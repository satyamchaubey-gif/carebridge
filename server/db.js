import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: parseInt(process.env.PGPORT || '5433', 10),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || undefined,
  database: process.env.PGDATABASE || 'carebridge',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  return res;
}

export async function initDb() {
  console.log('[DB] Initializing database schema...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Hospitals table
    await client.query(`
      CREATE TABLE IF NOT EXISTS hospitals (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        short_name VARCHAR(50) NOT NULL,
        area VARCHAR(255) NOT NULL,
        distance_km NUMERIC(5,2) NOT NULL DEFAULT 5.0,
        general_beds_total INT NOT NULL DEFAULT 50,
        general_beds_available INT NOT NULL DEFAULT 10,
        icu_beds_total INT NOT NULL DEFAULT 15,
        icu_beds_available INT NOT NULL DEFAULT 4,
        specialists_count INT NOT NULL DEFAULT 8,
        status VARCHAR(50) NOT NULL DEFAULT 'Available',
        color VARCHAR(30) NOT NULL DEFAULT '#9c4b60',
        coord_x NUMERIC(5,2) NOT NULL DEFAULT 0.0,
        coord_z NUMERIC(5,2) NOT NULL DEFAULT 0.0,
        tags TEXT[] NOT NULL DEFAULT '{}',
        is_demo BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL, -- 'coordinator', 'hospital_staff', 'paramedic', 'auditor'
        hospital_id VARCHAR(50) REFERENCES hospitals(id) ON DELETE SET NULL,
        badge_number VARCHAR(50),
        avatar_initials VARCHAR(6) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Emergency Requests table
    await client.query(`
      CREATE TABLE IF NOT EXISTS emergency_requests (
        id VARCHAR(50) PRIMARY KEY,
        patient_name VARCHAR(255) NOT NULL,
        service_type VARCHAR(100) NOT NULL,
        urgency VARCHAR(50) NOT NULL, -- 'Critical', 'High', 'Medium', 'Low'
        location VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'New request',
        matched_hospital_id VARCHAR(50) REFERENCES hospitals(id) ON DELETE SET NULL,
        created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        is_demo BOOLEAN NOT NULL DEFAULT FALSE,
        metadata JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Referrals table
    await client.query(`
      CREATE TABLE IF NOT EXISTS referrals (
        id VARCHAR(50) PRIMARY KEY,
        request_id VARCHAR(50) REFERENCES emergency_requests(id) ON DELETE CASCADE,
        from_hospital_id VARCHAR(50) REFERENCES hospitals(id) ON DELETE SET NULL,
        to_hospital_id VARCHAR(50) REFERENCES hospitals(id) ON DELETE RESTRICT,
        assigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'Pending', -- 'Pending', 'Accepted', 'Declined', 'In Transit', 'Completed'
        priority VARCHAR(50) NOT NULL DEFAULT 'Normal',
        notes TEXT,
        is_demo BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Resource logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS resource_logs (
        id SERIAL PRIMARY KEY,
        hospital_id VARCHAR(50) NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        metric VARCHAR(50) NOT NULL, -- 'beds', 'icu', 'specialists'
        delta INT NOT NULL,
        previous_val INT NOT NULL,
        new_val INT NOT NULL,
        reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Audit logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        user_name VARCHAR(255) NOT NULL,
        user_role VARCHAR(50) NOT NULL,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        entity_id VARCHAR(100),
        details JSONB NOT NULL DEFAULT '{}',
        ip_address VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Indexes for high performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_requests_status ON emergency_requests(status);
      CREATE INDEX IF NOT EXISTS idx_requests_urgency ON emergency_requests(urgency);
      CREATE INDEX IF NOT EXISTS idx_requests_demo ON emergency_requests(is_demo);
      CREATE INDEX IF NOT EXISTS idx_hospitals_status ON hospitals(status);
      CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
      CREATE INDEX IF NOT EXISTS idx_referrals_to_hosp ON referrals(to_hospital_id);
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_resource_logs_hosp ON resource_logs(hospital_id, created_at DESC);
    `);

    await client.query('COMMIT');
    console.log('[DB] Schema verified.');

    // Seed data
    await seedInitialData(client);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[DB] Schema initialization error:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function seedInitialData(client) {
  // Check if hospitals exist
  const hospCheck = await client.query('SELECT COUNT(*) FROM hospitals');
  if (parseInt(hospCheck.rows[0].count, 10) === 0) {
    console.log('[DB] Seeding hospitals...');
    
    // Seed Demo Hospitals (preserving exact 3D coordinates & metadata)
    const demoHospitals = [
      { id: 'H-001', name: 'Aurelia Medical Institute', short: 'AMI', area: 'Sector 62, Noida', dist: 2.4, beds: 12, icu: 4, spec: 8, status: 'Available', color: '#9c4b60', x: -2.7, z: -1.2, tags: ['Trauma', 'Cardiac', 'Neuro'], is_demo: true },
      { id: 'H-002', name: 'Crescent Multispeciality', short: 'CMH', area: 'Sector 50, Noida', dist: 4.8, beds: 7, icu: 2, spec: 5, status: 'Limited', color: '#b98b55', x: 1.9, z: -2.1, tags: ['Trauma', 'Orthopaedic'], is_demo: true },
      { id: 'H-003', name: 'St. Raphael Hospital', short: 'SRH', area: 'Indirapuram, Ghaziabad', dist: 7.1, beds: 18, icu: 6, spec: 11, status: 'Available', color: '#9c4b60', x: 2.9, z: 1.5, tags: ['Cardiac', 'Neuro', 'ICU'], is_demo: true },
      { id: 'H-004', name: 'Northgate Care Centre', short: 'NCC', area: 'Sector 18, Noida', dist: 5.3, beds: 0, icu: 0, spec: 4, status: 'At capacity', color: '#77716d', x: -1.2, z: 2.6, tags: ['General', 'Orthopaedic'], is_demo: true },
      { id: 'H-005', name: 'Veda Institute of Health', short: 'VIH', area: 'Sector 137, Noida', dist: 9.6, beds: 9, icu: 3, spec: 7, status: 'Available', color: '#9c4b60', x: -3.5, z: 2.3, tags: ['Trauma', 'ICU'], is_demo: true },
    ];

    // Seed Live/Production Hospitals (marked is_demo = false)
    const liveHospitals = [
      { id: 'H-101', name: 'Apex Metropolitan Trauma Center', short: 'AMTC', area: 'Greater Noida West', dist: 3.8, beds: 24, icu: 8, spec: 14, status: 'Available', color: '#9c4b60', x: 0.8, z: 0.5, tags: ['Trauma', 'Cardiac', 'Neuro', 'ICU'], is_demo: false },
      { id: 'H-102', name: 'NCR Central Emergency Care', short: 'NCEC', area: 'Sector 128, Noida', dist: 6.2, beds: 14, icu: 5, spec: 9, status: 'Available', color: '#9c4b60', x: -0.5, z: -2.8, tags: ['Trauma', 'Orthopaedic', 'ICU'], is_demo: false },
    ];

    for (const h of [...demoHospitals, ...liveHospitals]) {
      await client.query(`
        INSERT INTO hospitals (
          id, name, short_name, area, distance_km, general_beds_total, general_beds_available,
          icu_beds_total, icu_beds_available, specialists_count, status, color, coord_x, coord_z, tags, is_demo
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (id) DO NOTHING;
      `, [
        h.id, h.name, h.short, h.area, h.dist,
        h.beds + 15, h.beds,
        h.icu + 6, h.icu,
        h.spec, h.status, h.color, h.x, h.z, h.tags, h.is_demo
      ]);
    }
  }

  // Check if users exist
  const userCheck = await client.query('SELECT COUNT(*) FROM users');
  if (parseInt(userCheck.rows[0].count, 10) === 0) {
    console.log('[DB] Seeding 4 role persona accounts...');
    const hashedPass = await bcrypt.hash('CareBridge2026!', 10);

    const usersToSeed = [
      {
        email: 'coordinator@carebridge.health',
        fullName: 'Dr. Sarah Chen',
        role: 'coordinator',
        hospitalId: null,
        badge: 'NCR-COORD-01',
        initials: 'SC'
      },
      {
        email: 'staff@aurelia.health',
        fullName: 'Marcus Vance',
        role: 'hospital_staff',
        hospitalId: 'H-001',
        badge: 'AMI-STAFF-44',
        initials: 'MV'
      },
      {
        email: 'paramedic@carebridge.health',
        fullName: 'Alex Rivera (EMT-P)',
        role: 'paramedic',
        hospitalId: null,
        badge: 'NCR-UNIT-07',
        initials: 'AR'
      },
      {
        email: 'auditor@carebridge.health',
        fullName: 'Elena Rostova',
        role: 'auditor',
        hospitalId: null,
        badge: 'NCR-AUDIT-99',
        initials: 'ER'
      },
    ];

    for (const u of usersToSeed) {
      await client.query(`
        INSERT INTO users (email, password_hash, full_name, role, hospital_id, badge_number, avatar_initials)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (email) DO NOTHING;
      `, [u.email, hashedPass, u.fullName, u.role, u.hospitalId, u.badge, u.initials]);
    }
  }

  // Get coordinator ID for seeding requests
  const coordRes = await client.query("SELECT id FROM users WHERE role = 'coordinator' LIMIT 1");
  const coordId = coordRes.rows[0]?.id || null;

  // Check if emergency requests exist
  const reqCheck = await client.query('SELECT COUNT(*) FROM emergency_requests');
  if (parseInt(reqCheck.rows[0].count, 10) === 0) {
    console.log('[DB] Seeding emergency requests...');
    const demoReqs = [
      { id: 'CB-2048', patient: 'Demo Patient A', type: 'Trauma assessment', urgency: 'High', loc: 'Sector 61, Noida', status: 'Awaiting hospital', match: 'H-001', is_demo: true },
      { id: 'CB-2047', patient: 'Demo Patient B', type: 'Cardiac evaluation', urgency: 'Critical', loc: 'Sector 50, Noida', status: 'Referral accepted', match: 'H-003', is_demo: true },
      { id: 'CB-2046', patient: 'Demo Patient C', type: 'Orthopaedic consult', urgency: 'Medium', loc: 'Indirapuram, Ghaziabad', status: 'In coordination', match: 'H-002', is_demo: true },
    ];

    const liveReqs = [
      { id: 'CB-3001', patient: 'Priya Sharma (Age 42)', type: 'Cardiac evaluation', urgency: 'Critical', loc: 'Greater Noida West, Express Highway', status: 'Evaluating', match: 'H-101', is_demo: false },
      { id: 'CB-3002', patient: 'Vikram Mehta (Age 29)', type: 'Trauma assessment', urgency: 'High', loc: 'Sector 128, Noida Toll Plaza', status: 'New request', match: 'H-102', is_demo: false },
    ];

    for (const r of [...demoReqs, ...liveReqs]) {
      await client.query(`
        INSERT INTO emergency_requests (id, patient_name, service_type, urgency, location, status, matched_hospital_id, created_by_user_id, is_demo)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO NOTHING;
      `, [r.id, r.patient, r.type, r.urgency, r.loc, r.status, r.match, coordId, r.is_demo]);
    }
  }

  // Check if referrals exist
  const refCheck = await client.query('SELECT COUNT(*) FROM referrals');
  if (parseInt(refCheck.rows[0].count, 10) === 0) {
    console.log('[DB] Seeding referrals...');
    await client.query(`
      INSERT INTO referrals (id, request_id, from_hospital_id, to_hospital_id, assigned_by_user_id, status, priority, notes, is_demo)
      VALUES
        ('REF-1001', 'CB-2047', 'H-002', 'H-003', $1, 'Accepted', 'Critical', 'Emergency cardiac catheterization required immediately.', TRUE),
        ('REF-1002', 'CB-2046', NULL, 'H-002', $1, 'In Transit', 'Medium', 'Closed reduction needed for compound fracture.', TRUE)
      ON CONFLICT (id) DO NOTHING;
    `, [coordId]);
  }

  // Check if audit logs exist
  const auditCheck = await client.query('SELECT COUNT(*) FROM audit_logs');
  if (parseInt(auditCheck.rows[0].count, 10) === 0) {
    console.log('[DB] Seeding initial audit trail...');
    await client.query(`
      INSERT INTO audit_logs (user_id, user_name, user_role, action, entity_type, entity_id, details, ip_address, created_at)
      VALUES
        ($1, 'Dr. Sarah Chen', 'coordinator', 'SYSTEM_INITIALIZATION', 'SYSTEM', 'NCR-CORE', '{"event": "CareBridge platform core node online", "region": "North Capital Region"}', '127.0.0.1', NOW() - INTERVAL '45 minutes'),
        ($1, 'Dr. Sarah Chen', 'coordinator', 'REFERRAL_DISPATCHED', 'REFERRAL', 'REF-1001', '{"patient": "Demo Patient B", "to_hospital": "St. Raphael Hospital", "service": "Cardiac evaluation"}', '127.0.0.1', NOW() - INTERVAL '25 minutes'),
        ($1, 'Marcus Vance', 'hospital_staff', 'CAPACITY_UPDATED', 'HOSPITAL', 'H-001', '{"metric": "general_beds", "previous": 14, "current": 12, "reason": "Admitted emergency trauma intake"}', '127.0.0.1', NOW() - INTERVAL '12 minutes'),
        ($1, 'Alex Rivera (EMT-P)', 'paramedic', 'EMERGENCY_INTAKE', 'REQUEST', 'CB-3001', '{"urgency": "Critical", "patient": "Priya Sharma", "vitals": "BP 80/50, HR 135"}', '127.0.0.1', NOW() - INTERVAL '5 minutes');
    `, [coordId]);
  }
}
