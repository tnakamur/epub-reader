'use strict';

const router = require('express').Router();
const { authenticate }   = require('../middleware/auth');
const { upload }         = require('../middleware/upload');
const ctrl               = require('../controllers/booksController');

// 全エンドポイントに認証必須
router.use(authenticate);

// GET  /api/books       → 本棚一覧
router.get('/', ctrl.list);

// GET  /api/books/:id   → 1冊の詳細
router.get('/:id', ctrl.show);

// POST /api/books       → EPUBアップロード (field名: epub)
router.post('/', upload.single('epub'), ctrl.upload);

// DELETE /api/books/:id → 削除
router.delete('/:id', ctrl.destroy);

module.exports = router;
