'use strict';

/**
 * sync.js
 * オフライン中にキューに積んだ書き込みを
 * オンライン復帰時にサーバーへ反映する
 *
 * syncQueue エントリの type:
 *   'highlight:create'  payload: { bookId, cfiRange, selectedText, color, note }
 *   'highlight:update'  payload: { id, color, note }
 *   'highlight:delete'  payload: { id }
 *   'progress:upsert'   payload: { bookId, cfi, percentage, deviceId }
 */

const sync = {
  _running: false,

  init() {
    // オンライン復帰時に自動同期
    window.addEventListener('online', () => {
      console.log('[sync] Online — flushing queue');
      this.flush();
    });

    // 起動時にオンラインなら即時実行
    if (navigator.onLine) this.flush();
  },

  async flush() {
    if (this._running) return;
    if (!navigator.onLine) return;
    if (!auth.isLoggedIn()) return;

    this._running = true;
    try {
      const queue = await db.syncQueue.getAll();
      if (queue.length === 0) return;

      console.log(`[sync] Processing ${queue.length} queued items`);

      for (const item of queue) {
        const ok = await this._process(item);
        if (ok) {
          await db.syncQueue.dequeue(item.id);
        } else {
          console.warn('[sync] Failed to process item, will retry later:', item);
        }
      }
    } finally {
      this._running = false;
    }
  },

  async _process(item) {
    try {
      let res;
      const { type, payload } = item;

      if (type === 'highlight:create') {
        res = await api.post(`/api/highlights/${payload.bookId}`, payload);
        if (res && !res.ok) console.warn('[sync] highlight:create failed', res.status, res.data);
      } else if (type === 'highlight:update') {
        res = await api.patch(`/api/highlights/${payload.id}`, payload);
      } else if (type === 'highlight:delete') {
        res = await api.delete(`/api/highlights/${payload.id}`);
      } else if (type === 'progress:upsert') {
        res = await api.put(`/api/progress/${payload.bookId}`, payload);
      } else {
        console.warn('[sync] Unknown queue type:', type);
        return true; // 不明なエントリは削除して先へ進む
      }

      if (res.offline) return false;

      // 404 は相手が消えているので成功扱い
      return res.ok || res.status === 404;
    } catch (err) {
      console.error('[sync] Error processing item:', err);
      return false;
    }
  },

  /** オフライン判定付き書き込みヘルパー */
  async writeHighlight(type, payload) {
    if (navigator.onLine) {
      let res;
      if (type === 'create') {
        res = await api.post(`/api/highlights/${payload.bookId}`, payload);
        if (res && !res.ok) console.warn('[sync] highlight:create failed', res.status, res.data);
      } else if (type === 'update') {
        res = await api.patch(`/api/highlights/${payload.id}`, payload);
      } else if (type === 'delete') {
        res = await api.delete(`/api/highlights/${payload.id}`);
      }
      if (res && !res.offline && res.ok) return res.data;
    }
    // オフライン or 失敗 → キューに積む
    await db.syncQueue.enqueue(`highlight:${type}`, payload);
    return null;
  },

  async writeProgress(payload) {
    if (navigator.onLine) {
      const res = await api.put(`/api/progress/${payload.bookId}`, payload);
      if (!res.offline && res.ok) return res.data;
    }
    await db.syncQueue.enqueue('progress:upsert', payload);
    return null;
  },
};

window.sync = sync;
