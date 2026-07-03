'use strict';

/**
 * reader.js
 * foliate-js 初期化・ページ送り・進捗同期・設定
 */
import { makeBook, View } from 'foliate-js/view.js';

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
  const el = document.querySelector('#loadingOverlay span');
  if (el) el.textContent = msg;
}

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
    await highlights.init(bookId, view);

    await view.open(book);

    // テーマ・フォント設定（view.init() より前に load イベントリスナーを登録）
    applyTheme(view, loadSettings());

    // 設定パネル（スライダーでフォントサイズ変更 → 即座に適用）
    initSettings(view);

    // 前回の位置から復元、または先頭から開始
    await view.init({ lastLocation, showTextStart: !lastLocation });

    // ブックマーク初期化（view.init 後に初期化して renderer を確実に利用可能にする）
    await bookmarks.init(bookId, view);

    // ローディング非表示
    document.getElementById('loadingOverlay').style.display = 'none';

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

    // 目次
    renderToc(book, view);

    // スワイプ・ホイール
    initGestures(view);

    // 進捗スライダー
    initProgressBar(view);

    // UIトグル
    initUiToggles();

  } catch (err) {
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
        _setStatus('キャッシュからEPUBを読み込み中…');
      return cached.blob;
    }
  } catch (e) {
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

    try {
      await db.booksCache.set(bookId, blob);
    } catch (e) {
      }

    return blob;
  } catch (err) {
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
  if (isNaN(pct)) return;
  const slider = document.getElementById('progressSlider');
  const label  = document.getElementById('progressLabel');
  const val = Math.min(100, Math.max(0, pct));
  if (slider) slider.value = val;
  if (label) label.textContent = `${Math.round(val)}%`;
}

function initProgressBar(view) {
  const slider = document.getElementById('progressSlider');
  if (!slider) return;

  let isDragging = false;

  slider.addEventListener('mousedown', () => { isDragging = true; });
  slider.addEventListener('touchstart', () => { isDragging = true; }, { passive: true });

  slider.addEventListener('input', () => {
    const pct = parseFloat(slider.value);
    document.getElementById('progressLabel').textContent = `${Math.round(pct)}%`;
    // ドラッグ中は即座にジャンプ
    if (isDragging && !isNaN(pct)) {
      goToFractionSafe(view, pct / 100);
    }
  });

  slider.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      const pct = parseFloat(slider.value);
      goToFractionSafe(view, pct / 100);
    }
  });

  slider.addEventListener('touchend', () => {
    if (isDragging) {
      isDragging = false;
      const pct = parseFloat(slider.value);
      goToFractionSafe(view, pct / 100);
    }
  });

  slider.addEventListener('change', () => {
    isDragging = false;
    const pct = parseFloat(slider.value);
    goToFractionSafe(view, pct / 100);
  });
}

function goToFractionSafe(view, fraction) {
  if (isNaN(fraction) || fraction < 0 || fraction > 1) return;
  view.goToFraction(fraction).catch(() => {
    try {
      const loc = view.lastLocation;
      if (loc?.cfi) view.goTo(loc.cfi);
    } catch {}
  });
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

const FONT_FAMILIES = {
  serif: '"Hiragino Mincho ProN", "Noto Serif JP", "Yu Mincho", serif',
  sans:  '"Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif',
};

function _applyThemeToDoc(doc, style, theme) {
  try {
    const currentSettings = loadSettings();
    const currentFontSize = currentSettings.fontSize || 100;
    const currentFontFamily = FONT_FAMILIES[currentSettings.fontFamily] || FONT_FAMILIES.serif;
    const styleId = 'reader-theme-style';
    let styleEl = doc.getElementById(styleId);
    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = styleId;
      doc.head.prepend(styleEl);
    }
    styleEl.textContent = `
      *, *::before, *::after {
        background-color: ${style.background} !important;
        color: ${style.color} !important;
        border-color: ${style.color}22 !important;
      }
      html, body {
        font-size: ${currentFontSize}% !important;
        font-family: ${currentFontFamily} !important;
      }
      a, a:link, a:visited { color: ${style.color} !important; }
      img, svg { filter: ${theme === 'dark' ? 'brightness(0.85)' : 'none'} !important; }
    `;
  } catch {}
}

function _applyThemeToAllSections(view, style, theme) {
  try {
    // EPUB コンテンツの各セクションにテーマを適用
    const contents = view.renderer.getContents();
    for (const { doc } of contents) {
      if (doc) _applyThemeToDoc(doc, style, theme);
    }
    // paginator の --theme-bg を設定（Shadow DOM 内で継承される）
    view.renderer.style.setProperty('--theme-bg', style.background);
    // 同期的に背景を更新
    try { view.renderer.updateBackgroundSync(style.background); } catch (e) {}
  } catch {}
}

