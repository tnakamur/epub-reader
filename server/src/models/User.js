'use strict';

const { pool } = require('../config/db');

const User = {
  async findByEmail(email) {
    const { rows } = await pool.query(
      'SELECT id, email, password, display_name FROM users WHERE email = $1',
      [email]
    );
    return rows[0] || null;
  },

  async findById(id) {
    const { rows } = await pool.query(
      'SELECT id, email, display_name, created_at FROM users WHERE id = $1',
      [id]
    );
    return rows[0] || null;
  },

  async create({ email, passwordHash, displayName }) {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password, display_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name, created_at`,
      [email, passwordHash, displayName || '']
    );
    return rows[0];
  },

  async emailExists(email) {
    const { rows } = await pool.query(
      'SELECT 1 FROM users WHERE email = $1',
      [email]
    );
    return rows.length > 0;
  },
};

module.exports = User;
