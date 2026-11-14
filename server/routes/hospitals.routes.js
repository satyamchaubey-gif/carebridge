import { Router } from 'express';
import { query } from '../db.js';
import { authenticateToken, optionalAuth, requireRole } from '../auth.js';
import { logAuditEvent } from '../audit.js';
import { broadcast } from '../websocket.js';

const router = Router();

// GET /api/hospitals
router.get('/', optionalAuth, async (req, res) => {
  const { data_mode = 'all', status, search } = req.query;

  try {
    let sql = `SELECT * FROM hospitals WHERE 1=1`;
    const params = [];

    if (data_mode === 'demo') {
      params.push(true);
      sql += ` AND is_demo = $${params.length}`;
    } else if (data_mode === 'live') {
      params.push(false);
      sql += ` AND is_demo = $${params.length}`;
    }

    if (status && status !== 'All') {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    if (search) {
      params.push(`%${search.trim().toLowerCase()}%`);
      sql += ` AND (LOWER(name) LIKE $${params.length} OR LOWER(area) LIKE $${params.length} OR array_to_string(tags, ' ') ILIKE $${params.length})`;
    }

    sql += ` ORDER BY id ASC`;

    const result = await query(sql, params);

    const formatted = result.rows.map(h => ({
      id: h.id,
      name: h.name,
      short: h.short_name,
      area: h.area,
      distance: `${h.distance_km} km`,
      distanceKm: Number(h.distance_km),
      beds: h.general_beds_available,
      bedsTotal: h.general_beds_total,
      icu: h.icu_beds_available,
      icuTotal: h.icu_beds_total,
      specialists: h.specialists_count,
      status: h.status,
      color: h.color,
      x: Number(h.coord_x),
      z: Number(h.coord_z),
      tags: h.tags || [],
      isDemo: h.is_demo,
      updated: formatRelativeTime(h.updated_at),
      updatedAt: h.updated_at,
    }));

    res.json({ hospitals: formatted });
  } catch (err) {
    console.error('Fetch hospitals error:', err);
    res.status(500).json({ error: 'Failed to retrieve hospitals' });
  }
});

// GET /api/hospitals/:id
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM hospitals WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Hospital not found' });
    }
    const h = result.rows[0];

    // Fetch recent referrals for this hospital
    const refRes = await query(`
      SELECT r.*, req.patient_name, req.service_type, req.urgency
      FROM referrals r
      JOIN emergency_requests req ON r.request_id = req.id
      WHERE r.to_hospital_id = $1 OR r.from_hospital_id = $1
      ORDER BY r.created_at DESC LIMIT 5
    `, [h.id]);

    res.json({
      hospital: {
        id: h.id,
        name: h.name,
        short: h.short_name,
        area: h.area,
        distance: `${h.distance_km} km`,
        distanceKm: Number(h.distance_km),
        beds: h.general_beds_available,
        bedsTotal: h.general_beds_total,
        icu: h.icu_beds_available,
        icuTotal: h.icu_beds_total,
        specialists: h.specialists_count,
        status: h.status,
        color: h.color,
        x: Number(h.coord_x),
        z: Number(h.coord_z),
        tags: h.tags || [],
        isDemo: h.is_demo,
        updated: formatRelativeTime(h.updated_at),
        updatedAt: h.updated_at,
        recentReferrals: refRes.rows,
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve hospital' });
  }
});

