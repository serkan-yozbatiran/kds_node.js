const express = require('express');
const router = express.Router();
const MahalleController = require('../controllers/mahalleController');

// /api/mahalleler için
router.get('/', MahalleController.getAll);

// /api/mahalle-sinirlari için
router.get('/sinirlari', MahalleController.getBoundaries);

// /api/mahalle/:ad/binalar için
router.get('/:ad/binalar', MahalleController.getBuildings);

module.exports = router;

