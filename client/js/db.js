'use strict';

/**
 * db.js
 * IndexedDB ラッパー
 * ストア:
 *   books        - EPUBバイナリキャッシュ  { id, blob, cachedAt }
 *   booksMeta    - 本棚メタデータキャッシュ { id, ...bookFields }
 *   syncQueue    - オフライン書き込みキュー { id(uuid), type, payload, createdAt }
 */

const DB_NAME    = 'epub-reader';
const DB_VERSION = 4; // Increment to trigger IndexedDB upgrade (clear old syncQueue with snake_case payloads)

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('books')) {
        db.createObjectStore('books', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('booksMeta')) {
        db.createObjectStore('booksMeta', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('syncQueue')) {
        const store = db.createObjectStore('syncQueue', { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      } else {
        // v4: clear old syncQueue items with snake_case payloads
        const store = req.transaction.objectStore('syncQueue');
        store.clear();
      }
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror   = (e) => reject(e.target.error);
  });
}

function tx(storeName, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const req = fn(store);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  }));
}

// ── 書籍キャッシュ（EPUBバイナリ）──────────────────────

const booksCache = {
  get: (id)        => tx('books', 'readonly',  s => s.get(id)),
  set: (id, blob)  => tx('books', 'readwrite', s => s.put({ id, blob, cachedAt: Date.now() })),
  delete: (id)     => tx('books', 'readwrite', s => s.delete(id)),
};

// ── 本棚メタデータキャッシュ ──────────────────────────

const booksMeta = {
  getAll: () => new Promise(async (resolve, reject) => {
    const db = await openDB();
    const transaction = db.transaction('booksMeta', 'readonly');
    const store = transaction.objectStore('booksMeta');
    const req = store.getAll();
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  }),
  set:    (book) => tx('booksMeta', 'readwrite', s => s.put(book)),
  setAll: async (books) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('booksMeta', 'readwrite');
      const store = transaction.objectStore('booksMeta');
      books.forEach(b => store.put(b));
      transaction.oncomplete = () => resolve();
      transaction.onerror    = (e) => reject(e.target.error);
    });
  },
  delete: (id) => tx('booksMeta', 'readwrite', s => s.delete(id)),
};

// ── オフライン書き込みキュー ──────────────────────────

const syncQueue = {
  /** キューに追加 */
  enqueue: (type, payload) => {
    const id = crypto.randomUUID();
    return tx('syncQueue', 'readwrite', s => s.put({ id, type, payload, createdAt: Date.now() }));
  },

  /** 全件取得（createdAt昇順） */
  getAll: () => new Promise(async (resolve, reject) => {
    const db = await openDB();
    const transaction = db.transaction('syncQueue', 'readonly');
    const index = transaction.objectStore('syncQueue').index('createdAt');
    const req = index.getAll();
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  }),

  /** 処理済みを削除 */
  dequeue: (id) => tx('syncQueue', 'readwrite', s => s.delete(id)),

  /** 全件削除 */
  clear: () => new Promise(async (resolve, reject) => {
    const db = await openDB();
    const transaction = db.transaction('syncQueue', 'readwrite');
    const req = transaction.objectStore('syncQueue').clear();
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  }),
};

window.db = { booksCache, booksMeta, syncQueue };
