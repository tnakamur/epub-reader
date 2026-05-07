'use strict';

const router = require('express').Router();
const { authenticate }   = require('../middleware/auth');
const { serveEpub, serveCover } = require('../controllers/epubController');

// GET /epub/:id         → EPUBファイル本体を配信（Range対応）
router.get('/:id', authenticate, serveEpub);

// GET /epub/:id/cover   → カバー画像を配信
router.get('/:id/cover', authenticate, serveCover);

module.exports = router;
