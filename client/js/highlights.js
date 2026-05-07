'use strict';

/**
 * highlights.js
 * リーダー画面上のハイライト・メモ UI
 * reader.js から bookId, rendition を受け取って初期化する
 */

const highlights = (() => {
  let _bookId   = null;
  let _rendition = null;
  let _list     = [];   // { id, cfiRange, selectedText, color, note }

  const COLORS = {
    yellow: '#FFD54F',
    red:    '#EF9A9A',
    blue:   '#90CAF9',
    green:  '#A5D6A7',
  };

  // ── 初期化 ──────────────────────────────────
  async function init(bookId, rendition) {
    _bookId    = bookId;
    _rendition = rendition;

    await _load();
    _bindRenditionEvents();
    _renderPanel();
  }

  // ── サーバーからロード ────────────────────────
  async function _load() {
    const res = await api.get(`/api/highlights/${_bookId}`);
    if (res.ok) {
      _list = res.data;
      _applyAll();
    }
  }

  // ── EPUB上にハイライトを適用 ─────────────────
  function _applyAll() {
    _list.forEach(h => _applyOne(h));
  }

  function _applyOne(h) {
    try {
      _rendition.annotations.highlight(
        h.cfi_range,
        {},
        null,
        'epub-highlight',
        { fill: COLORS[h.color] || COLORS.yellow, 'fill-opacity': '0.4' }
      );
    } catch {
      // CFI が無効な場合は無視
    }
  }

  function _removeOne(h) {
    try {
      _rendition.annotations.remove(h.cfi_range, 'highlight');
    } catch {}
  }

  // ── テキスト選択 → コンテキストメニュー ────────
  function _bindRenditionEvents() {
    _rendition.on('selected', (cfiRange, contents) => {
      const selection = contents.window.getSelection();
      const selectedText = selection?.toString().trim();
      if (!selectedText) return;

      _showContextMenu(cfiRange, selectedText, contents);
    });
  }

  function _showContextMenu(cfiRange, selectedText, contents) {
    // 既存メニューを削除
    document.getElementById('highlightMenu')?.remove();

    const menu = document.createElement('div');
    menu.id = 'highlightMenu';
    menu.className = 'highlight-menu';
    menu.innerHTML = `
      <div class="hm-title">ハイライト色を選択</div>
      <div class="hm-colors">
        ${Object.entries(COLORS).map(([key, val]) =>
          `<button class="hm-color" data-color="${key}" style="background:${val}" title="${key}"></button>`
        ).join('')}
      </div>
      <button class="hm-cancel">キャンセル</button>
    `;

    document.getElementById('readerContainer').appendChild(menu);
    _positionMenuNearSelection(menu, contents);

    // 色選択
    menu.querySelectorAll('.hm-color').forEach(btn => {
      btn.addEventListener('click', async () => {
        const color = btn.dataset.color;
        menu.remove();
        await _create(cfiRange, selectedText, color);
      });
    });

    menu.querySelector('.hm-cancel').addEventListener('click', () => menu.remove());
  }

  function _positionMenuNearSelection(menu, contents) {
    // iframeの座標を取得して配置
    const iframe = document.querySelector('iframe');
    if (!iframe) return;
    const rect   = iframe.getBoundingClientRect();
    menu.style.top  = `${rect.top + 80}px`;
    menu.style.left = `${rect.left + rect.width / 2 - 120}px`;
  }

  // ── CRUD ────────────────────────────────────
  async function _create(cfiRange, selectedText, color) {
    const payload = { bookId: _bookId, cfiRange, selectedText, color, note: '' };
    const data = await sync.writeHighlight('create', payload);

    // オフライン時はローカルに仮追加
    const tempId = data?.id || `local-${crypto.randomUUID()}`;
    const newH = { id: tempId, cfi_range: cfiRange, selected_text: selectedText, color, note: '' };
    _list.push(newH);
    _applyOne(newH);
    _renderPanel();
  }

  async function deleteHighlight(h) {
    _removeOne(h);
    _list = _list.filter(x => x.id !== h.id);
    _renderPanel();
    await sync.writeHighlight('delete', { id: h.id });
  }

  async function updateNote(h, note) {
    h.note = note;
    await sync.writeHighlight('update', { id: h.id, note });
  }

  // ── サイドパネル描画 ─────────────────────────
  function _renderPanel() {
    const panel = document.getElementById('highlightList');
    if (!panel) return;

    if (_list.length === 0) {
      panel.innerHTML = '<p class="hl-empty">ハイライトはありません</p>';
      return;
    }

    panel.innerHTML = _list.map(h => `
      <div class="hl-item" data-id="${h.id}">
        <span class="hl-color-dot" style="background:${COLORS[h.color] || COLORS.yellow}"></span>
        <div class="hl-body">
          <p class="hl-text">${escHtml(h.selected_text)}</p>
          <textarea class="hl-note" placeholder="メモを追加…" data-id="${h.id}">${escHtml(h.note || '')}</textarea>
        </div>
        <button class="hl-delete" data-id="${h.id}" title="削除">✕</button>
      </div>
    `).join('');

    // ハイライト位置へジャンプ
    panel.querySelectorAll('.hl-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'TEXTAREA') return;
        const h = _list.find(x => x.id === el.dataset.id);
        if (h) _rendition.display(h.cfi_range);
      });
    });

    // メモ更新（debounce）
    panel.querySelectorAll('.hl-note').forEach(ta => {
      let timer;
      ta.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          const h = _list.find(x => x.id === ta.dataset.id);
          if (h) updateNote(h, ta.value);
        }, 800);
      });
    });

    // 削除ボタン
    panel.querySelectorAll('.hl-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const h = _list.find(x => x.id === btn.dataset.id);
        if (h) deleteHighlight(h);
      });
    });
  }

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { init };
})();

window.highlights = highlights;
