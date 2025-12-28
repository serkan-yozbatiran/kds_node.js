/**
 * Bayraklı KDS - Veritabanı Başlatma ve Veri Import Scripti
 * Bu script MySQL veritabanını oluşturur ve GeoJSON'dan verileri import eder.
 * 
 * Kullanım: npm run init-db
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const config = require('../config');

async function initDatabase() {
    console.log('🚀 Veritabanı başlatılıyor...\n');
    
    // Önce veritabanı olmadan bağlan
    let connection = await mysql.createConnection({
        host: config.db.host,
        user: config.db.user,
        password: config.db.password
    });
    
    try {
        // Veritabanını oluştur
        console.log('📦 Veritabanı oluşturuluyor: bayrakli_kds');
        await connection.query(`CREATE DATABASE IF NOT EXISTS bayrakli_kds CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci`);
        
        // Veritabanını seç
        await connection.query(`USE bayrakli_kds`);
        
        // Mahalleler tablosu
        console.log('📋 Tablo oluşturuluyor: mahalleler');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS mahalleler (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ad VARCHAR(100) NOT NULL UNIQUE,
                nufus INT DEFAULT 0,
                alan_m2 DECIMAL(15, 2) DEFAULT 0,
                risk_skoru DECIMAL(3, 2) DEFAULT 0,
                oncelik_sirasi INT DEFAULT 0,
                aciklama TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
        `);
        
        // Binalar tablosu
        console.log('📋 Tablo oluşturuluyor: binalar');
        await connection.query(`DROP TABLE IF EXISTS binalar`);
        await connection.query(`
            CREATE TABLE binalar (
                id INT AUTO_INCREMENT PRIMARY KEY,
                bina_id INT NOT NULL UNIQUE,
                osm_id VARCHAR(50),
                mahalle_adi VARCHAR(100),
                bina_turu VARCHAR(50),
                kat_sayisi INT DEFAULT NULL,
                yapi_yili INT DEFAULT NULL,
                yapi_malzemesi VARCHAR(100),
                hasar_durumu ENUM('hasarsiz', 'hafif', 'orta', 'agir', 'yikik') DEFAULT 'hasarsiz',
                deprem_hasari VARCHAR(50),
                deprem_riski DECIMAL(3, 2) DEFAULT 0,
                adres_sokak VARCHAR(200),
                adres_no VARCHAR(20),
                koordinat_lat DECIMAL(10, 8),
                koordinat_lng DECIMAL(11, 8),
                daire_sayisi INT DEFAULT NULL,
                bina_alani_m2 DECIMAL(10, 2) DEFAULT NULL,
                nufus INT DEFAULT NULL,
                aciklama TEXT,
                ozel_notlar TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_mahalle (mahalle_adi),
                INDEX idx_bina_id (bina_id),
                INDEX idx_hasar (hasar_durumu),
                INDEX idx_risk (deprem_riski)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
        `);
        
        console.log('\n✅ Tablolar oluşturuldu!\n');
        
        // GeoJSON'dan verileri import et
        console.log('📥 GeoJSON verileri import ediliyor...');
        
        const geojsonPath = path.join(__dirname, '..', 'birlesik_binalar.geojson');
        const rawData = fs.readFileSync(geojsonPath, 'utf8');
        const geojsonData = JSON.parse(rawData);
        
        console.log(`   Toplam bina: ${geojsonData.features.length}`);
        
        // Önce mahalleleri çıkar ve ekle
        const mahalleler = new Set();
        geojsonData.features.forEach(f => {
            if (f.properties.name_2) {
                mahalleler.add(f.properties.name_2);
            }
        });
        
        console.log(`   Toplam mahalle: ${mahalleler.size}`);
        
        // Mahalleleri ekle
        for (const mahalle of mahalleler) {
            try {
                await connection.query(
                    `INSERT IGNORE INTO mahalleler (ad) VALUES (?)`,
                    [mahalle]
                );
            } catch (e) {
                // Zaten var, atla
            }
        }
        
        // Binaları batch olarak ekle
        const batchSize = 500;
        let inserted = 0;
        
        for (let i = 0; i < geojsonData.features.length; i += batchSize) {
            const batch = geojsonData.features.slice(i, i + batchSize);
            
            const values = [];
            const placeholders = [];
            
            for (const feature of batch) {
                const props = feature.properties;
                
                // Merkez koordinatı hesapla
                let lat = null, lng = null;
                if (feature.geometry && feature.geometry.coordinates) {
                    try {
                        const coords = feature.geometry.coordinates[0][0];
                        if (coords && coords.length > 0) {
                            let sumLat = 0, sumLng = 0;
                            coords.forEach(c => {
                                sumLng += c[0];
                                sumLat += c[1];
                            });
                            lng = sumLng / coords.length;
                            lat = sumLat / coords.length;
                        }
                    } catch (e) {}
                }
                
                values.push(
                    props.bina_id || null,
                    props.osm_id || null,
                    props.name_2 || null,
                    props.building || null,
                    props['building:levels'] ? parseInt(props['building:levels']) : null,
                    props.start_date ? parseInt(props.start_date) : null,
                    props['building:material'] || null,
                    'hasarsiz',
                    props['earthquake:damage'] || null,
                    0,
                    props['addr:street'] || null,
                    props['addr:housenumber'] || null,
                    lat,
                    lng,
                    props['building:flats'] ? parseInt(props['building:flats']) : null,
                    null,
                    null,
                    null,
                    null
                );
                
                placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            }
            
            if (placeholders.length > 0) {
                try {
                    await connection.query(
                        `INSERT INTO binalar (bina_id, osm_id, mahalle_adi, bina_turu, kat_sayisi, yapi_yili, yapi_malzemesi, hasar_durumu, deprem_hasari, deprem_riski, adres_sokak, adres_no, koordinat_lat, koordinat_lng, daire_sayisi, bina_alani_m2, nufus, aciklama, ozel_notlar) VALUES ${placeholders.join(', ')}`,
                        values
                    );
                    inserted += batch.length;
                } catch (e) {
                    console.log(`   Batch hatası: ${e.message}`);
                }
            }
            
            // İlerleme göster
            if ((i + batchSize) % 5000 === 0 || i + batchSize >= geojsonData.features.length) {
                console.log(`   İşlenen: ${Math.min(i + batchSize, geojsonData.features.length)} / ${geojsonData.features.length}`);
            }
        }
        
        console.log(`\n✅ ${inserted} bina veritabanına aktarıldı!`);
        
        // İstatistikleri göster
        const [mahalleCount] = await connection.query('SELECT COUNT(*) as count FROM mahalleler');
        const [binaCount] = await connection.query('SELECT COUNT(*) as count FROM binalar');
        
        console.log('\n📊 Veritabanı İstatistikleri:');
        console.log(`   • Mahalle sayısı: ${mahalleCount[0].count}`);
        console.log(`   • Bina sayısı: ${binaCount[0].count}`);
        
    } catch (error) {
        console.error('❌ Hata:', error.message);
    } finally {
        await connection.end();
        console.log('\n🔌 Veritabanı bağlantısı kapatıldı.');
    }
}

initDatabase();
