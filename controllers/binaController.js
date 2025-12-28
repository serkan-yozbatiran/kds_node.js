const Bina = require('../models/Bina');

class BinaController {
    static async getById(req, res) {
        const binaId = parseInt(req.params.id);
        
        try {
            const bina = await Bina.findById(binaId);
            
            if (!bina) {
                return res.status(404).json({ error: 'Bina bulunamadı' });
            }
            
            res.json(bina);
        } catch (err) {
            console.error('Bina sorgu hatası:', err);
            res.status(500).json({ error: 'Veritabanı hatası' });
        }
    }

    static async getUrgentBuildings(req, res) {
        try {
            const buildings = await Bina.getUrgentBuildings(15);
            res.json({ buildings });
        } catch (error) {
            console.error('Acil müdahale binaları yüklenemedi:', error);
            res.status(500).json({ error: 'Veri yüklenemedi' });
        }
    }
}

module.exports = BinaController;



