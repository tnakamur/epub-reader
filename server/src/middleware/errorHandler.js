'use strict';

/**
 * Express グローバルエラーハンドラー
 * app.use() の最後に登録すること
 */
function errorHandler(err, req, res, _next) {
  // Multer エラー
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: `ファイルサイズが上限（${process.env.MAX_FILE_SIZE_MB || 50}MB）を超えています`,
    });
  }

  // 検証エラー（multer fileFilter）
  if (err.message && err.message.includes('EPUBファイル')) {
    return res.status(400).json({ error: err.message });
  }

  // その他のエラー
  const status = err.status || err.statusCode || 500;
  const message = (process.env.NODE_ENV === 'production' && status === 500)
    ? 'Internal server error'
    : err.message;

  if (status === 500) {
    console.error('[Error]', req.method, req.path, err);
  }

  res.status(status).json({ error: message });
}

module.exports = errorHandler;
