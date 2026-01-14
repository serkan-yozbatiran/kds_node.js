const express = require('express');
const router = express.Router();
const EtapController = require('../controllers/etapController');

router.get('/', EtapController.getAll);
router.get('/mahalle/:ad', EtapController.getByMahalle);

module.exports = router;





