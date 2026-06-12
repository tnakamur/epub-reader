'use strict';

/**
 * bookshelf.js
 * 本棚画面のUI制御・EPUBアップロード・フォルダ管理
 */

let _folders = [];
let _allBooks = [];
let _activeFolder = ''; // '' = all, '__none__' = unfiled, or folder id

document.addEventListener('DOMContentLoaded', async () => {
  auth.requireAuth();
  sync.init();

  const user = auth.getUser();
  document.getElementById('userName').textContent = user?.displayName || user?.email || '';

  await loadFolders();
  await loadBooks();

  document.getElementById('logoutBtn').addEventListener('click', () => auth.logout());
  document.getElementById('uploadBtn').addEventListener('click', () => {
    document.getElementById('epubInput').click();
  });
  document.getElementById('epubInput').addEventListener('change', handleUpload);
  document.getElementById('addFolderBtn').addEventListener('click', promptCreateFolder);

  // フォルダ選択
  document.getElementById('folderList').addEventListener('click', (e) => {
    const item = e.target.closest('.folder-item');
    if (!item) return;
    selectFolder(item.dataset.folderId);
  });

  // フォルダ右クリックメニュー
  document.getElementById('folderList').addEventListener('contextmenu', (e) => {
    const item = e.target.closest('.folder-item');
    if (!item || !item.dataset.folderId || item.dataset.folderId === '__none__') return;
    e.preventDefault();
    const folder = _folders.find(f => f.id === item.dataset.folderId);
    if (folder) showFolderContextMenu(e, folder);
  });

  // コンテキストメニュー外クリックで閉じる
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.context-menu')) removeContextMenu();
  });
});

// ─────────────────────────────────────────────
// フォルダ管理
// ─────────────────────────────────────────────
async function loadFolders() {
  try {
    const res = await api.get('/api/folders');
    if (res.ok) _folders = res.data;
    renderFolderList();
  } catch (err) {
    console.error('[bookshelf] loadFolders error:', err);
    renderFolderList();
  }
}

function renderFolderList() {
  const container = document.getElementById('folderList');
  // 固定アイテム以外を削除
  container.querySelectorAll('.folder-item:not([data-folder-id=""]):not([data-folder-id="__none__"])')
    .forEach(el => el.remove());

  _folders.forEach(folder => {
    const btn = document.createElement('button');
    btn.className = 'folder-item';
    btn.dataset.folderId = folder.id;
    btn.innerHTML = `<span class="folder-icon">📁</span><span class="folder-name">${escHtml(folder.name)}</span>`;
    container.appendChild(btn);
  });

  // アクティブフォルダの選択状態を更新
  updateActiveFolderUI();
}

function selectFolder(folderId) {
  _activeFolder = folderId;
  updateActiveFolderUI();

  // ヘッダ名更新
  const nameEl = document.getElementById('currentFolderName');
  if (folderId === '') nameEl.textContent = 'すべて';
  else if (folderId === '__none__') nameEl.textContent = '未分類';
  else {
    const folder = _folders.find(f => f.id === folderId);
    nameEl.textContent = folder ? folder.name : 'フォルダ';
  }

  renderBooks(_allBooks);
}

function updateActiveFolderUI() {
  document.querySelectorAll('.folder-item').forEach(item => {
    item.classList.toggle('active', item.dataset.folderId === _activeFolder);
  });
}

function showFolderContextMenu(e, folder) {
  removeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;

  menu.innerHTML = `
    <div class="context-menu-item" data-action="rename">名前を変更</div>
    <div class="context-menu-divider"></div>
    <div class="context-menu-item" data-action="delete" style="color:#c62828">削除</div>
  `;

  menu.querySelector('[data-action="rename"]').addEventListener('click', async () => {
    const name = prompt('フォルダ名を入力', folder.name);
    if (name && name !== folder.name) {
      const res = await api.put(`/api/folders/${folder.id}`, { name });
      if (res.ok) { folder.name = res.data.name; renderFolderList(); }
    }
    removeContextMenu();
  });

  menu.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    if (confirm(`フォルダ「${folder.name}」を削除しますか？\n本は未分類になります。`)) {
      const res = await api.delete(`/api/folders/${folder.id}`);
      if (res.ok || res.status === 204) {
        _folders = _folders.filter(f => f.id !== folder.id);
        if (_activeFolder === folder.id) selectFolder('');
        else renderFolderList();
      }
    }
    removeContextMenu();
  });

  document.body.appendChild(menu);
}

function promptCreateFolder() {
  const name = prompt('フォルダ名を入力');
  if (!name) return;
  api.post('/api/folders', { name }).then(res => {
    if (res.ok) {
      _folders.push(res.data);
      renderFolderList();
      selectFolder(res.data.id);
    }
  });
}

function removeContextMenu() {
  document.querySelectorAll('.context-menu').forEach(m => m.remove());
}

// ─────────────────────────────────────────────
// 本棚一覧
// ─────────────────────────────────────────────
async function loadBooks() {
  try {
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

    await db.booksMeta.setAll(res.data);
    renderBooks(res.data);
  } catch (err) {
    console.error('[bookshelf] loadBooks error:', err);
    showLoading(false);
    renderBooks([]);
  }
}

function renderBooks(books) {
  const grid  = document.getElementById('bookGrid');
  const empty = document.getElementById('emptyState');

  _allBooks = books;

  let filtered = books;
  if (_activeFolder === '__none__') {
    filtered = books.filter(b => !b.folder_id);
  } else if (_activeFolder) {
    filtered = books.filter(b => b.folder_id === _activeFolder);
  }

  grid.innerHTML = '';

  if (!filtered || filtered.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  filtered.forEach(book => {
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

    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('book-delete')) return;
      location.href = `/reader.html?id=${book.id}`;
    });

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showBookContextMenu(e, book);
    });

    card.querySelector('.book-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDelete(book);
    });

    grid.appendChild(card);
  });
}

function showBookContextMenu(e, book) {
  removeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;

  let html = '';
  const otherFolders = _folders.filter(f => f.id !== book.folder_id);
  if (otherFolders.length > 0) {
    otherFolders.forEach(f => {
      html += `<div class="context-menu-item" data-folder-id="${f.id}">📁 ${escHtml(f.name)} に移動</div>`;
    });
    html += '<div class="context-menu-divider"></div>';
  }
  if (book.folder_id) {
    html += `<div class="context-menu-item" data-folder-id="__remove__">📂 フォルダから外す</div>`;
    html += '<div class="context-menu-divider"></div>';
  }
  html += `<div class="context-menu-item" data-action="delete" style="color:#c62828">🗑 削除</div>`;

  menu.innerHTML = html;

  menu.querySelectorAll('[data-folder-id]').forEach(item => {
    item.addEventListener('click', async () => {
      const folderId = item.dataset.folderId;
      if (folderId === '__remove__') {
        await api.put(`/api/books/${book.id}/folder`, { folder_id: null });
        book.folder_id = null;
      } else {
        await api.put(`/api/books/${book.id}/folder`, { folder_id: folderId });
        book.folder_id = folderId;
      }
      removeContextMenu();
      renderBooks(_allBooks);
    });
  });

  menu.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
    removeContextMenu();
    confirmDelete(book);
  });

  document.body.appendChild(menu);
}

// ─────────────────────────────────────────────
// アップロード
// ─────────────────────────────────────────────
async function handleUpload(e) {
  const files = Array.from(e.target.files);
  e.target.value = '';
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
  await loadFolders();
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
