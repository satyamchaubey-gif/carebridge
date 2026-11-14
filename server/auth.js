import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'carebridge_secret_jwt_key_2026_super_secure';

export function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      fullName: user.full_name || user.fullName,
      role: user.role,
      hospitalId: user.hospital_id || user.hospitalId || null,
      initials: user.avatar_initials || user.initials || 'CB',
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired authentication token' });
    }
    req.user = decoded;
    next();
  });
}

// Optional auth for public exploration / fallback
export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    req.user = null;
    return next();
  }
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (!err) {
      req.user = decoded;
    }
    next();
  });
}

export function requireRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Role '${req.user.role}' is not authorized. Required: [${roles.join(', ')}]`,
      });
    }
    next();
  };
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}
