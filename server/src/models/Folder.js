'use strict';

const { pool } = require('../config/db');

const Folder = {
  async findByUser(userId) {
    const { rows } = await pool.query(
      `SELECT id, name, created_at, updated_at
       FROM folders
       WHERE user_id = $1
       ORDER BY created_at ASC`,
      [userId]
    );
    return rows;
  },

  async create({ userId, name }) {
    const { rows } = await pool.query(
      `INSERT INTO folders (user_id, name) VALUES ($1,$2)
       RETURNING id, name, created_at`,
      [userId, name]
    );
    return rows[0];
  },

  async update(id, userId, { name }) {
    const { rows } = await pool.query(
      `UPDATE folders SET name = $3
       WHERE id = $1 AND user_id = $2
       RETURNING id, name, updated_at`,
      [id, userId, name]
    );
    return rows[0] || null;
  },

  async delete(id, userId) {
    const { rows } = await pool.query(
      `DELETE FROM folders WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );
    return rows[0] || null;
  },
};

module.exports = Folder;
