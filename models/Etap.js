const pool = require('../config/database');
const geojsonService = require('../services/geojsonService');
const turf = require('@turf/turf');

class Etap {
    static async findAll(mahalleAdi = null) {
        let query = `
            SELECT DISTINCT
                etap_adi,
                mahalle_adi
            FROM binalar 
            WHERE etap_adi IS NOT NULL AND etap_adi != ''
        `;
        
        const params = [];
        if (mahalleAdi) {
            query += ` AND mahalle_adi = ?`;
            params.push(mahalleAdi);
        }
        
        query += ` ORDER BY mahalle_adi, etap_adi`;
        
        const [rows] = await pool.query(query, params);
        return rows;
    }

    static async findByMahalle(mahalleAd) {
        const [etaplar] = await pool.query(`
            SELECT 
                etap_id,
                etap_adi,
                COUNT(*) as bina_sayisi,
                SUM(CASE WHEN risk_kategorisi = 'Düşük' THEN 1 ELSE 0 END) as dusuk_risk,
                SUM(CASE WHEN risk_kategorisi = 'Orta' THEN 1 ELSE 0 END) as orta_risk,
                SUM(CASE WHEN risk_kategorisi = 'Yüksek' THEN 1 ELSE 0 END) as yuksek_risk,
                SUM(CASE WHEN risk_kategorisi = 'Çok Yüksek' THEN 1 ELSE 0 END) as cok_yuksek_risk,
                ROUND(AVG(risk_puani), 2) as ortalama_risk
            FROM binalar 
            WHERE mahalle_adi = ? AND etap_adi IS NOT NULL AND etap_adi != ''
            GROUP BY etap_id, etap_adi
            ORDER BY etap_adi
        `, [mahalleAd]);
        
        return etaplar;
    }

    static async getEtapDataWithBuildings(mahalleAd) {
        const etaplar = await this.findByMahalle(mahalleAd);
        
        // Her etabın binalarını çek
        const [binalar] = await pool.query(
            `SELECT bina_id, mahalle_adi, etap_adi, risk_kategorisi, risk_puani, yapi_turu, kat_sayisi, bina_yasi
             FROM binalar WHERE mahalle_adi = ? AND etap_adi IS NOT NULL AND etap_adi != ''`,
            [mahalleAd]
        );
        
        // GeoJSON'dan geometrileri al
        const binaGeojsonData = geojsonService.getBinaGeojson();
        const geometryMap = new Map();
        if (binaGeojsonData) {
            binaGeojsonData.features.forEach(f => {
                if (f.properties.bina_id) {
                    geometryMap.set(f.properties.bina_id, f.geometry);
                }
            });
        }
        
        // Her etap için bina geometrilerini grupla
        const etapBinalari = {};
        binalar.forEach(bina => {
            if (!etapBinalari[bina.etap_adi]) {
                etapBinalari[bina.etap_adi] = [];
            }
            const geometry = geometryMap.get(bina.bina_id);
            if (geometry) {
                etapBinalari[bina.etap_adi].push({
                    type: 'Feature',
                    properties: { ...bina },
                    geometry: geometry
                });
            }
        });
        
        // Etap sınırlarını hesapla (convex hull)
        const etapSinirlari = etaplar.map((etap, index) => {
            const etapBinaFeatures = etapBinalari[etap.etap_adi] || [];
            
            if (etapBinaFeatures.length === 0) {
                return null;
            }
            
            // Tüm bina noktalarını topla
            const points = [];
            etapBinaFeatures.forEach(f => {
                if (f.geometry.type === 'Polygon') {
                    f.geometry.coordinates[0].forEach(coord => {
                        points.push(turf.point(coord));
                    });
                } else if (f.geometry.type === 'MultiPolygon') {
                    f.geometry.coordinates.forEach(poly => {
                        poly[0].forEach(coord => {
                            points.push(turf.point(coord));
                        });
                    });
                }
            });
            
            if (points.length < 3) return null;
            
            // Convex hull oluştur
            const featureCollection = turf.featureCollection(points);
            const hull = turf.convex(featureCollection);
            
            if (!hull) return null;
            
            // Etap renklerini belirle
            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f43f5e', '#84cc16'];
            
            return {
                type: 'Feature',
                properties: {
                    etap_adi: etap.etap_adi,
                    bina_sayisi: etap.bina_sayisi,
                    dusuk_risk: etap.dusuk_risk,
                    orta_risk: etap.orta_risk,
                    yuksek_risk: etap.yuksek_risk,
                    cok_yuksek_risk: etap.cok_yuksek_risk,
                    ortalama_risk: etap.ortalama_risk,
                    color: colors[index % colors.length]
                },
                geometry: hull.geometry
            };
        }).filter(e => e !== null);
        
        return {
            mahalle: mahalleAd,
            etaplar: etaplar,
            etap_sinirlari: {
                type: 'FeatureCollection',
                features: etapSinirlari
            },
            binalar: etapBinalari
        };
    }
}

module.exports = Etap;





