const express = require('express');
const router = express.Router();
const DashboardController = require('../controllers/dashboardController');

router.get('/', DashboardController.getFinancialSummary); // /api/financial-summary
router.get('/strategy-decision', DashboardController.getStrategyDecision);
router.get('/legal-risk', DashboardController.getLegalRisk);
router.get('/construction-schedule', DashboardController.getConstructionSchedule);
router.get('/social-profile', DashboardController.getSocialProfile);
router.get('/infrastructure-impact', DashboardController.getInfrastructureImpact);

module.exports = router;

