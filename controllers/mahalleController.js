const Mahalle = require('../models/Mahalle');
const geojsonService = require('../services/geojsonService');

class MahalleController {
    static async getAll(req, res) {
        try {
            const mahalleler = await Mahalle.findAll();
            res.json(mahalleler);
        } catch (err) {
            console.error('Mahalle listesi hatası:', err);
            res.status(500).json({ error: 'Veritabanı hatası' });
        }
    }

    static async getBoundaries(req, res) {
        try {
            const boundaries = await Mahalle.getBoundaries();
            if (!boundaries) {
                return res.status(500).json({ error: 'Mahalle sınırları yüklenemedi' });
            }
            res.json(boundaries);
        } catch (err) {
            console.error('Mahalle istatistik hatası:', err);
            const mahalleGeojsonData = geojsonService.getMahalleGeojson();
            if (mahalleGeojsonData) {
                res.json(mahalleGeojsonData);
            } else {
                res.status(500).json({ error: 'Veritabanı hatası', message: err.message });
            }
        }
    }

    static async getBuildings(req, res) {
        const mahalleAd = decodeURIComponent(req.params.ad);
        
        try {
            const Bina = require('../models/Bina');
            const buildings = await Bina.getBuildingsWithGeometry(mahalleAd);
            res.json(buildings);
        } catch (err) {
            console.error('Veritabanı hatası:', err);
            res.status(500).json({ error: 'Veritabanı hatası', message: err.message });
        }
    }
}

module.exports = MahalleController;

