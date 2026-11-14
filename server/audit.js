import { query } from './db.js';
import { broadcast } from './websocket.js';

export async function logAuditEvent({
  userId = null,
  userName = 'System',
  userRole = 'system',
  action,
  entityType,
  entityId = null,
  details = {},
  ipAddress = '127.0.0.1'
}) {
  try {
    const res = await query(`
      INSERT INTO audit_logs (user_id, user_name, user_role, action, entity_type, entity_id, details, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `, [userId, userName, userRole, action, entityType, entityId, JSON.stringify(details), ipAddress]);

    const entry = res.rows[0];

    // Broadcast audit event to live WebSocket clients
    broadcast('ACTIVITY_LOGGED', {
      id: entry.id,
      action: entry.action,
      entityType: entry.entity_type,
      entityId: entry.entity_id,
      userName: entry.user_name,
      userRole: entry.user_role,
      details: entry.details,
      createdAt: entry.created_at,
    });

    return entry;
  } catch (err) {
    console.error('[AUDIT] Failed to record audit log:', err);
    return null;
  }
}
