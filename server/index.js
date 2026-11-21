import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initDb } from './db.js';
import { setupWebSocket } from './websocket.js';
import authRoutes from './routes/auth.routes.js';
import hospitalsRoutes from './routes/hospitals.routes.js';
import requestsRoutes from './routes/requests.routes.js';
import referralsRoutes from './routes/referrals.routes.js';
import auditRoutes from './routes/audit.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  // console.log(`[API] ${req.method} ${req.path}`);
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/hospitals', hospitalsRoutes);
app.use('/api/requests', requestsRoutes);
app.use('/api/referrals', referralsRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    system: 'CareBridge Healthcare Coordination Backend',
    version: '1.0.0',
    region: 'North Capital Region (NCR)',
    database: 'PostgreSQL 18',
    timestamp: new Date().toISOString(),
  });
});

// Serve frontend build if dist folder exists
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../dist');

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const server = http.createServer(app);

// Setup WebSocket server
setupWebSocket(server);

// Start server after DB initialization
async function startServer() {
  try {
    await initDb();
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[CareBridge] Backend server running on http://0.0.0.0:${PORT}`);
      console.log(`[CareBridge] WebSocket server active on ws://0.0.0.0:${PORT}/ws`);
    });
  } catch (err) {
    console.error('[CareBridge] Fatal startup error:', err);
    process.exit(1);
  }
}

startServer();
