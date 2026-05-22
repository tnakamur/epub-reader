'use strict';

/**
 * reader.js
 * foliate-js 初期化・ページ送り・進捗同期・設定
 */
import { makeBook, View } from 'https://cdn.jsdelivr.net/npm/foliate-js@1.0.1/view.js';

const DEVICE_ID = (() => {
  let id = localStorage.getItem('deviceId');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('deviceId', id); }
  return id;
})();

document.addEventListener('DOMContentLoaded', async () => {
  auth.requireAuth();
  sync.init();

  const bookId = new URLSearchParams(location.search).get('id');
  if (!bookId) { location.href = '/index.html'; return; }

  await initReader(bookId);
});

// ─────────────────────────────────────────────
// ステータス表示ヘルパー
// ─────────────────────────────────────────────
function _setStatus(msg) {
  console.log('[reader]', msg);
  const el = document.querySelector('#loadingOverlay span');
  if (el) el.textContent = msg;
}

// サーバーへログを送信するバッファ付きロガー
window._serverLog = (() => {
  const DEBUG = true;
  const buf = [];
  let timer = null;
  const flush = () => {
    if (!buf.length) return;
    const logs = buf.splice(0);
    fetch('/api/debug/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logs }),
    }).catch(() => {});
  };
  return (msg) => {
    console.log('[DEBUG]', msg);
    buf.push(msg);
    clearTimeout(timer);
    timer = setTimeout(flush, 500);
  };
})();

// ─────────────────────────────────────────────
// foliate-js 初期化
// ─────────────────────────────────────────────
async function initReader(bookId) {
  try {
    // 書籍情報取得
    _setStatus('書籍情報を取得中…');
    const bookRes = await api.get(`/api/books/${bookId}`);
    if (!bookRes.ok) {
      _setStatus('書籍情報の取得に失敗: ' + (bookRes.data?.error || bookRes.status));
      return;
    }
    const bookMeta = bookRes.data;

    document.getElementById('bookTitle').textContent  = bookMeta.title  || bookMeta.filename;
    document.getElementById('bookAuthor').textContent = bookMeta.author || '';
    document.title = bookMeta.title || 'epub-reader';

    // EPUBファイル取得
    _setStatus('EPUBファイルをダウンロード中…');
    const epubBlob = await fetchEpubBlob(bookId);
    if (!epubBlob) return;

    // foliate-js の makeBook は file.name を参照するため
    // Blob を File に変換してファイル名を付与する
    const epubFile = new File([epubBlob], bookMeta.filename || 'book.epub', { type: 'application/epub+zip' });

    // foliate-js で EPUB を解析
    _setStatus('EPUBを解析中…');
    const book = await makeBook(epubFile);
    console.log('[reader] Book loaded:', book.metadata?.title, 'dir:', book.dir);

    // 進捗復元
    _setStatus('進捗を復元中…');
    const progressRes = await api.get(`/api/progress/${bookId}`);
    const lastLocation = progressRes.ok && progressRes.data?.cfi
      ? progressRes.data.cfi
      : null;

    // View 要素を作成してコンテナに追加
    _setStatus('ビューアーを初期化中…');
    const view = document.createElement('foliate-view');
    const container = document.getElementById('viewer');
    container.appendChild(view);

    // ハイライト初期化（view.open より前にイベントリスナーを登録するため）
    console.log('[reader] calling highlights.init, _serverLog:', typeof window._serverLog);
    window._serverLog?.('[reader] calling highlights.init');
    await highlights.init(bookId, view);
    console.log('[reader] highlights.init done');

    // 書籍を開く（create-overlayer イベント確認用）
    view.addEventListener('create-overlayer', (e) => {
      console.log('[reader] create-overlayer fired, index:', e.detail?.index);
    });
    view.addEventListener('draw-annotation', (e) => {
      console.log('[reader] draw-annotation fired, type:', e.detail?.annotation?.type);
    });
    await view.open(book);

    // 前回の位置から復元、または先頭から開始
    await view.init({ lastLocation, showTextStart: !lastLocation });

    // ローディング非表示
    document.getElementById('loadingOverlay').style.display = 'none';

    // テーマ・フォント設定
    applyTheme(view, loadSettings());

    // ページ送りボタン
    document.getElementById('prevBtn').addEventListener('click', () => view.prev());
    document.getElementById('nextBtn').addEventListener('click', () => view.next());

    // キーボード
    document.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft')  view.goLeft();
      if (e.key === 'ArrowRight') view.goRight();
    });

    // 進捗更新
    let saveTimer;
    view.addEventListener('relocate', (e) => {
      const loc = e.detail;
      const pct = (loc.fraction ?? 0) * 100;
      updateProgressBar(pct);
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        sync.writeProgress({
          bookId,
          cfi:        loc.cfi,
          percentage: parseFloat(pct.toFixed(2)),
          deviceId:   DEVICE_ID,
        });
      }, 2000);
    });

    // 設定パネル
    initSettings(view);

    // 目次
    renderToc(book, view);

    // スワイプ・ホイール
    initGestures(view);

    // UIトグル
    initUiToggles();

  } catch (err) {
    console.error('[reader] initReader error:', err);
    _setStatus('エラー: ' + err.message);
  }
}

