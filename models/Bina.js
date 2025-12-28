const pool = require('../config/database');
const geojsonService = require('../services/geojsonService');

class Bina {
    static async findById(binaId) {
        const [rows] = await pool.query(
            `SELECT * FROM binalar WHERE bina_id = ?`,
            [binaId]
        );
        return rows[0] || null;
    }

    static async findByMahalle(mahalleAd) {
        const [rows] = await pool.query(
            `SELECT * FROM binalar WHERE mahalle_adi = ?`,
            [mahalleAd]
        );
        return rows;
    }

    static async findByMahalleAndEtap(mahalleAd, etapAdi) {
        const [rows] = await pool.query(
            `SELECT * FROM binalar WHERE mahalle_adi = ? AND etap_adi = ?`,
            [mahalleAd, etapAdi]
        );
        return rows;
    }

    static async getUrgentBuildings(limit = 15) {
        const [rows] = await pool.query(`
            SELECT 
                bina_id,
                mahalle_adi,
                risk_puani,
                bina_yasi,
                kat_sayisi,
                yapi_turu,
                etap_adi
            FROM binalar
            WHERE risk_puani > 80 
                AND bina_yasi > 30
            ORDER BY risk_puani DESC, bina_yasi DESC
            LIMIT ?
        `, [limit]);
        return rows;
    }

    static async getBuildingsWithGeometry(mahalleAd) {
        const dbBinalar = await this.findByMahalle(mahalleAd);
        const binaGeojsonData = geojsonService.getBinaGeojson();
        
        const geometryMap = new Map();
        if (binaGeojsonData) {
            binaGeojsonData.features.forEach(f => {
                if (f.properties.bina_id) {
                    geometryMap.set(f.properties.bina_id, f.geometry);
                }
            });
        }
        
        const features = dbBinalar.map(bina => {
            const geometry = geometryMap.get(bina.bina_id);
            
            return {
                type: 'Feature',
                properties: {
                    bina_id: bina.bina_id,
                    mahalle_adi: bina.mahalle_adi,
                    mahalle_id: bina.mahalle_id,
                    ada_no: bina.ada_no,
                    parsel_no: bina.parsel_no,
                    bina_yasi: bina.bina_yasi,
                    kat_sayisi: bina.kat_sayisi,
                    yapi_turu: bina.yapi_turu,
                    risk_puani: bina.risk_puani,
                    risk_kategorisi: bina.risk_kategorisi,
                    yapim_yili: bina.yapim_yili
                },
                geometry: geometry
            };
        }).filter(f => f.geometry);
        
        return {
            type: 'FeatureCollection',
            features: features
        };
    }

    static async getTotalCount() {
        const [result] = await pool.query('SELECT COUNT(*) as toplam FROM binalar');
        return result[0].toplam;
    }
}

module.exports = Bina;



