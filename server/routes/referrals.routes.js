import { Router } from 'express';
import { query } from '../db.js';
import { authenticateToken, optionalAuth, requireRole } from '../auth.js';
import { logAuditEvent } from '../audit.js';
import { broadcast } from '../websocket.js';

const router = Router();

// GET /api/referrals
router.get('/', optionalAuth, async (req, res) => {
  const { data_mode = 'all', status, hospital_id } = req.query;

  try {
    let sql = `
      SELECT ref.*,
             req.patient_name,
             req.service_type,
             req.urgency,
             req.location as patient_location,
             h_to.name as to_hospital_name,
             h_to.short_name as to_hospital_short,
             h_from.name as from_hospital_name,
             u.full_name as assigned_by_name
      FROM referrals ref
      JOIN emergency_requests req ON ref.request_id = req.id
      JOIN hospitals h_to ON ref.to_hospital_id = h_to.id
      LEFT JOIN hospitals h_from ON ref.from_hospital_id = h_from.id
      LEFT JOIN users u ON ref.assigned_by_user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (data_mode === 'demo') {
      params.push(true);
      sql += ` AND ref.is_demo = $${params.length}`;
    } else if (data_mode === 'live') {
      params.push(false);
      sql += ` AND ref.is_demo = $${params.length}`;
    }

    if (status && status !== 'All') {
      params.push(status);
      sql += ` AND ref.status = $${params.length}`;
    }

    if (hospital_id) {
      params.push(hospital_id);
      sql += ` AND (ref.to_hospital_id = $${params.length} OR ref.from_hospital_id = $${params.length})`;
    }

    sql += ` ORDER BY ref.created_at DESC`;

    const result = await query(sql, params);

    const formatted = result.rows.map(r => ({
      id: r.id,
      requestId: r.request_id,
      patientName: r.patient_name,
      serviceType: r.service_type,
      urgency: r.urgency,
      patientLocation: r.patient_location,
      fromHospitalId: r.from_hospital_id,
      fromHospitalName: r.from_hospital_name || 'Field / Community',
      toHospitalId: r.to_hospital_id,
      toHospitalName: r.to_hospital_name,
      toHospitalShort: r.to_hospital_short,
      status: r.status,
      priority: r.priority,
      notes: r.notes,
      assignedByName: r.assigned_by_name || 'System Dispatcher',
      isDemo: r.is_demo,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      time: new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }));

    res.json({ referrals: formatted });
  } catch (err) {
    console.error('Fetch referrals error:', err);
    res.status(500).json({ error: 'Failed to retrieve referrals' });
  }
});

// POST /api/referrals (Initiate referral)
router.post('/', authenticateToken, requireRole(['coordinator', 'hospital_staff', 'paramedic']), async (req, res) => {
  const { request_id, to_hospital_id, from_hospital_id = null, priority = 'Normal', notes = '', is_demo = false } = req.body;

  if (!request_id || !to_hospital_id) {
    return res.status(400).json({ error: 'request_id and to_hospital_id are required' });
  }

  try {
    // Check request exists
    const reqRes = await query('SELECT * FROM emergency_requests WHERE id = $1', [request_id]);
    if (reqRes.rows.length === 0) {
      return res.status(404).json({ error: 'Emergency request not found' });
    }
    const patientReq = reqRes.rows[0];

    // Check target hospital exists
    const hospRes = await query('SELECT * FROM hospitals WHERE id = $1', [to_hospital_id]);
    if (hospRes.rows.length === 0) {
      return res.status(404).json({ error: 'Target destination hospital not found' });
    }
    const targetHosp = hospRes.rows[0];

    const refCount = await query('SELECT COUNT(*) FROM referrals');
    const referralId = `REF-${2000 + parseInt(refCount.rows[0].count, 10) + 1}`;

    const insertRes = await query(`
      INSERT INTO referrals (
        id, request_id, from_hospital_id, to_hospital_id, assigned_by_user_id, status, priority, notes, is_demo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `, [
      referralId,
      request_id,
      from_hospital_id,
      to_hospital_id,
      req.user.id,
      'Pending',
      priority,
      notes,
      Boolean(is_demo || patientReq.is_demo)
    ]);

    const ref = insertRes.rows[0];

    // Update request status to 'In coordination'
    await query(`
      UPDATE emergency_requests
      SET status = 'In coordination',
          matched_hospital_id = $1,
          updated_at = NOW()
      WHERE id = $2;
    `, [to_hospital_id, request_id]);

    // Audit log
    await logAuditEvent({
      userId: req.user.id,
      userName: req.user.fullName,
      userRole: req.user.role,
      action: 'REFERRAL_INITIATED',
      entityType: 'REFERRAL',
      entityId: referralId,
      details: {
        requestId: request_id,
        patient: patientReq.patient_name,
        targetHospital: targetHosp.name,
        priority,
      },
      ipAddress: req.ip || '127.0.0.1'
    });

    const formattedReferral = {
      id: ref.id,
      requestId: ref.request_id,
      patientName: patientReq.patient_name,
      serviceType: patientReq.service_type,
      urgency: patientReq.urgency,
      patientLocation: patientReq.location,
      fromHospitalId: ref.from_hospital_id,
      toHospitalId: ref.to_hospital_id,
      toHospitalName: targetHosp.name,
      toHospitalShort: targetHosp.short_name,
      status: ref.status,
      priority: ref.priority,
      notes: ref.notes,
      assignedByName: req.user.fullName,
      isDemo: ref.is_demo,
      createdAt: ref.created_at,
      time: new Date(ref.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    broadcast('REFERRAL_CREATED', formattedReferral);
    broadcast('REQUEST_UPDATED', { id: request_id, status: 'In coordination', matchedHospitalId: to_hospital_id });

    res.status(201).json({
      success: true,
      referral: formattedReferral,
      message: `Referral ${referralId} dispatched to ${targetHosp.name}`,
    });
  } catch (err) {
    console.error('Create referral error:', err);
    res.status(500).json({ error: 'Failed to initiate referral' });
  }
});

// PATCH /api/referrals/:id/status
router.patch('/:id/status', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;
  const user = req.user;

  const validStatuses = ['Pending', 'Accepted', 'Declined', 'In Transit', 'Completed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  try {
    const refRes = await query(`
      SELECT r.*, req.patient_name, req.service_type, req.urgency, h.name as to_hospital_name, h.general_beds_available, h.icu_beds_available
      FROM referrals r
      JOIN emergency_requests req ON r.request_id = req.id
      JOIN hospitals h ON r.to_hospital_id = h.id
      WHERE r.id = $1
    `, [id]);

    if (refRes.rows.length === 0) {
      return res.status(404).json({ error: 'Referral not found' });
    }

    const ref = refRes.rows[0];

    // Authorization: Hospital Staff can only manage referrals to their own facility
    if (user.role === 'hospital_staff' && user.hospitalId !== ref.to_hospital_id) {
      return res.status(403).json({
        error: `Hospital staff are restricted to managing referrals for their assigned facility (${user.hospitalId}). Target: ${ref.to_hospital_id}`
      });
    } else if (user.role === 'paramedic' || user.role === 'auditor') {
      return res.status(403).json({
        error: `Role '${user.role}' cannot update referral disposition.`
      });
    }

    // Update referral status
    const updateRes = await query(`
      UPDATE referrals
      SET status = $1,
          notes = COALESCE($2, notes),
          updated_at = NOW()
      WHERE id = $3
      RETURNING *;
    `, [status, notes, id]);

    const updatedRef = updateRes.rows[0];

    // If Accepted: deduct bed capacity and update request status
    if (status === 'Accepted') {
      const isUrgent = ref.urgency === 'Critical' || ref.service_type.includes('ICU');
      const metric = isUrgent ? 'icu' : 'beds';
      const col = isUrgent ? 'icu_beds_available' : 'general_beds_available';
      const prevVal = isUrgent ? ref.icu_beds_available : ref.general_beds_available;
      const newVal = Math.max(0, prevVal - 1);

      // Status recompute
      let newHospStatus = 'Available';
      let newColor = '#9c4b60';
      const remainingBeds = isUrgent ? ref.general_beds_available : newVal;
      const remainingIcu = isUrgent ? newVal : ref.icu_beds_available;

      if (remainingBeds === 0 && remainingIcu === 0) {
        newHospStatus = 'At capacity';
        newColor = '#77716d';
      } else if (remainingBeds <= 3 || remainingIcu <= 1) {
        newHospStatus = 'Limited';
        newColor = '#b98b55';
      }

      await query(`
        UPDATE hospitals
        SET ${col} = $1, status = $2, color = $3, updated_at = NOW()
        WHERE id = $4;
      `, [newVal, newHospStatus, newColor, ref.to_hospital_id]);

      await query(`
        INSERT INTO resource_logs (hospital_id, user_id, metric, delta, previous_val, new_val, reason)
        VALUES ($1, $2, $3, -1, $4, $5, $6);
      `, [ref.to_hospital_id, user.id, metric, prevVal, newVal, `Reserved for accepted referral ${ref.id} (${ref.patient_name})`]);

      await query(`
        UPDATE emergency_requests
        SET status = 'Referral accepted', updated_at = NOW()
        WHERE id = $1;
      `, [ref.request_id]);

      // Broadcast hospital capacity change
      const hospFull = await query('SELECT * FROM hospitals WHERE id = $1', [ref.to_hospital_id]);
      if (hospFull.rows.length > 0) {
        const h = hospFull.rows[0];
        broadcast('HOSPITAL_UPDATED', {
          id: h.id,
          name: h.name,
          short: h.short_name,
          beds: h.general_beds_available,
          icu: h.icu_beds_available,
          status: h.status,
          color: h.color,
          updated: 'Just now'
        });
      }

      broadcast('REQUEST_UPDATED', { id: ref.request_id, status: 'Referral accepted' });
    } else if (status === 'Completed') {
      await query(`
        UPDATE emergency_requests
        SET status = 'Admitted', updated_at = NOW()
        WHERE id = $1;
      `, [ref.request_id]);
      broadcast('REQUEST_UPDATED', { id: ref.request_id, status: 'Admitted' });
    } else if (status === 'Declined') {
      await query(`
        UPDATE emergency_requests
        SET status = 'Awaiting hospital', updated_at = NOW()
        WHERE id = $1;
      `, [ref.request_id]);
      broadcast('REQUEST_UPDATED', { id: ref.request_id, status: 'Awaiting hospital' });
    }

    // Audit log
    await logAuditEvent({
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: `REFERRAL_${status.toUpperCase()}`,
      entityType: 'REFERRAL',
      entityId: id,
      details: {
        requestId: ref.request_id,
        patient: ref.patient_name,
        hospital: ref.to_hospital_name,
        newStatus: status,
      },
      ipAddress: req.ip || '127.0.0.1'
    });

    broadcast('REFERRAL_UPDATED', {
      id: updatedRef.id,
      status: updatedRef.status,
      requestId: updatedRef.request_id,
      updatedAt: updatedRef.updated_at
    });

    res.json({
      success: true,
      referral: updatedRef,
      message: `Referral ${id} updated to ${status}`
    });
  } catch (err) {
    console.error('Update referral status error:', err);
    res.status(500).json({ error: 'Failed to update referral' });
  }
});

export default router;
