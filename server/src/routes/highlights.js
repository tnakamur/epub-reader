'use strict';

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/highlightsController');

router.use(authenticate);

// GET  /api/highlights/sync?since=   → オフライン同期用（差分取得）
// ※ /:bookId より前に定義しないと "sync" が bookId に一致してしまう
router.get('/sync', ctrl.sync);

// GET  /api/highlights/:bookId       → 書籍のハイライト一覧
router.get('/:bookId', ctrl.list);

// POST /api/highlights/:bookId       → ハイライト作成
router.post('/:bookId', ctrl.create);

// PATCH  /api/highlights/:id         → メモ・色の更新
router.patch('/:id', ctrl.update);

// DELETE /api/highlights/:id         → 論理削除
router.delete('/:id', ctrl.destroy);

module.exports = router;
