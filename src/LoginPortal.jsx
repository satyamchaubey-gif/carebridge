import React, { useState } from 'react';
import {
  HeartPulse, Hospital, Shield, Ambulance, ShieldCheck,
  Lock, ArrowRight, CheckCircle2, AlertCircle, KeyRound, Siren, Building2, Sparkles, Loader2
} from 'lucide-react';
import { api } from './api.js';
import PublicSosModal from './PublicSosModal.jsx';

export default function LoginPortal({ onLoginSuccess }) {
  const [tab, setTab] = useState('hospitals'); // 'hospitals' | 'roles' | 'credentials'
  const [showSosModal, setShowSosModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeItem, setActiveItem] = useState(null);
  const [error, setError] = useState('');

  const hospitalsList = [
    {
      id: 'H-001',
      name: 'Aurelia Medical Institute',
      area: 'Sector 62, Noida',
      lead: 'Marcus Vance',
      beds: '11 Beds Ready',
    },
    {
      id: 'H-002',
      name: 'Crescent Multispeciality',
      area: 'Sector 50, Noida',
      lead: 'Dr. Ananya Roy',
      beds: '7 Beds Ready',
    },
    {
      id: 'H-003',
      name: 'St. Raphael Hospital',
      area: 'Indirapuram, Ghaziabad',
      lead: 'Dr. David Kurian',
      beds: '18 Beds Ready',
    },
    {
      id: 'H-101',
      name: 'Apex Trauma Center',
      area: 'Greater Noida West',
      lead: 'Dr. Vikram Singhania',
      beds: '24 Beds Ready',
    },
    {
      id: 'H-004',
      name: 'Northgate Care Centre',
      area: 'Sector 18, Noida',
      lead: 'Sister Rachel Green',
      beds: 'Sync Ready',
    },
    {
      id: 'H-005',
      name: 'Veda Institute of Health',
      area: 'Sector 137, Noida',
      lead: 'Dr. Kabir Seth',
      beds: '9 Beds Ready',
    },
  ];

  const rolesList = [
    {
      role: 'coordinator',
      title: 'Dr. Sarah Chen',
      subtitle: 'System Coordinator & Regional Dispatcher',
      desc: 'Central command authority, regional triage matching & hospital routing.',
      icon: Shield,
    },
    {
      role: 'paramedic',
      title: 'Alex Rivera (EMT-P)',
      subtitle: 'Mobile Paramedic Unit 7',
      desc: 'On-scene emergency intake, patient transit telemetry & ambulance dispatch.',
      icon: Ambulance,
    },
    {
      role: 'auditor',
      title: 'Elena Rostova',
      subtitle: 'Clinical Compliance Auditor',
      desc: 'Immutable audit log inspection, clinical score verification & compliance analytics.',
      icon: ShieldCheck,
    },
  ];

  const handleHospitalLogin = async (hospId) => {
    setActiveItem(hospId);
    setLoading(true);
    setError('');
    try {
      const res = await api.loginHospital(hospId);
      if (res?.user) {
        onLoginSuccess(res.user);
      }
    } catch (err) {
      setError(err.message || 'Hospital login failed. Please try again.');
    } finally {
      setLoading(false);
      setActiveItem(null);
    }
  };

  const handleRoleLogin = async (role) => {
    setActiveItem(role);
    setLoading(true);
    setError('');
    try {
      const res = await api.switchPersona(role);
      if (res?.user) {
        onLoginSuccess(res.user);
      }
    } catch (err) {
      setError(err.message || 'Persona login failed. Please try again.');
    } finally {
      setLoading(false);
      setActiveItem(null);
    }
  };

  const handleCredentialsSubmit = async (e) => {
    if (e) e.preventDefault();
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

  const fillQuickCredentials = (roleEmail) => {
    setEmail(roleEmail);
    setPassword('CareBridge2026!');
  };

  return (
    <div className="login-portal">
      <div className="login-container">
        {/* Urgent Emergency Callout - Positioned Cleanly in Document Flow */}
        <div className="login-sos-banner">
          <div className="sos-banner-left">
            <span className="live-dot pulse-red"></span>
            <div>
              <div className="sos-title">CRITICAL EMERGENCY? NO LOGIN REQUIRED</div>
              <div className="sos-subtitle">Instant GPS location pin & emergency ambulance dispatch</div>
            </div>
          </div>
          <button
            onClick={() => setShowSosModal(true)}
            className="btn btn-primary sos-button"
          >
            <Siren size={15} /> CALL SOS AMBULANCE
          </button>
        </div>

        {/* Portal Branding */}
        <div className="login-header">
          <div className="login-brand-mark">
            <HeartPulse size={26} />
          </div>
          <h1 className="login-title">
            CareBridge<span>.</span>
          </h1>
          <p className="login-subtitle">
            Regional Emergency Healthcare Command Gateway
          </p>
        </div>

        {/* Clean Login Card */}
        <div className="login-card">
          {/* Navigation Tabs */}
          <div className="login-tabs">
            <button
              className={`login-tab-btn ${tab === 'hospitals' ? 'active' : ''}`}
              onClick={() => { setTab('hospitals'); setError(''); }}
              type="button"
            >
              <Hospital size={14} /> Hospital Desks
            </button>
            <button
              className={`login-tab-btn ${tab === 'roles' ? 'active' : ''}`}
              onClick={() => { setTab('roles'); setError(''); }}
              type="button"
            >
              <Shield size={14} /> Command Units
            </button>
            <button
              className={`login-tab-btn ${tab === 'credentials' ? 'active' : ''}`}
              onClick={() => { setTab('credentials'); setError(''); }}
              type="button"
            >
              <KeyRound size={14} /> Sign In
            </button>
          </div>

          {error && (
            <div className="login-error-box">
              <AlertCircle size={15} /> <span>{error}</span>
            </div>
          )}

          {/* TAB 1: Hospital Facilities */}
          {tab === 'hospitals' && (
            <div>
              <div className="tab-instruction">
                Select your assigned facility desk to enter:
              </div>
              <div className="facility-login-grid">
                {hospitalsList.map((h) => {
                  const isCurrent = loading && activeItem === h.id;
                  return (
                    <button
                      key={h.id}
                      className="facility-login-card"
                      disabled={loading}
                      onClick={() => handleHospitalLogin(h.id)}
                      type="button"
                    >
                      <div className="facility-card-top">
                        <span className="facility-id">{h.id}</span>
                        <span className="facility-login-badge">
                          <CheckCircle2 size={11} /> {h.beds}
                        </span>
                      </div>
                      <div className="facility-name">{h.name}</div>
                      <div className="facility-meta">
                        <span>{h.area}</span>
                        <span>•</span>
                        <span>Lead: {h.lead}</span>
                      </div>
                      {isCurrent && (
                        <div className="card-loading-overlay">
                          <Loader2 size={16} className="spin-icon" /> Connecting...
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: Regional Command Roles */}
          {tab === 'roles' && (
            <div className="roles-login-list">
              <div className="tab-instruction">
                Choose your command persona:
              </div>
              {rolesList.map((r) => {
                const Icon = r.icon;
                const isCurrent = loading && activeItem === r.role;
                return (
                  <button
                    key={r.role}
                    className="role-login-card"
                    disabled={loading}
                    onClick={() => handleRoleLogin(r.role)}
                    type="button"
                  >
                    <div className="role-icon-box">
                      <Icon size={20} />
                    </div>
                    <div className="role-text-box">
                      <div className="role-title">{r.title}</div>
                      <div className="role-subtitle">{r.subtitle}</div>
                      <div className="role-desc">{r.desc}</div>
                    </div>
                    <div className="role-arrow">
                      {isCurrent ? <Loader2 size={16} className="spin-icon" /> : <ArrowRight size={16} />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* TAB 3: Credentials Login */}
          {tab === 'credentials' && (
            <form onSubmit={handleCredentialsSubmit} className="credentials-form">
              <div className="input-field-group">
                <label>Official Email</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. coordinator@carebridge.health"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="input-field-group">
                <label>Access Password</label>
                <input
                  type="password"
                  required
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {/* Fast 1-Click Test Login Pills */}
              <div className="quick-fill-section">
                <span className="quick-fill-label">Quick autofill:</span>
                <button
                  type="button"
                  className="quick-fill-pill"
                  onClick={() => fillQuickCredentials('coordinator@carebridge.health')}
                >
                  Coordinator
                </button>
                <button
                  type="button"
                  className="quick-fill-pill"
                  onClick={() => fillQuickCredentials('staff@aurelia.health')}
                >
                  Hospital Staff
                </button>
              </div>

              <button
                type="submit"
                className="btn btn-primary submit-btn"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 size={15} className="spin-icon" /> Authenticating...
                  </>
                ) : (
                  <>
                    Sign In to Portal <ArrowRight size={15} />
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Subtle, Clean Footer */}
        <div className="login-clean-footer">
          <span>PostgreSQL 18 Persistent</span>
          <span>•</span>
          <span>End-to-End Encrypted</span>
          <span>•</span>
          <span>CareBridge v1.0</span>
        </div>
      </div>

      {/* Zero-Login Public SOS Modal */}
      {showSosModal && (
        <PublicSosModal
          onClose={() => setShowSosModal(false)}
          onDispatchSuccess={() => {}}
        />
      )}
    </div>
  );
}
