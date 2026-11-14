import { Router } from 'express';
import { query } from '../db.js';
import { authenticateToken, optionalAuth, requireRole } from '../auth.js';
import { logAuditEvent } from '../audit.js';
import { broadcast } from '../websocket.js';
import { rankHospitalsForRequest } from '../matching.js';

const router = Router();

// GET /api/requests
router.get('/', optionalAuth, async (req, res) => {
  const { data_mode = 'all', urgency, status, search } = req.query;

  try {
    let sql = `
      SELECT r.*,
             h.name as matched_hospital_name,
             h.short_name as matched_hospital_short,
             u.full_name as created_by_name,
             u.role as created_by_role
      FROM emergency_requests r
      LEFT JOIN hospitals h ON r.matched_hospital_id = h.id
      LEFT JOIN users u ON r.created_by_user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (data_mode === 'demo') {
      params.push(true);
      sql += ` AND r.is_demo = $${params.length}`;
    } else if (data_mode === 'live') {
      params.push(false);
      sql += ` AND r.is_demo = $${params.length}`;
    }

    if (urgency && urgency !== 'All') {
      params.push(urgency);
      sql += ` AND r.urgency = $${params.length}`;
    }

    if (status && status !== 'All') {
      params.push(status);
      sql += ` AND r.status = $${params.length}`;
    }

    if (search) {
      params.push(`%${search.trim().toLowerCase()}%`);
      sql += ` AND (LOWER(r.id) LIKE $${params.length} OR LOWER(r.patient_name) LIKE $${params.length} OR LOWER(r.service_type) LIKE $${params.length} OR LOWER(r.location) LIKE $${params.length})`;
    }

    sql += ` ORDER BY r.created_at DESC`;

    const result = await query(sql, params);

    const formatted = result.rows.map(r => ({
      id: r.id,
      patient: r.patient_name,
      type: r.service_type,
      urgency: r.urgency,
      time: new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: r.created_at,
      location: r.location,
      status: r.status,
      match: r.matched_hospital_name || 'Awaiting matching',
      matchId: r.matched_hospital_id,
      matchShort: r.matched_hospital_short,
      createdByName: r.created_by_name,
      createdByRole: r.created_by_role,
      isDemo: r.is_demo,
      metadata: r.metadata,
    }));

    res.json({ requests: formatted });
  } catch (err) {
    console.error('Fetch requests error:', err);
    res.status(500).json({ error: 'Failed to retrieve emergency requests' });
  }
});

// GET /api/requests/:id
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT r.*,
             h.name as matched_hospital_name,
             h.short_name as matched_hospital_short
      FROM emergency_requests r
      LEFT JOIN hospitals h ON r.matched_hospital_id = h.id
      WHERE r.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Emergency request not found' });
    }

    const r = result.rows[0];

    // Compute live matches for this request
    const hospitalsRes = await query('SELECT * FROM hospitals WHERE status != $1 ORDER BY id ASC', ['Offline']);
    const matches = rankHospitalsForRequest(r, hospitalsRes.rows);

    res.json({
      request: {
        id: r.id,
        patient: r.patient_name,
        type: r.service_type,
        urgency: r.urgency,
        time: new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        createdAt: r.created_at,
        location: r.location,
        status: r.status,
        match: r.matched_hospital_name,
        matchId: r.matched_hospital_id,
        isDemo: r.is_demo,
        metadata: r.metadata,
      },
      matches,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve request details' });
  }
});

// POST /api/requests
// Coordinator, Hospital Staff, Paramedic can initiate emergency intake
router.post('/', authenticateToken, requireRole(['coordinator', 'hospital_staff', 'paramedic']), async (req, res) => {
  const {
    patient_name,
    service_type = 'Trauma assessment',
    urgency = 'High',
    location = 'Sector 62, Noida',
    is_demo = false,
    metadata = {}
  } = req.body;

  if (!patient_name || !patient_name.trim()) {
    return res.status(400).json({ error: 'Patient name or reference identifier required' });
  }

  try {
    // Generate sequential or prefixed ID
    const countRes = await query('SELECT COUNT(*) FROM emergency_requests');
    const seq = 3000 + parseInt(countRes.rows[0].count, 10) + 1;
    const requestId = is_demo ? `CB-${2050 + parseInt(countRes.rows[0].count, 10)}` : `CB-${seq}`;

    // Run matching algorithm to automatically find top hospital recommendation
    const hospRes = await query('SELECT * FROM hospitals WHERE status != $1', ['Offline']);
    const candidateHospitals = hospRes.rows;
    let matchedHospitalId = null;
    let topHospitalName = 'Awaiting matching';

    if (candidateHospitals.length > 0) {
      const ranked = rankHospitalsForRequest(
        { service_type, urgency, location },
        candidateHospitals
      );
      if (ranked.length > 0 && ranked[0].score >= 60) {
        matchedHospitalId = ranked[0].hospitalId;
        topHospitalName = ranked[0].hospitalName;
      }
    }

    const insertRes = await query(`
      INSERT INTO emergency_requests (
        id, patient_name, service_type, urgency, location, status,
        matched_hospital_id, created_by_user_id, is_demo, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *;
    `, [
      requestId,
      patient_name.trim(),
      service_type,
      urgency,
      location.trim(),
      'New request',
      matchedHospitalId,
      req.user.id,
      Boolean(is_demo),
      JSON.stringify(metadata)
    ]);

    const r = insertRes.rows[0];

    // Log to immutable audit log
    await logAuditEvent({
      userId: req.user.id,
      userName: req.user.fullName,
      userRole: req.user.role,
      action: 'EMERGENCY_REQUEST_CREATED',
      entityType: 'REQUEST',
      entityId: requestId,
      details: {
        patient: r.patient_name,
        service: r.service_type,
        urgency: r.urgency,
        location: r.location,
        recommendedMatch: topHospitalName,
        isDemo: r.is_demo,
      },
      ipAddress: req.ip || '127.0.0.1'
    });

    const formattedRequest = {
      id: r.id,
      patient: r.patient_name,
      type: r.service_type,
      urgency: r.urgency,
      time: new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: r.created_at,
      location: r.location,
      status: r.status,
      match: topHospitalName,
      matchId: r.matched_hospital_id,
      createdByName: req.user.fullName,
      createdByRole: req.user.role,
      isDemo: r.is_demo,
      metadata: r.metadata,
    };

    // Broadcast new request to all active command centers
    broadcast('REQUEST_CREATED', formattedRequest);

    res.status(201).json({
      success: true,
      request: formattedRequest,
      message: `Emergency request ${r.id} logged and matched to ${topHospitalName}`,
    });
  } catch (err) {
    console.error('Create request error:', err);
    res.status(500).json({ error: 'Failed to create emergency request' });
  }
});

// POST /api/requests/public-sos (Public Emergency SOS - No Login Required)
router.post('/public-sos', async (req, res) => {
  const {
    patient_name = 'Emergency Citizen',
    service_type = 'Trauma assessment',
    location = 'Live GPS Location (NCR)',
    latitude = 28.585,
    longitude = 77.365,
    caller_phone = 'Local Emergency Call'
  } = req.body;

  try {
    const countRes = await query('SELECT COUNT(*) FROM emergency_requests');
    const seq = 5000 + parseInt(countRes.rows[0].count, 10) + 1;
    const requestId = `CB-SOS-${seq}`;

    // Rank nearest hospitals based on capability and proximity
    const hospRes = await query('SELECT * FROM hospitals WHERE status != $1 ORDER BY id ASC', ['Offline']);
    const candidateHospitals = hospRes.rows;
    let matchedHospitalId = 'H-001';
    let topHospital = candidateHospitals[0] || { name: 'Aurelia Medical Institute', short_name: 'AMI', area: 'Sector 62, Noida' };

    if (candidateHospitals.length > 0) {
      const ranked = rankHospitalsForRequest(
        { service_type, urgency: 'Critical', location },
        candidateHospitals
      );
      if (ranked.length > 0) {
        matchedHospitalId = ranked[0].hospitalId;
        topHospital = candidateHospitals.find(h => h.id === matchedHospitalId) || candidateHospitals[0];
      }
    }

    const metadata = {
      is_sos: true,
      gps: { lat: latitude, lng: longitude },
      callerPhone: caller_phone,
      ambulanceUnit: 'NCR Unit 7 (Advanced Life Support)',
      driver: 'Alex Rivera (EMT-P)',
      etaMinutes: 4,
      dispatchedAt: new Date().toISOString()
    };

    const insertRes = await query(`
      INSERT INTO emergency_requests (
        id, patient_name, service_type, urgency, location, status,
        matched_hospital_id, created_by_user_id, is_demo, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, FALSE, $8)
      RETURNING *;
    `, [
      requestId,
      patient_name.trim(),
      service_type,
      'Critical',
      location.trim(),
      'In transit',
      matchedHospitalId,
      JSON.stringify(metadata)
    ]);

    const r = insertRes.rows[0];

    // Automatically create immediate hospital referral
    const refCount = await query('SELECT COUNT(*) FROM referrals');
    const refId = `REF-SOS-${3000 + parseInt(refCount.rows[0].count, 10) + 1}`;
    await query(`
      INSERT INTO referrals (
        id, request_id, from_hospital_id, to_hospital_id, assigned_by_user_id, status, priority, notes, is_demo
      ) VALUES ($1, $2, NULL, $3, NULL, 'In Transit', 'Critical', 'Emergency Citizen SOS Call - Automatic GPS Routing', FALSE);
    `, [refId, requestId, matchedHospitalId]);

    // Log to immutable audit trail
    await logAuditEvent({
      userId: null,
      userName: 'Public Emergency Caller',
      userRole: 'citizen_sos',
      action: 'PUBLIC_SOS_AMBULANCE_DISPATCHED',
      entityType: 'REQUEST',
      entityId: requestId,
      details: {
        patient: r.patient_name,
        service: r.service_type,
        hospital: topHospital.name,
        gps: { lat: latitude, lng: longitude },
        ambulance: metadata.ambulanceUnit,
      },
      ipAddress: req.ip || '127.0.0.1'
    });

    const formattedRequest = {
      id: r.id,
      patient: r.patient_name,
      type: r.service_type,
      urgency: 'Critical',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: r.created_at,
      location: r.location,
      status: 'In transit',
      match: topHospital.name,
      matchId: matchedHospitalId,
      matchShort: topHospital.short_name,
      isDemo: false,
      metadata
    };

    broadcast('REQUEST_CREATED', formattedRequest);
    broadcast('REFERRAL_CREATED', {
      id: refId,
      requestId,
      patientName: r.patient_name,
      serviceType: r.service_type,
      urgency: 'Critical',
      toHospitalId: matchedHospitalId,
      toHospitalName: topHospital.name,
      status: 'In Transit',
      priority: 'Critical',
      isDemo: false
    });

    res.status(201).json({
      success: true,
      requestId,
      ambulanceUnit: metadata.ambulanceUnit,
      etaMinutes: metadata.etaMinutes,
      matchedHospital: {
        id: matchedHospitalId,
        name: topHospital.name,
        area: topHospital.area,
        distanceKm: topHospital.distance_km || 3.2
      },
      gps: metadata.gps,
      message: `Emergency ambulance dispatched to your location! Assigned to ${topHospital.name}.`
    });
  } catch (err) {
    console.error('Public SOS dispatch error:', err);
    res.status(500).json({ error: 'Emergency dispatch failed. Please dial 112 directly.' });
  }
});

// PATCH /api/requests/:id/status
router.patch('/:id/status', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { status, matchedHospitalId } = req.body;

  const validStatuses = ['New request', 'Evaluating', 'Matched', 'Referral accepted', 'In coordination', 'In transit', 'Admitted', 'Cancelled'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  try {
    const updateRes = await query(`
      UPDATE emergency_requests
      SET status = COALESCE($1, status),
          matched_hospital_id = COALESCE($2, matched_hospital_id),
          updated_at = NOW()
      WHERE id = $3
      RETURNING *;
    `, [status, matchedHospitalId, id]);

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Emergency request not found' });
    }

    const r = updateRes.rows[0];

    // Log to audit trail
    await logAuditEvent({
      userId: req.user.id,
      userName: req.user.fullName,
      userRole: req.user.role,
      action: 'REQUEST_STATUS_UPDATED',
      entityType: 'REQUEST',
      entityId: id,
      details: { newStatus: r.status, patient: r.patient_name },
      ipAddress: req.ip || '127.0.0.1'
    });

    // Broadcast update
    broadcast('REQUEST_UPDATED', {
      id: r.id,
      status: r.status,
      matchedHospitalId: r.matched_hospital_id,
      updatedAt: r.updated_at
    });

    res.json({ success: true, request: r });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update request status' });
  }
});

// GET /api/requests/:id/matches
router.get('/:id/matches', optionalAuth, async (req, res) => {
  try {
    const reqRes = await query('SELECT * FROM emergency_requests WHERE id = $1', [req.params.id]);
    if (reqRes.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }
    const r = reqRes.rows[0];

    const hospRes = await query('SELECT * FROM hospitals WHERE status != $1 ORDER BY id ASC', ['Offline']);
    const ranked = rankHospitalsForRequest(r, hospRes.rows);

    res.json({
      requestId: r.id,
      patient: r.patient_name,
      serviceType: r.service_type,
      urgency: r.urgency,
      rankings: ranked
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute matches' });
  }
});

export default router;
