const express = require('express');
const router = express.Router();
const geojsonService = require('../services/geojsonService');

router.get('/', (req, res) => {
    const binaGeojsonData = geojsonService.getBinaGeojson();
    if (!binaGeojsonData) {
        return res.status(500).json({ error: 'Bina GeoJSON verisi yüklenemedi' });
    }
    res.json(binaGeojsonData);
});

module.exports = router;



