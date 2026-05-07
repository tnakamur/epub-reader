#!/usr/bin/env node
'use strict';

/**
 * manageUsers.js — 管理者用ユーザー管理CLI
 *
 * 使い方:
 *   node src/scripts/manageUsers.js create <email> <password> [表示名]
 *   node src/scripts/manageUsers.js list
 *   node src/scripts/manageUsers.js delete <email>
 *   node src/scripts/manageUsers.js password <email> <新パスワード>
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../..', '.env') });

const bcrypt = require('bcrypt');
const { pool } = require('../config/db');

const BCRYPT_ROUNDS = 12;
const [,, command, ...args] = process.argv;

async function main() {
  try {
    switch (command) {
      case 'create':  await createUser(args); break;
      case 'list':    await listUsers();      break;
      case 'delete':  await deleteUser(args); break;
      case 'password': await changePassword(args); break;
      default:
        printUsage();
        process.exit(1);
    }
  } catch (err) {
    console.error('エラー:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// ── ユーザー作成 ──────────────────────────────────
async function createUser([email, password, displayName = '']) {
  if (!email || !password) {
    console.error('使い方: create <email> <password> [表示名]');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('パスワードは8文字以上にしてください');
    process.exit(1);
  }

  // 重複チェック
  const { rows: exists } = await pool.query(
    'SELECT 1 FROM users WHERE email = $1', [email]
  );
  if (exists.length > 0) {
    console.error(`エラー: ${email} は既に登録されています`);
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const { rows } = await pool.query(
    `INSERT INTO users (email, password, display_name)
     VALUES ($1, $2, $3)
     RETURNING id, email, display_name, created_at`,
    [email, hash, displayName]
  );
  const user = rows[0];

  console.log('\n✅ ユーザーを作成しました');
  console.log(`   ID       : ${user.id}`);
  console.log(`   Email    : ${user.email}`);
  console.log(`   表示名   : ${user.display_name || '（未設定）'}`);
  console.log(`   作成日時 : ${user.created_at.toLocaleString('ja-JP')}\n`);
}

// ── ユーザー一覧 ──────────────────────────────────
async function listUsers() {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.display_name, u.created_at,
            COUNT(b.id) AS book_count
     FROM users u
     LEFT JOIN books b ON b.user_id = u.id
     GROUP BY u.id
     ORDER BY u.created_at ASC`
  );

  if (rows.length === 0) {
    console.log('\nユーザーは登録されていません\n');
    return;
  }

  console.log(`\n登録ユーザー一覧 (${rows.length}件)`);
  console.log('─'.repeat(80));
  rows.forEach((u, i) => {
    console.log(`${String(i + 1).padStart(3)}. ${u.email.padEnd(35)} 書籍:${String(u.book_count).padStart(3)}冊  ${u.created_at.toLocaleDateString('ja-JP')}`);
    if (u.display_name) console.log(`       表示名: ${u.display_name}`);
  });
  console.log('─'.repeat(80) + '\n');
}

// ── ユーザー削除 ──────────────────────────────────
async function deleteUser([email]) {
  if (!email) {
    console.error('使い方: delete <email>');
    process.exit(1);
  }

  const { rows } = await pool.query(
    'SELECT id, email, display_name FROM users WHERE email = $1', [email]
  );
  if (rows.length === 0) {
    console.error(`エラー: ${email} は見つかりません`);
    process.exit(1);
  }

  const user = rows[0];

  // 確認プロンプト
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(resolve =>
    rl.question(`本当に ${user.email} を削除しますか？ [yes/N]: `, resolve)
  );
  rl.close();

  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('キャンセルしました');
    return;
  }

  // CASCADE DELETE により books/highlights/progress も削除される
  await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
  console.log(`\n✅ ${user.email} を削除しました\n`);
}

// ── パスワード変更 ────────────────────────────────
async function changePassword([email, newPassword]) {
  if (!email || !newPassword) {
    console.error('使い方: password <email> <新パスワード>');
    process.exit(1);
  }
  if (newPassword.length < 8) {
    console.error('パスワードは8文字以上にしてください');
    process.exit(1);
  }

  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  const { rowCount } = await pool.query(
    'UPDATE users SET password = $1 WHERE email = $2',
    [hash, email]
  );

  if (rowCount === 0) {
    console.error(`エラー: ${email} は見つかりません`);
    process.exit(1);
  }
  console.log(`\n✅ ${email} のパスワードを変更しました\n`);
}

// ── ヘルプ ────────────────────────────────────────
function printUsage() {
  console.log(`
ユーザー管理CLI

使い方:
  create   <email> <password> [表示名]  ユーザーを作成
  list                                  ユーザー一覧を表示
  delete   <email>                      ユーザーを削除（関連データも削除）
  password <email> <新パスワード>        パスワードを変更

例:
  node src/scripts/manageUsers.js create user@example.com pass1234 "田中花子"
  node src/scripts/manageUsers.js list
  node src/scripts/manageUsers.js delete user@example.com
  node src/scripts/manageUsers.js password user@example.com newpass5678
`);
}

main();
