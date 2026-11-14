import React, { useState, useEffect } from 'react';
import {
  Siren, MapPin, Phone, ShieldAlert, CheckCircle2,
  Navigation, Crosshair, ArrowRight, X, Clock, AlertTriangle, Hospital
} from 'lucide-react';
import { api } from './api.js';

export default function PublicSosModal({ onClose, onDispatchSuccess }) {
  const [locating, setLocating] = useState(false);
  const [gps, setGps] = useState({ lat: 28.585, lng: 77.365, accuracy: 'Default NCR Core' });
  const [locationName, setLocationName] = useState('Noida Expressway, Sector 128 (GPS Auto-Detected)');
  const [patientName, setPatientName] = useState('Accident Victim / Citizen SOS');
  const [serviceType, setServiceType] = useState('Trauma assessment');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dispatchedData, setDispatchedData] = useState(null);

  // Auto-detect browser GPS coordinates on mount
  useEffect(() => {
    if (navigator.geolocation) {
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGps({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: `High Precision GPS (±${Math.round(position.coords.accuracy)}m)`,
          });
          setLocationName(`Live GPS: ${position.coords.latitude.toFixed(4)}° N, ${position.coords.longitude.toFixed(4)}° E`);
          setLocating(false);
        },
        (error) => {
          console.warn('Geolocation error or permission denied:', error.message);
          // Fallback to active NCR sector
          setGps({ lat: 28.5714, lng: 77.3686, accuracy: 'Sector Proximity Fallback' });
          setLocationName('Noida Expressway, Sector 50 (Estimated)');
          setLocating(false);
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    }
  }, []);

  const handleDispatch = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.publicSos({
        patient_name: patientName || 'Emergency Citizen',
        service_type: serviceType,
        location: locationName,
        latitude: gps.lat,
        longitude: gps.lng,
        caller_phone: phone || 'Public SOS Emergency Call',
      });

      if (res.success) {
        setDispatchedData(res);
        if (onDispatchSuccess) onDispatchSuccess(res);
      }
    } catch (err) {
      alert(`SOS Dispatch Failed: ${err.message}. Please dial 112 immediately!`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 200 }}>
      <div className="modal" style={{ width: 'min(580px, 100%)', border: '2px solid var(--accent-crimson)', background: '#0a0f1c' }}>
        {/* Header */}
        <div className="modal-top" style={{ marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-crimson)', fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700 }}>
              <Siren size={18} className="live-dot" style={{ width: 'auto', height: 'auto', background: 'none', boxShadow: 'none' }} />
              CITIZEN SOS DISPATCH — NO LOGIN REQUIRED
            </div>
            <h2 style={{ color: '#fff', fontSize: '22px', margin: '6px 0 2px' }}>
              Immediate Emergency Response
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
              Real-time GPS tracking will dispatch the nearest ambulance and prep the trauma ward.
            </p>
          </div>
          <button className="square-btn" onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {!dispatchedData ? (
          <form onSubmit={handleDispatch} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Live GPS Telemetry Box */}
            <div style={{ background: 'rgba(225, 29, 72, 0.08)', border: '1px solid rgba(225, 29, 72, 0.3)', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-crimson)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Crosshair size={14} /> LIVE CALLER LOCATION:
                </span>
                <span className="mono" style={{ fontSize: '10px', color: locating ? 'var(--accent-amber)' : 'var(--accent-emerald)' }}>
                  {locating ? 'Acquiring GPS Satellite...' : gps.accuracy}
                </span>
              </div>
              <input
                required
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                style={{
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid var(--border-medium)',
                  height: '38px',
                  borderRadius: '6px',
                  padding: '0 10px',
                  color: '#fff',
                  fontSize: '12px',
                }}
              />
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="pill-btn"
                  style={{ padding: '3px 8px', fontSize: '9px' }}
                  onClick={() => setLocationName('Noida Expressway KM 14 (Near Toll)')}
                >
                  Noida Expressway
                </button>
                <button
                  type="button"
                  className="pill-btn"
                  style={{ padding: '3px 8px', fontSize: '9px' }}
                  onClick={() => setLocationName('Sector 62, Fortis Junction, Noida')}
                >
                  Sector 62 Junction
                </button>
                <button
                  type="button"
                  className="pill-btn"
                  style={{ padding: '3px 8px', fontSize: '9px' }}
                  onClick={() => setLocationName('Indirapuram Habitat Center, Ghaziabad')}
                >
                  Indirapuram
                </button>
              </div>
            </div>

            {/* Emergency Service Type */}
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <span>Emergency Incident Nature</span>
              <select
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value)}
                style={{
                  height: '42px',
                  borderRadius: '8px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid var(--border-medium)',
                  color: '#fff',
                  padding: '0 12px',
                  fontSize: '13px',
                }}
              >
                <option value="Trauma assessment">🚨 Severe Accident / Road Collision / Bleeding</option>
                <option value="Cardiac evaluation">❤️ Heart Attack / Sudden Chest Pain</option>
                <option value="ICU admission review">🏥 Unconscious / Severe Respiratory Distress</option>
                <option value="Neurology assessment">🧠 Stroke / Brain Injury / Seizure</option>
                <option value="General emergency">🚑 Other Critical Medical Emergency</option>
              </select>
            </label>

            <div className="form-row">
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <span>Patient / Caller Name</span>
                <input
                  required
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="e.g. Ramesh Singh / Bystander"
                  style={{
                    height: '40px',
                    borderRadius: '8px',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid var(--border-medium)',
                    color: '#fff',
                    padding: '0 12px',
                  }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <span>Caller Contact Phone (Optional)</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                  style={{
                    height: '40px',
                    borderRadius: '8px',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid var(--border-medium)',
                    color: '#fff',
                    padding: '0 12px',
                  }}
                />
              </label>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', padding: '10px 12px', borderRadius: '8px', fontSize: '11px', color: 'var(--accent-amber)' }}>
              <AlertTriangle size={16} />
              <span>By pressing dispatch, nearest available trauma ambulance is dispatched immediately.</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button type="button" className="btn btn-quiet" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary"
                style={{ height: '46px', fontSize: '13px', padding: '0 20px', background: 'linear-gradient(135deg, #ef4444, #b91c1c)', boxShadow: '0 0 25px rgba(239, 68, 68, 0.5)' }}
              >
                {submitting ? 'DISPATCHING AMBULANCE...' : '🚨 DISPATCH AMBULANCE NOW'} <ArrowRight size={16} />
              </button>
            </div>
          </form>
        ) : (
          /* Live Approaching Ambulance Screen */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'center', padding: '10px 0' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', border: '2px solid var(--accent-emerald)', color: 'var(--accent-emerald)', display: 'grid', placeItems: 'center', margin: '0 auto', boxShadow: '0 0 25px rgba(16, 185, 129, 0.4)' }}>
              <CheckCircle2 size={36} />
            </div>

            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '20px', color: '#fff', margin: '0 0 4px' }}>
                AMBULANCE EN ROUTE TO YOUR GPS LOCATION!
              </h3>
              <span className="mono" style={{ color: 'var(--accent-cyan)', fontSize: '12px' }}>
                Case ID: {dispatchedData.requestId}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '14px', textAlign: 'left' }}>
              <div>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>ASSIGNED AMBULANCE</span>
                <b style={{ display: 'block', fontSize: '13px', color: '#fff' }}>{dispatchedData.ambulanceUnit}</b>
              </div>
              <div>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>ESTIMATED ARRIVAL TIME</span>
                <b style={{ display: 'block', fontSize: '15px', color: 'var(--accent-emerald)' }}>~{dispatchedData.etaMinutes} Minutes</b>
              </div>
              <div style={{ gridColumn: 'span 2', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>DESTINATION MEDICAL CENTER</span>
                <b style={{ display: 'block', fontSize: '13px', color: 'var(--accent-crimson)' }}>
                  {dispatchedData.matchedHospital?.name} ({dispatchedData.matchedHospital?.distanceKm} km away)
                </b>
              </div>
            </div>

            <div style={{ background: 'rgba(225, 29, 72, 0.1)', border: '1px solid rgba(225, 29, 72, 0.3)', padding: '12px', borderRadius: '8px', fontSize: '11px', color: '#ff859d', textAlign: 'left' }}>
              <b>Emergency Guidance:</b>
              <ul style={{ paddingLeft: '16px', marginTop: '4px' }}>
                <li>Keep the caller phone line free. The emergency paramedic will call for exact landmark.</li>
                <li>If the victim is bleeding, apply firm pressure with a clean cloth.</li>
                <li>Do not move head or neck if spinal trauma is suspected.</li>
              </ul>
            </div>

            <button
              className="btn btn-primary"
              onClick={onClose}
              style={{ height: '42px', width: '100%', fontSize: '12px' }}
            >
              Close & View Live Network Telemetry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
