import { Router } from 'express';
import { query } from '../db.js';
import { generateToken, authenticateToken, requireRole, comparePassword, hashPassword } from '../auth.js';
import { logAuditEvent } from '../audit.js';

const router = Router();

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const userRes = await query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = userRes.rows[0];
    const match = await comparePassword(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user);

    await logAuditEvent({
      userId: user.id,
      userName: user.full_name,
      userRole: user.role,
      action: 'USER_LOGIN',
      entityType: 'USER',
      entityId: user.id,
      details: { email: user.email, role: user.role },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1'
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        hospitalId: user.hospital_id,
        badgeNumber: user.badge_number,
        avatarInitials: user.avatar_initials,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Quick Switch Persona (1-Click Login for testing any of the 4 roles)
router.post('/switch-persona', async (req, res) => {
  const { role } = req.body;
  const validRoles = ['coordinator', 'hospital_staff', 'paramedic', 'auditor'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
  }

  try {
    const userRes = await query('SELECT * FROM users WHERE role = $1 ORDER BY created_at ASC LIMIT 1', [role]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: `No user found for role ${role}` });
    }

    const user = userRes.rows[0];
    const token = generateToken(user);

    await logAuditEvent({
      userId: user.id,
      userName: user.full_name,
      userRole: user.role,
      action: 'PERSONA_SWITCHED',
      entityType: 'USER',
      entityId: user.id,
      details: { switchedTo: role, email: user.email },
      ipAddress: req.ip || '127.0.0.1'
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        hospitalId: user.hospital_id,
        badgeNumber: user.badge_number,
        avatarInitials: user.avatar_initials,
      },
    });
  } catch (err) {
    console.error('Persona switch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Quick Hospital Staff Login (Logs in as authorized staff for a specific hospital)
router.post('/login-hospital', async (req, res) => {
  const { hospitalId } = req.body;
  if (!hospitalId) {
    return res.status(400).json({ error: 'hospitalId is required' });
  }

  try {
    const userRes = await query('SELECT * FROM users WHERE hospital_id = $1 LIMIT 1', [hospitalId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: `No staff user configured for facility ${hospitalId}` });
    }

    const user = userRes.rows[0];
    const hospRes = await query('SELECT name, short_name FROM hospitals WHERE id = $1', [hospitalId]);
    const hospName = hospRes.rows[0]?.name || hospitalId;

    const token = generateToken(user);

    await logAuditEvent({
      userId: user.id,
      userName: user.full_name,
      userRole: user.role,
      action: 'HOSPITAL_OPERATOR_LOGIN',
      entityType: 'HOSPITAL',
      entityId: hospitalId,
      details: { hospitalName: hospName, staffEmail: user.email },
      ipAddress: req.ip || '127.0.0.1'
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        hospitalId: user.hospital_id,
        hospitalName: hospName,
        badgeNumber: user.badge_number,
        avatarInitials: user.avatar_initials,
      },
    });
  } catch (err) {
    console.error('Hospital login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userRes = await query('SELECT id, email, full_name, role, hospital_id, badge_number, avatar_initials, created_at FROM users WHERE id = $1', [req.user.id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userRes.rows[0];
    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        hospitalId: user.hospital_id,
        badgeNumber: user.badge_number,
        avatarInitials: user.avatar_initials,
        createdAt: user.created_at,
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List all team users (Team Access)
router.get('/users', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT u.id, u.email, u.full_name, u.role, u.hospital_id, u.badge_number, u.avatar_initials, u.is_active, u.created_at,
             h.name as hospital_name
      FROM users u
      LEFT JOIN hospitals h ON u.hospital_id = h.id
      ORDER BY u.created_at ASC
    `);

    res.json({
      users: result.rows.map(u => ({
        id: u.id,
        email: u.email,
        fullName: u.full_name,
        role: u.role,
        hospitalId: u.hospital_id,
        hospitalName: u.hospital_name,
        badgeNumber: u.badge_number,
        avatarInitials: u.avatar_initials,
        isActive: u.is_active,
        createdAt: u.created_at,
      }))
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user role (Coordinator / Auditor privilege)
router.patch('/users/:id/role', authenticateToken, requireRole(['coordinator', 'auditor']), async (req, res) => {
  const { id } = req.params;
  const { role, hospitalId } = req.body;
  const validRoles = ['coordinator', 'hospital_staff', 'paramedic', 'auditor'];

  if (role && !validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    const updateRes = await query(`
      UPDATE users
      SET role = COALESCE($1, role),
          hospital_id = $2
      WHERE id = $3
      RETURNING id, email, full_name, role, hospital_id, badge_number, avatar_initials
    `, [role, hospitalId ?? null, id]);

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = updateRes.rows[0];

    await logAuditEvent({
      userId: req.user.id,
      userName: req.user.fullName,
      userRole: req.user.role,
      action: 'USER_ROLE_UPDATED',
      entityType: 'USER',
      entityId: id,
      details: { newRole: updatedUser.role, targetUser: updatedUser.full_name },
      ipAddress: req.ip || '127.0.0.1'
    });

    res.json({ user: updatedUser });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