function applyTheme(view, settings) {
  const theme = settings.theme || 'white';
  const style = THEME_STYLES[theme] || THEME_STYLES.white;

  // 新しくロードされるセクションにテーマを適用
  view.addEventListener('load', (e) => {
    if (e.detail?.doc) _applyThemeToDoc(e.detail.doc, style, theme);
  });

  // 既に表示中のセクションにも即座に適用
  _applyThemeToAllSections(view, style, theme);

  // paginator の背景を即座に更新（updateBackgroundSync で同期的に反映）
  if (view.renderer) {
    // Shadow Host (paginator = view.renderer) に CSS 変数を設定 → Shadow DOM 内に継承される
    view.renderer.style.setProperty('--theme-bg', style.background);
    // 同期的な背景更新メソッドを直接呼び出し（CSS変数継承に依存しない確実な方法）
    try { view.renderer.updateBackgroundSync(style.background); } catch (e) {}
    // フォールバック: 既存の背景更新メソッドも併用
    try { view.renderer.setStyles(''); } catch (e) {}
  }

  document.body.dataset.theme = theme;
}

function _applyFontSizeToCurrentSection(view, size) {
  try {
    const contents = view.renderer.getContents();
    for (const { doc } of contents) {
      if (doc) {
        // インラインスタイルを設定
        doc.documentElement.style.fontSize = `${size}%`;
        // テーマの style 要素も更新（!important で上書きされるため）
        const styleId = 'reader-theme-style';
        const styleEl = doc.getElementById(styleId);
        if (styleEl) {
          styleEl.textContent = styleEl.textContent.replace(
            /font-size: [^%]+% !important;/,
            `font-size: ${size}% !important;`
          );
        }
      }
    }
  } catch {}
}

function _applyFontFamilyToCurrentSection(view, fontFamily) {
  _applyFontFamilyToAllSections(view, fontFamily);
}

function _applyFontFamilyToDoc(doc, fontFamily) {
  try {
    const styleId = 'reader-theme-style';
    const styleEl = doc.getElementById(styleId);
    if (styleEl) {
      // 既存の style 要素の font-family 部分を更新
      styleEl.textContent = styleEl.textContent.replace(
        /font-family: [^;]+ !important;/g,
        `font-family: ${fontFamily} !important;`
      );
    }
    doc.documentElement.style.fontFamily = fontFamily;
    if (doc.body) doc.body.style.fontFamily = fontFamily;
  } catch {}
}

function _applyFontFamilyToAllSections(view, fontFamily) {
  try {
    const contents = view.renderer.getContents();
    for (const { doc } of contents) {
      if (doc) _applyFontFamilyToDoc(doc, fontFamily);
    }
  } catch {}
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
    _applyFontSizeToCurrentSection(view, size);
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

  document.querySelectorAll('.font-btn').forEach(btn => {
    if (btn.dataset.font === (settings.fontFamily || 'serif')) btn.classList.add('active');
    btn.addEventListener('click', () => {
      document.querySelectorAll('.font-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      settings.fontFamily = btn.dataset.font;
      saveSettings(settings);
      const family = FONT_FAMILIES[btn.dataset.font] || FONT_FAMILIES.serif;
      _applyFontFamilyToAllSections(view, family);
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

  document.getElementById('bmBtn').addEventListener('click', () => {
    bookmarks.toggleBookmark();
  });

  document.getElementById('bmPanelBtn').addEventListener('click', () => {
    document.getElementById('bookmarkPanel').classList.toggle('open');
    document.getElementById('tocPanel').classList.remove('open');
    document.getElementById('highlightPanel').classList.remove('open');
    document.getElementById('settingsPanel').classList.remove('open');
  });

  document.getElementById('hlBtn').addEventListener('click', () => {
    document.getElementById('highlightPanel').classList.toggle('open');
    document.getElementById('tocPanel').classList.remove('open');
    document.getElementById('settingsPanel').classList.remove('open');
    document.getElementById('bookmarkPanel').classList.remove('open');
  });

  document.getElementById('settingsBtn').addEventListener('click', () => {
    document.getElementById('settingsPanel').classList.toggle('open');
    document.getElementById('tocPanel').classList.remove('open');
    document.getElementById('highlightPanel').classList.remove('open');
    document.getElementById('bookmarkPanel').classList.remove('open');
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