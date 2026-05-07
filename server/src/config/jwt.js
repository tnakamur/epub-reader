'use strict';

const jwt = require('jsonwebtoken');

const ACCESS_SECRET  = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXP     = process.env.JWT_EXPIRES_IN         || '15m';
const REFRESH_EXP    = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  console.error('[JWT] JWT_SECRET / JWT_REFRESH_SECRET が未設定です');
  process.exit(1);
}

/** アクセストークン発行 */
function signAccessToken(payload) {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXP });
}

/** リフレッシュトークン発行 */
function signRefreshToken(payload) {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXP });
}

/** アクセストークン検証 */
function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

/** リフレッシュトークン検証 */
function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
