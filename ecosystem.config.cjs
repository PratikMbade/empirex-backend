// PM2: `npm run build && pm2 start ecosystem.config.cjs`
module.exports = {
  apps: [
    // BLOCKCHAIN WORKER — live event listeners + sync scheduler. MUST be a single fork:
    // two workers would open two sets of WebSocket listeners for the same events.
    {
      name: 'empirex-worker',
      script: 'dist/worker.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 25, // WSS drops are expected; restart quickly
      min_uptime: '8s',
      max_memory_restart: '512M',
      kill_timeout: 10000,
    },
    // API SERVER — stateless, can scale out.
    {
      name: 'empirex-api',
      script: 'dist/index.js',
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      max_memory_restart: '512M',
      kill_timeout: 6000,
    },
  ],
}
