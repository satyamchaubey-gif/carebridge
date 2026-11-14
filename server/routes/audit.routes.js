import { Router } from 'express';
import { query } from '../db.js';
import { authenticateToken, optionalAuth, requireRole } from '../auth.js';

const router = Router();

// GET /api/audit-logs
router.get('/', authenticateToken, async (req, res) => {
  const { limit = 50, offset = 0, action, entity_type, search } = req.query;

  try {
    let sql = `SELECT * FROM audit_logs WHERE 1=1`;
    const params = [];

    if (action) {
      params.push(action);
      sql += ` AND action = $${params.length}`;
    }

    if (entity_type) {
      params.push(entity_type);
      sql += ` AND entity_type = $${params.length}`;
    }

    if (search) {
      params.push(`%${search.trim().toLowerCase()}%`);
      sql += ` AND (LOWER(action) LIKE $${params.length} OR LOWER(user_name) LIKE $${params.length} OR LOWER(entity_type) LIKE $${params.length} OR details::text ILIKE $${params.length})`;
    }

    // Role-based visibility: Hospital staff can only see events related to their hospital or their own actions
    if (req.user.role === 'hospital_staff') {
      params.push(req.user.id);
      params.push(req.user.hospitalId || 'NONE');
      sql += ` AND (user_id = $${params.length - 1} OR entity_id = $${params.length} OR details->>'hospitalId' = $${params.length} OR details->>'to_hospital' LIKE '%' || $${params.length} || '%')`;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const result = await query(sql, params);
    const countRes = await query('SELECT COUNT(*) FROM audit_logs');

    res.json({
      total: parseInt(countRes.rows[0].count, 10),
      logs: result.rows.map(l => ({
        id: l.id,
        userId: l.user_id,
        userName: l.user_name,
        userRole: l.user_role,
        action: l.action,
        entityType: l.entity_type,
        entityId: l.entity_id,
        details: l.details,
        ipAddress: l.ip_address,
        createdAt: l.created_at,
        timeFormatted: new Date(l.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        dateFormatted: new Date(l.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
      }))
    });
  } catch (err) {
    console.error('Fetch audit logs error:', err);
    res.status(500).json({ error: 'Failed to retrieve audit logs' });
  }
});

// GET /api/audit-logs/pulse (Lightweight public activity pulse for Overview)
router.get('/pulse', optionalAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT id, action, entity_type, entity_id, user_name, user_role, details, created_at
      FROM audit_logs
      ORDER BY created_at DESC
      LIMIT 8
    `);

    res.json({
      pulse: result.rows.map(r => ({
        id: r.id,
        title: formatActionTitle(r.action),
        desc: formatActionDesc(r),
        time: formatPulseTime(r.created_at),
        color: getActionColor(r.action),
        icon: getActionIcon(r.action),
        createdAt: r.created_at,
      }))
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve activity pulse' });
  }
});

function formatActionTitle(action) {
  switch (action) {
    case 'REFERRAL_ACCEPTED': return 'Referral accepted';
    case 'RESOURCE_CAPACITY_UPDATED': return 'Resource status synced';
    case 'EMERGENCY_REQUEST_CREATED': return 'New request received';
    case 'REFERRAL_INITIATED': return 'Referral dispatched';
    case 'REFERRAL_COMPLETED': return 'Patient admitted';
    case 'USER_LOGIN': return 'Dispatcher session active';
    case 'SYSTEM_INITIALIZATION': return 'Core node initialized';
    default: return action.replace(/_/g, ' ').toLowerCase();
  }
}

function formatActionDesc(row) {
  const d = row.details || {};
  if (row.action === 'REFERRAL_ACCEPTED') {
    return `${d.hospital || 'Hospital'} · ${row.entity_id || 'Ref'}`;
  }
  if (row.action === 'RESOURCE_CAPACITY_UPDATED') {
    return `${d.hospitalName || 'Facility'} · ${d.current ?? 0} ${d.metric || 'beds'}`;
  }
  if (row.action === 'EMERGENCY_REQUEST_CREATED') {
    return `${d.service || 'Emergency'} · ${row.entity_id || 'Case'}`;
  }
  if (row.action === 'REFERRAL_INITIATED') {
    return `To: ${d.targetHospital || 'Facility'} (${d.priority || 'Normal'})`;
  }
  return `${row.user_name} (${row.user_role})`;
}

function getActionColor(action) {
  if (action.includes('ACCEPTED') || action.includes('COMPLETED') || action.includes('INITIALIZATION')) return 'green';
  if (action.includes('CAPACITY') || action.includes('DISPATCHED')) return 'gold';
  return 'rose';
}

function getActionIcon(action) {
  if (action.includes('ACCEPTED') || action.includes('COMPLETED')) return 'CheckCircle2';
  if (action.includes('CAPACITY')) return 'Radio';
  if (action.includes('REQUEST')) return 'FilePlus2';
  return 'ShieldCheck';
}

function formatPulseTime(date) {
  if (!date) return 'Just now';
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default router;
