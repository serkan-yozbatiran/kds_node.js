/**
 * Binaları etaplara (proje alanlarına) böler
 * Her mahalle TAM 6 ETAP'a bölünür
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const turf = require('@turf/turf');
const config = require('../config');

const ETAP_SAYISI = 6; // Her mahalle için sabit etap sayısı

async function createEtaplar() {
    console.log('🏗️ Etap oluşturma işlemi başlatılıyor...');
    console.log(`📦 Her mahalle ${ETAP_SAYISI} etaba bölünecek\n`);
    
    const conn = await mysql.createConnection({
        host: config.db.host,
        user: config.db.user,
        password: config.db.password,
        database: config.db.database
    });
    
    try {
        // 1. Etap sütunlarını ekle/sıfırla
        console.log('📋 Veritabanı şeması güncelleniyor...');
        
        try {
            await conn.query(`ALTER TABLE binalar ADD COLUMN etap_id INT DEFAULT NULL`);
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                await conn.query(`UPDATE binalar SET etap_id = NULL`);
            }
        }
        
        try {
            await conn.query(`ALTER TABLE binalar ADD COLUMN etap_adi VARCHAR(100) DEFAULT NULL`);
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                await conn.query(`UPDATE binalar SET etap_adi = NULL`);
            }
        }
        
        // Etaplar tablosu
        await conn.query(`DROP TABLE IF EXISTS etaplar`);
        await conn.query(`
            CREATE TABLE etaplar (
                id INT AUTO_INCREMENT PRIMARY KEY,
                etap_no INT NOT NULL,
                etap_adi VARCHAR(100) NOT NULL,
                mahalle_adi VARCHAR(100),
                bina_sayisi INT DEFAULT 0,
                toplam_risk_puani DECIMAL(10,2) DEFAULT 0,
                ortalama_risk DECIMAL(5,2) DEFAULT 0,
                oncelik_sirasi INT DEFAULT 0,
                durum ENUM('planlanmadi', 'planlandi', 'devam_ediyor', 'tamamlandi') DEFAULT 'planlanmadi',
                center_lat DECIMAL(10,7) DEFAULT NULL,
                center_lng DECIMAL(10,7) DEFAULT NULL,
                boundary_geojson LONGTEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
        `);
        console.log('   ✓ Veritabanı hazır');
        
        // 2. GeoJSON'dan koordinatları yükle
        console.log('\n📍 Bina koordinatları yükleniyor...');
        
        const geojsonPath = path.join(__dirname, '..', 'birlesik_binalar.geojson');
        const rawData = fs.readFileSync(geojsonPath, 'utf8');
        const geojsonData = JSON.parse(rawData);
        
        const binaKoordinatlari = new Map();
        
        geojsonData.features.forEach(feature => {
            const binaId = feature.properties.bina_id;
            if (!binaId || !feature.geometry) return;
            
            try {
                let coords = feature.geometry.coordinates;
                if (feature.geometry.type === 'MultiPolygon') {
                    coords = coords[0][0];
                } else if (feature.geometry.type === 'Polygon') {
                    coords = coords[0];
                }
                
                if (coords && coords.length > 0) {
                    let sumLng = 0, sumLat = 0;
                    coords.forEach(c => {
                        sumLng += c[0];
                        sumLat += c[1];
                    });
                    binaKoordinatlari.set(binaId, {
                        lng: sumLng / coords.length,
                        lat: sumLat / coords.length
                    });
                }
            } catch (e) {}
        });
        
        console.log(`   ✓ ${binaKoordinatlari.size} bina koordinatı yüklendi`);
        
        // 3. Her mahalle için 6 etap oluştur
        console.log(`\n🔄 Etaplar oluşturuluyor (${ETAP_SAYISI} etap/mahalle)...`);
        
        const [mahalleler] = await conn.query(`
            SELECT DISTINCT mahalle_adi FROM binalar WHERE mahalle_adi IS NOT NULL ORDER BY mahalle_adi
        `);
        
        let toplamEtap = 0;
        
        for (const mahalle of mahalleler) {
            const mahalleAdi = mahalle.mahalle_adi;
            
            // Mahalledeki binaları koordinatlarıyla al
            const [binalar] = await conn.query(
                `SELECT bina_id, risk_puani FROM binalar WHERE mahalle_adi = ?`,
                [mahalleAdi]
            );
            
            // Koordinatları olan binaları filtrele
            const binalarWithCoords = binalar
                .filter(b => binaKoordinatlari.has(b.bina_id))
                .map(b => ({
                    ...b,
                    ...binaKoordinatlari.get(b.bina_id)
                }));
            
            if (binalarWithCoords.length < ETAP_SAYISI) continue;
            
            console.log(`   📍 ${mahalleAdi}: ${binalarWithCoords.length} bina → ${ETAP_SAYISI} etap`);
            
            // K-Means benzeri kümeleme ile 6 etap oluştur
            const etaplar = kMeansCluster(binalarWithCoords, ETAP_SAYISI);
            
            // Her etabı kaydet
            for (let i = 0; i < etaplar.length; i++) {
                const etapBinalari = etaplar[i];
                if (etapBinalari.length === 0) continue;
                
                const etapNo = i + 1;
                const etapAdi = `${mahalleAdi.replace(' Mahallesi', '')} - Etap ${etapNo}`;
                
                // Etap merkezi
                const centerLat = etapBinalari.reduce((sum, b) => sum + b.lat, 0) / etapBinalari.length;
                const centerLng = etapBinalari.reduce((sum, b) => sum + b.lng, 0) / etapBinalari.length;
                
                // Etap sınırı (convex hull)
                let boundaryGeojson = null;
                try {
                    const points = etapBinalari.map(b => turf.point([b.lng, b.lat]));
                    const fc = turf.featureCollection(points);
                    
                    // Önce convex hull dene
                    let hull = turf.convex(fc);
                    
                    // Buffer ekle (daha güzel görünmesi için)
                    if (hull) {
                        hull = turf.buffer(hull, 0.02, { units: 'kilometers' });
                        boundaryGeojson = JSON.stringify(hull.geometry);
                    }
                } catch (e) {}
                
                // Etabı kaydet
                const [result] = await conn.query(
                    `INSERT INTO etaplar (etap_no, etap_adi, mahalle_adi, bina_sayisi, center_lat, center_lng, boundary_geojson) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [etapNo, etapAdi, mahalleAdi, etapBinalari.length, centerLat, centerLng, boundaryGeojson]
                );
                
                const etapId = result.insertId;
                
                // Binaları etaba ata
                const binaIds = etapBinalari.map(b => b.bina_id);
                if (binaIds.length > 0) {
                    await conn.query(
                        `UPDATE binalar SET etap_id = ?, etap_adi = ? WHERE bina_id IN (?)`,
                        [etapId, etapAdi, binaIds]
                    );
                }
                
                toplamEtap++;
            }
            
            // Etap istatistiklerini güncelle
            await conn.query(`
                UPDATE etaplar e SET 
                    toplam_risk_puani = (SELECT COALESCE(SUM(risk_puani), 0) FROM binalar WHERE etap_id = e.id),
                    ortalama_risk = (SELECT COALESCE(AVG(risk_puani), 0) FROM binalar WHERE etap_id = e.id),
                    bina_sayisi = (SELECT COUNT(*) FROM binalar WHERE etap_id = e.id)
                WHERE mahalle_adi = ?
            `, [mahalleAdi]);
        }
        
        // 4. Öncelik sıralaması
        console.log('\n📊 Öncelik sıralaması yapılıyor...');
        await conn.query('SET @rank = 0');
        await conn.query(`
            UPDATE etaplar 
            SET oncelik_sirasi = (@rank := @rank + 1)
            ORDER BY ortalama_risk DESC
        `);
        
        // İstatistikler
        const [stats] = await conn.query(`
            SELECT 
                COUNT(*) as toplam_etap,
                SUM(bina_sayisi) as toplam_bina,
                ROUND(AVG(bina_sayisi), 1) as ort_bina,
                MIN(bina_sayisi) as min_bina,
                MAX(bina_sayisi) as max_bina
            FROM etaplar
        `);
        
        const [mahalleStats] = await conn.query(`
            SELECT COUNT(DISTINCT mahalle_adi) as mahalle_sayisi FROM etaplar
        `);
        
        console.log('\n✅ Etap oluşturma tamamlandı!');
        console.log('\n📈 İstatistikler:');
        console.log(`   • Toplam Mahalle: ${mahalleStats[0].mahalle_sayisi}`);
        console.log(`   • Toplam Etap: ${stats[0].toplam_etap}`);
        console.log(`   • Toplam Bina: ${stats[0].toplam_bina}`);
        console.log(`   • Ortalama Bina/Etap: ${stats[0].ort_bina}`);
        console.log(`   • Min-Max Bina: ${stats[0].min_bina} - ${stats[0].max_bina}`);
        
    } catch (error) {
        console.error('❌ Hata:', error.message);
        console.error(error.stack);
    } finally {
        await conn.end();
        console.log('\n🔌 Veritabanı bağlantısı kapatıldı.');
    }
}

/**
 * K-Means benzeri kümeleme algoritması
 */