// ─────────────────────────────────────────────
// EPUBファイル取得（キャッシュ付き）
// ─────────────────────────────────────────────
async function fetchEpubBlob(bookId) {
  try {
    const cached = await db.booksCache.get(bookId);
    if (cached?.blob) {
      console.log('[reader] EPUB from IndexedDB cache');
      _setStatus('キャッシュからEPUBを読み込み中…');
      return cached.blob;
    }
  } catch (e) {
    console.warn('[reader] Cache read failed:', e);
  }

  if (!navigator.onLine) {
    _setStatus('オフラインのため読み込めません');
    alert('オフラインのためEPUBを読み込めません。');
    location.href = '/index.html';
    return null;
  }

  document.getElementById('loadingOverlay').style.display = 'flex';
  _setStatus('サーバーからEPUBをダウンロード中…');

  const token = localStorage.getItem('accessToken');
  try {
    const res = await fetch(api.epubUrl(bookId), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    _setStatus('EPUBを受信中…');
    const blob = await res.blob();
    console.log('[reader] EPUB fetched, size:', blob.size);

    try {
      await db.booksCache.set(bookId, blob);
    } catch (e) {
      console.warn('[reader] Cache write failed:', e);
    }

    return blob;
  } catch (err) {
    console.error('[reader] EPUB fetch failed:', err);
    _setStatus('取得エラー: ' + err.message);
    alert('EPUBの読み込みに失敗しました\n' + err.message);
    location.href = '/index.html';
    return null;
  }
}

// ─────────────────────────────────────────────
// 進捗バー
// ─────────────────────────────────────────────
function updateProgressBar(pct) {
  const bar   = document.getElementById('progressBar');
  const label = document.getElementById('progressLabel');
  if (bar)   bar.style.width   = `${Math.min(100, Math.max(0, pct))}%`;
  if (label) label.textContent = `${Math.round(pct)}%`;
}

// ─────────────────────────────────────────────
// 目次
// ─────────────────────────────────────────────
function renderToc(book, view) {
  const list = document.getElementById('tocList');
  if (!list) return;

  const toc = book.toc;
  if (!toc || !toc.length) {
    list.innerHTML = '<p class="hl-empty">目次はありません</p>';
    return;
  }

  function renderItems(items, depth) {
    return items.map(item => `
      <li style="padding-left:${depth * 12}px">
        <a href="#" data-href="${item.href}">${(item.label || '').trim()}</a>
        ${item.subitems?.length ? `<ul>${renderItems(item.subitems, depth+1).join('')}</ul>` : ''}
      </li>
    `).join('');
  }

  list.innerHTML = `<ul>${renderItems(toc, 0)}</ul>`;
  list.querySelectorAll('a[data-href]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      view.goTo(a.dataset.href);
      document.getElementById('tocPanel').classList.remove('open');
    });
  });
}

// ─────────────────────────────────────────────
// テーマ・フォント設定
// ─────────────────────────────────────────────
const THEME_STYLES = {
  white: { background: '#ffffff', color: '#1a1a1a' },
  sepia: { background: '#f5ebe0', color: '#3d2b1f' },
  dark:  { background: '#4a4d60', color: '#ffffff' },
};

function applyTheme(view, settings) {
  const theme    = settings.theme    || 'white';
  const style    = THEME_STYLES[theme] || THEME_STYLES.white;

  // foliate-js の各セクションのドキュメントにテーマを適用
  view.addEventListener('load', (e) => {
    const doc = e.detail.doc;
    if (!doc) return;
    try {
      const currentSettings = loadSettings();
      const currentFontSize = currentSettings.fontSize || 100;
      doc.documentElement.style.background = style.background;
      doc.documentElement.style.color = style.color;
      if (doc.body) {
        doc.body.style.background = style.background;
        doc.body.style.color = style.color;
      }
      doc.documentElement.style.fontSize = `${currentFontSize}%`;
    } catch (err) {
      console.warn('[reader] theme apply to doc failed:', err);
    }
  });

  document.body.dataset.theme = theme;
}

