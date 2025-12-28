const express = require('express');
const router = express.Router();
const StatisticsController = require('../controllers/statisticsController');

router.get('/', StatisticsController.getGeneralStats);
router.get('/db-test', StatisticsController.testConnection);

module.exports = router;



