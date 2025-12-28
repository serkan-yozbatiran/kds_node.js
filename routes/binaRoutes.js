const express = require('express');
const router = express.Router();
const BinaController = require('../controllers/binaController');

router.get('/:id', BinaController.getById);
router.get('/urgent-buildings', BinaController.getUrgentBuildings);

module.exports = router;

