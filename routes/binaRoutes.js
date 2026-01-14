const express = require('express');
const router = express.Router();
const BinaController = require('../controllers/binaController');

router.get('/:id', BinaController.getById);
router.get('/urgent-buildings', BinaController.getUrgentBuildings);

// CRUD Routes
router.post('/', BinaController.createBina);
router.put('/:id', BinaController.updateBina);
router.delete('/:id', BinaController.deleteBina);

module.exports = router;

