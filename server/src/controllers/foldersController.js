'use strict';

const Folder = require('../models/Folder');

async function list(req, res, next) {
  try {
    const folders = await Folder.findByUser(req.user.id);
    res.json(folders);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const name = req.body.name;
    if (!name) return res.status(400).json({ error: 'フォルダ名は必須です' });
    const folder = await Folder.create({ userId: req.user.id, name });
    res.status(201).json(folder);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const name = req.body.name;
    if (!name) return res.status(400).json({ error: 'フォルダ名は必須です' });
    const updated = await Folder.update(req.params.id, req.user.id, { name });
    if (!updated) return res.status(404).json({ error: 'フォルダが見つかりません' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

async function destroy(req, res, next) {
  try {
    const deleted = await Folder.delete(req.params.id, req.user.id);
    if (!deleted) return res.status(404).json({ error: 'フォルダが見つかりません' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, destroy };
