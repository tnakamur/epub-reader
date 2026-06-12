'use strict';

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const rateLimit    = require('express-rate-limit');
const errorHandler = require('./middleware/errorHandler');

const authRoutes       = require('./routes/auth');
const booksRoutes      = require('./routes/books');
const epubRoutes       = require('./routes/epub');
const highlightsRoutes = require('./routes/highlights');
const bookmarksRoutes  = require('./routes/bookmarks');
const progressRoutes   = require('./routes/progress');
const foldersRoutes  = require('./routes/folders');
const debugRoutes = require('./routes/debug');

const app = express();

// リバースプロキシ（Caddy）を信頼する設定
app.set('trust proxy', 1);

// ── セキュリティヘッダー ──────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-origin' },
  contentSecurityPolicy: false, // Caddy側で管理
}));

// ── CORS ──────────────────────────────────────────
// 本番は Caddy と同一オリジンなので cors は API開発用
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? false   // 本番: Caddyと同一オリジン → cors不要
    : 'http://localhost:5173',
  credentials: true,
}));

// ── Body Parser ───────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// ── グローバルレートリミット ───────────────────────
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },   // ← この行を追加
  message: { error: 'Too many requests, please try again later.' },
}));

// ── ヘルスチェック ────────────────────────────────
app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

// ── ルーティング ──────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/books',      booksRoutes);
app.use('/epub',           epubRoutes);       // JWT認証後にEPUBファイル配信
app.use('/api/highlights', highlightsRoutes);
app.use('/api/bookmarks',  bookmarksRoutes);
app.use('/api/folders',    foldersRoutes);
app.use('/api/progress',   progressRoutes);
app.use('/api/debug',      debugRoutes);

// ── 404 ──────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ── エラーハンドラー (必ず最後) ───────────────────
app.use(errorHandler);

module.exports = app;
