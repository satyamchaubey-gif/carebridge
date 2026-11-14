import React, { useState } from 'react';
import {
  HeartPulse, Hospital, Shield, Ambulance, ShieldCheck,
  Lock, Mail, ArrowRight, CheckCircle2, AlertCircle, KeyRound, Siren, PhoneCall, Building2, Globe
} from 'lucide-react';
import { api } from './api.js';
import PublicSosModal from './PublicSosModal.jsx';

export default function LoginPortal({ onLoginSuccess }) {
  const [tab, setTab] = useState('hospitals'); // 'hospitals' | 'roles' | 'credentials'
  const [showSosModal, setShowSosModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const hospitalsList = [
    {
      id: 'H-001',
      name: 'Aurelia Medical Institute',
      area: 'Sector 62, Noida',
      lead: 'Marcus Vance',
      designation: 'Trauma & Emergency Reception Desk',
      beds: '11 Beds Ready',
    },
    {
      id: 'H-002',
      name: 'Crescent Multispeciality',
      area: 'Sector 50, Noida',
      lead: 'Dr. Ananya Roy',
      designation: 'Emergency Care Administrator',
      beds: '7 Beds Ready',
    },
    {
      id: 'H-003',
      name: 'St. Raphael Hospital',
      area: 'Indirapuram, Ghaziabad',
      lead: 'Dr. David Kurian',
      designation: 'Cardiac Wing Coordinator',
      beds: '18 Beds Ready',
    },
    {
      id: 'H-101',
      name: 'Apex Metropolitan Trauma',
      area: 'Greater Noida West',
      lead: 'Dr. Vikram Singhania',
      designation: 'ICU Critical Care Director',
      beds: '24 Beds Ready',
    },
    {
      id: 'H-004',
      name: 'Northgate Care Centre',
      area: 'Sector 18, Noida',
      lead: 'Sister Rachel Green',
      designation: 'Triage Supervisor',
      beds: 'Capacity Sync',
    },
    {
      id: 'H-005',
      name: 'Veda Institute of Health',
      area: 'Sector 137, Noida',
      lead: 'Dr. Kabir Seth',
      designation: 'Emergency Medicine Specialist',
      beds: '9 Beds Ready',
    },
  ];

  const rolesList = [
    {
      role: 'coordinator',
      title: 'Dr. Sarah Chen',
      subtitle: 'System Coordinator & Regional Dispatcher',
      desc: 'Full regional command authority, multi-facility routing, and protocol override.',
      icon: Shield,
    },
    {
      role: 'paramedic',
      title: 'Alex Rivera (EMT-P)',
      subtitle: 'Mobile Paramedic Unit 7',
      desc: 'Field emergency case intake, GPS proximity routing, and ambulance transfer requests.',
      icon: Ambulance,
    },
    {
      role: 'auditor',
      title: 'Elena Rostova',
      subtitle: 'Clinical Compliance Auditor',
      desc: 'Immutable audit trail inspection, compliance scoring, and regional capacity analytics.',
      icon: ShieldCheck,
    },
  ];

  const handleHospitalLogin = async (hospId) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.loginHospital(hospId);
      if (res?.user) {
        onLoginSuccess(res.user);
      }
    } catch (err) {
      setError(err.message || 'Hospital login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleLogin = async (role) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.switchPersona(role);
      if (res?.user) {
        onLoginSuccess(res.user);
      }
    } catch (err) {
      setError(err.message || 'Persona authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.login(email, password);
      if (res?.user) {
        onLoginSuccess(res.user);
      }
    } catch (err) {
      setError(err.message || 'Authentication credentials invalid');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-portal">
      {/* Top Urgent Emergency Callout (No Login Needed) */}
      <div style={{ position: 'absolute', top: '18px', width: 'min(920px, 94%)', zIndex: 30, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(225, 29, 72, 0.12)', border: '1px solid rgba(225, 29, 72, 0.4)', borderRadius: '12px', padding: '10px 18px', backdropFilter: 'blur(10px)', boxShadow: '0 0 25px rgba(225, 29, 72, 0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="live-dot" style={{ background: 'var(--accent-crimson)', boxShadow: '0 0 10px var(--accent-crimson)' }}></span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>
            CRITICAL EMERGENCY? NO LOGIN REQUIRED.
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }} className="hide-mobile">
            Instant GPS ambulance tracking & trauma prep.
          </span>
        </div>
        <button
          onClick={() => setShowSosModal(true)}
          className="btn btn-primary"
          style={{ height: '34px', fontSize: '11px', padding: '0 14px', background: 'linear-gradient(135deg, #ef4444, #b91c1c)', boxShadow: '0 0 15px rgba(239, 68, 68, 0.5)' }}
        >
          <Siren size={14} /> 🚨 CALL AMBULANCE NOW
        </button>
      </div>

      <div className="login-container" style={{ marginTop: '54px' }}>
        {/* Authoritative National Portal Header (PM Vidyalaxmi Style) */}
        <div className="login-header">
          <div className="login-brand-mark">
            <HeartPulse size={28} />
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.3)', padding: '3px 10px', borderRadius: '16px', fontSize: '10px', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
            <Globe size={11} /> NATIONAL CAPITAL REGION HEALTHCARE COORDINATION AUTHORITY
          </div>
          <h1 className="login-title">
            CareBridge<span>.</span> Integrated Health Gateway
          </h1>
          <p className="login-subtitle">
            Single unified access window for hospital admission desks, regional emergency dispatchers, and mobile ambulance units across NCR.
          </p>
        </div>

        {/* Clean Portal Card */}
        <div className="login-card">
          {/* Navigation Tabs */}
          <div className="login-tabs">
            <button
              className={`login-tab-btn ${tab === 'hospitals' ? 'active' : ''}`}
              onClick={() => { setTab('hospitals'); setError(''); }}
            >
              <Hospital size={15} /> 1. Hospital Facility Desks
            </button>
            <button
              className={`login-tab-btn ${tab === 'roles' ? 'active' : ''}`}
              onClick={() => { setTab('roles'); setError(''); }}
            >
              <Shield size={15} /> 2. Command & Field Units
            </button>
            <button
              className={`login-tab-btn ${tab === 'credentials' ? 'active' : ''}`}
              onClick={() => { setTab('credentials'); setError(''); }}
            >
              <KeyRound size={15} /> 3. Credentials Sign In
            </button>
          </div>

          {error && (
            <div style={{ background: 'rgba(225, 29, 72, 0.15)', border: '1px solid rgba(225, 29, 72, 0.4)', padding: '10px 14px', borderRadius: '8px', color: '#ff859d', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {/* TAB 1: Hospital Facilities */}
          {tab === 'hospitals' && (
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                <span>SELECT YOUR MEDICAL FACILITY TO ENTER SCENE-FOCUSED DESK:</span>
                <span style={{ color: 'var(--accent-emerald)' }}>● ALL 7 NODES ONLINE</span>
              </div>
              <div className="facility-login-grid">
                {hospitalsList.map((h) => (
                  <button
                    key={h.id}
                    className="facility-login-card"
                    disabled={loading}
                    onClick={() => handleHospitalLogin(h.id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span className="mono" style={{ color: 'var(--accent-crimson)', fontWeight: 600 }}>{h.id}</span>
                      <span className="facility-login-badge">
                        <CheckCircle2 size={11} /> {h.beds}
                      </span>
                    </div>
                    <b>{h.name}</b>
                    <span>{h.area}</span>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px', borderTop: '1px solid var(--border-subtle)', paddingTop: '6px' }}>
                      <b>Desk Lead:</b> {h.lead}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: Regional Command Roles */}
          {tab === 'roles' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
                AUTHENTICATE AS CENTRAL DISPATCH OR MOBILE FIELD AMBULANCE:
              </div>
              {rolesList.map((r) => {
                const Icon = r.icon;
                return (
                  <button
                    key={r.role}
                    className="facility-login-card"
                    style={{ padding: '16px 20px', flexDirection: 'row', alignItems: 'center', gap: '16px' }}
                    disabled={loading}
                    onClick={() => handleRoleLogin(r.role)}
                  >
                    <div className="metric-icon" style={{ height: '44px', width: '44px', borderRadius: '10px' }}>
                      <Icon size={22} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <b style={{ fontSize: '15px' }}>{r.title}</b>
                      <span style={{ display: 'block', color: 'var(--accent-cyan)', fontWeight: 600, fontSize: '12px' }}>
                        {r.subtitle}
                      </span>
                      <small style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                        {r.desc}
                      </small>
                    </div>
                    <ArrowRight size={18} style={{ color: 'var(--accent-crimson)' }} />
                  </button>
                );
              })}
            </div>
          )}

          {/* TAB 3: Credentials Login */}
          {tab === 'credentials' && (
            <form onSubmit={handleCredentialsSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <span>Official Healthcare Email</span>
                <input
                  type="email"
                  required
                  placeholder="e.g. coordinator@carebridge.health"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    height: '44px',
                    borderRadius: '8px',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid var(--border-medium)',
                    padding: '0 14px',
                    color: '#fff',
                    fontSize: '13px',
                  }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <span>Master Access Key / Password</span>
                <input
                  type="password"
                  required
                  placeholder="Enter your security token or password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    height: '44px',
                    borderRadius: '8px',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid var(--border-medium)',
                    padding: '0 14px',
                    color: '#fff',
                    fontSize: '13px',
                  }}
                />
              </label>

              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px 14px', borderRadius: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                <b>Pre-Configured Operator Accounts:</b> Password is <code>CareBridge2026!</code> for accounts <code>coordinator@carebridge.health</code> or <code>staff@aurelia.health</code>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{ height: '44px', fontSize: '13px' }}
              >
                {loading ? 'Authenticating...' : 'Sign In to Designated Desk'} <ArrowRight size={15} />
              </button>
            </form>
          )}
        </div>

        {/* Security Compliance Footer */}
        <div className="login-security-footer">
          <span><Lock size={12} /> 256-BIT ENCRYPTED MESH</span>
          <span>•</span>
          <span>POSTGRESQL 18 PERSISTENT</span>
          <span>•</span>
          <span>MAPTILER CLOUD GPS</span>
          <span>•</span>
          <span>NCR HEALTH PROTOCOL V2.5</span>
        </div>
      </div>

      {/* Zero-Login Public SOS Modal */}
      {showSosModal && (
        <PublicSosModal
          onClose={() => setShowSosModal(false)}
          onDispatchSuccess={(data) => {
            // Can stay on live tracking or close
          }}
        />
      )}
    </div>
  );
}
