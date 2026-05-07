'use strict';

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const {
  register, login, refresh, me, loginLimiter,
} = require('../controllers/authController');

// POST /api/auth/register — 公開登録を廃止（管理者がCLIで作成）
router.post('/register', (_req, res) => {
  res.status(403).json({ error: 'ユーザー登録は管理者のみ行えます' });
});

// POST /api/auth/login  （厳しいレートリミット適用）
router.post('/login', loginLimiter, login);

// POST /api/auth/refresh
router.post('/refresh', refresh);

// GET  /api/auth/me  （認証必須）
router.get('/me', authenticate, me);

module.exports = router;
