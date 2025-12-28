const pool = require('../config/database');
const geojsonService = require('../services/geojsonService');

class Mahalle {
    static async findAll() {
        const [rows] = await pool.query(`
            SELECT 
                mahalle_adi as ad,
                COUNT(*) as bina_sayisi,
                ROUND(AVG(risk_puani), 2) as ortalama_risk
            FROM binalar 
            WHERE mahalle_adi IS NOT NULL
            GROUP BY mahalle_adi
            ORDER BY bina_sayisi DESC
        `);
        return rows;
    }

    static async getBoundaries() {
        const mahalleGeojsonData = geojsonService.getMahalleGeojson();
        
        if (!mahalleGeojsonData) {
            return null;
        }
        
        // Veritabanından mahalle istatistiklerini çek
        const [stats] = await pool.query(`
            SELECT 
                mahalle_adi,
                COUNT(*) as bina_sayisi,
                SUM(CASE WHEN risk_kategorisi = 'Düşük' THEN 1 ELSE 0 END) as dusuk,
                SUM(CASE WHEN risk_kategorisi = 'Orta' THEN 1 ELSE 0 END) as orta,
                SUM(CASE WHEN risk_kategorisi = 'Yüksek' THEN 1 ELSE 0 END) as yuksek,
                SUM(CASE WHEN risk_kategorisi = 'Çok Yüksek' THEN 1 ELSE 0 END) as cok_yuksek,
                ROUND(AVG(risk_puani), 2) as ortalama_risk
            FROM binalar 
            WHERE mahalle_adi IS NOT NULL
            GROUP BY mahalle_adi
        `);
        
        const statsMap = new Map();
        stats.forEach(s => statsMap.set(s.mahalle_adi, s));
        
        // GeoJSON'u kopyala ve istatistikleri ekle
        const result = {
            type: 'FeatureCollection',
            features: mahalleGeojsonData.features.map(f => {
                const mahalleName = f.properties.name;
                const stat = statsMap.get(mahalleName);
                
                return {
                    type: 'Feature',
                    properties: {
                        name: mahalleName,
                        bina_sayisi: stat ? stat.bina_sayisi : 0,
                        dusuk: stat ? stat.dusuk : 0,
                        orta: stat ? stat.orta : 0,
                        yuksek: stat ? stat.yuksek : 0,
                        cok_yuksek: stat ? stat.cok_yuksek : 0,
                        ortalama_risk: stat ? stat.ortalama_risk : 0
                    },
                    geometry: f.geometry
                };
            })
        };
        
        return result;
    }

    static async getStatistics(mahalleAd) {
        const [rows] = await pool.query(`
            SELECT 
                mahalle_adi as ad,
                COUNT(*) as bina_sayisi,
                SUM(CASE WHEN risk_kategorisi = 'Düşük' THEN 1 ELSE 0 END) as dusuk_risk,
                SUM(CASE WHEN risk_kategorisi = 'Orta' THEN 1 ELSE 0 END) as orta_risk,
                SUM(CASE WHEN risk_kategorisi = 'Yüksek' THEN 1 ELSE 0 END) as yuksek_risk,
                SUM(CASE WHEN risk_kategorisi = 'Çok Yüksek' THEN 1 ELSE 0 END) as cok_yuksek_risk,
                ROUND(AVG(risk_puani), 2) as ortalama_risk
            FROM binalar 
            WHERE mahalle_adi = ?
            GROUP BY mahalle_adi
        `, [mahalleAd]);
        return rows[0] || null;
    }

    static async getInfrastructureData(mahalleAd, etapAdi = null) {
        let query = `
            SELECT 
                m.mahalle_adi,
                m.nufus as mevcut_nufus,
                m.alan_hektar as alan,
                m.yogunluk as mevcut_yogunluk
            FROM mahalleler m
        `;
        
        const params = [];
        
        if (etapAdi && mahalleAd) {
            query += `
                INNER JOIN binalar b ON m.mahalle_adi = b.mahalle_adi
                WHERE b.etap_adi = ? AND b.mahalle_adi = ?
                GROUP BY m.mahalle_id, m.mahalle_adi, m.nufus, m.alan_hektar, m.yogunluk
            `;
            params.push(etapAdi, mahalleAd);
        } else if (mahalleAd) {
            query += ` WHERE m.mahalle_adi = ?`;
            params.push(mahalleAd);
        } else {
            query = `
                SELECT 
                    'Tüm İlçe' as mahalle_adi,
                    SUM(m.nufus) as mevcut_nufus,
                    SUM(m.alan_hektar) as alan,
                    AVG(m.yogunluk) as mevcut_yogunluk
                FROM mahalleler m
            `;
        }
        
        const [result] = await pool.query(query, params);
        return result[0] || null;
    }
}

module.exports = Mahalle;