// 現在の表示セクションにフォントサイズを即座に適用
function _applyFontSizeToCurrentSection(view, size) {
  try {
    const contents = view.renderer.getContents();
    for (const { doc } of contents) {
      if (doc && doc.documentElement) {
        doc.documentElement.style.fontSize = `${size}%`;
      }
    }
  } catch (err) {
    console.warn('[reader] applyFontSize error:', err);
  }
}

function loadSettings() {
  try { return JSON.parse(localStorage.getItem('readerSettings') || '{}'); }
  catch { return {}; }
}

function saveSettings(settings) {
  localStorage.setItem('readerSettings', JSON.stringify(settings));
}

function initSettings(view) {
  const settings = loadSettings();

  document.getElementById('fontSizeRange').value = settings.fontSize || 100;
  document.getElementById('fontSizeLabel').textContent = `${settings.fontSize || 100}%`;

  document.getElementById('fontSizeRange').addEventListener('input', (e) => {
    const size = parseInt(e.target.value);
    document.getElementById('fontSizeLabel').textContent = `${size}%`;
    settings.fontSize = size;
    saveSettings(settings);
    console.log('[reader] fontSize changed to', size, 'lastLocation:', view.lastLocation);
    window._serverLog?.('[reader] fontSize changed to ' + size);
    // フォントサイズを即座に適用：現在のセクションのドキュメントに直接設定
    _applyFontSizeToCurrentSection(view, size);
    // 次回以降のloadイベントで適用されるよう保存のみ
  });

  document.querySelectorAll('.theme-btn').forEach(btn => {
    if (btn.dataset.theme === (settings.theme || 'white')) btn.classList.add('active');
    btn.addEventListener('click', () => {
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      settings.theme = btn.dataset.theme;
      applyTheme(view, settings);
      saveSettings(settings);
    });
  });
}

// ─────────────────────────────────────────────
// スワイプ・ホイール操作
// ─────────────────────────────────────────────
function initGestures(view) {
  const el = document.getElementById('readerContainer');
  let touchStartX = 0;
  let touchStartY = 0;

  el.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });

  el.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].screenX - touchStartX;
    const dy = e.changedTouches[0].screenY - touchStartY;
    if (Math.abs(dx) < 30 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) view.next();
    else        view.prev();
  }, { passive: true });

  let wheelTimer = null;
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (wheelTimer) return;
    wheelTimer = setTimeout(() => { wheelTimer = null; }, 600);
    if (e.deltaX > 30 || e.deltaY > 30)        view.next();
    else if (e.deltaX < -30 || e.deltaY < -30) view.prev();
  }, { passive: false });
}

// ─────────────────────────────────────────────
// UIトグル
// ─────────────────────────────────────────────
function initUiToggles() {
  document.getElementById('tocBtn').addEventListener('click', () => {
    document.getElementById('tocPanel').classList.toggle('open');
    document.getElementById('highlightPanel').classList.remove('open');
    document.getElementById('settingsPanel').classList.remove('open');
  });

  document.getElementById('hlBtn').addEventListener('click', () => {
    document.getElementById('highlightPanel').classList.toggle('open');
    document.getElementById('tocPanel').classList.remove('open');
    document.getElementById('settingsPanel').classList.remove('open');
  });

  document.getElementById('settingsBtn').addEventListener('click', () => {
    document.getElementById('settingsPanel').classList.toggle('open');
    document.getElementById('tocPanel').classList.remove('open');
    document.getElementById('highlightPanel').classList.remove('open');
  });

  document.getElementById('panelOverlay').addEventListener('click', () => {
    document.querySelectorAll('.side-panel').forEach(p => p.classList.remove('open'));
  });

  document.getElementById('backBtn').addEventListener('click', () => {
    location.href = '/index.html';
  });

  // パネル表示時にオーバーレイを制御
  const panelOverlay = document.getElementById('panelOverlay');
  document.querySelectorAll('.side-panel').forEach(panel => {
    const observer = new MutationObserver(() => {
      const anyOpen = [...document.querySelectorAll('.side-panel')].some(p => p.classList.contains('open'));
      panelOverlay.classList.toggle('show', anyOpen);
    });
    observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.error);
  }
}