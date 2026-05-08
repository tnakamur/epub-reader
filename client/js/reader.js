'use strict';

/**
 * reader.js
 * EPUB.js 初期化・ページ送り・進捗同期・設定
 */

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

// ─────────────────────────────────────────────
// EPUBのOPFを直接解析して縦書きかどうか判定
// book.openedに依存しない独自実装
// ─────────────────────────────────────────────
async function detectVertical(arrayBuffer) {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);

    // container.xml からOPFのパスを取得
    const containerXml = await zip.file('META-INF/container.xml')?.async('string');
    if (!containerXml) return false;

    const opfPath = containerXml.match(/full-path="([^"]+\.opf)"/)?.[1];
    if (!opfPath) return false;

    // OPFを読み込む
    const opfXml = await zip.file(opfPath)?.async('string');
    if (!opfXml) return false;

    // page-progression-direction="rtl" を検索
    const isRtl = /page-progression-direction\s*=\s*["']rtl["']/.test(opfXml);
    console.log('[reader] OPF rtl detection:', isRtl, 'path:', opfPath);
    return isRtl;
  } catch (e) {
    console.warn('[reader] detectVertical error:', e);
    return false;
  }
}

// ─────────────────────────────────────────────
// EPUB.js 初期化
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

    // ArrayBufferに変換
    _setStatus('EPUB.jsを初期化中…');
    const arrayBuffer = await epubBlob.arrayBuffer();

    // OPFを直接解析して縦書き判定（book.openedに依存しない）
    _setStatus('書籍構造を解析中…');
    const isVertical = await detectVertical(arrayBuffer);
    _setStatus(`レイアウト: ${isVertical ? '縦書き' : '横書き'}`);
    console.log('[reader] isVertical:', isVertical);

    const book = ePub(arrayBuffer);

    // viewerサイズを確定
    await new Promise(r => setTimeout(r, 200));

    const headerH = document.querySelector('.reader-header')?.offsetHeight || 56;
    const footerH = document.querySelector('.reader-footer')?.offsetHeight || 36;
    const h = window.innerHeight - headerH - footerH;
    const w = window.innerWidth;

    _setStatus(`ビューアー初期化中 (${w}x${h})…`);

    document.getElementById('viewer').style.width  = w + 'px';
    document.getElementById('viewer').style.height = h + 'px';

    // 縦書きと横書きで異なる設定でレンダリング
    // 縦書き(rtl)はdirection:'rtl'を渡すことでEPUB.jsが正しくcolumn軸を判定する
    const rendition = book.renderTo('viewer', {
      width:          w,
      height:         h,
      spread:         'none',
      flow:           'paginated',
      minSpreadWidth: 9999,
      ...(isVertical ? { direction: 'rtl' } : {}),
    });

    // 縦書きEPUBのみCSS修正
    // vertical-rl + text-align:right は下寄せになるため start に上書き
    if (isVertical) {
      rendition.hooks.content.register((contents) => {
        try {
          const doc = contents.document;
          if (!doc || !doc.head) return;

          const old = doc.getElementById('epub-reader-fix');
          if (old) old.remove();

          const style = doc.createElement('style');
          style.id = 'epub-reader-fix';
          // writing-mode:vertical-rl では column-width は物理的な「高さ」を意味する
          // EPUB.jsは column-width=画面横幅 を設定するが、正しくは画面高さ を設定すべき
          // そのためここで column-width を h（画面高さ）に上書きする
          style.textContent = `
            body {
              -webkit-column-width: ${h}px !important;
              column-width: ${h}px !important;
            }
            body, p, div, section, article {
              text-align: start !important;
            }
          `;
          doc.head.appendChild(style);
          console.log('[reader] Vertical column-width fix injected, h=' + h);
        } catch(e) {
          console.warn('[reader] CSS inject error:', e);
        }
      });
    }

    // 進捗復元
    _setStatus('進捗を復元中…');
    const progressRes = await api.get(`/api/progress/${bookId}`);
    const startCfi = progressRes.ok && progressRes.data?.cfi
      ? progressRes.data.cfi
      : undefined;

    // ページ表示
    _setStatus('ページを表示中…');

    rendition.once('rendered', () => {
      document.getElementById('loadingOverlay').style.display = 'none';
    });

    setTimeout(() => {
      document.getElementById('loadingOverlay').style.display = 'none';
    }, 3000);

    rendition.display(startCfi);

    // テーマ・フォント設定
    applyTheme(rendition, loadSettings());

    // ページ送りボタン
    document.getElementById('prevBtn').addEventListener('click', () => rendition.prev());
    document.getElementById('nextBtn').addEventListener('click', () => rendition.next());

    // キーボード
    document.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft')  rendition.prev();
      if (e.key === 'ArrowRight') rendition.next();
    });
    rendition.on('keyup', (e) => {
      if (e.key === 'ArrowLeft')  rendition.prev();
      if (e.key === 'ArrowRight') rendition.next();
    });

    // 進捗更新
    let saveTimer;
    rendition.on('relocated', (location) => {
      const pct = book.locations.percentageFromCfi(location.start.cfi) * 100;
      updateProgressBar(pct);
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        sync.writeProgress({
          bookId,
          cfi:        location.start.cfi,
          percentage: parseFloat(pct.toFixed(2)),
          deviceId:   DEVICE_ID,
        });
      }, 2000);
    });

    // ページ数算出（バックグラウンド）
    book.ready
      .then(() => book.locations.generate(1000))
      .then(() => console.log('[reader] Locations generated'))
      .catch(e => console.warn('[reader] Locations error:', e));

    // ハイライト初期化
    await highlights.init(bookId, rendition);

    // 設定パネル
    initSettings(rendition);

    // 目次
    book.loaded.navigation
      .then(nav => renderToc(nav.toc, rendition))
      .catch(e => console.warn('[reader] TOC error:', e));

    // スワイプ・ホイール
    initGestures(rendition);

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
function renderToc(toc, rendition) {
  const list = document.getElementById('tocList');
  if (!list || !toc) return;

  function renderItems(items, depth) {
    return items.map(item => `
      <li style="padding-left:${depth * 12}px">
        <a href="#" data-href="${item.href}">${item.label.trim()}</a>
        ${item.subitems?.length ? `<ul>${renderItems(item.subitems, depth+1).join('')}</ul>` : ''}
      </li>
    `).join('');
  }

  list.innerHTML = `<ul>${renderItems(toc, 0)}</ul>`;
  list.querySelectorAll('a[data-href]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      rendition.display(a.dataset.href);
      document.getElementById('tocPanel').classList.remove('open');
    });
  });
}

