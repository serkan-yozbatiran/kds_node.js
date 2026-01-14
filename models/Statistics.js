const pool = require('../config/database');

class Statistics {
    static async getGeneralStats() {
        // Toplam bina
        const [totalResult] = await pool.query('SELECT COUNT(*) as toplam FROM binalar');
        const toplamBina = totalResult[0].toplam;
        
        // Mahalle istatistikleri
        const [mahalleStats] = await pool.query(`
            SELECT 
                mahalle_adi as ad,
                COUNT(*) as bina_sayisi,
                SUM(CASE WHEN risk_kategorisi = 'Düşük' THEN 1 ELSE 0 END) as dusuk_risk,
                SUM(CASE WHEN risk_kategorisi = 'Orta' THEN 1 ELSE 0 END) as orta_risk,
                SUM(CASE WHEN risk_kategorisi = 'Yüksek' THEN 1 ELSE 0 END) as yuksek_risk,
                SUM(CASE WHEN risk_kategorisi = 'Çok Yüksek' THEN 1 ELSE 0 END) as cok_yuksek_risk,
                ROUND(AVG(risk_puani), 2) as ortalama_risk
            FROM binalar 
            WHERE mahalle_adi IS NOT NULL
            GROUP BY mahalle_adi
            ORDER BY bina_sayisi DESC
        `);
        
        // Risk dağılımı
        const [riskStats] = await pool.query(`
            SELECT risk_kategorisi, COUNT(*) as sayi
            FROM binalar 
            GROUP BY risk_kategorisi
        `);
        
        const riskDagilimi = {};
        riskStats.forEach(r => {
            riskDagilimi[r.risk_kategorisi] = r.sayi;
        });
        
        // Yapı türü dağılımı
        const [yapiStats] = await pool.query(`
            SELECT yapi_turu, COUNT(*) as sayi
            FROM binalar 
            GROUP BY yapi_turu
            ORDER BY sayi DESC
        `);
        
        const yapiTurleri = {};
        yapiStats.forEach(y => {
            yapiTurleri[y.yapi_turu] = y.sayi;
        });
        
        return {
            toplam_bina: toplamBina,
            toplam_mahalle: mahalleStats.length,
            risk_dagilimi: riskDagilimi,
            yapi_turleri: yapiTurleri,
            mahalleler: mahalleStats
        };
    }

    static async testConnection() {
        const [rows] = await pool.query('SELECT COUNT(*) as total FROM binalar');
        return {
            success: true,
            message: 'Veritabanı bağlantısı başarılı',
            toplam_bina: rows[0].total
        };
    }
}

module.exports = Statistics;





