'use strict';

const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../config/jwt');

const BCRYPT_ROUNDS = 12;

/** ログイン専用の厳しいレートリミット */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  validate: { xForwardedForHeader: false },   // ← この行を追加
  message: { error: 'ログイン試行が多すぎます。15分後に再試行してください。' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** POST /api/auth/register */
async function register(req, res, next) {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email と password は必須です' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'パスワードは8文字以上で設定してください' });
    }
    if (await User.emailExists(email)) {
      return res.status(409).json({ error: 'このメールアドレスは既に登録されています' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await User.create({ email, passwordHash, displayName });

    const accessToken  = signAccessToken({ sub: user.id, email: user.email });
    const refreshToken = signRefreshToken({ sub: user.id });

    res.status(201).json({ accessToken, refreshToken, user: {
      id: user.id, email: user.email, displayName: user.display_name,
    }});
  } catch (err) {
    next(err);
  }
}

/** POST /api/auth/login */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email と password は必須です' });
    }

    const user = await User.findByEmail(email);
    // タイミング攻撃対策: ユーザーが存在しない場合も bcrypt を実行
    const passwordHash = user?.password || '$2b$12$invalidhashfortimingattackprevention';
    const valid = await bcrypt.compare(password, passwordHash);

    if (!user || !valid) {
      return res.status(401).json({ error: 'メールアドレスまたはパスワードが正しくありません' });
    }

    const accessToken  = signAccessToken({ sub: user.id, email: user.email });
    const refreshToken = signRefreshToken({ sub: user.id });

    res.json({ accessToken, refreshToken, user: {
      id: user.id, email: user.email, displayName: user.display_name,
    }});
  } catch (err) {
    next(err);
  }
}

/** POST /api/auth/refresh */
async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'refreshToken が必要です' });
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({ error: 'リフレッシュトークンが無効または期限切れです' });
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'ユーザーが存在しません' });
    }

    const newAccessToken = signAccessToken({ sub: user.id, email: user.email });
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    next(err);
  }
}

/** GET /api/auth/me */
async function me(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
    res.json({ id: user.id, email: user.email, displayName: user.display_name });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, refresh, me, loginLimiter };
