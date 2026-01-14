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

    // CRUD - Create
    static async createBina(req, res) {
        try {
            const data = req.body;
            // Basit validasyon
            if (!data.mahalle_adi || !data.ada_no || !data.parsel_no) {
                return res.status(400).json({ error: 'Zorunlu alanlar eksik' });
            }

            const insertId = await Bina.create(data);
            res.status(201).json({ message: 'Bina başarıyla eklendi', id: insertId });
        } catch (err) {
            console.error('Bina ekleme hatası:', err);
            res.status(500).json({ error: 'Bina eklenemedi' });
        }
    }

    // CRUD - Update with Business Rule
    static async updateBina(req, res) {
        try {
            const id = parseInt(req.params.id);
            const updates = req.body;

            // Mevcut binayı bul
            const currentBina = await Bina.findById(id);
            if (!currentBina) {
                return res.status(404).json({ error: 'Bina bulunamadı' });
            }

            // SENARYO 2: Riskli Yapı Kuralı
            // "Riskli Yapı şerhi olan bir binanın durumu 'Hasarsız' olarak güncellenemez."
            if (currentBina.risk_durumu === 'Riskli' && updates.risk_durumu === 'Hasarsız') {
                return res.status(400).json({
                    error: 'İŞ KURALI İHLALİ: Riskli yapı şerhi olan binalar doğrudan hasarsız duruma getirilemez.'
                });
            }

            const affected = await Bina.update(id, updates);
            if (affected === 0) {
                return res.json({ message: 'Değişiklik yapılmadı' });
            }
            res.json({ message: 'Bina güncellendi' });
        } catch (err) {
            console.error('Güncelleme hatası:', err);
            res.status(500).json({ error: 'Güncelleme başarısız' });
        }
    }

    // CRUD - Delete with Business Rule
    static async deleteBina(req, res) {
        try {
            const id = parseInt(req.params.id);

            // SENARYO 1: Hak Sahibi Kuralı
            // "İçinde hak sahibi (kişi) kaydı bulunan bir bina silinemez."
            const ownerCount = await Bina.getHakSahibiCount(id);
            if (ownerCount > 0) {
                return res.status(400).json({
                    error: `İŞ KURALI İHLALİ: Bu binada ${ownerCount} adet hak sahibi kaydı var. Önce hak sahipleri taşınmalıdır.`
                });
            }

            const affected = await Bina.delete(id);
            if (affected === 0) {
                return res.status(404).json({ error: 'Silinecek bina bulunamadı' });
            }
            res.json({ message: 'Bina başarıyla silindi' });
        } catch (err) {
            console.error('Silme hatası:', err);
            res.status(500).json({ error: 'Silme işlemi başarısız' });
        }
    }
}

module.exports = BinaController;





