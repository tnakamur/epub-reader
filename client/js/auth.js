'use strict';

/**
 * auth.js
 * ログイン・登録・ログアウト・認証ガード
 */

const auth = {
  /** アクセストークンが存在するか */
  isLoggedIn() {
    return !!localStorage.getItem('accessToken');
  },

  /** 未ログインならログインページへリダイレクト */
  requireAuth() {
    if (!this.isLoggedIn()) {
      location.href = '/login.html';
    }
  },

  /** ログイン済みならトップへリダイレクト（ログインページ用） */
  redirectIfLoggedIn() {
    if (this.isLoggedIn()) {
      location.href = '/index.html';
    }
  },

  getUser() {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  },

  /** POST /api/auth/login */
  async login(email, password) {
    const res = await api.post('/api/auth/login', { email, password });
    if (res.offline) throw new Error('オフラインのためログインできません');
    if (!res.ok) throw new Error(res.data?.error || 'ログインに失敗しました');
    this._save(res.data);
    return res.data.user;
  },

  /** POST /api/auth/register */
  async register(email, password, displayName) {
    const res = await api.post('/api/auth/register', { email, password, displayName });
    if (res.offline) throw new Error('オフラインのため登録できません');
    if (!res.ok) throw new Error(res.data?.error || '登録に失敗しました');
    this._save(res.data);
    return res.data.user;
  },

  logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    location.href = '/login.html';
  },

  _save({ accessToken, refreshToken, user }) {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(user));
  },
};

window.auth = auth;
