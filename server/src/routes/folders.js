'use strict';

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/foldersController');

router.use(authenticate);

router.get('/',   ctrl.list);
router.post('/',  ctrl.create);
router.put('/:id',  ctrl.update);
router.delete('/:id', ctrl.destroy);

module.exports = router;
