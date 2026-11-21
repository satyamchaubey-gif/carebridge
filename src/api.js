// CareBridge API Client & WebSocket Service

const rawApiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
const API_BASE = rawApiUrl ? (rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`) : '/api';

class ApiService {
  constructor() {
    this.token = null;
  }

  setToken(token) {
    this.token = token;
    if (token) {
      sessionStorage.setItem('carebridge_token', token);
    } else {
      sessionStorage.removeItem('carebridge_token');
      try {
        localStorage.removeItem('carebridge_token');
      } catch (e) {}
    }
  }

  getToken() {
    return this.token || sessionStorage.getItem('carebridge_token');
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}: Request failed`);
    }
    return data;
  }

  // Auth & Roles
  async login(email, password) {
    const res = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(res.token);
    return res;
  }

  async switchPersona(role) {
    const res = await this.request('/auth/switch-persona', {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
    this.setToken(res.token);
    return res;
  }

  async loginHospital(hospitalId) {
    const res = await this.request('/auth/login-hospital', {
      method: 'POST',
      body: JSON.stringify({ hospitalId }),
    });
    this.setToken(res.token);
    return res;
  }

  async getMe() {
    return this.request('/auth/me');
  }

  async getUsers() {
    return this.request('/auth/users');
  }

  async updateUserRole(id, { role, hospitalId }) {
    return this.request(`/auth/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role, hospitalId }),
    });
  }

  logout() {
    this.setToken(null);
  }

  // Hospitals
  async getHospitals({ dataMode = 'all', status, search } = {}) {
    const params = new URLSearchParams();
    if (dataMode) params.append('data_mode', dataMode);
    if (status && status !== 'All') params.append('status', status);
    if (search) params.append('search', search);
    return this.request(`/hospitals?${params.toString()}`);
  }

  async getHospital(id) {
    return this.request(`/hospitals/${id}`);
  }

  async updateHospitalCapacity(id, { metric, delta, value, reason }) {
    return this.request(`/hospitals/${id}/capacity`, {
      method: 'PATCH',
      body: JSON.stringify({ metric, delta, value, reason }),
    });
  }

  // Emergency Requests
  async getRequests({ dataMode = 'all', urgency, status, search } = {}) {
    const params = new URLSearchParams();
    if (dataMode) params.append('data_mode', dataMode);
    if (urgency && urgency !== 'All') params.append('urgency', urgency);
    if (status && status !== 'All') params.append('status', status);
    if (search) params.append('search', search);
    return this.request(`/requests?${params.toString()}`);
  }

  async getRequest(id) {
    return this.request(`/requests/${id}`);
  }

  async createRequest(data) {
    return this.request('/requests', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async publicSos(data) {
    return this.request('/requests/public-sos', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateRequestStatus(id, { status, matchedHospitalId }) {
    return this.request(`/requests/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, matchedHospitalId }),
    });
  }

  async getRequestMatches(id) {
    return this.request(`/requests/${id}/matches`);
  }

  // Referrals
  async getReferrals({ dataMode = 'all', status, hospital_id } = {}) {
    const params = new URLSearchParams();
    if (dataMode) params.append('data_mode', dataMode);
    if (status && status !== 'All') params.append('status', status);
    if (hospital_id) params.append('hospital_id', hospital_id);
    return this.request(`/referrals?${params.toString()}`);
  }

  async createReferral(data) {
    return this.request('/referrals', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateReferralStatus(id, { status, notes }) {
    return this.request(`/referrals/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, notes }),
    });
  }

  // Audit Logs
  async getAuditLogs({ limit = 50, offset = 0, action, entity_type, search } = {}) {
    const params = new URLSearchParams({ limit, offset });
    if (action) params.append('action', action);
    if (entity_type) params.append('entity_type', entity_type);
    if (search) params.append('search', search);
    return this.request(`/audit-logs?${params.toString()}`);
  }

  async getPulse() {
    return this.request('/audit-logs/pulse');
  }

  // Analytics
  async getAnalytics({ dataMode = 'all' } = {}) {
    return this.request(`/analytics?data_mode=${dataMode}`);
  }

  // System Health
  async getHealth() {
    return this.request('/health');
  }
}

export const api = new ApiService();

// Real-Time WebSocket Manager
class RealtimeService {
  constructor() {
    this.ws = null;
    this.listeners = new Set();
    this.reconnectTimer = null;
    this.isConnected = false;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    let wsUrl = import.meta.env.VITE_WS_URL;
    if (!wsUrl) {
      if (rawApiUrl && rawApiUrl.startsWith('http')) {
        try {
          const urlObj = new URL(rawApiUrl);
          const wsProtocol = urlObj.protocol === 'https:' ? 'wss:' : 'ws:';
          wsUrl = `${wsProtocol}//${urlObj.host}/ws`;
        } catch (e) {
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          wsUrl = `${protocol}//${window.location.host}/ws`;
        }
      } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}/ws`;
      }
    }

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        // console.log('[WS] Connected to CareBridge real-time event pipeline');
        this.isConnected = true;
        this.notifyListeners({ type: 'STATUS', status: 'connected' });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.notifyListeners(data);
        } catch (e) {
          // ignore
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.notifyListeners({ type: 'STATUS', status: 'disconnected' });
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.isConnected = false;
      };
    } catch (e) {
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    if (!this.isConnected) {
      this.connect();
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  notifyListeners(data) {
    this.listeners.forEach((fn) => {
      try {
        fn(data);
      } catch (err) {
        console.error('[WS] Listener error:', err);
      }
    });
  }
}

export const realtime = new RealtimeService();
