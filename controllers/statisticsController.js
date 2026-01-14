const Statistics = require('../models/Statistics');

class StatisticsController {
    static async getGeneralStats(req, res) {
        try {
            const stats = await Statistics.getGeneralStats();
            res.json(stats);
        } catch (err) {
            console.error('İstatistik hatası:', err);
            res.status(500).json({ error: 'Veritabanı hatası', message: err.message });
        }
    }

    static async testConnection(req, res) {
        try {
            const result = await Statistics.testConnection();
            res.json(result);
        } catch (err) {
            res.json({ success: false, message: err.message });
        }
    }
}

module.exports = StatisticsController;





