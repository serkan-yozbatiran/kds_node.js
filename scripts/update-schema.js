/**
 * Binalar tablosuna yapi_turu, risk_skoru, risk_kategorisi sütunlarını ekler
 */

const mysql = require('mysql2/promise');
const config = require('../config');

async function updateSchema() {
    console.log('🔧 Veritabanı şeması güncelleniyor...\n');
    
    const connection = await mysql.createConnection({
        host: config.db.host,
        user: config.db.user,
        password: config.db.password,
        database: config.db.database
    });
    
    try {
        // yapi_turu sütunu ekle (eğer yoksa)
        console.log('📋 yapi_turu sütunu ekleniyor...');
        try {
            await connection.query(`
                ALTER TABLE binalar 
                ADD COLUMN yapi_turu VARCHAR(100) DEFAULT NULL
            `);
            console.log('   ✓ yapi_turu eklendi');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('   ℹ yapi_turu zaten mevcut');
            } else {
                throw e;
            }
        }
        
        // risk_skoru sütunu ekle (eğer yoksa)
        console.log('📋 risk_skoru sütunu ekleniyor...');
        try {
            await connection.query(`
                ALTER TABLE binalar 
                ADD COLUMN risk_skoru DECIMAL(5,2) DEFAULT 0
            `);
            console.log('   ✓ risk_skoru eklendi');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('   ℹ risk_skoru zaten mevcut');
            } else {
                throw e;
            }
        }
        
        // risk_kategorisi sütunu ekle (eğer yoksa)
        console.log('📋 risk_kategorisi sütunu ekleniyor...');
        try {
            await connection.query(`
                ALTER TABLE binalar 
                ADD COLUMN risk_kategorisi ENUM('dusuk', 'orta', 'yuksek') DEFAULT 'dusuk'
            `);
            console.log('   ✓ risk_kategorisi eklendi');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('   ℹ risk_kategorisi zaten mevcut');
            } else {
                throw e;
            }
        }
        
        // Index ekle
        console.log('📋 Index ekleniyor...');
        try {
            await connection.query(`
                ALTER TABLE binalar 
                ADD INDEX idx_risk_kategorisi (risk_kategorisi)
            `);
            console.log('   ✓ Index eklendi');
        } catch (e) {
            if (e.code === 'ER_DUP_KEYNAME') {
                console.log('   ℹ Index zaten mevcut');
            }
        }
        
        // Mevcut verilere örnek risk değerleri ata (rastgele dağılım)
        console.log('\n📊 Örnek risk verileri atanıyor...');
        
        // Rastgele risk kategorisi ata
        await connection.query(`
            UPDATE binalar SET 
                risk_kategorisi = CASE 
                    WHEN RAND() < 0.6 THEN 'dusuk'
                    WHEN RAND() < 0.8 THEN 'orta'
                    ELSE 'yuksek'
                END,
                risk_skoru = CASE 
                    WHEN risk_kategorisi = 'dusuk' THEN ROUND(RAND() * 30, 2)
                    WHEN risk_kategorisi = 'orta' THEN ROUND(30 + RAND() * 40, 2)
                    ELSE ROUND(70 + RAND() * 30, 2)
                END
            WHERE risk_skoru = 0 OR risk_skoru IS NULL
        `);
        
        // Risk skoruna göre kategori güncelle
        await connection.query(`
            UPDATE binalar SET 
                risk_kategorisi = CASE 
                    WHEN risk_skoru < 30 THEN 'dusuk'
                    WHEN risk_skoru < 70 THEN 'orta'
                    ELSE 'yuksek'
                END
        `);
        
        // yapi_turu'nu bina_turu'ndan kopyala (eğer boşsa)
        await connection.query(`
            UPDATE binalar SET yapi_turu = bina_turu WHERE yapi_turu IS NULL
        `);
        
        // İstatistikleri göster
        const [stats] = await connection.query(`
            SELECT 
                risk_kategorisi,
                COUNT(*) as sayi,
                ROUND(AVG(risk_skoru), 2) as ortalama_skor
            FROM binalar 
            GROUP BY risk_kategorisi
        `);
        
        console.log('\n📈 Risk Dağılımı:');
        stats.forEach(s => {
            const emoji = s.risk_kategorisi === 'dusuk' ? '🟢' : 
                         s.risk_kategorisi === 'orta' ? '🟡' : '🔴';
            console.log(`   ${emoji} ${s.risk_kategorisi.toUpperCase()}: ${s.sayi} bina (ort. skor: ${s.ortalama_skor})`);
        });
        
        console.log('\n✅ Şema güncelleme tamamlandı!');
        
    } catch (error) {
        console.error('❌ Hata:', error.message);
    } finally {
        await connection.end();
    }
}

updateSchema();



















