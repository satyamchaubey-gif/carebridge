import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import {
  Activity, ArrowDownRight, ArrowUpRight, Bell, Building2, Check, CheckCircle2,
  ChevronDown, ChevronRight, Clock3, Command, Crosshair, FilePlus2, Filter,
  HeartPulse, Hospital, LayoutDashboard, LocateFixed, LogOut, MapPin, Menu,
  MoreHorizontal, Navigation, Plus, Search, Settings2, ShieldCheck, Siren,
  SlidersHorizontal, Sparkles, Stethoscope, TrendingUp, Users, X, Zap,
  Ambulance, BedDouble, CircleAlert, RefreshCw, ClipboardList, Radio,
  PanelLeftClose, ArrowRight, ExternalLink, Gauge, CircleDot, MapPinned,
  Shield, CheckCheck, Send, AlertTriangle, UserCheck, Eye, LogIn, KeyRound, Globe, Layers, User
} from 'lucide-react';
import { api, realtime } from './api.js';
import RealLeafletMap from './RealLeafletMap.jsx';
import LoginPortal from './LoginPortal.jsx';
import PublicSosModal from './PublicSosModal.jsx';
import './styles.css';

// ---------------------------------------------------------------------------
// 3D Three.js Geospatial Radar Component
// ---------------------------------------------------------------------------
function ThreeMap({ hospitals, selected, onSelect }) {
  const mountRef = useRef(null);
  const selectedRef = useRef(selected);
  const selectRef = useRef(onSelect);

  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { selectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#060910');

    const camera = new THREE.PerspectiveCamera(42, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.set(7.5, 9.5, 11);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xcfd8dc, 1.2);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xe0f2fe, 2.4);
    keyLight.position.set(5, 10, 6);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xe11d48, 1.0);
    fillLight.position.set(-6, 4, -4);
    scene.add(fillLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 16),
      new THREE.MeshStandardMaterial({ color: '#090d16', roughness: 0.95, metalness: 0.2 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.12;
    scene.add(floor);

    const grid = new THREE.GridHelper(20, 40, '#334155', '#172033');
    grid.position.y = -0.1;
    scene.add(grid);

    const roadMat = new THREE.MeshStandardMaterial({ color: '#131b2e', roughness: 0.9 });
    const roads = [
      [-0.2, 0, 0, 14, 0.18],
      [-3, 0, 0, 0.18, 11],
      [3, 0, 0, 0.18, 11],
      [0, 0, -3, 11, 0.18],
      [0, 0, 3, 11, 0.18],
    ];
    roads.forEach(([x, y, z, w, d]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.025, d), roadMat);
      m.position.set(x, -0.055, z);
      scene.add(m);
    });

    const blockMat = new THREE.MeshStandardMaterial({ color: '#182238', roughness: 0.85 });
    for (let i = 0; i < 32; i++) {
      const x = ((i * 37) % 140) / 10 - 7;
      const z = ((i * 19) % 110) / 10 - 5.5;
      if (Math.abs(x) < 1.2 && Math.abs(z) < 1.2) continue;
      const h = 0.14 + ((i * 7) % 6) * 0.065;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.42, h, 0.42), blockMat);
      b.position.set(x, h / 2 - 0.08, z);
      scene.add(b);
    }

    const nodeObjects = [];
    hospitals.forEach((h) => {
      const group = new THREE.Group();
      const isAvailable = h.status === 'Available';
      const isLimited = h.status === 'Limited';

      const colorHex = isAvailable ? '#10b981' : isLimited ? '#f59e0b' : '#64748b';
      const emissiveHex = isAvailable ? '#059669' : isLimited ? '#d97706' : '#1e293b';

      const mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: emissiveHex,
        emissiveIntensity: isAvailable ? 0.75 : 0.5,
        roughness: 0.3,
        metalness: 0.4,
      });

      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.7, 12), mat);
      stem.position.y = 0.35;
      group.add(stem);

      const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.19, 24, 24), mat);
      sphere.position.y = 0.78;
      group.add(sphere);

      const ringMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: isAvailable ? 0.85 : 0.6,
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 12, 36), ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.14;
      group.add(ring);

      group.position.set(h.x || 0, 0, h.z || 0);
      group.userData = { id: h.id };
      scene.add(group);
      nodeObjects.push(group);
    });

    const beaconMat = new THREE.MeshStandardMaterial({
      color: '#e11d48',
      emissive: '#be123c',
      emissiveIntensity: 1.4,
      metalness: 0.5,
    });
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.8, 16), beaconMat);
    beacon.position.set(0, 0.4, 0);
    scene.add(beacon);

    const beaconRing1 = new THREE.Mesh(
      new THREE.TorusGeometry(0.48, 0.022, 12, 48),
      new THREE.MeshBasicMaterial({ color: '#f43f5e', transparent: true, opacity: 0.75 })
    );
    beaconRing1.rotation.x = Math.PI / 2;
    beaconRing1.position.y = 0.05;
    scene.add(beaconRing1);

    const beaconRing2 = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.016, 12, 48),
      new THREE.MeshBasicMaterial({ color: '#06b6d4', transparent: true, opacity: 0.55 })
    );
    beaconRing2.rotation.x = Math.PI / 2;
    beaconRing2.position.y = 0.05;
    scene.add(beaconRing2);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const onClick = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(nodeObjects, true);
      if (hits.length) {
        let o = hits[0].object;
        while (o.parent && !o.userData.id) o = o.parent;
        if (o.userData.id) {
          selectRef.current(o.userData.id);
        }
      }
    };
    renderer.domElement.addEventListener('click', onClick);

    let frame = 0;
    let clock = new THREE.Clock();

    const animate = () => {
      frame = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      beacon.rotation.y = elapsed * 0.8;
      beaconRing1.rotation.z = elapsed * 0.5;
      beaconRing2.rotation.z = -elapsed * 0.35;

      nodeObjects.forEach((g) => {
        const isSelected = g.userData.id === selectedRef.current;
        const targetScale = isSelected ? 1.28 + Math.sin(elapsed * 4) * 0.05 : 1.0;
        g.scale.setScalar(targetScale);
      });

      renderer.render(scene, camera);
    };
    animate();

    const resize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      renderer.domElement.removeEventListener('click', onClick);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
    };
  }, [hospitals]);

  return (
    <div className="three-map" ref={mountRef}>
      <div className="map-overlay top">
        <span className="live-dot"></span> <b>NCR 3D CYBER RADAR</b>{' '}
        <span className="mono">• REAL-TIME POSTGRESQL 18 MESH</span>
      </div>
      <div className="map-overlay bottom">
        <span>
          <Crosshair size={13} /> CENTRAL COORDINATION NODE
        </span>
        <span className="mono">28.6139° N / 77.2090° E</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Application Component
// ---------------------------------------------------------------------------
function App() {
  // Authentication Gateway State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  // App Navigation & Selection State
  const [active, setActive] = useState('Overview');
  const [selected, setSelected] = useState('H-001');
  const [mapMode, setMapMode] = useState('gps'); // 'gps' (Leaflet OpenStreetMap) | 'radar' (Three.js 3D)

  // Data State
  const [hospitals, setHospitals] = useState([]);
  const [requests, setRequests] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [pulse, setPulse] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [analytics, setAnalytics] = useState(null);

  // Filters & State
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [urgencyFilter, setUrgencyFilter] = useState('All');
  const [dataMode, setDataMode] = useState('all'); // 'all' | 'live' | 'demo'
  const [notice, setNotice] = useState('');
  const [mobileNav, setMobileNav] = useState(false);

  // Modals & Drawers
  const [requestModal, setRequestModal] = useState(false);
  const [matchingDrawer, setMatchingDrawer] = useState(null);
  const [showSosModal, setShowSosModal] = useState(false);

  // Request intake form
  const [form, setForm] = useState({
    patient: '',
    type: 'Trauma assessment',
    urgency: 'High',
    location: '',
    isDemo: false,
  });

  const notify = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3200);
  };

  // -------------------------------------------------------------------------
  // Data Loading from PostgreSQL API
  // -------------------------------------------------------------------------
  const loadData = useCallback(async () => {
    try {
      const [hospData, reqData, refData, pulseData, anaData] = await Promise.all([
        api.getHospitals({ dataMode }),
        api.getRequests({ dataMode }),
        api.getReferrals({ dataMode }),
        api.getPulse(),
        api.getAnalytics({ dataMode }),
      ]);

      if (hospData?.hospitals) setHospitals(hospData.hospitals);
      if (reqData?.requests) setRequests(reqData.requests);
      if (refData?.referrals) setReferrals(refData.referrals);
      if (pulseData?.pulse) setPulse(pulseData.pulse);
      if (anaData) setAnalytics(anaData);
    } catch (err) {
      console.error('Data loading error:', err);
    }
  }, [dataMode]);

  const loadAuditLogs = useCallback(async () => {
    try {
      const res = await api.getAuditLogs({ limit: 40 });
      if (res?.logs) setAuditLogs(res.logs);
    } catch (err) {
      console.error('Audit load error:', err);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const res = await api.getUsers();
      if (res?.users) setUsers(res.users);
    } catch (err) {
      console.error('Users load error:', err);
    }
  }, []);

  // Check existing session on boot
  useEffect(() => {
    const token = api.getToken();
    if (token) {
      api.getMe()
        .then((res) => {
          if (res?.user) {
            setCurrentUser(res.user);
            setIsAuthenticated(true);
            if (res.user.hospitalId) {
              setSelected(res.user.hospitalId);
            }
          }
        })
        .catch(() => {
          api.logout();
          setIsAuthenticated(false);
        })
        .finally(() => {
          loadData();
        });
    }
  }, [loadData]);

  // Load audit logs and users when tabs active
  useEffect(() => {
    if (!isAuthenticated) return;
    if (active === 'Team access') loadUsers();
    if (active === 'Settings' || active === 'Analytics') loadAuditLogs();
  }, [active, isAuthenticated, loadUsers, loadAuditLogs]);

  // -------------------------------------------------------------------------
  // WebSocket Real-Time Synchronization
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated) return;
    const unsubscribe = realtime.subscribe((event) => {
      if (!event || !event.type) return;

      if (event.type === 'HOSPITAL_UPDATED') {
        const updated = event.payload;
        setHospitals((prev) =>
          prev.map((h) => (h.id === updated.id ? { ...h, ...updated } : h))
        );
      } else if (event.type === 'REQUEST_CREATED') {
        const newReq = event.payload;
        setRequests((prev) => [newReq, ...prev]);
        notify(`⚡ Emergency Alert: ${newReq.id} (${newReq.urgency})`);
      } else if (event.type === 'REQUEST_UPDATED') {
        const { id, status, matchedHospitalId } = event.payload;
        setRequests((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: status || r.status,
                  matchId: matchedHospitalId || r.matchId,
                }
              : r
          )
        );
      } else if (event.type === 'REFERRAL_CREATED') {
        const newRef = event.payload;
        setReferrals((prev) => [newRef, ...prev]);
        notify(`Transfer Dispatched: ${newRef.id} -> ${newRef.toHospitalName}`);
      } else if (event.type === 'REFERRAL_UPDATED') {
        const { id, status } = event.payload;
        setReferrals((prev) =>
          prev.map((ref) => (ref.id === id ? { ...ref, status } : ref))
        );
      } else if (event.type === 'ACTIVITY_LOGGED') {
        const item = event.payload;
        setPulse((prev) => [
          {
            id: item.id,
            title: item.action.replace(/_/g, ' '),
            desc: `${item.userName} (${item.userRole})`,
            time: new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            color: 'green',
            icon: 'CheckCircle2',
          },
          ...prev.slice(0, 7),
        ]);
      }
    });

    return unsubscribe;
  }, [isAuthenticated]);

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    if (user.hospitalId) {
      setSelected(user.hospitalId);
    }
    notify(`Authenticated as ${user.fullName} (${user.role.toUpperCase()})`);
    loadData();
  };

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
    setIsAuthenticated(false);
    notify('Logged out from CareBridge command session.');
  };

  const switchRole = async (role) => {
    try {
      const res = await api.switchPersona(role);
      if (res?.user) {
        setCurrentUser(res.user);
        notify(`Switched active profile to ${res.user.fullName} (${res.user.role})`);
        loadData();
      }
    } catch (err) {
      notify(`Role switch failed: ${err.message}`);
    }
  };

  const selectedHospital =
    hospitals.find((h) => h.id === selected) || hospitals[0] || {
      id: 'H-001',
      name: 'Aurelia Medical Institute',
      short: 'AMI',
      area: 'Sector 62, Noida',
      distance: '2.4 km',
      beds: 12,
      icu: 4,
      specialists: 8,
      score: 96,
      status: 'Available',
      color: '#9c4b60',
      tags: ['Trauma', 'Cardiac', 'Neuro'],
      updated: 'Just now',
    };

  const adjustCapacity = async (hospId, metric, delta) => {
    try {
      const res = await api.updateHospitalCapacity(hospId, {
        metric,
        delta,
        reason: `${currentUser.fullName} adjusted ${metric} by ${delta > 0 ? '+' : ''}${delta}`,
      });
      if (res.success) {
        notify(res.message);
        setHospitals((prev) =>
          prev.map((h) => (h.id === hospId ? { ...h, ...res.hospital } : h))
        );
      }
    } catch (err) {
      notify(`Capacity update restricted: ${err.message}`);
    }
  };

  const submitRequest = async (e) => {
    e.preventDefault();
    try {
      const res = await api.createRequest({
        patient_name: form.patient || 'Emergency Patient',
        service_type: form.type,
        urgency: form.urgency,
        location: form.location || 'NCR Region',
        is_demo: form.isDemo,
      });

      if (res.success) {
        notify(`Emergency case ${res.request.id} registered & matched!`);
        setRequestModal(false);
        setForm({
          patient: '',
          type: 'Trauma assessment',
          urgency: 'High',
          location: '',
          isDemo: false,
        });
        loadData();
        setActive('Emergency requests');
      }
    } catch (err) {
      notify(`Intake creation failed: ${err.message}`);
    }
  };

  const advanceReferral = async (refId, newStatus) => {
    try {
      const res = await api.updateReferralStatus(refId, {
        status: newStatus,
        notes: `Processed by ${currentUser.fullName} (${currentUser.role})`,
      });
      if (res.success) {
        notify(`Referral ${refId} status advanced to ${newStatus}`);
        loadData();
      }
    } catch (err) {
      notify(`Referral action failed: ${err.message}`);
    }
  };

  const openMatching = async (reqItem) => {
    try {
      const matchData = await api.getRequestMatches(reqItem.id);
      setMatchingDrawer({
        ...reqItem,
        rankings: matchData?.rankings || [],
      });
    } catch (err) {
      notify(`Failed to evaluate matches: ${err.message}`);
    }
  };

  const dispatchReferral = async (reqId, targetHospId, targetHospName) => {
    try {
      const res = await api.createReferral({
        request_id: reqId,
        to_hospital_id: targetHospId,
        priority: matchingDrawer?.urgency || 'High',
        notes: `Direct referral dispatched to ${targetHospName}`,
      });
      if (res.success) {
        notify(`Referral created: Dispatched to ${targetHospName}`);
        setMatchingDrawer(null);
        loadData();
      }
    } catch (err) {
      notify(`Dispatch error: ${err.message}`);
    }
  };

  // -------------------------------------------------------------------------
  // If not authenticated, render the dedicated Login Portal Gateway
  // -------------------------------------------------------------------------
  if (!isAuthenticated || !currentUser) {
    return <LoginPortal onLoginSuccess={handleLoginSuccess} />;
  }

  // Hospital-Specific Context Variables
  const isHospitalStaff = currentUser.role === 'hospital_staff';
  const myHospitalId = currentUser.hospitalId;
  const myHospital = hospitals.find((h) => h.id === myHospitalId) || selectedHospital;

  // Inbound referrals targeting this specific hospital
  const myInboundReferrals = referrals.filter(
    (r) => r.toHospitalId === myHospitalId && (r.status === 'Pending' || r.status === 'Accepted' || r.status === 'In Transit')
  );

  const nav = [
    ['Overview', LayoutDashboard],
    ['Live network', MapPinned],
    ['Emergency requests', Siren],
    ['Hospitals', Building2],
    ['Referrals', ClipboardList],
  ];

  return (
    <div className="app-shell">
      {/* Sleek Mission-Control Sidebar */}
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <HeartPulse size={22} />
          </div>
          <div>
            <div className="brand-name">
              CareBridge<span>.</span>
            </div>
            <div className="brand-sub">
              {isHospitalStaff ? 'FACILITY RECEPTION DESK' : 'REGIONAL DISPATCH MESH'}
            </div>
          </div>
          <button className="mobile-close" onClick={() => setMobileNav(false)}>
            <X size={18} />
          </button>
        </div>

        {/* Region / Hospital Scope Workspace Selector */}
        <div className="workspace">
          <div className="workspace-icon">
            {myHospitalId ? myHospitalId.replace('H-', '') : 'NCR'}
          </div>
          <div>
            <b>{currentUser.hospitalName || 'North Capital Region'}</b>
            <small>
              {isHospitalStaff
                ? 'Designated Hospital Desk'
                : 'Regional Command Center'}
            </small>
          </div>
          <ChevronDown size={14} />
        </div>

        {/* Quick Portal Gateway Switcher */}
        <div className="role-switcher-bar">
          <span>DESK:</span>
          <button
            className={`role-btn ${currentUser.role === 'coordinator' ? 'active' : ''}`}
            onClick={() => switchRole('coordinator')}
            title="System Coordinator (Full regional dispatch & override)"
          >
            Coord
          </button>
          <button
            className={`role-btn ${currentUser.role === 'hospital_staff' ? 'active' : ''}`}
            onClick={() => switchRole('hospital_staff')}
            title="Hospital Facility Staff"
          >
            Hosp
          </button>
          <button
            className={`role-btn ${currentUser.role === 'paramedic' ? 'active' : ''}`}
            onClick={() => switchRole('paramedic')}
            title="Paramedic EMT (Field Emergency Intake)"
          >
            EMT
          </button>
          <button
            className={`role-btn ${currentUser.role === 'auditor' ? 'active' : ''}`}
            onClick={() => switchRole('auditor')}
            title="Clinical Auditor (Compliance & Audit Logs)"
          >
            Audit
          </button>
        </div>

        <div className="nav-label">
          {isHospitalStaff ? 'FACILITY WORKSPACE' : 'DISPATCH & OPERATIONS'}
        </div>
        <nav>
          {nav.map(([label, Icon]) => (
            <button
              key={label}
              className={`nav-item ${active === label ? 'active' : ''}`}
              onClick={() => {
                setActive(label);
                setMobileNav(false);
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
              {label === 'Referrals' && isHospitalStaff && myInboundReferrals.length > 0 && (
                <i className="nav-count" style={{ background: 'var(--accent-crimson)', color: '#fff' }}>
                  {myInboundReferrals.length} Inbound
                </i>
              )}
              {label === 'Emergency requests' && !isHospitalStaff && (
                <i className="nav-count">
                  {requests.filter((r) => r.status !== 'Referral accepted' && r.status !== 'Admitted').length}
                </i>
              )}
            </button>
          ))}
        </nav>

        <div className="nav-label second">SYSTEM MANAGEMENT</div>
        <nav>
          <button
            className={`nav-item ${active === 'Analytics' ? 'active' : ''}`}
            onClick={() => {
              setActive('Analytics');
              setMobileNav(false);
            }}
          >
            <TrendingUp size={18} />
            <span>Analytics</span>
          </button>
          <button
            className={`nav-item ${active === 'Team access' ? 'active' : ''}`}
            onClick={() => {
              setActive('Team access');
              setMobileNav(false);
            }}
          >
            <Users size={18} />
            <span>Team access</span>
          </button>
          <button
            className={`nav-item ${active === 'Settings' ? 'active' : ''}`}
            onClick={() => {
              setActive('Settings');
              setMobileNav(false);
            }}
          >
            <Settings2 size={18} />
            <span>Settings</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="protocol-card">
            <div className="protocol-icon">
              <ShieldCheck size={16} />
            </div>
            <div>
              <b>Mesh Status</b>
              <small>Live WebSocket Stream</small>
            </div>
            <span className="status-pip"></span>
          </div>

          {/* Profile & Logout Action */}
          <div className="profile" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="avatar">{currentUser.avatarInitials || 'CB'}</div>
              <div className="profile-meta">
                <b>{currentUser.fullName}</b>
                <small>
                  {currentUser.role === 'coordinator'
                    ? 'Lead Dispatcher'
                    : isHospitalStaff
                    ? `${currentUser.hospitalName || 'Facility Desk'}`
                    : currentUser.role === 'paramedic'
                    ? 'Field Paramedic'
                    : 'Clinical Auditor'}
                </small>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="square-btn"
              title="Sign Out to Portal Gateway"
              style={{ width: '32px', height: '32px', color: 'var(--accent-crimson)' }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {mobileNav && <div className="scrim" onClick={() => setMobileNav(false)}></div>}

      {/* Main Content Area */}
      <main className="main">
        {/* Topbar */}
        <header className="topbar">
          <div className="top-left">
            <button className="mobile-menu" onClick={() => setMobileNav(true)}>
              <Menu size={19} />
            </button>
            <div className="breadcrumb">
              Workspace <ChevronRight size={13} /> <b>{active}</b>
              {currentUser.hospitalName && (
                <>
                  <ChevronRight size={13} />{' '}
                  <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>
                    {currentUser.hospitalName}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="top-actions">
            {/* Zero-Login Instant Emergency SOS Button */}
            <button
              onClick={() => setShowSosModal(true)}
              className="btn btn-primary"
              style={{ height: '34px', fontSize: '11px', padding: '0 12px', background: 'linear-gradient(135deg, #ef4444, #b91c1c)', boxShadow: '0 0 15px rgba(239, 68, 68, 0.4)' }}
            >
              <Siren size={14} /> 🚨 SOS AMBULANCE
            </button>

            {/* Data Environment Isolation Selector */}
            <div className="env-selector" title="Isolate Fictional Demo Data from Real Records">
              <button
                className={`env-pill ${dataMode === 'all' ? 'active' : ''}`}
                onClick={() => setDataMode('all')}
              >
                All
              </button>
              <button
                className={`env-pill ${dataMode === 'live' ? 'active' : ''}`}
                onClick={() => setDataMode('live')}
              >
                Live
              </button>
              <button
                className={`env-pill ${dataMode === 'demo' ? 'active' : ''}`}
                onClick={() => setDataMode('demo')}
              >
                Demo
              </button>
            </div>

            <div className="system-status hide-mobile">
              <span className="live-dot"></span> OPERATIONAL
            </div>

            <button
              className="btn btn-quiet"
              onClick={handleLogout}
              style={{ height: '34px', fontSize: '11px', padding: '0 10px', gap: '6px' }}
              title="Sign Out to Portal Gateway"
            >
              <LogOut size={13} /> Exit Desk
            </button>

            <div
              className="top-avatar"
              title={`Logged in as ${currentUser.fullName} (${currentUser.role})`}
            >
              {currentUser.avatarInitials || 'CB'}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-line"></span> SATURDAY, 14 NOVEMBER 2026{' '}
                <span className="eyebrow-dot">/</span>{' '}
                {isHospitalStaff ? 'FACILITY EMERGENCY ADMISSION WARD' : 'NCR HIGH-PRIORITY COMMAND'}
              </div>
              <h1>
                {active === 'Overview'
                  ? isHospitalStaff
                    ? `${currentUser.hospitalName || 'Hospital'} Emergency Desk`
                    : `Command Center — ${currentUser.fullName}`
                  : active}
              </h1>
              <p>
                {isHospitalStaff
                  ? `Dedicated facility dashboard for ${currentUser.hospitalName}. Monitor incoming ambulances, accept referrals, and manage bed capacity.`
                  : active === 'Overview'
                  ? 'Real-time telemetry, emergency case triage, and dynamic regional hospital routing.'
                  : `Monitor and coordinate ${active.toLowerCase()} across the CareBridge healthcare infrastructure.`}
              </p>
            </div>

            <div className="heading-actions">
              <button className="btn btn-quiet" onClick={loadData}>
                <RefreshCw size={15} /> Refresh
              </button>
              {currentUser.role !== 'auditor' && (
                <button className="btn btn-primary" onClick={() => setRequestModal(true)}>
                  <Plus size={16} /> New Emergency Case
                </button>
              )}
            </div>
          </div>

          {/* VIEW: OVERVIEW */}
          {active === 'Overview' && (
            <>
              {/* If Hospital Staff: Clean Dedicated Facility Metrics & Inbound Alert Box */}
              {isHospitalStaff && (
                <div style={{ background: 'rgba(225, 29, 72, 0.08)', border: '1px solid rgba(225, 29, 72, 0.3)', borderRadius: '12px', padding: '18px 22px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                  <div>
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--accent-crimson)', fontWeight: 700 }}>
                      INBOUND AMBULANCE TRANSFERS FOR {myHospital.name.toUpperCase()}
                    </span>
                    <h3 style={{ fontSize: '18px', color: '#fff', margin: '4px 0 2px' }}>
                      {myInboundReferrals.length > 0
                        ? `${myInboundReferrals.length} Patient Transfer(s) Approaching Ward`
                        : 'No pending inbound transfers at this moment.'}
                    </h3>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Available Beds: <b>{myHospital.beds}</b> • ICU Capacity: <b>{myHospital.icu}</b> • Specialists On Duty: <b>{myHospital.specialists}</b>
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn btn-quiet"
                      onClick={() => adjustCapacity(myHospital.id, 'beds', -1)}
                      style={{ fontSize: '11px' }}
                    >
                      Reserve Bed (-1)
                    </button>
                    <button
                      className="btn btn-quiet"
                      onClick={() => adjustCapacity(myHospital.id, 'beds', 1)}
                      style={{ fontSize: '11px' }}
                    >
                      Release Bed (+1)
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={() => setActive('Referrals')}
                      style={{ fontSize: '11px' }}
                    >
                      View Transfer Queue <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              )}

              {/* HUD Metrics Cards */}
              <section className="metrics">
                <Metric
                  icon={Siren}
                  label={isHospitalStaff ? "MY FACILITY ADMISSIONS" : "ACTIVE EMERGENCY CASES"}
                  value={String(isHospitalStaff ? myInboundReferrals.length : analytics?.summary?.activeRequests ?? requests.length).padStart(2, '0')}
                  delta={isHospitalStaff ? "Approaching Ward" : "Live Triage Stream"}
                  trend="up"
                />
                <Metric
                  icon={Hospital}
                  label="REGIONAL HOSPITALS"
                  value={String(analytics?.summary?.totalHospitals ?? hospitals.length).padStart(2, '0')}
                  delta="NCR Mesh Nodes"
                  trend="neutral"
                />
                <Metric
                  icon={BedDouble}
                  label={isHospitalStaff ? "MY BEDS AVAILABLE" : "TOTAL CRITICAL BEDS"}
                  value={String(isHospitalStaff ? myHospital.beds : analytics?.summary?.availableBeds ?? 83).padStart(2, '0')}
                  delta="PostgreSQL Synced"
                  trend="up"
                />
                <Metric
                  icon={Zap}
                  label="MATCH ACCURACY"
                  value={analytics?.summary?.avgMatchScore ?? '86.4%'}
                  delta="Multi-Factorial Fit"
                  trend="up"
                />
              </section>

              {/* Overview Grid (Map + Selected Hospital) */}
              <section className="overview-grid">
                <div className="panel network-panel">
                  <div className="panel-head">
                    <div>
                      <div className="section-kicker">GEOSPATIAL TOPOGRAPHY</div>
                      <h2>
                        Network Radar <span className="live-label"><i></i> LIVE</span>
                      </h2>
                      <p>Switch between MapTiler Cloud GPS Map & 3D Cyber Radar</p>
                    </div>

                    <div className="map-mode-bar">
                      <button
                        className={`map-mode-btn ${mapMode === 'gps' ? 'active' : ''}`}
                        onClick={() => setMapMode('gps')}
                      >
                        <Globe size={13} /> Real GPS Map
                      </button>
                      <button
                        className={`map-mode-btn ${mapMode === 'radar' ? 'active' : ''}`}
                        onClick={() => setMapMode('radar')}
                      >
                        <Layers size={13} /> 3D Radar
                      </button>
                    </div>
                  </div>

                  <div className="map-wrap">
                    {mapMode === 'gps' ? (
                      <RealLeafletMap
                        hospitals={hospitals}
                        selected={selected}
                        onSelect={setSelected}
                        activeRequests={requests}
                      />
                    ) : (
                      <ThreeMap hospitals={hospitals} selected={selected} onSelect={setSelected} />
                    )}
                  </div>

                  <div className="map-legend">
                    <span><i className="legend-dot burgundy"></i> Available</span>
                    <span><i className="legend-dot gold"></i> Limited</span>
                    <span><i className="legend-dot grey"></i> At Capacity</span>
                    <span className="legend-note">Click any hospital pin or 3D node to inspect telemetry</span>
                  </div>
                </div>

                {/* Selected Hospital Intelligence */}
                <div className="panel selected-panel">
                  <div className="panel-head compact">
                    <div>
                      <div className="section-kicker">FACILITY TELEMETRY</div>
                      <h2>Hospital Intelligence</h2>
                    </div>
                    <button className="square-btn" onClick={() => setActive('Hospitals')}>
                      <MoreHorizontal size={17} />
                    </button>
                  </div>

                  <div className="facility-title">
                    <div className="facility-symbol">
                      <Hospital size={22} />
                    </div>
                    <div>
                      <h3>{selectedHospital.name}</h3>
                      <span>
                        {selectedHospital.id} <span className="separator">/</span> {selectedHospital.area}
                        {selectedHospital.isDemo && <span className="demo-chip">DEMO</span>}
                      </span>
                    </div>
                  </div>

                  <div className="facility-status">
                    <span
                      className={`pill ${
                        selectedHospital.status === 'Available'
                          ? 'pill-good'
                          : selectedHospital.status === 'Limited'
                          ? 'pill-warn'
                          : 'pill-muted'
                      }`}
                    >
                      <i></i>
                      {selectedHospital.status}
                    </span>
                    <span className="updated">
                      <Clock3 size={13} /> Updated {selectedHospital.updated}
                    </span>
                  </div>

                  <div className="resource-grid">
                    <Resource label="General Beds" value={selectedHospital.beds || 0} icon={BedDouble} />
                    <Resource label="ICU Units" value={selectedHospital.icu || 0} icon={Activity} />
                    <Resource label="Specialists" value={selectedHospital.specialists || 0} icon={Stethoscope} />
                  </div>

                  <div className="match-block">
                    <div className="match-head">
                      <span>Capability Match Score</span>
                      <b>{selectedHospital.score || 88}%</b>
                    </div>
                    <div className="progress">
                      <span style={{ width: `${selectedHospital.score || 88}%` }} />
                    </div>
                    <div className="match-foot">
                      <Sparkles size={13} /> Multi-factorial algorithm score
                    </div>
                  </div>

                  <div className="capabilities">
                    <div className="mini-label">REGISTERED CAPABILITIES</div>
                    <div className="tag-list">
                      {(selectedHospital.tags || []).map((t) => (
                        <span key={t}>{t}</span>
                      ))}
                    </div>
                  </div>

                  <div className="facility-actions">
                    <button
                      className="btn btn-outline"
                      onClick={() => setActive('Hospitals')}
                    >
                      View All Facilities
                    </button>
                    {(currentUser.role === 'coordinator' ||
                      (currentUser.role === 'hospital_staff' && currentUser.hospitalId === selectedHospital.id)) && (
                      <button
                        className="btn btn-primary"
                        onClick={() => adjustCapacity(selectedHospital.id, 'beds', -1)}
                      >
                        <Check size={15} /> Reserve Bed (-1)
                      </button>
                    )}
                  </div>
                </div>
              </section>

              {/* Lower Grid (Priority Queue + Activity Pulse) */}
              <section className="lower-grid">
                <div className="panel requests-panel">
                  <div className="panel-head">
                    <div>
                      <div className="section-kicker">EMERGENCY TRIAGE QUEUE</div>
                      <h2>
                        Priority Cases <span className="count-chip">{requests.length}</span>
                      </h2>
                      <p>Pending field cases requiring facility matching and dispatch</p>
                    </div>
                    <button className="text-btn" onClick={() => setActive('Emergency requests')}>
                      View Queue <ArrowRight size={14} />
                    </button>
                  </div>

                  <div className="table-tools">
                    <div className="searchbox">
                      <Search size={15} />
                      <input
                        placeholder="Search emergency cases, patients, areas..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                    <button
                      className="filter-btn"
                      onClick={() => setUrgencyFilter(urgencyFilter === 'All' ? 'Critical' : 'All')}
                    >
                      <Filter size={14} /> {urgencyFilter === 'All' ? 'All Urgencies' : 'Critical Only'}
                    </button>
                  </div>

                  <div className="request-list">
                    {requests
                      .filter(
                        (r) =>
                          (urgencyFilter === 'All' || r.urgency === urgencyFilter) &&
                          `${r.id} ${r.patient} ${r.type} ${r.location}`
                            .toLowerCase()
                            .includes(query.toLowerCase())
                      )
                      .slice(0, 5)
                      .map((r) => (
                        <div
                          className="request-row"
                          key={r.id}
                          onClick={() => openMatching(r)}
                          style={{ cursor: 'pointer' }}
                        >
                          <div className={`urgency-mark ${r.urgency.toLowerCase()}`}></div>
                          <div className="request-main">
                            <div className="request-title">
                              <b>{r.type}</b>
                              <span className={`urgency ${r.urgency.toLowerCase()}`}>{r.urgency}</span>
                              {r.isDemo && <span className="demo-chip">DEMO</span>}
                            </div>
                            <div className="request-sub">
                              <span className="mono">{r.id}</span>
                              <span>•</span>
                              <span>{r.patient}</span>
                              <span>•</span>
                              <span>{r.location}</span>
                            </div>
                          </div>
                          <div className="request-state">
                            <span
                              className={`state-dot ${
                                r.status === 'Referral accepted' || r.status === 'Admitted'
                                  ? 'accepted'
                                  : ''
                              }`}
                            ></span>
                            {r.status}
                          </div>
                          <button className="row-more" title="Evaluate Hospital Matching">
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Network Pulse */}
                <div className="panel activity-panel">
                  <div className="panel-head">
                    <div>
                      <div className="section-kicker">NETWORK PULSE</div>
                      <h2>Live Event Stream</h2>
                      <p>Immutable PostgreSQL audit feed</p>
                    </div>
                    <Radio size={17} className="activity-radio" />
                  </div>
                  <div className="timeline">
                    {pulse.slice(0, 4).map((p, idx) => (
                      <ActivityItem
                        key={p.id || idx}
                        icon={p.color === 'green' ? CheckCircle2 : p.color === 'gold' ? Radio : FilePlus2}
                        title={p.title}
                        desc={p.desc}
                        time={p.time}
                        color={p.color}
                      />
                    ))}
                  </div>
                  <button className="activity-link" onClick={() => setActive('Settings')}>
                    Open System Audit Log <ArrowRight size={14} />
                  </button>
                </div>
              </section>
            </>
          )}

          {/* VIEW: LIVE NETWORK */}
          {active === 'Live network' && (
            <div className="panel" style={{ padding: '22px' }}>
              <div className="panel-head" style={{ padding: '0 0 18px' }}>
                <div>
                  <div className="section-kicker">REGIONAL GEOSPATIAL COMMAND</div>
                  <h2>Full NCR Topology & Resource Allocation</h2>
                  <p>Interactive GPS Street map and 3D Cyber Radar with live bed/ICU adjustments</p>
                </div>

                <div className="map-mode-bar">
                  <button
                    className={`map-mode-btn ${mapMode === 'gps' ? 'active' : ''}`}
                    onClick={() => setMapMode('gps')}
                  >
                    <Globe size={13} /> Real GPS Map
                  </button>
                  <button
                    className={`map-mode-btn ${mapMode === 'radar' ? 'active' : ''}`}
                    onClick={() => setMapMode('radar')}
                  >
                    <Layers size={13} /> 3D Radar
                  </button>
                </div>
              </div>

              <div className="map-wrap" style={{ height: '460px', margin: '0 0 22px' }}>
                {mapMode === 'gps' ? (
                  <RealLeafletMap
                    hospitals={hospitals}
                    selected={selected}
                    onSelect={setSelected}
                    activeRequests={requests}
                  />
                ) : (
                  <ThreeMap hospitals={hospitals} selected={selected} onSelect={setSelected} />
                )}
              </div>

              <div className="grid-cards">
                {hospitals.map((h) => (
                  <div
                    className="facility-card"
                    key={h.id}
                    style={{
                      borderLeft: h.id === selected ? '3px solid var(--accent-crimson)' : undefined,
                    }}
                    onClick={() => setSelected(h.id)}
                  >
                    <div className="facility-card-header">
                      <div>
                        <h3>{h.name}</h3>
                        <span>
                          {h.id} • {h.area} ({h.distance})
                        </span>
                      </div>
                      <span
                        className={`pill ${
                          h.status === 'Available'
                            ? 'pill-good'
                            : h.status === 'Limited'
                            ? 'pill-warn'
                            : 'pill-muted'
                        }`}
                      >
                        <i></i>
                        {h.status}
                      </span>
                    </div>

                    <div className="bed-control-row">
                      <span>
                        <BedDouble size={15} /> General Beds Available
                      </span>
                      <div className="counter-box">
                        <button
                          className="btn-round"
                          disabled={
                            currentUser.role === 'paramedic' ||
                            currentUser.role === 'auditor' ||
                            (currentUser.role === 'hospital_staff' && currentUser.hospitalId !== h.id)
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            adjustCapacity(h.id, 'beds', -1);
                          }}
                        >
                          -
                        </button>
                        <b>{h.beds}</b>
                        <button
                          className="btn-round"
                          disabled={
                            currentUser.role === 'paramedic' ||
                            currentUser.role === 'auditor' ||
                            (currentUser.role === 'hospital_staff' && currentUser.hospitalId !== h.id)
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            adjustCapacity(h.id, 'beds', 1);
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="bed-control-row">
                      <span>
                        <Activity size={15} /> ICU Critical Care Units
                      </span>
                      <div className="counter-box">
                        <button
                          className="btn-round"
                          disabled={
                            currentUser.role === 'paramedic' ||
                            currentUser.role === 'auditor' ||
                            (currentUser.role === 'hospital_staff' && currentUser.hospitalId !== h.id)
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            adjustCapacity(h.id, 'icu', -1);
                          }}
                        >
                          -
                        </button>
                        <b>{h.icu}</b>
                        <button
                          className="btn-round"
                          disabled={
                            currentUser.role === 'paramedic' ||
                            currentUser.role === 'auditor' ||
                            (currentUser.role === 'hospital_staff' && currentUser.hospitalId !== h.id)
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            adjustCapacity(h.id, 'icu', 1);
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VIEW: EMERGENCY REQUESTS */}
          {active === 'Emergency requests' && (
            <div className="data-table-wrap">
              <div className="panel-head" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <div className="section-kicker">TRIAGE OPERATIONS</div>
                  <h2>Active Emergency Queue ({requests.length})</h2>
                  <p>Real-time intake from field paramedics and emergency dispatch units</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn btn-quiet" onClick={loadData}>
                    <RefreshCw size={14} /> Refresh
                  </button>
                  {currentUser.role !== 'auditor' && (
                    <button className="btn btn-primary" onClick={() => setRequestModal(true)}>
                      <Plus size={15} /> Intake Case
                    </button>
                  )}
                </div>
              </div>

              <table className="data-table">
                <thead>
                  <tr>
                    <th>CASE ID</th>
                    <th>PATIENT REFERENCE</th>
                    <th>SERVICE SPECIALTY</th>
                    <th>URGENCY</th>
                    <th>LOCATION</th>
                    <th>MATCHED FACILITY</th>
                    <th>STATUS</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className="mono" style={{ fontWeight: 600, color: '#fff' }}>
                          {r.id}
                        </span>
                        {r.isDemo && <span className="demo-chip">DEMO</span>}
                      </td>
                      <td><b>{r.patient}</b></td>
                      <td>{r.type}</td>
                      <td>
                        <span className={`urgency ${r.urgency.toLowerCase()}`}>{r.urgency}</span>
                      </td>
                      <td>{r.location}</td>
                      <td>
                        <span style={{ color: 'var(--accent-crimson)', fontWeight: 600 }}>
                          {r.match}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`pill ${
                            r.status === 'Referral accepted' || r.status === 'Admitted'
                              ? 'pill-good'
                              : r.status === 'In coordination' || r.status === 'In transit'
                              ? 'pill-warn'
                              : 'pill-muted'
                          }`}
                        >
                          <i></i>
                          {r.status}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-primary"
                          style={{ height: '30px', padding: '0 10px', fontSize: '11px' }}
                          onClick={() => openMatching(r)}
                        >
                          <Sparkles size={13} /> Match & Dispatch
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* VIEW: HOSPITALS */}
          {active === 'Hospitals' && (
            <div>
              <div className="grid-cards">
                {hospitals.map((h) => {
                  const canEdit =
                    currentUser.role === 'coordinator' ||
                    (currentUser.role === 'hospital_staff' && currentUser.hospitalId === h.id);

                  return (
                    <div className="facility-card" key={h.id}>
                      <div className="facility-card-header">
                        <div>
                          <h3>{h.name}</h3>
                          <span>
                            {h.id} • {h.area}
                            {h.isDemo ? (
                              <span className="demo-chip">DEMO</span>
                            ) : (
                              <span className="live-chip">LIVE</span>
                            )}
                          </span>
                        </div>
                        <span
                          className={`pill ${
                            h.status === 'Available'
                              ? 'pill-good'
                              : h.status === 'Limited'
                              ? 'pill-warn'
                              : 'pill-muted'
                          }`}
                        >
                          <i></i>
                          {h.status}
                        </span>
                      </div>

                      <div className="bed-control-row">
                        <span>
                          <BedDouble size={15} /> Beds Ready: {h.beds} / {h.bedsTotal || 50}
                        </span>
                        <div className="counter-box">
                          <button
                            className="btn-round"
                            disabled={!canEdit}
                            onClick={() => adjustCapacity(h.id, 'beds', -1)}
                            title={canEdit ? 'Decrement available beds' : 'Restricted to facility staff'}
                          >
                            -
                          </button>
                          <b>{h.beds}</b>
                          <button
                            className="btn-round"
                            disabled={!canEdit}
                            onClick={() => adjustCapacity(h.id, 'beds', 1)}
                            title={canEdit ? 'Increment available beds' : 'Restricted'}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="bed-control-row">
                        <span>
                          <Activity size={15} /> ICU Ready: {h.icu} / {h.icuTotal || 15}
                        </span>
                        <div className="counter-box">
                          <button
                            className="btn-round"
                            disabled={!canEdit}
                            onClick={() => adjustCapacity(h.id, 'icu', -1)}
                          >
                            -
                          </button>
                          <b>{h.icu}</b>
                          <button
                            className="btn-round"
                            disabled={!canEdit}
                            onClick={() => adjustCapacity(h.id, 'icu', 1)}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="bed-control-row">
                        <span>
                          <Stethoscope size={15} /> Specialists On Duty: {h.specialists}
                        </span>
                        <div className="counter-box">
                          <button
                            className="btn-round"
                            disabled={!canEdit}
                            onClick={() => adjustCapacity(h.id, 'specialists', -1)}
                          >
                            -
                          </button>
                          <b>{h.specialists}</b>
                          <button
                            className="btn-round"
                            disabled={!canEdit}
                            onClick={() => adjustCapacity(h.id, 'specialists', 1)}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="capabilities" style={{ padding: 0 }}>
                        <div className="tag-list">
                          {h.tags.map((t) => (
                            <span key={t}>{t}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW: REFERRALS (Kanban Pipeline) */}
          {active === 'Referrals' && (
            <div>
              <div className="panel-head" style={{ padding: '0 0 18px' }}>
                <div>
                  <div className="section-kicker">CROSS-FACILITY TRANSFER PIPELINE</div>
                  <h2>Active Patient Referrals ({referrals.length})</h2>
                  <p>Lifecycle tracking: Triage → Destination Reception → Bed Allocation</p>
                </div>
              </div>

              <div className="pipeline-grid">
                {['Pending', 'Accepted', 'In Transit', 'Completed'].map((stage) => {
                  const stageItems = referrals.filter((r) => r.status === stage);
                  return (
                    <div className="pipeline-col" key={stage}>
                      <div className="pipeline-col-header">
                        <span>{stage.toUpperCase()}</span>
                        <span className="count-chip">{stageItems.length}</span>
                      </div>

                      {stageItems.map((ref) => {
                        const canManage =
                          currentUser.role === 'coordinator' ||
                          (currentUser.role === 'hospital_staff' && currentUser.hospitalId === ref.toHospitalId);

                        return (
                          <div className="pipeline-card" key={ref.id}>
                            <div className="pipeline-card-title">
                              <span>{ref.patientName}</span>
                              <span className={`urgency ${ref.urgency?.toLowerCase() || 'medium'}`}>
                                {ref.priority || ref.urgency}
                              </span>
                            </div>
                            <div className="pipeline-card-meta">
                              <span>
                                <b>Case:</b> {ref.requestId} • {ref.serviceType}
                              </span>
                              <span>
                                <b>Destination:</b> {ref.toHospitalName}
                              </span>
                              {ref.notes && <span><i>"{ref.notes}"</i></span>}
                            </div>

                            {canManage && (
                              <div className="pipeline-actions">
                                {stage === 'Pending' && (
                                  <>
                                    <button
                                      className="btn btn-primary"
                                      onClick={() => advanceReferral(ref.id, 'Accepted')}
                                    >
                                      <Check size={12} /> Accept Bed
                                    </button>
                                    <button
                                      className="btn btn-quiet"
                                      onClick={() => advanceReferral(ref.id, 'Declined')}
                                    >
                                      Decline
                                    </button>
                                  </>
                                )}
                                {stage === 'Accepted' && (
                                  <button
                                    className="btn btn-primary"
                                    onClick={() => advanceReferral(ref.id, 'In Transit')}
                                  >
                                    <Ambulance size={12} /> Dispatch Ambulance
                                  </button>
                                )}
                                {stage === 'In Transit' && (
                                  <button
                                    className="btn btn-primary"
                                    onClick={() => advanceReferral(ref.id, 'Completed')}
                                  >
                                    <CheckCheck size={12} /> Confirm Admission
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW: ANALYTICS */}
          {active === 'Analytics' && (
            <div>
              <section className="metrics">
                <Metric
                  icon={BedDouble}
                  label="BED OCCUPANCY RATIO"
                  value={analytics?.summary?.occupancyRate || '74%'}
                  delta="Across Network Capacity"
                  trend="up"
                />
                <Metric
                  icon={Zap}
                  label="MATCH SUCCESS ACCURACY"
                  value={analytics?.summary?.matchSuccessRate || '91%'}
                  delta="Target Admission Success"
                  trend="up"
                />
                <Metric
                  icon={Clock3}
                  label="AVG. TRIAGE VELOCITY"
                  value="4.2m"
                  delta="Response Time"
                  trend="up"
                />
                <Metric
                  icon={ShieldCheck}
                  label="POSTGRESQL 18 UPTIME"
                  value="99.9%"
                  delta="High Availability"
                  trend="neutral"
                />
              </section>

              <div className="stat-grid">
                <div className="chart-box">
                  <h3>Incident Distribution by Urgency</h3>
                  <div className="bar-chart-row">
                    <span>Critical</span>
                    <div className="bar-track">
                      <div
                        className="bar-fill critical"
                        style={{
                          width: `${Math.min(
                            100,
                            ((analytics?.urgencyDistribution?.critical || 2) /
                              Math.max(1, analytics?.summary?.totalRequests || 1)) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                    <b>{analytics?.urgencyDistribution?.critical || 0} cases</b>
                  </div>
                  <div className="bar-chart-row">
                    <span>High</span>
                    <div className="bar-track">
                      <div
                        className="bar-fill high"
                        style={{
                          width: `${Math.min(
                            100,
                            ((analytics?.urgencyDistribution?.high || 3) /
                              Math.max(1, analytics?.summary?.totalRequests || 1)) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                    <b>{analytics?.urgencyDistribution?.high || 0} cases</b>
                  </div>
                  <div className="bar-chart-row">
                    <span>Medium</span>
                    <div className="bar-track">
                      <div
                        className="bar-fill medium"
                        style={{
                          width: `${Math.min(
                            100,
                            ((analytics?.urgencyDistribution?.medium || 1) /
                              Math.max(1, analytics?.summary?.totalRequests || 1)) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                    <b>{analytics?.urgencyDistribution?.medium || 0} cases</b>
                  </div>
                  <div className="bar-chart-row">
                    <span>Low</span>
                    <div className="bar-track">
                      <div
                        className="bar-fill low"
                        style={{
                          width: `${Math.min(
                            100,
                            ((analytics?.urgencyDistribution?.low || 0) /
                              Math.max(1, analytics?.summary?.totalRequests || 1)) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                    <b>{analytics?.urgencyDistribution?.low || 0} cases</b>
                  </div>
                </div>

                <div className="chart-box">
                  <h3>Critical Resource Utilization</h3>
                  <div className="bar-chart-row">
                    <span>General Beds Ready</span>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${Math.min(
                            100,
                            ((analytics?.summary?.availableBeds || 40) /
                              (analytics?.summary?.totalBeds || 100)) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                    <b>{analytics?.summary?.availableBeds || 0} ready</b>
                  </div>
                  <div className="bar-chart-row">
                    <span>ICU Units Ready</span>
                    <div className="bar-track">
                      <div
                        className="bar-fill high"
                        style={{
                          width: `${Math.min(
                            100,
                            ((analytics?.summary?.availableIcu || 12) /
                              (analytics?.summary?.totalIcu || 30)) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                    <b>{analytics?.summary?.availableIcu || 0} ready</b>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: TEAM ACCESS */}
          {active === 'Team access' && (
            <div className="data-table-wrap">
              <div className="panel-head" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <div className="section-kicker">ROLE-BASED ACCESS CONTROL (RBAC)</div>
                  <h2>Authorized CareBridge Personnel</h2>
                  <p>Coordinators, Hospital Staff, Field Paramedics, and Compliance Auditors</p>
                </div>
              </div>

              {/* Quick Persona Switcher */}
              <div style={{ padding: '16px 20px', background: 'rgba(0, 0, 0, 0.3)', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Quick Persona Switcher (1-Click Login):
                </span>
                <div className="quick-login-pills">
                  <button className="pill-btn" onClick={() => switchRole('coordinator')}>
                    <Shield size={13} /> Dr. Sarah Chen (Coordinator)
                  </button>
                  <button className="pill-btn" onClick={() => switchRole('hospital_staff')}>
                    <Hospital size={13} /> Marcus Vance (Aurelia Staff)
                  </button>
                  <button className="pill-btn" onClick={() => switchRole('paramedic')}>
                    <Ambulance size={13} /> Alex Rivera (Field Paramedic)
                  </button>
                  <button className="pill-btn" onClick={() => switchRole('auditor')}>
                    <ShieldCheck size={13} /> Elena Rostova (Auditor)
                  </button>
                </div>
              </div>

              <table className="data-table">
                <thead>
                  <tr>
                    <th>NAME</th>
                    <th>EMAIL</th>
                    <th>ROLE PERMISSION</th>
                    <th>BADGE / IDENTIFIER</th>
                    <th>FACILITY SCOPE</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div className="avatar" style={{ width: '28px', height: '28px', fontSize: '10px' }}>
                            {u.avatarInitials}
                          </div>
                          <b>{u.fullName}</b>
                        </div>
                      </td>
                      <td>{u.email}</td>
                      <td>
                        <span className={`role-tag ${u.role}`}>
                          {u.role.toUpperCase().replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        <span className="mono">{u.badgeNumber || 'NCR-GLOBAL'}</span>
                      </td>
                      <td>{u.hospitalName || 'Regional Dispatch'}</td>
                      <td>
                        <span className="pill pill-good">
                          <i></i> Active
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* VIEW: SETTINGS & AUDIT LOGS */}
          {active === 'Settings' && (
            <div>
              <div className="panel" style={{ padding: '22px', marginBottom: '22px' }}>
                <div className="panel-head" style={{ padding: 0, marginBottom: '16px' }}>
                  <div>
                    <div className="section-kicker">INFRASTRUCTURE TELEMETRY</div>
                    <h2>Network Protocol & Node Configuration</h2>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <div>
                    <b>PostgreSQL Connection:</b> <code>postgresql://postgres@localhost:5433/carebridge</code>
                  </div>
                  <div>
                    <b>WebSocket Engine:</b> <code>ws://localhost:4000/ws</code>
                  </div>
                  <div>
                    <b>Active Filter Environment:</b>{' '}
                    <span className="mono" style={{ fontWeight: 600, color: '#fff' }}>
                      {dataMode.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Full Audit Trail */}
              <div className="data-table-wrap">
                <div className="panel-head" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <div>
                    <div className="section-kicker">COMPLIANCE & TRACEABILITY</div>
                    <h2>Immutable System Audit Trail ({auditLogs.length})</h2>
                    <p>Tamper-evident record of clinical intake, bed allocation, and referral decisions</p>
                  </div>
                </div>

                <table className="data-table">
                  <thead>
                    <tr>
                      <th>TIMESTAMP</th>
                      <th>ACTOR</th>
                      <th>ROLE</th>
                      <th>ACTION</th>
                      <th>ENTITY</th>
                      <th>DETAILS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td>
                          <span className="mono">{log.timeFormatted}</span>
                        </td>
                        <td><b>{log.userName}</b></td>
                        <td>
                          <span className={`role-tag ${log.userRole}`}>{log.userRole}</span>
                        </td>
                        <td>
                          <span className="audit-badge dispatch">{log.action}</span>
                        </td>
                        <td>
                          <span className="mono">{log.entityType} ({log.entityId})</span>
                        </td>
                        <td>
                          <small style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono' }}>
                            {JSON.stringify(log.details)}
                          </small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <footer className="footer">
            <span>CAREBRIDGE <b>•</b> MISSION-CONTROL HEALTHCARE INFRASTRUCTURE</span>
            <span>BUILD 3.0.0 <b>·</b> MAPTILER GPS + THREE.JS + POSTGRESQL 18 + ZERO-LOGIN SOS</span>
          </footer>
        </div>
      </main>

      {/* MODAL: New Emergency Request (Internal) */}
      {requestModal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setRequestModal(false);
          }}
        >
          <form className="modal" onSubmit={submitRequest}>
            <div className="modal-top">
              <div>
                <div className="section-kicker">EMERGENCY INTAKE</div>
                <h2>Register Emergency Case</h2>
                <p>Log a patient case into the regional coordination queue.</p>
              </div>
              <button type="button" className="square-btn" onClick={() => setRequestModal(false)}>
                <X size={17} />
              </button>
            </div>

            <label>
              Patient Reference / Name
              <input
                required
                value={form.patient}
                onChange={(e) => setForm({ ...form, patient: e.target.value })}
                placeholder="e.g. Ramesh Kumar (Age 48) or Unknown Field #12"
              />
            </label>

            <label>
              Required Service Specialty
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option>Trauma assessment</option>
                <option>Cardiac evaluation</option>
                <option>Orthopaedic consult</option>
                <option>Neurology assessment</option>
                <option>ICU admission review</option>
                <option>General emergency</option>
              </select>
            </label>

            <div className="form-row">
              <label>
                Urgency
                <select
                  value={form.urgency}
                  onChange={(e) => setForm({ ...form, urgency: e.target.value })}
                >
                  <option>Critical</option>
                  <option>High</option>
                  <option>Medium</option>
                  <option>Low</option>
                </select>
              </label>

              <label>
                Patient Location
                <input
                  required
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Sector 62, Expressway, Noida"
                />
              </label>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.isDemo}
                onChange={(e) => setForm({ ...form, isDemo: e.target.checked })}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Mark as fictional simulation record (isolate from live operations)
              </span>
            </label>

            <div className="modal-note">
              <CircleAlert size={16} /> Request will be evaluated by the CareBridge matching engine and persisted to PostgreSQL.
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => setRequestModal(false)}
              >
                Cancel
              </button>
              <button className="btn btn-primary" type="submit">
                <Plus size={15} /> Log Case
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DRAWER: Intelligent Hospital Matching & Referral Dispatch */}
      {matchingDrawer && (
        <div
          className="match-drawer-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMatchingDrawer(null);
          }}
        >
          <div className="match-drawer">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="section-kicker">INTELLIGENT MATCHING ENGINE</div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '20px', color: '#fff', margin: '4px 0' }}>
                  {matchingDrawer.type}
                </h2>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Case: {matchingDrawer.id} • {matchingDrawer.patient} ({matchingDrawer.urgency})
                </span>
              </div>
              <button className="square-btn" onClick={() => setMatchingDrawer(null)}>
                <X size={17} />
              </button>
            </div>

            <div style={{ background: 'rgba(6, 182, 212, 0.08)', border: '1px solid rgba(6, 182, 212, 0.2)', padding: '14px', borderRadius: '10px', fontSize: '11px', color: 'var(--accent-cyan)' }}>
              <b>Multi-Factorial Criteria:</b> Specialty tag match (Trauma, Cardiac, ICU) • Real-time bed & ICU availability • Distance decay factor ({matchingDrawer.location})
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="section-kicker">RANKED HOSPITAL CANDIDATES</div>
              {matchingDrawer.rankings?.map((h, idx) => (
                <div
                  className={`match-item ${idx === 0 ? 'recommended' : ''}`}
                  key={h.hospitalId}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className="match-rank-badge">#{idx + 1}</span>
                      <b style={{ fontSize: '13px', color: '#fff' }}>{h.hospitalName}</b>
                    </div>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px', color: 'var(--accent-crimson)' }}>
                      {h.score}%
                    </span>
                  </div>

                  <div className="progress">
                    <span style={{ width: `${h.score}%` }} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
                    <span>
                      {h.bedsAvailable} Beds • {h.icuAvailable} ICU Units
                    </span>
                    <span>Transit: {h.distanceKm} km</span>
                  </div>

                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'rgba(0, 0, 0, 0.3)', padding: '6px 10px', borderRadius: '6px' }}>
                    {h.rationale}
                  </div>

                  {currentUser.role !== 'auditor' && (
                    <button
                      className="btn btn-primary"
                      style={{ height: '34px', marginTop: '6px', fontSize: '11px' }}
                      onClick={() => dispatchReferral(matchingDrawer.id, h.hospitalId, h.hospitalName)}
                    >
                      <Send size={13} /> Dispatch Referral to {h.shortName || h.hospitalName}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Zero-Login Public SOS Modal */}
      {showSosModal && (
        <PublicSosModal
          onClose={() => setShowSosModal(false)}
          onDispatchSuccess={(data) => {
            loadData();
          }}
        />
      )}

      {/* Toast Notification */}
      {notice && (
        <div className="toast">
          <CheckCircle2 size={18} />
          {notice}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable HUD Display Helpers
// ---------------------------------------------------------------------------
function Metric({ icon: Icon, label, value, delta, trend }) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <div className="metric-icon">
          <Icon size={18} />
        </div>
      </div>
      <div className="metric-value">{value}</div>
      <div className={`metric-delta ${trend}`}>
        <span>{trend === 'up' ? <ArrowUpRight size={14} /> : <Activity size={14} />}</span>
        {delta}
      </div>
    </div>
  );
}

function Resource({ label, value, icon: Icon }) {
  return (
    <div className="resource">
      <div className="resource-icon">
        <Icon size={16} />
      </div>
      <b>{String(value).padStart(2, '0')}</b>
      <span>{label}</span>
    </div>
  );
}

function ActivityItem({ icon: Icon, title, desc, time, color }) {
  return (
    <div className="activity-item">
      <div className={`activity-icon ${color}`}>
        <Icon size={15} />
      </div>
      <div className="activity-copy">
        <b>{title}</b>
        <span>{desc}</span>
      </div>
      <time>{time}</time>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
