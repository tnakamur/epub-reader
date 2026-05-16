'use strict';

/**
 * highlights.js
 * リーダー画面上のハイライト・メモ UI
 * reader.js から bookId, view (foliate-js View) を受け取って初期化する
 */

const highlights = (() => {
  let _bookId   = null;
  let _view     = null;
  let _list     = [];   // { id, cfiRange, selectedText, color, note }

  const COLORS = {
    yellow: '#FFD54F',
    red:    '#EF9A9A',
    blue:   '#90CAF9',
    green:  '#A5D6A7',
  };

  // ── 初期化 ──────────────────────────────────
  async function init(bookId, view) {
    _bookId = bookId;
    _view   = view;

    await _load();
    _bindViewEvents();
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
      _view.addAnnotation({
        value: h.cfi_range,
        type: 'highlight',
        color: COLORS[h.color] || COLORS.yellow,
      });
    } catch {
      // CFI が無効な場合は無視
    }
  }

  function _removeOne(h) {
    try {
      _view.deleteAnnotation({ value: h.cfi_range });
    } catch {}
  }

  // ── テキスト選択 → ハイライト作成 ────────────
  function _bindViewEvents() {
    // draw-annotation イベントでハイライト描画方法を指定
    _view.addEventListener('draw-annotation', (e) => {
      const { draw, annotation } = e.detail;
      if (annotation.type === 'highlight') {
        draw(rects => {
          // SVG でハイライト矩形を描画
          const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          g.setAttribute('fill', annotation.color);
          g.style.opacity = '0.3';
          for (const { left, top, height, width } of rects) {
            const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            el.setAttribute('x', left);
            el.setAttribute('y', top);
            el.setAttribute('height', height);
            el.setAttribute('width', width);
            g.append(el);
          }
          return g;
        });
      }
    });
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
        if (h) _view.goTo(h.cfi_range);
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

  return { init, deleteHighlight };
})();

window.highlights = highlights;