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
    console.log('[hl] init called, view:', view);
    window._serverLog?.('[hl] init called');

    await _load();
    _bindViewEvents();
    _renderPanel();
    console.log('[hl] init done');
  }

  // ── サーバーからロード ────────────────────────
  async function _load() {
    const res = await api.get(`/api/highlights/${_bookId}`);
    if (res.ok) {
      // Convert snake_case to camelCase for internal consistency
      _list = res.data.map(item => ({
        id: item.id,
        bookId: item.book_id,
        cfiRange: item.cfi_range,
        selectedText: item.selected_text,
        color: item.color,
        note: item.note || ''
      }));
      console.log('[hl] loaded from server count=' + _list.length);
      window._serverLog?.('[hl] loaded from server count=' + _list.length);
    }
  }

  // ── CFIからセクションindexを抽出 ─────────────────
  // epubcfi(/6/2!/4/232,/1:1,/1:3) → 2 (spineの2番目 = index 1)
  // resolveNavigation を使って正確に特定する
  async function _getSectionIndex(cfi) {
    try {
      const resolved = await _view.resolveNavigation(cfi);
      return resolved?.index ?? null;
    } catch {
      return null;
    }
  }

  // ── EPUB上にハイライトを適用 ─────────────────
  // セクションがロードされたとき、そのセクションに属するハイライトのみ適用
  async function _applyAllForSection(sectionIndex) {
    const targets = [];
    for (const h of _list) {
      // キャッシュ済みならスキップ
      if (h._appliedSection === sectionIndex) continue;
      const idx = await _getSectionIndex(h.cfiRange);
      if (idx === sectionIndex) {
        targets.push(h);
      }
    }
    console.log('[hl] applyAll section=' + sectionIndex + ' targets=' + targets.length + '/' + _list.length);
    for (const h of targets) {
      await _applyOne(h);
      h._appliedSection = sectionIndex;
    }
  }

  async function _applyOne(h) {
    console.log('[hl] applyOne cfi=' + h.cfiRange + ' color=' + h.color);
    try {
      const annotation = {
        value: h.cfiRange,
        type: 'highlight',
        color: COLORS[h.color] || COLORS.yellow,
      };
      const result = await _view.addAnnotation(annotation);
      console.log('[hl] addAnnotation result:', result);
    } catch (err) {
      console.warn('[hl] addAnnotation error:', err);
    }
  }

  function _removeOne(h) {
    try {
      _view.deleteAnnotation({ value: h.cfiRange });
    } catch {}
  }

  // ── テキスト選択 → ハイライト作成 ────────────
  function _bindViewEvents() {
    // create-overlayer イベントの確認
    _view.addEventListener('create-overlayer', (e) => {
      console.log('[hl] create-overlayer index=' + e.detail?.index);
      window._serverLog?.('[hl] create-overlayer index=' + e.detail?.index);
    });

    // draw-annotation イベントでハイライト描画方法を指定
    _view.addEventListener('draw-annotation', (e) => {
      const { draw, annotation } = e.detail;
      console.log('[hl] draw-annotation type=' + annotation.type + ' value=' + annotation.value + ' color=' + annotation.color);
      window._serverLog?.('[hl] draw-annotation type=' + annotation.type + ' color=' + annotation.color);
      if (annotation.type === 'highlight') {
        draw(rects => {
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

    // テキスト選択時にハイライトメニューを表示
    // foliate-js は closed Shadow DOM 内でレンダリングされるため
    // load イベントで各セクションの document に直接リスナーを追加する
    _view.addEventListener('load', async (e) => {
      const doc = e.detail?.doc;
      const index = e.detail?.index;
      console.log('[hl] load event fired, index:', index);
      window._serverLog?.('[hl] load event fired, index=' + index);
      if (!doc) return;
      _currentDoc = doc;
      _attachDocListeners(doc);
      // セクションがロードされたら、このセクションに属するハイライトを適用
      await _applyAllForSection(index);
    });

    // 既にロード済みのセクションにもリスナーを追加
    // (view.init で load イベントが発火済みの場合)
    _attachToExistingSections();
  }

  // ── セクション document にリスナー追加 ─────────
  let _pendingSelection = null;

  function _attachDocListeners(doc) {
    // selectionchange: 選択を記録するだけ（メニューは出さない）
    doc.addEventListener('selectionchange', () => {
      const sel = _currentDoc?.defaultView?.getSelection?.()
        ?? window.getSelection();
      if (sel && sel.rangeCount > 0 && sel.toString().trim()) {
        _pendingSelection = {
          text: sel.toString(),
          range: sel.getRangeAt(0),
        };
      }
    });
    // pointerup: 選択確定時にメニューを表示
    doc.addEventListener('pointerup', () => {
      setTimeout(() => {
        if (_pendingSelection) {
          const { text, range } = _pendingSelection;
          _pendingSelection = null;
          const index = _view.currentIndex ?? 0;
          console.log('[hl] pointerup currentIndex=' + index);
          window._serverLog?.('[hl] pointerup currentIndex=' + index);
          const cfiRange = _view.getCFI?.(index, range) ?? '';
          console.log('[hl] pointerup show menu cfi=' + cfiRange + ' text=' + text.substring(0, 30));
          window._serverLog?.('[hl] pointerup show menu');
          _showHighlightMenu(cfiRange, text, range);
        }
      }, 10);
    });
  }

  function _attachToExistingSections() {
    // foliate-js の renderer は iframe 内にセクションをレンダリングする
    // closed Shadow DOM の外からは直接アクセスできないが、
    // book.sections の各セクションの iframe を探す
    const iframes = document.querySelectorAll('iframe');
    console.log('[hl] existing iframes:', iframes.length);
    window._serverLog?.('[hl] existing iframes: ' + iframes.length);
    iframes.forEach((iframe, i) => {
      try {
        const doc = iframe.contentDocument;
        if (doc) {
          console.log('[hl] iframe ' + i + ' doc found');
          window._serverLog?.('[hl] iframe ' + i + ' doc found');
          _currentDoc = doc;
          _attachDocListeners(doc);
        }
      } catch (err) {
        window._serverLog?.('[hl] iframe ' + i + ' error: ' + err.message);
      }
    });
  }

  // ── 選択検出 → メニュー表示 ───────────────────
  let _currentDoc = null;


  // ── ハイライト色選択メニュー ──────────────────
  let _menu = null;

  function _removeMenu() {
    if (_menu) { _menu.remove(); _menu = null; }
  }

  function _showHighlightMenu(cfiRange, selectedText, range) {
    _removeMenu();

    const menu = document.createElement('div');
    menu.className = 'highlight-menu';
    console.log('[hl] creating menu, range:', range);
    window._serverLog?.('[hl] creating menu');
    menu.innerHTML = `
      <div class="hm-title">ハイライト色を選択</div>
      <div class="hm-colors">
        ${Object.entries(COLORS).map(([name, color]) =>
          `<button class="hm-color" data-color="${name}" style="background:${color}" title="${name}"></button>`
        ).join('')}
      </div>
      <button class="hm-cancel">キャンセル</button>
    `;

    // 選択範囲の位置を取得してメニューを配置
    // ビューポート内に収める
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (range) {
      const rect = range.getBoundingClientRect();
      // 縦書きの場合、選択範囲の右側にメニューを表示
      const left = Math.min(vw - 230, Math.max(8, rect.right + 4));
      const top = Math.min(vh - 120, Math.max(8, rect.top));
      console.log('[hl] menu pos:', { left, top, rect, vw, vh });
      window._serverLog?.('[hl] menu pos left=' + left + ' top=' + top);
      menu.style.left = `${left}px`;
      menu.style.top  = `${top}px`;
    } else {
      menu.style.left = '50%';
      menu.style.top  = '50%';
      menu.style.transform = 'translate(-50%, -50%)';
    }

    // 色選択
    menu.querySelectorAll('.hm-color').forEach(btn => {
      btn.addEventListener('click', async () => {
        const color = btn.dataset.color;
        const id = crypto.randomUUID();
        const h = { id, bookId: _bookId, cfiRange, selectedText, color, note: '' };
        _list.push(h);
        _applyOne(h);
        _renderPanel();
        _removeMenu();
        await sync.writeHighlight('create', h);
      });
    });

    // キャンセル
    menu.querySelector('.hm-cancel').addEventListener('click', _removeMenu);

    // 外側クリックで閉じる
    setTimeout(() => {
      const closeHandler = (ev) => {
        if (!menu.contains(ev.target)) {
          _removeMenu();
          document.removeEventListener('click', closeHandler);
        }
      };
      document.addEventListener('click', closeHandler);
    }, 0);

    document.body.appendChild(menu);
    _menu = menu;
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
          <p class="hl-text">${escHtml(h.selectedText)}</p>
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
        if (h) _view.goTo(h.cfiRange);
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