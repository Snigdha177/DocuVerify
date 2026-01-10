#!/usr/bin/env node

/**
 * Server Starter with Auto-Restart & Health Monitoring
 * Ensures the document verification system stays online
 */

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8888;
const HEALTH_CHECK_INTERVAL = 5000; // Check every 5 seconds
const LOG_FILE = path.join(__dirname, 'server.log');

let serverProcess = null;
let lastHealthCheck = Date.now();
let consecutiveFailures = 0;
const MAX_FAILURES = 3;

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  
  // Append to log file
  fs.appendFileSync(LOG_FILE, logMessage + '\n', { flag: 'a' });
}

function startServer() {
  log('📍 Starting auth-server.js...');
  
  serverProcess = spawn('node', ['auth-server.js'], {
    cwd: __dirname,
    stdio: 'inherit',
    detached: false
  });

  serverProcess.on('error', (err) => {
    log('❌ Failed to start server: ' + err.message);
  });

  serverProcess.on('close', (code) => {
    log('⚠️  Server crashed with exit code ' + code);
    if (code !== 0) {
      log('🔄 Restarting server in 2 seconds...');
      setTimeout(startServer, 2000);
    }
  });

  serverProcess.on('exit', (code, signal) => {
    if (code !== 0) {
      log('⚠️  Server exited unexpectedly (signal: ' + signal + ')');
    }
  });
}

function checkServerHealth() {
  const options = {
    hostname: 'localhost',
    port: PORT,
    path: '/health',
    method: 'GET',
    timeout: 3000
  };

  const req = http.request(options, (res) => {
    if (res.statusCode === 200) {
      consecutiveFailures = 0;
      lastHealthCheck = Date.now();
      log('✓ Server is healthy');
    } else {
      consecutiveFailures++;
      log('⚠️  Server health check failed (HTTP ' + res.statusCode + ')');
    }
  });

  req.on('error', (error) => {
    consecutiveFailures++;
    log('❌ Health check failed: ' + error.message);
    
    if (consecutiveFailures >= MAX_FAILURES) {
      log('🔴 Server unresponsive - restarting...');
      if (serverProcess) {
        serverProcess.kill();
      }
      consecutiveFailures = 0;
      setTimeout(startServer, 1000);
    }
  });

  req.on('timeout', () => {
    consecutiveFailures++;
    req.destroy();
    log('⏱️  Server health check timed out');
    
    if (consecutiveFailures >= MAX_FAILURES) {
      log('🔴 Server timeout - restarting...');
      if (serverProcess) {
        serverProcess.kill();
      }
      consecutiveFailures = 0;
      setTimeout(startServer, 1000);
    }
  });

  req.end();
}

function startHealthMonitoring() {
  log('🏥 Starting health monitoring (interval: ' + HEALTH_CHECK_INTERVAL + 'ms)');
  setInterval(checkServerHealth, HEALTH_CHECK_INTERVAL);
  
  // First check after 2 seconds
  setTimeout(checkServerHealth, 2000);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('⏹️  Shutting down...');
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  setTimeout(() => {
    log('✓ Shutdown complete');
    process.exit(0);
  }, 1000);
});

process.on('SIGTERM', () => {
  log('⏹️  Received SIGTERM - shutting down...');
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  setTimeout(() => {
    log('✓ Shutdown complete');
    process.exit(0);
  }, 1000);
});

// Clear old log on startup
try {
  if (fs.existsSync(LOG_FILE)) {
    fs.truncateSync(LOG_FILE, 0);
  }
} catch (e) {
  // Ignore
}

log('╔════════════════════════════════════════════════════╗');
log('║   DocuVerify - Document Verification System       ║');
log('║   Server Manager with Auto-Restart                ║');
log('╚════════════════════════════════════════════════════╝');
log('');

// Start the server
startServer();

// Start monitoring
setTimeout(startHealthMonitoring, 3000);

log('🚀 Server manager is running. Press Ctrl+C to stop.');
log('');
