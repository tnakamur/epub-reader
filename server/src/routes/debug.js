'use strict';

const router   = require('express').Router();
const fs       = require('fs');
const LOG_PATH = '/tmp/epub-debug.log';

router.post('/log', (req, res) => {
  try {
    const { logs } = req.body;
    if (!Array.isArray(logs)) return res.status(400).json({ error: 'logs must be array' });
    const lines = logs.map(l => `[${new Date().toISOString()}] ${l}`).join('\n') + '\n';
    fs.appendFileSync(LOG_PATH, lines);
    res.json({ ok: true, count: logs.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