function kMeansCluster(binalar, k) {
    if (binalar.length <= k) {
        return binalar.map(b => [b]);
    }
    
    // İlk merkezleri eşit aralıklı seç
    const sortedByLat = [...binalar].sort((a, b) => a.lat - b.lat);
    const centers = [];
    const step = Math.floor(binalar.length / k);
    
    for (let i = 0; i < k; i++) {
        const idx = Math.min(i * step + Math.floor(step / 2), binalar.length - 1);
        centers.push({
            lat: sortedByLat[idx].lat,
            lng: sortedByLat[idx].lng
        });
    }
    
    // İterasyon
    let clusters = new Array(k).fill(null).map(() => []);
    
    for (let iter = 0; iter < 10; iter++) {
        // Kümeleri sıfırla
        clusters = new Array(k).fill(null).map(() => []);
        
        // Her binayı en yakın merkeze ata
        for (const bina of binalar) {
            let minDist = Infinity;
            let minIdx = 0;
            
            for (let i = 0; i < k; i++) {
                const dist = haversineDistance(bina.lat, bina.lng, centers[i].lat, centers[i].lng);
                if (dist < minDist) {
                    minDist = dist;
                    minIdx = i;
                }
            }
            
            clusters[minIdx].push(bina);
        }
        
        // Merkezleri güncelle
        for (let i = 0; i < k; i++) {
            if (clusters[i].length > 0) {
                centers[i].lat = clusters[i].reduce((sum, b) => sum + b.lat, 0) / clusters[i].length;
                centers[i].lng = clusters[i].reduce((sum, b) => sum + b.lng, 0) / clusters[i].length;
            }
        }
    }
    
    // Boş kümeleri doldur (en büyük kümeden böl)
    for (let i = 0; i < k; i++) {
        if (clusters[i].length === 0) {
            // En büyük kümeyi bul
            let maxIdx = 0;
            let maxLen = 0;
            for (let j = 0; j < k; j++) {
                if (clusters[j].length > maxLen) {
                    maxLen = clusters[j].length;
                    maxIdx = j;
                }
            }
            
            // Yarısını aktar
            const half = Math.floor(clusters[maxIdx].length / 2);
            clusters[i] = clusters[maxIdx].splice(half);
        }
    }
    
    return clusters;
}

function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

createEtaplar();
