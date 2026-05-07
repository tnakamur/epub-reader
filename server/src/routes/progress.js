'use strict';

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/progressController');

router.use(authenticate);

// GET /api/progress/sync?since=      → オフライン同期用（差分取得）
router.get('/sync', ctrl.sync);

// GET /api/progress/:bookId          → 進捗取得
router.get('/:bookId', ctrl.show);

// PUT /api/progress/:bookId          → 進捗更新（upsert）
router.put('/:bookId', ctrl.upsert);

module.exports = router;
