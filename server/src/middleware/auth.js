'use strict';

const { verifyAccessToken } = require('../config/jwt');

/**
 * JWT認証ミドルウェア
 * Authorization: Bearer <token> ヘッダーを検証し
 * req.user = { id, email } をセットする
 */
function authenticate(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing' });
  }

  const token = header.slice(7);
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError'
      ? 'Token expired'
      : 'Invalid token';
    return res.status(401).json({ error: message });
  }
}

module.exports = { authenticate };
