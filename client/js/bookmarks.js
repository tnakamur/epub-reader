'use strict';

/**
 * bookmarks.js
 * リーダー画面上のブックマーク UI
 * reader.js から bookId, view (foliate-js View) を受け取って初期化する
 */

const bookmarks = (() => {
  let _bookId = null;
  let _view   = null;
  let _list   = [];   // { id, cfi, label, sectionPercent }
  let _currentCfi = null;

  async function init(bookId, view) {
    _bookId = bookId;
    _view   = view;
    await _load();
    _bindViewEvents();
    _initCurrentCfi();
    _renderPanel();
  }

  async function _load() {
    const res = await api.get(`/api/bookmarks/${_bookId}`);
    if (res.ok) {
      _list = res.data.map(item => ({
        id: item.id,
        cfi: item.cfi,
        label: item.label || '',
        sectionPercent: item.section_percent,
      }));
      // 既存ブックマークでラベルがないものを生成
      for (const b of _list) {
        if (!b.label) {
          b.label = await _getLabelFromCfi(b.cfi, b.sectionPercent) || '';
        }
      }
    }
  }

  function _bindViewEvents() {
    _view.addEventListener('relocate', (e) => {
      _currentCfi = e.detail?.cfi ?? null;
      _updateToolbarButton();
    });
  }

  function _initCurrentCfi() {
    try {
      // lastLocation から CFI を取得（オブジェクトの cfi プロパティ）
      const ll = _view.lastLocation;
      if (ll) {
        _currentCfi = typeof ll === 'string' ? ll : (ll.cfi ?? ll.href ?? null);
      }
    } catch {}
    _updateToolbarButton();
  }

  // CFI から読みやすいラベルを生成
  async function _getLabelFromCfi(cfi, savedSectionPercent) {
    try {
      const resolved = await _view.resolveNavigation(cfi);
      const index = resolved?.index;
      if (index === undefined || index === null) return null;

      // linear なセクションのみを数えて章番号を求める
      const linearSections = _view.book.sections.filter(s => s.linear !== 'no');
      const linearIndex = linearSections.findIndex(s => s === _view.book.sections[index]);

      // 保存済みのセクション内位置パーセンテージを使用
      let positionInfo = '';
      if (savedSectionPercent !== null && savedSectionPercent !== undefined && savedSectionPercent !== '') {
        positionInfo = ` (${savedSectionPercent}%)`;
      }

      if (linearIndex >= 0) {
        return `第${linearIndex + 1}章${positionInfo}`;
      }
      return `セクション ${index + 1}${positionInfo}`;
    } catch {
      return null;
    }
  }

  function _updateToolbarButton() {
    const btn = document.getElementById('bmBtn');
    if (!btn || !_currentCfi) return;
    const exists = _list.some(b => b.cfi === _currentCfi);
    btn.classList.toggle('active', exists);
    btn.title = exists ? 'ブックマークを削除' : 'ブックマーク';
  }

  function _renderPanel() {
    const panel = document.getElementById('bookmarkList');
    if (!panel) return;

    if (_list.length === 0) {
      panel.innerHTML = '<p class="hl-empty">ブックマークはありません</p>';
      return;
    }

    panel.innerHTML = _list.map(b => `
      <div class="hl-item" data-id="${b.id}">
        <span class="bm-dot"></span>
        <div class="hl-body">
          <p class="hl-text">${escHtml(b.label) || b.cfi.substring(0, 60)}</p>
        </div>
        <button class="hl-delete" data-id="${b.id}" title="削除">✕</button>
      </div>
    `).join('');

    panel.querySelectorAll('.hl-item').forEach(el => {
      el.addEventListener('click', async (e) => {
        if (e.target.tagName === 'BUTTON') return;
        const targetId = e.currentTarget?.dataset?.id;
        const b = _list.find(x => x.id === targetId);
        if (b) {
          document.getElementById('bookmarkPanel').classList.remove('open');
          try {
            // goTo 内部でターゲットセクションのロード完了まで待機する
            await _view.goTo(b.cfi);
          } catch {
            // フォールバック: renderer 直接呼び出し
            try {
              await _view.renderer?.goTo(b.cfi);
            } catch {}
          }
        }
      });
    });

    panel.querySelectorAll('.hl-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const b = _list.find(x => x.id === btn.dataset.id);
        if (b) deleteBookmark(b);
      });
    });
  }

  async function toggleBookmark() {
    // _currentCfi が未設定の場合は view から直接取得
    let cfi = _currentCfi;
    if (!cfi) {
      try {
        const ll = _view.lastLocation;
        cfi = typeof ll === 'string' ? ll : (ll?.cfi ?? ll?.href ?? null);
      } catch {}
    }
    if (!cfi) return;

    const existing = _list.find(b => b.cfi === cfi);
    if (existing) {
      _list = _list.filter(x => x.id !== existing.id);
      _renderPanel();
      _updateToolbarButton();
      await sync.writeBookmark('delete', { id: existing.id });
    } else {
      await createBookmark(cfi);
    }
    _updateToolbarButton();
  }

  async function createBookmark(cfi) {
    const id = crypto.randomUUID();
    // 作成時の位置パーセンテージを計算して保存
    let sectionPercent = null;
    try {
      const ll = _view.lastLocation;
      const resolved = await _view.resolveNavigation(cfi);
      const index = resolved?.index;
      const currentSection = ll?.section?.current;
      if (currentSection === index && typeof ll.fraction === 'number') {
        sectionPercent = Math.round(ll.fraction * 100);
      }
    } catch {}
    const label = await _getLabelFromCfi(cfi, sectionPercent) || '';
    const b = { id, cfi, label, sectionPercent };
    _list.push(b);
    _renderPanel();
    _updateToolbarButton();
    const saved = await sync.writeBookmark('create', { bookId: _bookId, cfi, sectionPercent });
    if (saved) {
      b.id = saved.id;
      b.sectionPercent = saved.section_percent ?? sectionPercent;
      _renderPanel();
    }
  }

  async function deleteBookmark(b) {
    _list = _list.filter(x => x.id !== b.id);
    _renderPanel();
    _updateToolbarButton();
    await sync.writeBookmark('delete', { id: b.id });
  }

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&').replace(/</g, '<')
      .replace(/>/g, '>').replace(/"/g, '"');
  }

  return { init, toggleBookmark };
})();

window.bookmarks = bookmarks;