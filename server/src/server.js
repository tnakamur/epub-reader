'use strict';
require('dotenv').config();

const app  = require('./app');
const { pool } = require('./config/db');

const PORT = process.env.PORT || 3000;

async function start() {
  // DB接続確認
  try {
    await pool.query('SELECT 1');
    console.log('[DB] PostgreSQL connected');
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`[Server] Listening on port ${PORT} (${process.env.NODE_ENV})`);
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`[Server] ${signal} received — shutting down`);
    server.close(async () => {
      await pool.end();
      console.log('[DB] Pool closed');
      process.exit(0);
    });
    // 10秒で強制終了
    setTimeout(() => process.exit(1), 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

start();