// PATCH /api/hospitals/:id/capacity
// Coordinator can update any hospital; Hospital staff can only update their assigned facility.
router.patch('/:id/capacity', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { metric = 'beds', delta, value, reason = 'Routine capacity update' } = req.body;
  const user = req.user;

  // Authorization check
  if (user.role === 'hospital_staff' && user.hospitalId !== id) {
    return res.status(403).json({
      error: `Hospital staff are only authorized to manage their assigned facility (${user.hospitalId}). Target: ${id}`,
    });
  } else if (user.role !== 'coordinator' && user.role !== 'hospital_staff') {
    return res.status(403).json({
      error: `Role '${user.role}' does not have permission to modify clinical bed capacity.`,
    });
  }

  try {
    const hospRes = await query('SELECT * FROM hospitals WHERE id = $1', [id]);
    if (hospRes.rows.length === 0) {
      return res.status(404).json({ error: 'Hospital not found' });
    }
    const h = hospRes.rows[0];

    let fieldName;
    let prevVal;
    let newVal;

    if (metric === 'beds') {
      fieldName = 'general_beds_available';
      prevVal = h.general_beds_available;
      newVal = value !== undefined ? Math.max(0, value) : Math.max(0, prevVal + (delta !== undefined ? delta : -1));
    } else if (metric === 'icu') {
      fieldName = 'icu_beds_available';
      prevVal = h.icu_beds_available;
      newVal = value !== undefined ? Math.max(0, value) : Math.max(0, prevVal + (delta !== undefined ? delta : -1));
    } else if (metric === 'specialists') {
      fieldName = 'specialists_count';
      prevVal = h.specialists_count;
      newVal = value !== undefined ? Math.max(0, value) : Math.max(0, prevVal + (delta !== undefined ? delta : 1));
    } else {
      return res.status(400).json({ error: "Invalid metric. Must be 'beds', 'icu', or 'specialists'" });
    }

    // Auto-recalculate status
    let currentBeds = metric === 'beds' ? newVal : h.general_beds_available;
    let currentIcu = metric === 'icu' ? newVal : h.icu_beds_available;
    let newStatus = 'Available';
    let newColor = '#9c4b60';

    if (currentBeds === 0 && currentIcu === 0) {
      newStatus = 'At capacity';
      newColor = '#77716d';
    } else if (currentBeds <= 3 || currentIcu <= 1) {
      newStatus = 'Limited';
      newColor = '#b98b55';
    }

    const updateRes = await query(`
      UPDATE hospitals
      SET ${fieldName} = $1,
          status = $2,
          color = $3,
          updated_at = NOW()
      WHERE id = $4
      RETURNING *;
    `, [newVal, newStatus, newColor, id]);

    const updatedHosp = updateRes.rows[0];

    // Log to resource_logs
    await query(`
      INSERT INTO resource_logs (hospital_id, user_id, metric, delta, previous_val, new_val, reason)
      VALUES ($1, $2, $3, $4, $5, $6, $7);
    `, [id, user.id, metric, newVal - prevVal, prevVal, newVal, reason]);

    // Log to immutable audit_logs
    await logAuditEvent({
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: 'RESOURCE_CAPACITY_UPDATED',
      entityType: 'HOSPITAL',
      entityId: id,
      details: {
        hospitalName: updatedHosp.name,
        metric,
        previous: prevVal,
        current: newVal,
        delta: newVal - prevVal,
        status: newStatus,
        reason,
      },
      ipAddress: req.ip || '127.0.0.1'
    });

    const formattedHospital = {
      id: updatedHosp.id,
      name: updatedHosp.name,
      short: updatedHosp.short_name,
      area: updatedHosp.area,
      distance: `${updatedHosp.distance_km} km`,
      distanceKm: Number(updatedHosp.distance_km),
      beds: updatedHosp.general_beds_available,
      bedsTotal: updatedHosp.general_beds_total,
      icu: updatedHosp.icu_beds_available,
      icuTotal: updatedHosp.icu_beds_total,
      specialists: updatedHosp.specialists_count,
      status: updatedHosp.status,
      color: updatedHosp.color,
      x: Number(updatedHosp.coord_x),
      z: Number(updatedHosp.coord_z),
      tags: updatedHosp.tags || [],
      isDemo: updatedHosp.is_demo,
      updated: 'Just now',
      updatedAt: updatedHosp.updated_at,
    };

    // Broadcast update via WebSocket
    broadcast('HOSPITAL_UPDATED', formattedHospital);

    res.json({
      success: true,
      hospital: formattedHospital,
      message: `${updatedHosp.name} ${metric} updated to ${newVal}`,
    });
  } catch (err) {
    console.error('Update capacity error:', err);
    res.status(500).json({ error: 'Failed to update capacity' });
  }
});

function formatRelativeTime(date) {
  if (!date) return 'Just now';
  const diffSec = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  return `${diffHours} hr ago`;
}

export default router;