// ─────────────────────────────────────────────
// テーマ・フォント設定
// ─────────────────────────────────────────────
function applyTheme(rendition, settings) {
  const theme    = settings.theme    || 'white';
  const fontSize = settings.fontSize || 100;

  const themeStyles = {
    white: { background: '#ffffff', color: '#1a1a1a' },
    sepia: { background: '#f5ebe0', color: '#3d2b1f' },
    dark:  { background: '#1e2130', color: '#d4d8e8' },
  };
  const style = themeStyles[theme] || themeStyles.white;

  Object.entries(themeStyles).forEach(([name, s]) => {
    rendition.themes.register(name, {
      'html': { background: `${s.background} !important`, color: `${s.color} !important` },
      'body': { background: `${s.background} !important`, color: `${s.color} !important` },
      'p':    { color: `${s.color} !important` },
    });
  });
  rendition.themes.select(theme);
  rendition.themes.fontSize(`${fontSize}%`);

  try {
    document.querySelectorAll('#viewer iframe').forEach(iframe => {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;
      doc.documentElement.style.setProperty('background', style.background, 'important');
      doc.documentElement.style.setProperty('color', style.color, 'important');
      if (doc.body) {
        doc.body.style.setProperty('background', style.background, 'important');
        doc.body.style.setProperty('color', style.color, 'important');
      }
    });
  } catch (e) {
    console.warn('[reader] iframe style failed:', e);
  }

  document.body.dataset.theme = theme;
}

function loadSettings() {
  try { return JSON.parse(localStorage.getItem('readerSettings') || '{}'); }
  catch { return {}; }
}

function saveSettings(settings) {
  localStorage.setItem('readerSettings', JSON.stringify(settings));
}

function initSettings(rendition) {
  const settings = loadSettings();

  document.getElementById('fontSizeRange').value = settings.fontSize || 100;
  document.getElementById('fontSizeLabel').textContent = `${settings.fontSize || 100}%`;

  document.getElementById('fontSizeRange').addEventListener('input', (e) => {
    const size = parseInt(e.target.value);
    document.getElementById('fontSizeLabel').textContent = `${size}%`;
    rendition.themes.fontSize(`${size}%`);
    settings.fontSize = size;
    saveSettings(settings);
  });

  document.querySelectorAll('.theme-btn').forEach(btn => {
    if (btn.dataset.theme === (settings.theme || 'white')) btn.classList.add('active');
    btn.addEventListener('click', () => {
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      settings.theme = btn.dataset.theme;
      applyTheme(rendition, settings);
      saveSettings(settings);
    });
  });
}

// ─────────────────────────────────────────────
// スワイプ・ホイール操作
// ─────────────────────────────────────────────
function initGestures(rendition) {
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
    if (dx < 0) rendition.next();
    else        rendition.prev();
  }, { passive: true });

  rendition.on('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  });
  rendition.on('touchend', (e) => {
    const dx = e.changedTouches[0].screenX - touchStartX;
    const dy = e.changedTouches[0].screenY - touchStartY;
    if (Math.abs(dx) < 30 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) rendition.next();
    else        rendition.prev();
  });

  let wheelTimer = null;
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (wheelTimer) return;
    wheelTimer = setTimeout(() => { wheelTimer = null; }, 600);
    if (e.deltaX > 30 || e.deltaY > 30)        rendition.next();
    else if (e.deltaX < -30 || e.deltaY < -30) rendition.prev();
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
}
