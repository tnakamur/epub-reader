'use strict';

/**
 * bookshelf.js
 * 本棚画面のUI制御・EPUBアップロード
 */

document.addEventListener('DOMContentLoaded', async () => {
  auth.requireAuth();
  sync.init();

  // ── ユーザー名表示 ──────────────────────────
  const user = auth.getUser();
  document.getElementById('userName').textContent = user?.displayName || user?.email || '';

  // ── 本棚を読み込む ──────────────────────────
  await loadBooks();

  // ── イベント ───────────────────────────────
  document.getElementById('logoutBtn').addEventListener('click', () => auth.logout());
  document.getElementById('uploadBtn').addEventListener('click', () => {
    document.getElementById('epubInput').click();
  });
  document.getElementById('epubInput').addEventListener('change', handleUpload);
});

// ─────────────────────────────────────────────
// 本棚一覧
// ─────────────────────────────────────────────
async function loadBooks() {
  const grid = document.getElementById('bookGrid');
  const empty = document.getElementById('emptyState');

  // オフラインならキャッシュから表示
  if (!navigator.onLine) {
    const cached = await db.booksMeta.getAll();
    renderBooks(cached);
    showToast('オフラインモード — キャッシュから表示中');
    return;
  }

  showLoading(true);
  const res = await api.get('/api/books');
  showLoading(false);

  if (res.offline || !res.ok) {
    const cached = await db.booksMeta.getAll();
    renderBooks(cached);
    showToast('本棚の取得に失敗しました。キャッシュを表示中');
    return;
  }

  // IndexedDBに保存
  await db.booksMeta.setAll(res.data);
  renderBooks(res.data);
}

function renderBooks(books) {
  const grid  = document.getElementById('bookGrid');
  const empty = document.getElementById('emptyState');

  grid.innerHTML = '';

  if (!books || books.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  books.forEach(book => {
    const card = document.createElement('div');
    card.className = 'book-card';
    card.dataset.id = book.id;

    const pct = Math.round(parseFloat(book.percentage) || 0);

    card.innerHTML = `
      <div class="book-cover" style="position:relative;">
        <img
          src="${api.coverUrl(book.id)}"
          alt="${escHtml(book.title)}"
          onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'120\' height=\'180\' viewBox=\'0 0 120 180\'%3E%3Crect width=\'120\' height=\'180\' fill=\'%23e2e6ea\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' dominant-baseline=\'middle\' text-anchor=\'middle\' font-size=\'12\' fill=\'%236b7280\'%3ENo Cover%3C/text%3E%3C/svg%3E'"
          loading="lazy"
        />
        ${pct > 0 ? `<div class="progress-badge">${pct}%</div>` : ''}
      </div>
      <div class="book-info">
        <p class="book-title">${escHtml(book.title || book.filename)}</p>
        <p class="book-author">${escHtml(book.author || '著者不明')}</p>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>
      <button class="book-delete" title="削除" data-id="${book.id}">✕</button>
    `;

    // 読書開始
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('book-delete')) return;
      location.href = `/reader.html?id=${book.id}`;
    });

    // 削除
    card.querySelector('.book-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDelete(book);
    });

    grid.appendChild(card);
  });
}

// ─────────────────────────────────────────────
// アップロード
// ─────────────────────────────────────────────
async function handleUpload(e) {
  const files = Array.from(e.target.files);
  e.target.value = ''; // 同じファイルを再選択できるようリセット

  if (files.length === 0) return;

  for (const file of files) {
    if (!file.name.endsWith('.epub')) {
      showToast(`${file.name} はEPUBファイルではありません`, 'error');
      continue;
    }
    await uploadBook(file);
  }
}

async function uploadBook(file) {
  const formData = new FormData();
  formData.append('epub', file);

  const toast = showToast(`「${file.name}」をアップロード中…`, 'info', 0);

  const res = await api.upload('/api/books', formData);
  toast.remove();

  if (res.offline) {
    showToast('オフラインのためアップロードできません', 'error');
    return;
  }
  if (!res.ok) {
    showToast(res.data?.error || 'アップロードに失敗しました', 'error');
    return;
  }

  showToast(`「${res.data.title || file.name}」を追加しました`);
  await loadBooks();
}

// ─────────────────────────────────────────────
// 削除
// ─────────────────────────────────────────────
async function confirmDelete(book) {
  if (!confirm(`「${book.title || book.filename}」を削除しますか？\nこの操作は取り消せません。`)) return;

  const res = await api.delete(`/api/books/${book.id}`);
  if (res.ok || res.status === 204) {
    await db.booksMeta.delete(book.id);
    await db.booksCache.delete(book.id);
    showToast('削除しました');
    await loadBooks();
  } else {
    showToast(res.data?.error || '削除に失敗しました', 'error');
  }
}

// ─────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────
function showLoading(show) {
  const el = document.getElementById('loading');
  el.style.display = show ? 'flex' : 'none';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * トースト通知
 * @param {string} msg
 * @param {'success'|'error'|'info'} type
 * @param {number} duration ms  0 = 手動削除
 * @returns {HTMLElement}
 */
function showToast(msg, type = 'success', duration = 3000) {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  container.appendChild(el);
  if (duration > 0) setTimeout(() => el.remove(), duration);
  return el;
}

window.showToast = showToast;
