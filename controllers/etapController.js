const Etap = require('../models/Etap');

class EtapController {
    static async getAll(req, res) {
        try {
            const { mahalle_adi } = req.query;
            const etaplar = await Etap.findAll(mahalle_adi);
            res.json(etaplar);
        } catch (err) {
            console.error('Etap listesi hatası:', err);
            res.status(500).json({ error: 'Veritabanı hatası', message: err.message });
        }
    }

    static async getByMahalle(req, res) {
        const mahalleAd = decodeURIComponent(req.params.ad);
        
        try {
            const etapData = await Etap.getEtapDataWithBuildings(mahalleAd);
            res.json(etapData);
        } catch (err) {
            console.error('Etap hatası:', err);
            res.status(500).json({ error: 'Veritabanı hatası', message: err.message });
        }
    }
}

module.exports = EtapController;



