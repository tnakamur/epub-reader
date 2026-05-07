'use strict';

const { pool } = require('../config/db');

const Progress = {
  async findByBook(bookId, userId) {
    const { rows } = await pool.query(
      `SELECT id, cfi, percentage, device_id, updated_at
       FROM progress
       WHERE book_id = $1 AND user_id = $2`,
      [bookId, userId]
    );
    return rows[0] || null;
  },

  /** オフライン同期: updated_at 以降に更新された進捗 */
  async findUpdatedSince(userId, since) {
    const { rows } = await pool.query(
      `SELECT id, book_id, cfi, percentage, device_id, updated_at
       FROM progress
       WHERE user_id = $1 AND updated_at > $2
       ORDER BY updated_at ASC`,
      [userId, since]
    );
    return rows;
  },

  /**
   * Upsert（UNIQUE制約: user_id + book_id）
   * Last-Write-Wins: updated_at が新しい場合のみ更新
   */
  async upsert({ userId, bookId, cfi, percentage, deviceId }) {
    const { rows } = await pool.query(
      `INSERT INTO progress (user_id, book_id, cfi, percentage, device_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, book_id) DO UPDATE
         SET cfi        = EXCLUDED.cfi,
             percentage = EXCLUDED.percentage,
             device_id  = EXCLUDED.device_id,
             updated_at = NOW()
       RETURNING id, cfi, percentage, device_id, updated_at`,
      [userId, bookId, cfi, percentage, deviceId || '']
    );
    return rows[0];
  },
};

module.exports = Progress;
