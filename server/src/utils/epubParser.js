'use strict';

const EPub  = require('epub2').EPub;
const fs    = require('fs');
const path  = require('path');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';

/**
 * EPUBファイルからメタデータとカバー画像を抽出する
 * @param {string} epubPath - EPUBファイルのフルパス
 * @returns {Promise<{title, author, publisher, language, description, coverPath}>}
 */
async function parseEpub(epubPath) {
  return new Promise((resolve, reject) => {
    const epub = new EPub(epubPath);

    epub.on('error', reject);

    epub.on('end', async () => {
      const meta = {
        title:       epub.metadata.title       || '',
        author:      epub.metadata.creator     || epub.metadata.author || '',
        publisher:   epub.metadata.publisher   || '',
        language:    epub.metadata.language    || '',
        description: epub.metadata.description || '',
        coverPath:   '',
      };

      // カバー画像の抽出
      try {
        const coverId = epub.metadata.cover;
        if (coverId && epub.manifest[coverId]) {
          const coverItem = epub.manifest[coverId];
          const ext = path.extname(coverItem.href) || '.jpg';
          const coverFilename = `cover_${uuidv4()}${ext}`;
          const coverFullPath = path.join(UPLOAD_DIR, coverFilename);

          await extractImage(epub, coverId, coverFullPath);
          meta.coverPath = coverFilename;
        }
      } catch (err) {
        // カバー取得失敗は致命的でないので続行
        console.warn('[epubParser] Cover extraction failed:', err.message);
      }

      resolve(meta);
    });

    epub.parse();
  });
}

/**
 * epub2 でカバー画像バイナリを取得してファイルに保存
 */
function extractImage(epub, imageId, destPath) {
  return new Promise((resolve, reject) => {
    epub.getImage(imageId, (err, data, mimeType) => {
      if (err) return reject(err);
      if (!data) return reject(new Error('Image data empty'));
      fs.writeFile(destPath, data, (writeErr) => {
        if (writeErr) return reject(writeErr);
        resolve();
      });
    });
  });
}

module.exports = { parseEpub };
