'use strict';

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/bookmarksController');

router.use(authenticate);

// GET  /api/bookmarks/sync?since=    → オフライン同期用
router.get('/sync', ctrl.sync);

// GET  /api/bookmarks/:bookId        → 書籍のブックマーク一覧
router.get('/:bookId', ctrl.list);

// POST /api/bookmarks/:bookId        → ブックマーク作成
router.post('/:bookId', ctrl.create);

// DELETE /api/bookmarks/:id           → 論理削除
router.delete('/:id', ctrl.destroy);

module.exports = router;
