'use strict';

/**
 * api.js
 * - Authorization: Bearer ヘッダーを自動付与
 * - 401 時にリフレッシュトークンで自動再取得
 * - オフライン時は { offline: true } を返す
 */

const BASE_URL = '';  // 同一オリジン。開発時は 'http://localhost:3000' に変更

async function request(path, options = {}, retry = true) {
  const token = localStorage.getItem('accessToken');

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  // FormData の場合は Content-Type を削除（multer が境界を自動設定）
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  } catch {
    return { offline: true };
  }

  // アクセストークン期限切れ → リフレッシュして1回リトライ
  if (res.status === 401 && retry) {
    const refreshed = await _refreshToken();
    if (refreshed) return request(path, options, false);
    _forceLogout();
    return { offline: false, status: 401 };
  }

  const contentType = res.headers.get('Content-Type') || '';
  const data = contentType.includes('application/json')
    ? await res.json()
    : await res.text();

  return { offline: false, status: res.status, ok: res.ok, data };
}

async function _refreshToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const { accessToken } = await res.json();
    localStorage.setItem('accessToken', accessToken);
    return true;
  } catch {
    return false;
  }
}

function _forceLogout() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  location.href = '/login.html';
}

const api = {
  get:    (path)       => request(path, { method: 'GET' }),
  delete: (path)       => request(path, { method: 'DELETE' }),
  post:   (path, body) => request(path, { method: 'POST',  body: JSON.stringify(body) }),
  put:    (path, body) => request(path, { method: 'PUT',   body: JSON.stringify(body) }),
  patch:  (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  upload: (path, formData) => request(path, { method: 'POST', body: formData }),

  /** EPUB.js に渡すファイルURL（Bearerヘッダーは後述の epubLoader で処理） */
  epubUrl:  (bookId) => `${BASE_URL}/epub/${bookId}`,
  coverUrl: (bookId) => `${BASE_URL}/epub/${bookId}/cover`,
};

window.api = api;
