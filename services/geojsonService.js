const fs = require('fs');
const path = require('path');

// GeoJSON dosyalarını yükle
let binaGeojsonData = null;
let mahalleGeojsonData = null;

// Bina geometrileri (birlesik_binalar.geojson)
const binaGeojsonPath = path.join(__dirname, '..', 'birlesik_binalar.geojson');
try {
    const rawData = fs.readFileSync(binaGeojsonPath, 'utf8');
    binaGeojsonData = JSON.parse(rawData);
    console.log(`✓ Bina GeoJSON yüklendi: ${binaGeojsonData.features.length} bina`);
} catch (err) {
    console.error('Bina GeoJSON dosyası yüklenemedi:', err.message);
}

// Mahalle sınırları (bayrakli.geojson)
const mahalleGeojsonPath = path.join(__dirname, '..', 'bayrakli.geojson');
try {
    const rawData = fs.readFileSync(mahalleGeojsonPath, 'utf8');
    const tempData = JSON.parse(rawData);
    
    // Sadece Polygon ve MultiPolygon geometrilerini al
    mahalleGeojsonData = {
        type: 'FeatureCollection',
        features: tempData.features.filter(f => 
            f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
        )
    };
    
    console.log(`✓ Mahalle GeoJSON yüklendi: ${mahalleGeojsonData.features.length} mahalle sınırı`);
} catch (err) {
    console.error('Mahalle GeoJSON dosyası yüklenemedi:', err.message);
}

module.exports = {
    getBinaGeojson: () => binaGeojsonData,
    getMahalleGeojson: () => mahalleGeojsonData
};



