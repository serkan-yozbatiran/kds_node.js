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

    // CRUD Opers
    static async create(data) {
        const query = `
            INSERT INTO binalar 
            (mahalle_adi, etap_adi, ada_no, parsel_no, bina_yasi, kat_sayisi, yapi_turu, risk_puani, risk_durumu) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            data.mahalle_adi,
            data.etap_adi,
            data.ada_no,
            data.parsel_no,
            data.bina_yasi,
            data.kat_sayisi,
            data.yapi_turu,
            data.risk_puani,
            data.risk_durumu || 'Riskli'
        ];

        const [result] = await pool.query(query, values);
        return result.insertId;
    }

    static async update(id, data) {
        // Dinamik update sorgusu
        const fields = [];
        const values = [];

        // Gelen verideki alanları kontrol et
        if (data.mahalle_adi) { fields.push('mahalle_adi = ?'); values.push(data.mahalle_adi); }
        if (data.etap_adi) { fields.push('etap_adi = ?'); values.push(data.etap_adi); }
        if (data.ada_no) { fields.push('ada_no = ?'); values.push(data.ada_no); }
        if (data.parsel_no) { fields.push('parsel_no = ?'); values.push(data.parsel_no); }
        if (data.bina_yasi) { fields.push('bina_yasi = ?'); values.push(data.bina_yasi); }
        if (data.kat_sayisi) { fields.push('kat_sayisi = ?'); values.push(data.kat_sayisi); }
        if (data.yapi_turu) { fields.push('yapi_turu = ?'); values.push(data.yapi_turu); }
        if (data.risk_puani) { fields.push('risk_puani = ?'); values.push(data.risk_puani); }
        if (data.risk_durumu) { fields.push('risk_durumu = ?'); values.push(data.risk_durumu); }

        if (fields.length === 0) return 0;

        values.push(id);
        const query = `UPDATE binalar SET ${fields.join(', ')} WHERE bina_id = ?`;

        const [result] = await pool.query(query, values);
        return result.affectedRows;
    }

    static async delete(id) {
        const [result] = await pool.query('DELETE FROM binalar WHERE bina_id = ?', [id]);
        return result.affectedRows;
    }

    // Business Rule Helpers
    static async getHakSahibiCount(binaId) {
        const [rows] = await pool.query(
            'SELECT COUNT(*) as count FROM hak_sahipleri WHERE bina_id = ?',
            [binaId]
        );
        return rows[0].count;
    }
}

module.exports = Bina;





