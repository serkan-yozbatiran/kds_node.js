// Bayraklı KDS - Karar Destek Sistemi
// Dashboard + KDS Modülleri

// ========== GLOBAL DEĞİŞKENLER ==========
let map, mahallelerLayer, binalarLayer, etaplarLayer, darkOverlay = null;
let currentMahalle = null, currentEtap = null, allMahalleler = [], mahalleSinirlari = null, globalStats = null;
let charts = {};

// Etap renkleri
const ETAP_COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
    '#06b6d4', '#f43f5e', '#84cc16', '#ec4899', '#14b8a6'
];

const BAYRAKLI_CENTER = [38.4580, 27.1670];
const INITIAL_ZOOM = 13;

const COLORS = {
    mahalleFill: '#1e40af', mahalleStroke: '#3b82f6',
    mahalleHover: '#06b6d4', mahalleHoverFill: '#0e7490',
    riskDusuk: '#22c55e', riskOrta: '#eab308', riskYuksek: '#ef4444', riskCokYuksek: '#991b1b'
};

function getBuildingColor(risk) {
    return { 'Düşük': COLORS.riskDusuk, 'Orta': COLORS.riskOrta, 'Yüksek': COLORS.riskYuksek, 'Çok Yüksek': COLORS.riskCokYuksek }[risk] || COLORS.riskDusuk;
}

// ========== SAYFA BAŞLATMA ==========
function setupPage() {
    // Tek sayfa - scroll animasyonu için
    setTimeout(() => map.invalidateSize(), 100);
}

// ========== HARİTA ==========
function initMap() {
    map = L.map('map', { center: BAYRAKLI_CENTER, zoom: INITIAL_ZOOM, zoomControl: false, attributionControl: false });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(map);
    mahallelerLayer = L.layerGroup().addTo(map);
    etaplarLayer = L.layerGroup().addTo(map);
    binalarLayer = L.layerGroup().addTo(map);
    setupMapControls();
}

function setupMapControls() {
    document.getElementById('zoomIn').addEventListener('click', () => map.zoomIn());
    document.getElementById('zoomOut').addEventListener('click', () => map.zoomOut());
    document.getElementById('resetView').addEventListener('click', () => resetToMahalleler());
    document.getElementById('backBtnMap').addEventListener('click', handleBackNavigation);
}

// Geri navigasyon fonksiyonu
function handleBackNavigation() {
    // Eğer etap seçiliyse, etaplara dön
    if (currentEtap) {
        resetEtapSelection();
    }
    // Eğer sadece mahalle seçiliyse, ilçe haritasına dön
    else if (currentMahalle) {
        resetToMahalleler();
    }
}

// Geri tuşunun görünürlüğünü güncelle
function updateBackButtonVisibility() {
    const backBtnMap = document.getElementById('backBtnMap');
    if (backBtnMap) {
        // Eğer etap veya mahalle seçiliyse göster
        if (currentEtap || currentMahalle) {
            backBtnMap.style.display = 'block';
        } else {
            backBtnMap.style.display = 'none';
        }
    }
}

// ========== VERİ YÜKLEME ==========
async function loadStatistics() {
    try {
        const response = await fetch('/api/istatistikler');
        const data = await response.json();
        globalStats = data;

        document.getElementById('totalBina').textContent = data.toplam_bina.toLocaleString('tr-TR');
        document.getElementById('totalMahalle').textContent = data.toplam_mahalle;

        // İstatistiklerden mahalle listesini al (eski format için)
        const mahalleStats = data.mahalleler || [];
        allMahalleler = mahalleStats.map(m => ({
            mahalle_adi: m.ad || m.mahalle_adi,
            ortalama_risk: parseFloat(m.ortalama_risk) || 0,
            yuksek_risk: parseInt(m.yuksek_risk) || 0,
            dusuk_risk: parseInt(m.dusuk_risk) || 0,
            orta_risk: parseInt(m.orta_risk) || 0,
            cok_yuksek_risk: parseInt(m.cok_yuksek_risk) || 0
        }));

        // Yüksek riskli toplam
        const totalRiskli = allMahalleler.reduce((sum, m) => sum + (m.yuksek_risk || 0) + (m.cok_yuksek_risk || 0), 0);
        document.getElementById('totalRiskli').textContent = totalRiskli.toLocaleString('tr-TR');
        
    } catch (error) {
        console.error('Veri yüklenemedi:', error);
    }
}


// ========== MAHALLE SINIRLARİ ==========
async function loadMahalleSinirlari() {
    try {
        const response = await fetch('/api/mahalle-sinirlari');
        mahalleSinirlari = await response.json();
        mahallelerLayer.clearLayers();
        binalarLayer.clearLayers();

        L.geoJSON(mahalleSinirlari, {
            style: () => ({ fillColor: COLORS.mahalleFill, fillOpacity: 0.6, color: COLORS.mahalleStroke, weight: 2 }),
            onEachFeature: (feature, layer) => {
                const props = feature.properties;
                layer.on('mouseover', function() {
                    if (currentMahalle) return;
                    this.setStyle({ fillColor: COLORS.mahalleHoverFill, fillOpacity: 0.8, color: '#fff', weight: 3 });
                    this.bringToFront();
                    showMahalleName(props.name);
                    showInfoPanel(props);
                });
                layer.on('mouseout', function() {
                    if (currentMahalle) return;
                    this.setStyle({ fillColor: COLORS.mahalleFill, fillOpacity: 0.6, color: COLORS.mahalleStroke, weight: 2 });
                    hideMahalleName();
                    hideInfoPanel();
                });
                layer.on('click', () => selectMahalle(props.name));
            }
        }).addTo(mahallelerLayer);

        const bounds = L.geoJSON(mahalleSinirlari).getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [15, 15] });
        updateBackButtonVisibility();
    } catch (error) {
        console.error('Sınırlar yüklenemedi:', error);
    }
}

// ========== MAHALLE SEÇİMİ ==========
async function selectMahalle(mahalleAd) {
    currentMahalle = mahalleAd;
    currentEtap = null;
    showMahalleName(mahalleAd);
    updateBackButtonVisibility();
    await loadFinancialSummary();
    await loadModelDecision();
    await loadLegalRisk();
    await loadConstructionSchedule();
    await loadSocialProfile();
    await loadInfrastructureImpact();

    // Sidebar kaldırıldı, bu elementler artık yok - optional chaining ile güvenli hale getir
    document.querySelectorAll('.mahalle-item').forEach(item => {
        item.classList.toggle('active', item.dataset.mahalle === mahalleAd);
    });

    const backBtn = document.getElementById('backBtn');
    if (backBtn) backBtn.classList.add('visible');
    const legend = document.getElementById('legend');
    if (legend) legend.classList.add('visible');
    hideInfoPanel();

    if (darkOverlay) map.removeLayer(darkOverlay);
    darkOverlay = L.rectangle([[-90, -180], [90, 180]], { fillColor: '#000', fillOpacity: 0.7, color: 'transparent', interactive: false }).addTo(map);
    darkOverlay.bringToBack();

    mahallelerLayer.clearLayers();
    etaplarLayer.clearLayers();
    binalarLayer.clearLayers();

    // Mahalle sınırını çiz
    const mahalleFeature = mahalleSinirlari?.features?.find(f => f.properties.name === mahalleAd);
    if (mahalleFeature) {
        L.geoJSON(mahalleFeature, {
            style: { fillColor: COLORS.mahalleFill, fillOpacity: 0.8, color: '#fff', weight: 3 }
        }).addTo(mahallelerLayer);
        map.fitBounds(L.geoJSON(mahalleFeature).getBounds(), { padding: [50, 50] });
    }

    // Etap verilerini çek
    try {
        const etapResponse = await fetch(`/api/mahalle/${encodeURIComponent(mahalleAd)}/etaplar`);
        const etapData = await etapResponse.json();
        
        if (etapData.etaplar && etapData.etaplar.length > 0) {
            // Etap verileri var, etapları göster
            const etapColors = {};
            etapData.etaplar.forEach((etap, idx) => {
                etapColors[etap.etap_adi] = ETAP_COLORS[idx % ETAP_COLORS.length];
            });

            // Binaları etap bazlı göster
            etapData.etaplar.forEach(etap => {
                // binalar bir obje olabilir (etap adına göre gruplanmış) veya array olabilir
                let etapBinalar = [];
                if (Array.isArray(etapData.binalar)) {
                    etapBinalar = etapData.binalar.filter(b => b.etap_adi === etap.etap_adi || (b.properties && b.properties.etap_adi === etap.etap_adi));
                } else if (etapData.binalar && typeof etapData.binalar === 'object') {
                    // Obje formatında ise etap adına göre eriş
                    etapBinalar = etapData.binalar[etap.etap_adi] || [];
                }
                
                if (etapBinalar && etapBinalar.length > 0) {
                    const geoLayer = L.geoJSON(etapBinalar, {
                        style: f => ({
                            color: etapColors[etap.etap_adi],
                            weight: currentEtap === etap.etap_adi ? 2 : 1,
                            fillColor: etapColors[etap.etap_adi],
                            fillOpacity: currentEtap === etap.etap_adi ? 0.8 : 0.6
                        }),
                        onEachFeature: (f, layer) => {
                            const bina = f.properties;
                            layer.options.binaData = { ...bina, etap_adi: etap.etap_adi };
                            
                            layer.on('mouseover', function() { 
                                if (currentEtap && currentEtap !== etap.etap_adi) return;
                                this.setStyle({ weight: 3, fillOpacity: 0.95, color: '#fff' }); 
                                this.bringToFront();
                                if (!currentEtap) {
                                    showEtapInfo(etapData.etaplar.find(e => e.etap_adi === etap.etap_adi) || { etap_adi: etap.etap_adi });
                                }
                            });
                            layer.on('mouseout', function() { 
                                if (currentEtap && currentEtap !== etap.etap_adi) return;
                                const color = currentEtap ? this.options.riskColor : this.options.etapColor;
                                this.setStyle({ weight: 1, fillOpacity: currentEtap ? 0.8 : 0.7, color: color }); 
                            });
                            layer.on('click', function() {
                                if (!currentEtap) {
                                    // Etap seçilmemişse, etabı seç
                                    selectEtap(mahalleAd, etap.etap_adi, etapData);
                                } else if (currentEtap === etap.etap_adi) {
                                    // Kendi etabındaysa bina detayını göster
                                    showBuildingDetails(this.options.binaData);
                                }
                            });
                        }
                    });
                    
                    geoLayer.options.etapAdi = etap.etap_adi;
                    geoLayer.addTo(binalarLayer);
                }
            });
            
            // Legend'ı göster
            document.getElementById('legend').classList.add('visible');
        } else {
            // Etap yoksa normal binaları göster
            const response = await fetch(`/api/mahalle/${encodeURIComponent(mahalleAd)}/binalar`);
            const data = await response.json();

            L.geoJSON(data, {
                style: f => ({ 
                    color: getBuildingColor(f.properties.risk_kategorisi), 
                    weight: 1.5, 
                    fillColor: getBuildingColor(f.properties.risk_kategorisi), 
                    fillOpacity: 0.7 
                }),
                onEachFeature: (f, layer) => {
                    const p = f.properties;
                    layer.on('mouseover', function() { this.setStyle({ weight: 3, fillOpacity: 0.95, color: '#fff' }); this.bringToFront(); });
                    layer.on('mouseout', function() { this.setStyle({ weight: 1.5, fillOpacity: 0.7, color: getBuildingColor(p.risk_kategorisi) }); });
                    layer.on('click', () => showBuildingDetails(p));
                }
            }).addTo(binalarLayer);
        }

        // binalarLayer'ın var olduğundan ve geçerli bir Leaflet layer olduğundan emin ol
        if (binalarLayer && typeof binalarLayer.bringToFront === 'function') {
            binalarLayer.bringToFront();
        }
    } catch (error) {
        console.error('Veriler yüklenemedi:', error);
    }
}

// ========== ETAP BİLGİSİ ==========
function showEtapInfo(props) {
    const infoPanel = document.getElementById('infoPanel');
    document.getElementById('infoPanelTitle').textContent = props.etap_adi || '-';
    document.getElementById('infoBinaSayisi').textContent = (props.bina_sayisi || 0).toLocaleString('tr-TR');
    document.getElementById('infoOrtalamaRisk').textContent = parseFloat(props.ortalama_risk || 0).toFixed(1);
    infoPanel.classList.add('visible');
}

function resetEtapSelection() {
    if (!currentEtap) return;
    
    currentEtap = null;
    showMahalleName(currentMahalle);
    updateBackButtonVisibility();
    loadFinancialSummary();
    
    // Legend'ı etaplara geri çevir
    document.getElementById('legendTitle').textContent = 'Etaplar';
    document.getElementById('legendContent').innerHTML = `
        <div class="legend-item"><div class="legend-color" style="background:#3b82f6"></div>Etap 1</div>
        <div class="legend-item"><div class="legend-color" style="background:#10b981"></div>Etap 2</div>
        <div class="legend-item"><div class="legend-color" style="background:#f59e0b"></div>Etap 3</div>
        <div class="legend-item"><div class="legend-color" style="background:#ef4444"></div>Etap 4</div>
        <div class="legend-item"><div class="legend-color" style="background:#8b5cf6"></div>Etap 5</div>
        <div class="legend-item"><div class="legend-color" style="background:#06b6d4"></div>Etap 6</div>
    `;
    
    // Binaları normale döndür (etap rengine geri dön)
    binalarLayer.eachLayer(geoLayer => {
        if (geoLayer.eachLayer) {
            geoLayer.eachLayer(layer => {
                const etapColor = layer.options?.etapColor;
                if (etapColor) {
                    layer.setStyle({ 
                        fillOpacity: 0.7, 
                        opacity: 1,
                        weight: 1,
                        fillColor: etapColor,
                        color: etapColor
                    });
                }
            });
        } else {
            const etapColor = geoLayer.options?.etapColor;
            if (etapColor) {
                geoLayer.setStyle({ 
                    fillOpacity: 0.7, 
                    opacity: 1,
                    weight: 1,
                    fillColor: etapColor,
                    color: etapColor
                });
            }
        }
    });
    
    hideInfoPanel();
}

function resetEtapSelection() {
    if (!currentEtap) return;
    
    currentEtap = null;
    showMahalleName(currentMahalle);
    updateBackButtonVisibility();
    loadFinancialSummary();
    
    // Legend'ı etaplara geri çevir
    document.getElementById('legendTitle').textContent = 'Etaplar';
    document.getElementById('legendContent').innerHTML = `
        <div class="legend-item"><div class="legend-color" style="background:#3b82f6"></div>Etap 1</div>
        <div class="legend-item"><div class="legend-color" style="background:#10b981"></div>Etap 2</div>
        <div class="legend-item"><div class="legend-color" style="background:#f59e0b"></div>Etap 3</div>
        <div class="legend-item"><div class="legend-color" style="background:#ef4444"></div>Etap 4</div>
        <div class="legend-item"><div class="legend-color" style="background:#8b5cf6"></div>Etap 5</div>
        <div class="legend-item"><div class="legend-color" style="background:#06b6d4"></div>Etap 6</div>
    `;
    
    // Binaları tekrar yükle (etap renkleriyle)
    if (currentMahalle) {
        selectMahalle(currentMahalle);
    }
}

async function selectEtap(mahalleAd, etapAdi, etapData) {
    currentEtap = etapAdi;
    showMahalleName(`${mahalleAd} - ${etapAdi}`);
    updateBackButtonVisibility();
    await loadFinancialSummary();
    await loadModelDecision();
    await loadLegalRisk();
    await loadConstructionSchedule();
    await loadSocialProfile();
    await loadInfrastructureImpact();

    // Legend'ı risk renklerine çevir
    document.getElementById('legendTitle').textContent = 'Risk Durumu';
    document.getElementById('legendContent').innerHTML = `
        <div class="legend-item"><div class="legend-color" style="background:#22c55e"></div>Düşük</div>
        <div class="legend-item"><div class="legend-color" style="background:#eab308"></div>Orta</div>
        <div class="legend-item"><div class="legend-color" style="background:#ef4444"></div>Yüksek</div>
        <div class="legend-item"><div class="legend-color" style="background:#991b1b"></div>Çok Yüksek</div>
    `;

    // Binaları güncelle - seçili etap RİSK RENGİNE dönüşsün
    binalarLayer.eachLayer(geoLayer => {
        // GeoJSON layer içindeki her bir feature layer'a eriş
        if (geoLayer.eachLayer) {
            geoLayer.eachLayer(layer => {
                const binaEtap = layer.options?.etapAdi;
                const riskColor = layer.options?.riskColor;
                
                if (binaEtap === etapAdi && riskColor) {
                    // SEÇİLİ ETABIN BİNALARI - Risk rengine dönüş
                    layer.setStyle({ 
                        fillOpacity: 0.85, 
                        opacity: 1,
                        weight: 1.5,
                        fillColor: riskColor,
                        color: riskColor
                    });
                    layer.bringToFront();
                } else if (binaEtap) {
                    // DİĞER BİNALAR - Çok soluk
                    layer.setStyle({ 
                        fillOpacity: 0.1, 
                        opacity: 0.2,
                        weight: 0.3
                    });
                }
            });
        } else {
            // Tek layer ise
            const binaEtap = geoLayer.options?.etapAdi;
            const riskColor = geoLayer.options?.riskColor;
            
            if (binaEtap === etapAdi && riskColor) {
                geoLayer.setStyle({ 
                    fillOpacity: 0.85, 
                    opacity: 1,
                    weight: 1.5,
                    fillColor: riskColor,
                    color: riskColor
                });
                geoLayer.bringToFront();
            } else if (binaEtap) {
                geoLayer.setStyle({ 
                    fillOpacity: 0.1, 
                    opacity: 0.2,
                    weight: 0.3
                });
            }
        }
    });

    // Etap bilgisini göster
    const etapInfo = etapData.etaplar?.find(e => e.etap_adi === etapAdi);
    if (etapInfo) {
        showEtapInfo(etapInfo);
    }
}

// ========== BİNA DETAYLARI ==========
function showBuildingDetails(p) {
    document.getElementById('buildingTitle').textContent = `Bina #${p.bina_id}`;
    const etapInfo = p.etap_adi ? ` | ${p.etap_adi}` : '';
    document.getElementById('buildingType').textContent = `${p.yapi_turu || '-'} - ${p.mahalle_adi || ''}${etapInfo}`;
    const emoji = { 'Düşük': '🟢', 'Orta': '🟡', 'Yüksek': '🔴', 'Çok Yüksek': '⛔' }[p.risk_kategorisi] || '🟢';
    
    const details = [
        ['ID', p.bina_id], 
        ['Mahalle', p.mahalle_adi || '-'], 
        ['Etap', p.etap_adi || '-'],
        ['Risk', `${emoji} ${p.risk_kategorisi}`],
        ['Puan', p.risk_puani || 0], 
        ['Yapı', p.yapi_turu || '-'], 
        ['Kat', p.kat_sayisi || '-'],
        ['Yaş', p.bina_yasi ? `${p.bina_yasi} yıl` : '-']
    ];
    
    document.getElementById('buildingDetails').innerHTML = details
        .map(([l, v]) => `<div class="detail-item"><div class="detail-label">${l}</div><div class="detail-value">${v}</div></div>`)
        .join('');
    document.getElementById('buildingPanel').classList.add('visible');
}

function closeBuildingPanel() { document.getElementById('buildingPanel').classList.remove('visible'); }

function resetToMahalleler() {
    currentMahalle = null;
    currentEtap = null;
    hideMahalleName();
    updateBackButtonVisibility();
    loadFinancialSummary();
    loadModelDecision();
    loadLegalRisk();
    loadConstructionSchedule();
    loadSocialProfile();
    loadInfrastructureImpact();
    document.querySelectorAll('.mahalle-item').forEach(i => i.classList.remove('active'));
    const backBtn = document.getElementById('backBtn');
    if (backBtn) backBtn.classList.remove('visible');
    const legend = document.getElementById('legend');
    if (legend) legend.classList.remove('visible');
    hideInfoPanel();

    if (darkOverlay) map.removeLayer(darkOverlay);
    mahallelerLayer.clearLayers();
    etaplarLayer.clearLayers();
    binalarLayer.clearLayers();

    loadMahalleSinirlari();
}

// ========== MAHALLE SINIRLARİ ==========
async function loadMahalleSinirlari() {
    try {
        const response = await fetch('/api/mahalle-sinirlari');
        mahalleSinirlari = await response.json();
        mahallelerLayer.clearLayers();
        binalarLayer.clearLayers();

        L.geoJSON(mahalleSinirlari, {
            style: () => ({ fillColor: COLORS.mahalleFill, fillOpacity: 0.6, color: COLORS.mahalleStroke, weight: 2 }),
            onEachFeature: (feature, layer) => {
                const props = feature.properties;
                layer.on('mouseover', function() {
                    if (currentMahalle) return;
                    this.setStyle({ fillColor: COLORS.mahalleHoverFill, fillOpacity: 0.8, color: '#fff', weight: 3 });
                    this.bringToFront();
                    showMahalleName(props.name);
                    showInfoPanel(props);
                });
                layer.on('mouseout', function() {
                    if (currentMahalle) return;
                    this.setStyle({ fillColor: COLORS.mahalleFill, fillOpacity: 0.6, color: COLORS.mahalleStroke, weight: 2 });
                    hideMahalleName();
                    hideInfoPanel();
                });
                layer.on('click', () => selectMahalle(props.name));
            }
        }).addTo(mahallelerLayer);

        const bounds = L.geoJSON(mahalleSinirlari).getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [15, 15] });
        updateBackButtonVisibility();
    } catch (error) {
        console.error('Sınırlar yüklenemedi:', error);
    }
}

function showMahalleName(name) {
    const el = document.getElementById('mahalleNameOverlay');
    el.textContent = name;
    el.classList.add('visible');
}

function hideMahalleName() {
    document.getElementById('mahalleNameOverlay').classList.remove('visible');
}

function showInfoPanel(props) {
    document.getElementById('infoPanelTitle').textContent = props.name || '-';
    document.getElementById('infoBinaSayisi').textContent = (props.bina_sayisi || 0).toLocaleString('tr-TR');
    const risk = parseFloat(props.ortalama_risk) || 0;
    document.getElementById('infoOrtalamaRisk').textContent = risk.toFixed(1);
    document.getElementById('infoPanel').classList.add('visible');
}

function hideInfoPanel() {
    document.getElementById('infoPanel').classList.remove('visible');
}

// ========== MAHALLE SEÇİMİ ==========
async function selectMahalle(mahalleAd) {
    currentMahalle = mahalleAd;
    currentEtap = null;
    showMahalleName(mahalleAd);
    updateBackButtonVisibility();
    await loadFinancialSummary();
    await loadModelDecision();
    await loadLegalRisk();
    await loadConstructionSchedule();
    await loadSocialProfile();
    await loadInfrastructureImpact();

    // Sidebar kaldırıldı, bu elementler artık yok - optional chaining ile güvenli hale getir
    document.querySelectorAll('.mahalle-item').forEach(item => {
        item.classList.toggle('active', item.dataset.mahalle === mahalleAd);
    });

    const backBtn = document.getElementById('backBtn');
    if (backBtn) backBtn.classList.add('visible');
    const legend = document.getElementById('legend');
    if (legend) legend.classList.add('visible');
    hideInfoPanel();

    if (darkOverlay) map.removeLayer(darkOverlay);
    darkOverlay = L.rectangle([[-90, -180], [90, 180]], { fillColor: '#000', fillOpacity: 0.7, color: 'transparent', interactive: false }).addTo(map);
    darkOverlay.bringToBack();

    mahallelerLayer.clearLayers();
    etaplarLayer.clearLayers();
    binalarLayer.clearLayers();

    // Mahalle sınırını çiz
    if (mahalleSinirlari) {
        const selected = mahalleSinirlari.features.find(f => f.properties.name === mahalleAd);
        if (selected) {
            L.geoJSON(selected, { 
                style: { fillOpacity: 0, color: '#fff', weight: 3 },
                onEachFeature: (f, layer) => {
                    // Mahalle sınırına tıklanınca etap seçimini sıfırla
                    layer.on('click', () => resetEtapSelection());
                }
            }).addTo(mahallelerLayer);
            const bounds = L.geoJSON(selected).getBounds();
            if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
        }
    }

    try {
        // Etap verilerini çek
        const etapResponse = await fetch(`/api/mahalle/${encodeURIComponent(mahalleAd)}/etaplar`);
        const etapData = await etapResponse.json();

        // Etap verilerini global'e kaydet
        window.currentEtapData = etapData;

        // Etap sınırları ve binaları varsa
        if (etapData.etap_sinirlari && etapData.etap_sinirlari.features.length > 0) {
            
            // Etap sınırlarını görünmez olarak ekle (sadece tıklama için)
            L.geoJSON(etapData.etap_sinirlari, {
                style: (feature) => ({
                    fillColor: 'transparent',
                    fillOpacity: 0,
                    color: 'transparent',
                    weight: 0
                }),
                onEachFeature: (feature, layer) => {
                    const props = feature.properties;
                    
                    layer.on('click', () => selectEtap(mahalleAd, props.etap_adi, etapData));
                }
            }).addTo(etaplarLayer);

            // Binaları ETAP RENGİNE GÖRE renklendir
            Object.keys(etapData.binalar).forEach((etapAdi, index) => {
                const binalar = etapData.binalar[etapAdi];
                const etapColor = ETAP_COLORS[index % ETAP_COLORS.length];
                
                binalar.forEach(bina => {
                    if (bina.geometry) {
                        const riskColor = getBuildingColor(bina.properties.risk_kategorisi);
                        
                        const geoLayer = L.geoJSON(bina, {
                            style: {
                                fillColor: etapColor,      // Başlangıçta etap rengi
                                fillOpacity: 0.7,
                                color: etapColor,
                                weight: 1
                            },
                            onEachFeature: (f, layer) => {
                                layer.options.etapAdi = etapAdi;
                                layer.options.etapColor = etapColor;
                                layer.options.riskColor = riskColor;
                                layer.options.binaData = { ...bina.properties, etap_adi: etapAdi };
                                
                                layer.on('mouseover', function() { 
                                    if (currentEtap && currentEtap !== etapAdi) return;
                                    this.setStyle({ weight: 3, fillOpacity: 0.95, color: '#fff' }); 
                                    this.bringToFront();
                                    if (!currentEtap) {
                                        showEtapInfo(etapData.etaplar.find(e => e.etap_adi === etapAdi) || { etap_adi: etapAdi });
                                    }
                                });
                                layer.on('mouseout', function() { 
                                    if (currentEtap && currentEtap !== etapAdi) return;
                                    const color = currentEtap ? this.options.riskColor : this.options.etapColor;
                                    this.setStyle({ weight: 1, fillOpacity: currentEtap ? 0.8 : 0.7, color: color }); 
                                });
                                layer.on('click', function() {
                                    if (!currentEtap) {
                                        // Etap seçilmemişse, etabı seç
                                        selectEtap(mahalleAd, etapAdi, etapData);
                                    } else if (currentEtap === etapAdi) {
                                        // Kendi etabındaysa bina detayını göster
                                        showBuildingDetails(this.options.binaData);
                                    }
                                });
                            }
                        });
                        
                        geoLayer.options.etapAdi = etapAdi;
                        geoLayer.addTo(binalarLayer);
                    }
                });
            });
            
            // Legend'ı göster
            document.getElementById('legend').classList.add('visible');
        } else {
            // Etap yoksa normal binaları göster
            const response = await fetch(`/api/mahalle/${encodeURIComponent(mahalleAd)}/binalar`);
            const data = await response.json();

            L.geoJSON(data, {
                style: f => ({ 
                    color: getBuildingColor(f.properties.risk_kategorisi), 
                    weight: 1.5, 
                    fillColor: getBuildingColor(f.properties.risk_kategorisi), 
                    fillOpacity: 0.7 
                }),
                onEachFeature: (f, layer) => {
                    const p = f.properties;
                    layer.on('mouseover', function() { this.setStyle({ weight: 3, fillOpacity: 0.95, color: '#fff' }); this.bringToFront(); });
                    layer.on('mouseout', function() { this.setStyle({ weight: 1.5, fillOpacity: 0.7, color: getBuildingColor(p.risk_kategorisi) }); });
                    layer.on('click', () => showBuildingDetails(p));
                }
            }).addTo(binalarLayer);
        }

        // binalarLayer'ın var olduğundan ve geçerli bir Leaflet layer olduğundan emin ol
        if (binalarLayer && typeof binalarLayer.bringToFront === 'function') {
            binalarLayer.bringToFront();
        }
    } catch (error) {
        console.error('Veriler yüklenemedi:', error);
    }
}

// ========== ETAP BİLGİSİ ==========
function showEtapInfo(props) {
    const infoPanel = document.getElementById('infoPanel');
    document.getElementById('infoPanelTitle').textContent = props.etap_adi || '-';
    document.getElementById('infoBinaSayisi').textContent = (props.bina_sayisi || 0).toLocaleString('tr-TR');
    document.getElementById('infoOrtalamaRisk').textContent = parseFloat(props.ortalama_risk || 0).toFixed(1);
    infoPanel.classList.add('visible');
}

// ========== ETAP SEÇİMİNİ SIFIRLA ==========
function resetEtapSelection() {
    if (!currentEtap) return;
    
    currentEtap = null;
    showMahalleName(currentMahalle);
    
    // Legend'ı etaplara geri çevir
    document.getElementById('legendTitle').textContent = 'Etaplar';
    document.getElementById('legendContent').innerHTML = `
        <div class="legend-item"><div class="legend-color" style="background:#3b82f6"></div>Etap 1</div>
        <div class="legend-item"><div class="legend-color" style="background:#10b981"></div>Etap 2</div>
        <div class="legend-item"><div class="legend-color" style="background:#f59e0b"></div>Etap 3</div>
        <div class="legend-item"><div class="legend-color" style="background:#ef4444"></div>Etap 4</div>
        <div class="legend-item"><div class="legend-color" style="background:#8b5cf6"></div>Etap 5</div>
        <div class="legend-item"><div class="legend-color" style="background:#06b6d4"></div>Etap 6</div>
    `;
    
    // Binaları normale döndür (etap rengine geri dön)
    binalarLayer.eachLayer(geoLayer => {
        if (geoLayer.eachLayer) {
            geoLayer.eachLayer(layer => {
                const etapColor = layer.options?.etapColor;
                if (etapColor) {
                    layer.setStyle({ 
                        fillOpacity: 0.7, 
                        opacity: 1,
                        weight: 1,
                        fillColor: etapColor,
                        color: etapColor
                    });
                }
            });
        } else {
            const etapColor = geoLayer.options?.etapColor;
            if (etapColor) {
                geoLayer.setStyle({ 
                    fillOpacity: 0.7, 
                    opacity: 1,
                    weight: 1,
                    fillColor: etapColor,
                    color: etapColor
                });
            }
        }
    });
    
    hideInfoPanel();
}

// ========== ETAP SEÇİMİ ==========
async function selectEtap(mahalleAd, etapAdi, etapData) {
    currentEtap = etapAdi;
    showMahalleName(`${mahalleAd} - ${etapAdi}`);
    updateBackButtonVisibility();
    await loadFinancialSummary();
    await loadModelDecision();
    await loadLegalRisk();
    await loadConstructionSchedule();
    await loadSocialProfile();
    await loadInfrastructureImpact();

    // Legend'ı risk renklerine çevir
    document.getElementById('legendTitle').textContent = 'Risk Durumu';
    document.getElementById('legendContent').innerHTML = `
        <div class="legend-item"><div class="legend-color" style="background:#22c55e"></div>Düşük</div>
        <div class="legend-item"><div class="legend-color" style="background:#eab308"></div>Orta</div>
        <div class="legend-item"><div class="legend-color" style="background:#ef4444"></div>Yüksek</div>
        <div class="legend-item"><div class="legend-color" style="background:#991b1b"></div>Çok Yüksek</div>
    `;

    // Binaları güncelle - seçili etap RİSK RENGİNE dönüşsün
    binalarLayer.eachLayer(geoLayer => {
        // GeoJSON layer içindeki her bir feature layer'a eriş
        if (geoLayer.eachLayer) {
            geoLayer.eachLayer(layer => {
                const binaEtap = layer.options?.etapAdi;
                const riskColor = layer.options?.riskColor;
                
                if (binaEtap === etapAdi && riskColor) {
                    // SEÇİLİ ETABIN BİNALARI - Risk rengine dönüş
                    layer.setStyle({ 
                        fillOpacity: 0.85, 
                        opacity: 1,
                        weight: 1.5,
                        fillColor: riskColor,
                        color: riskColor
                    });
                    layer.bringToFront();
                } else if (binaEtap) {
                    // DİĞER BİNALAR - Çok soluk
                    layer.setStyle({ 
                        fillOpacity: 0.1, 
                        opacity: 0.2,
                        weight: 0.3
                    });
                }
            });
        } else {
            // Tek layer ise
            const binaEtap = geoLayer.options?.etapAdi;
            const riskColor = geoLayer.options?.riskColor;
            
            if (binaEtap === etapAdi && riskColor) {
                geoLayer.setStyle({ 
                    fillOpacity: 0.85, 
                    opacity: 1,
                    weight: 1.5,
                    fillColor: riskColor,
                    color: riskColor
                });
                geoLayer.bringToFront();
            } else if (binaEtap) {
                geoLayer.setStyle({ 
                    fillOpacity: 0.1, 
                    opacity: 0.2,
                    weight: 0.3
                });
            }
        }
    });

    // Etap bilgisini göster
    const etapInfo = etapData.etaplar.find(e => e.etap_adi === etapAdi);
    if (etapInfo) {
        showEtapInfo(etapInfo);
    }
}

function showBuildingDetails(p) {
    document.getElementById('buildingTitle').textContent = `Bina #${p.bina_id}`;
    const etapInfo = p.etap_adi ? ` | ${p.etap_adi}` : '';
    document.getElementById('buildingType').textContent = `${p.yapi_turu || '-'} - ${p.mahalle_adi || ''}${etapInfo}`;
    const emoji = { 'Düşük': '🟢', 'Orta': '🟡', 'Yüksek': '🔴', 'Çok Yüksek': '⛔' }[p.risk_kategorisi] || '🟢';
    
    const details = [
        ['ID', p.bina_id], 
        ['Mahalle', p.mahalle_adi || '-'], 
        ['Etap', p.etap_adi || '-'],
        ['Risk', `${emoji} ${p.risk_kategorisi}`],
        ['Puan', p.risk_puani || 0], 
        ['Yapı', p.yapi_turu || '-'], 
        ['Kat', p.kat_sayisi || '-'],
        ['Yaş', p.bina_yasi ? `${p.bina_yasi} yıl` : '-']
    ];
    
    document.getElementById('buildingDetails').innerHTML = details
        .map(([l, v]) => `<div class="detail-item"><div class="detail-label">${l}</div><div class="detail-value">${v}</div></div>`)
        .join('');
    document.getElementById('buildingPanel').classList.add('visible');
}

function closeBuildingPanel() { document.getElementById('buildingPanel').classList.remove('visible'); }

function resetToMahalleler() {
    currentMahalle = null;
    currentEtap = null;
    hideMahalleName();
    updateBackButtonVisibility();
    loadFinancialSummary();
    loadModelDecision();
    loadLegalRisk();
    loadConstructionSchedule();
    loadSocialProfile();
    loadInfrastructureImpact();
    document.querySelectorAll('.mahalle-item').forEach(i => i.classList.remove('active'));
    const backBtn = document.getElementById('backBtn');
    if (backBtn) backBtn.classList.remove('visible');
    const legend = document.getElementById('legend');
    if (legend) legend.classList.remove('visible');
    closeBuildingPanel();
    hideInfoPanel();
    if (darkOverlay) { map.removeLayer(darkOverlay); darkOverlay = null; }
    etaplarLayer.clearLayers();
    binalarLayer.clearLayers();
    loadMahalleSinirlari();
}

// ========== ESKİ KDS FONKSİYONLARI KALDIRILDI ==========
// Yeni 7 analitik kart sistemi aktif

// ========== YARDIMCI FONKSİYONLAR ==========
function applyFilters() {
    const minRisk = parseInt(document.getElementById('filterRisk')?.value || 0);
    const filterDusuk = document.getElementById('filterDusuk')?.checked ?? true;
    const filterOrta = document.getElementById('filterOrta')?.checked ?? true;
    const filterYuksek = document.getElementById('filterYuksek')?.checked ?? true;
    const filterCokYuksek = document.getElementById('filterCokYuksek')?.checked ?? true;
    
    if (document.getElementById('filterRiskVal')) {
        document.getElementById('filterRiskVal').textContent = minRisk;
    }

    // Risk kategorisine göre filtrele
    const filtered = allMahalleler.filter(m => m.ortalama_risk >= minRisk);
    
    // Her mahalle için kategoriye göre bina sayısını hesapla
    let totalDusuk = 0, totalOrta = 0, totalYuksek = 0, totalCokYuksek = 0;
    
    filtered.forEach(m => {
        if (filterDusuk) totalDusuk += m.dusuk_risk || 0;
        if (filterOrta) totalOrta += m.orta_risk || 0;
        if (filterYuksek) totalYuksek += m.yuksek_risk || 0;
        if (filterCokYuksek) totalCokYuksek += m.cok_yuksek_risk || 0;
    });
    
    const totalBina = totalDusuk + totalOrta + totalYuksek + totalCokYuksek;
    const avgRisk = filtered.length ? (filtered.reduce((sum, m) => sum + m.ortalama_risk, 0) / filtered.length).toFixed(1) : 0;
    
    // En riskli mahalleleri listele
    const topRiskli = [...filtered].sort((a, b) => b.ortalama_risk - a.ortalama_risk).slice(0, 3);

    document.getElementById('filterResults').innerHTML = `
        <div class="results-title">Filtre Sonuçları</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px;">
            <div style="background:var(--bg-card); padding:10px; border-radius:6px; text-align:center;">
                <div style="font-size:18px; font-weight:600; color:var(--accent-cyan)">${filtered.length}</div>
                <div style="font-size:10px; color:var(--text-muted)">Mahalle</div>
            </div>
            <div style="background:var(--bg-card); padding:10px; border-radius:6px; text-align:center;">
                <div style="font-size:18px; font-weight:600; color:var(--accent-emerald)">${totalBina.toLocaleString('tr-TR')}</div>
                <div style="font-size:10px; color:var(--text-muted)">Bina</div>
            </div>
        </div>
        <div style="margin-top:8px; display:grid; grid-template-columns:repeat(4,1fr); gap:4px; font-size:9px;">
            <div style="text-align:center; padding:4px; background:rgba(34,197,94,0.15); border-radius:4px;">
                <div style="color:#22c55e; font-weight:600;">${totalDusuk.toLocaleString('tr-TR')}</div>
                <div style="color:var(--text-muted);">Düşük</div>
            </div>
            <div style="text-align:center; padding:4px; background:rgba(234,179,8,0.15); border-radius:4px;">
                <div style="color:#eab308; font-weight:600;">${totalOrta.toLocaleString('tr-TR')}</div>
                <div style="color:var(--text-muted);">Orta</div>
            </div>
            <div style="text-align:center; padding:4px; background:rgba(239,68,68,0.15); border-radius:4px;">
                <div style="color:#ef4444; font-weight:600;">${totalYuksek.toLocaleString('tr-TR')}</div>
                <div style="color:var(--text-muted);">Yüksek</div>
            </div>
            <div style="text-align:center; padding:4px; background:rgba(153,27,27,0.15); border-radius:4px;">
                <div style="color:#991b1b; font-weight:600;">${totalCokYuksek.toLocaleString('tr-TR')}</div>
                <div style="color:var(--text-muted);">Çok Y.</div>
            </div>
        </div>
        <div style="margin-top:10px; font-size:10px; color:var(--text-secondary); border-top:1px solid var(--border-color); padding-top:8px;">
            <strong>En Riskli:</strong> ${topRiskli.map(m => m.ad.replace(' Mahallesi', '')).join(', ')}
        </div>
    `;
}

function resetFilters() {
    if (document.getElementById('filterRisk')) document.getElementById('filterRisk').value = 0;
    if (document.getElementById('filterRiskVal')) document.getElementById('filterRiskVal').textContent = '0';
    ['filterDusuk', 'filterOrta', 'filterYuksek', 'filterCokYuksek'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = true;
    });
    document.getElementById('filterResults').innerHTML = `
        <div class="results-title">Sonuçlar</div>
        <p style="font-size:11px; color:var(--text-muted);">Filtre uygulayın...</p>
    `;
}

// ========== KDS: ETAP BAZLI SENARYO ==========
async function runEtapScenario() {
    // Elle girilen bütçeyi parse et (nokta ve virgülleri kaldır)
    const budgetInput = document.getElementById('scenarioBudget');
    const budgetStr = budgetInput?.value?.replace(/[.,\s]/g, '') || '100000000';
    const butce = parseInt(budgetStr) || 100000000;
    const sure = parseInt(document.getElementById('scenarioTime')?.value || 36);
    
    try {
        const response = await fetch(`/api/kds/senaryo?butce=${butce}&sure=${sure}`);
        const data = await response.json();
        
        document.getElementById('scenarioEtap').textContent = data.sonuc.tamamlanabilecek_etap.toLocaleString('tr-TR');
        document.getElementById('scenarioBina').textContent = data.sonuc.toplam_bina.toLocaleString('tr-TR');
        document.getElementById('scenarioKalan').textContent = formatNumberReadable(data.sonuc.kalan_butce) + ' TL';
        
        // Etap listesi - Hepsi görünsün
        const listEl = document.getElementById('scenarioEtapList');
        if (listEl && data.etaplar.length > 0) {
            listEl.innerHTML = `
                <div style="color:var(--text-muted); margin-bottom:6px; font-weight:600;">Tamamlanacak ${data.etaplar.length} Etap:</div>
                ${data.etaplar.map((e, i) => `
                    <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--border-color);">
                        <span style="font-size:10px;">${i + 1}. ${e.etap_adi}</span>
                        <span style="color:var(--text-muted); font-size:10px;">${e.bina_sayisi.toLocaleString('tr-TR')} bina</span>
                    </div>
                `).join('')}
            `;
        } else if (listEl) {
            listEl.innerHTML = '<div style="color:var(--text-muted);">Bütçe yetersiz</div>';
        }
        
    } catch (error) {
        console.error('Senaryo analizi hatası:', error);
    }
}

// Sayıyı okunaklı formata çevir (1.234.567 TL gibi)
function formatNumberReadable(num) {
    if (num === null || num === undefined) return '-';
    return Math.round(num).toLocaleString('tr-TR');
}

// Bütçe input formatlaması
function setupBudgetInput() {
    const budgetInput = document.getElementById('scenarioBudget');
    if (!budgetInput) return;
    
    budgetInput.addEventListener('input', function(e) {
        // Sadece rakamları al
        let value = e.target.value.replace(/[^\d]/g, '');
        
        // Boş ise çık
        if (!value) {
            e.target.value = '';
            return;
        }
        
        // Sayıyı formatla (1.000.000 gibi)
        const num = parseInt(value);
        e.target.value = num.toLocaleString('tr-TR');
    });
    
    // İlk değeri formatla
    const initialValue = budgetInput.value.replace(/[^\d]/g, '');
    if (initialValue) {
        budgetInput.value = parseInt(initialValue).toLocaleString('tr-TR');
    }
}

// ========== KDS: MALİYET-FAYDA (Veritabanı Bazlı) ==========
function calculateCostFromDB() {
    if (!globalStats || !allMahalleler.length) return;
    
    const totalBina = globalStats.toplam_bina || 31681;
    
    // Risk kategorisine göre maliyet hesaplama
    const dusukRisk = allMahalleler.reduce((sum, m) => sum + (m.dusuk_risk || 0), 0);
    const ortaRisk = allMahalleler.reduce((sum, m) => sum + (m.orta_risk || 0), 0);
    const yuksekRisk = allMahalleler.reduce((sum, m) => sum + (m.yuksek_risk || 0), 0);
    const cokYuksekRisk = allMahalleler.reduce((sum, m) => sum + (m.cok_yuksek_risk || 0), 0);
    
    // Ortalama bina maliyeti (m2 * kat * birim fiyat)
    // Düşük risk: 500K TL, Orta: 1M TL, Yüksek: 2M TL, Çok Yüksek: 3M TL
    const maliyetDusuk = dusukRisk * 500000;
    const maliyetOrta = ortaRisk * 1000000;
    const maliyetYuksek = yuksekRisk * 2000000;
    const maliyetCokYuksek = cokYuksekRisk * 3000000;
    
    const toplamMaliyet = maliyetDusuk + maliyetOrta + maliyetYuksek + maliyetCokYuksek;
    
    // Fayda hesaplama (risk azaltma + değer artışı + sosyal fayda)
    // Yüksek riskli bina dönüşümü daha fazla fayda sağlar
    const faydaCarpani = 1.35; // %35 net fayda
    const toplamFayda = toplamMaliyet * faydaCarpani;
    
    // ROI hesaplama
    const roi = ((toplamFayda - toplamMaliyet) / toplamMaliyet * 100).toFixed(0);
    
    // Geri ödeme süresi (yıl)
    const yillikFayda = toplamFayda / 10; // 10 yılda toplam fayda
    const geriOdeme = Math.ceil(toplamMaliyet / yillikFayda);
    
    // UI güncelle
    if (document.getElementById('costTotal')) {
        document.getElementById('costTotal').textContent = formatMoney(toplamMaliyet);
    }
    if (document.getElementById('costBenefit')) {
        document.getElementById('costBenefit').textContent = formatMoney(toplamFayda);
    }
    if (document.getElementById('costROI')) {
        document.getElementById('costROI').textContent = `%${roi}`;
    }
    if (document.getElementById('costPayback')) {
        document.getElementById('costPayback').textContent = `${geriOdeme}-${geriOdeme + 2} Yıl`;
    }
}

// Para formatı
function formatMoney(value) {
    if (value >= 1e12) return (value / 1e12).toFixed(1) + 'T TL';
    if (value >= 1e9) return (value / 1e9).toFixed(1) + 'B TL';
    if (value >= 1e6) return (value / 1e6).toFixed(0) + 'M TL';
    return value.toLocaleString('tr-TR') + ' TL';
}

// ========== KDS: KARŞILAŞTIRMA ==========
function populateCompareSelects() {
    const opts = allMahalleler.map(m => `<option value="${m.ad}">${m.ad.replace(' Mahallesi', '')}</option>`).join('');
    ['compare1', 'compare2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = opts;
    });
    // İkinci seçeneği farklı yap
    if (document.getElementById('compare2') && allMahalleler.length > 1) {
        document.getElementById('compare2').selectedIndex = 1;
    }
}

function compareMahalleler() {
    const m1 = allMahalleler.find(m => m.ad === document.getElementById('compare1')?.value);
    const m2 = allMahalleler.find(m => m.ad === document.getElementById('compare2')?.value);
    if (!m1 || !m2) return;

    document.getElementById('compareH1').textContent = m1.ad.replace(' Mahallesi', '');
    document.getElementById('compareH2').textContent = m2.ad.replace(' Mahallesi', '');

    // Karşılaştırma için renklendirme (düşük risk = iyi, yüksek bina = kötü olabilir bağlama göre)
    const highlight = (v1, v2, lowerIsBetter = false) => {
        const better = lowerIsBetter ? (v1 < v2 ? v1 : v2) : (v1 > v2 ? v1 : v2);
        const format = (v) => typeof v === 'number' ? v.toLocaleString('tr-TR') : v;
        if (v1 === v2) return [format(v1), format(v2)];
        return [
            v1 === better ? `<span style="color:#22c55e; font-weight:600;">${format(v1)}</span>` : format(v1),
            v2 === better ? `<span style="color:#22c55e; font-weight:600;">${format(v2)}</span>` : format(v2)
        ];
    };

    // Yüksek riskli oranı hesapla
    const riskOran1 = ((m1.yuksek_risk + m1.cok_yuksek_risk) / m1.bina_sayisi * 100).toFixed(1);
    const riskOran2 = ((m2.yuksek_risk + m2.cok_yuksek_risk) / m2.bina_sayisi * 100).toFixed(1);

    const rows = [
        ['📊 Bina Sayısı', ...highlight(m1.bina_sayisi, m2.bina_sayisi)],
        ['⚠️ Ort. Risk Puanı', ...highlight(m1.ortalama_risk.toFixed(1), m2.ortalama_risk.toFixed(1), true)],
        ['🔴 Yüksek Riskli', ...highlight(m1.yuksek_risk + m1.cok_yuksek_risk, m2.yuksek_risk + m2.cok_yuksek_risk, true)],
        ['📈 Risk Oranı %', ...highlight(parseFloat(riskOran1), parseFloat(riskOran2), true)],
        ['🟢 Düşük Riskli', ...highlight(m1.dusuk_risk, m2.dusuk_risk)],
        ['🟡 Orta Riskli', ...highlight(m1.orta_risk, m2.orta_risk, true)]
    ];

    document.getElementById('compareBody').innerHTML = rows.map(([name, v1, v2]) => {
        return `<tr><td>${name}</td><td style="text-align:center;">${v1}</td><td style="text-align:center;">${v2}</td></tr>`;
    }).join('');
}

// ========== KDS: AKILLI ÖNERİLER (Veritabanı Bazlı) ==========
function generateSmartRecommendations() {
    if (!allMahalleler.length) return;
    
    const list = document.getElementById('recommendationList');
    if (!list) return;

    // Veritabanı verilerine göre analiz
    const sorted = [...allMahalleler].sort((a, b) => b.ortalama_risk - a.ortalama_risk);
    const enRiskli = sorted[0];
    const ikinciRiskli = sorted[1];
    const ucuncuRiskli = sorted[2];
    
    // Toplam istatistikler
    const toplamBina = globalStats?.toplam_bina || 31681;
    const toplamYuksekRisk = allMahalleler.reduce((sum, m) => sum + m.yuksek_risk + m.cok_yuksek_risk, 0);
    const yuksekRiskOrani = ((toplamYuksekRisk / toplamBina) * 100).toFixed(1);
    
    // En kalabalık mahalle
    const enKalabalik = [...allMahalleler].sort((a, b) => b.bina_sayisi - a.bina_sayisi)[0];
    
    // En düşük riskli (başlangıç için uygun)
    const enDusukRiskli = sorted[sorted.length - 1];
    
    const recommendations = [
        {
            type: 'urgent',
            icon: '🚨',
            title: `${enRiskli.ad.replace(' Mahallesi', '')} - Acil Müdahale Gerekli`,
            text: `Risk puanı ${enRiskli.ortalama_risk.toFixed(1)} ile en kritik seviyede. ` +
                  `${(enRiskli.yuksek_risk + enRiskli.cok_yuksek_risk).toLocaleString('tr-TR')} yüksek riskli bina acil dönüşüm programına alınmalı.`
        },
        {
            type: 'urgent',
            icon: '⚠️',
            title: `Kritik Bölgeler: ${ikinciRiskli.ad.replace(' Mahallesi', '')} ve ${ucuncuRiskli.ad.replace(' Mahallesi', '')}`,
            text: `Sırasıyla ${ikinciRiskli.ortalama_risk.toFixed(1)} ve ${ucuncuRiskli.ortalama_risk.toFixed(1)} risk puanı ile ikinci öncelikli dönüşüm alanları.`
        },
        {
            type: 'warning',
            icon: '📊',
            title: `Bayraklı Geneli: %${yuksekRiskOrani} Yüksek Risk`,
            text: `Toplam ${toplamBina.toLocaleString('tr-TR')} binanın ${toplamYuksekRisk.toLocaleString('tr-TR')} tanesi yüksek/çok yüksek risk kategorisinde. ` +
                  `Sistematik dönüşüm planı şart.`
        },
        {
            type: 'warning',
            icon: '🏘️',
            title: `${enKalabalik.ad.replace(' Mahallesi', '')} - Yoğunluk Dikkat`,
            text: `${enKalabalik.bina_sayisi.toLocaleString('tr-TR')} bina ile en kalabalık mahalle. ` +
                  `Blok bazlı dönüşüm önerilir. Tahmini etkilenecek kişi: ${(enKalabalik.bina_sayisi * 4).toLocaleString('tr-TR')}`
        },
        {
            type: '',
            icon: '🎯',
            title: `Pilot Bölge Önerisi: ${enDusukRiskli.ad.replace(' Mahallesi', '')}`,
            text: `Risk puanı ${enDusukRiskli.ortalama_risk.toFixed(1)} ile en düşük seviyede. ` +
                  `${enDusukRiskli.bina_sayisi} bina - pilot uygulama için ideal başlangıç noktası.`
        },
        {
            type: '',
            icon: '📅',
            title: 'Optimal Dönüşüm Takvimi',
            text: 'İzmir iklim verileri analizi: Nisan-Ekim arası inşaat için en uygun dönem. ' +
                  'Kış öncesi temel atılması, yaz aylarında kaba inşaat tamamlanması önerilir.'
        }
    ];

    list.innerHTML = recommendations.map(r => `
        <div class="recommendation-item ${r.type}">
            <div class="recommendation-title">
                ${r.icon} ${r.title}
                ${r.type ? `<span class="badge badge-${r.type}">${r.type === 'urgent' ? 'ACİL' : 'UYARI'}</span>` : ''}
            </div>
            <div class="recommendation-text">${r.text}</div>
        </div>
    `).join('');
}

// ========== KDS: DETAYLI RAPORLAMA ==========
let etapDataCache = null;

// Etap verilerini önbelleğe al
async function loadEtapDataForReport() {
    if (etapDataCache) return etapDataCache;
    try {
        const response = await fetch('/api/kds/etap-analizi');
        etapDataCache = await response.json();
        return etapDataCache;
    } catch (error) {
        console.error('Etap verisi yüklenemedi:', error);
        return null;
    }
}

function generateReport(type) {
    const date = new Date().toLocaleDateString('tr-TR');
    const preview = document.getElementById('reportPreview');
    if (!preview) return;

    const toplamBina = globalStats?.toplam_bina?.toLocaleString('tr-TR') || '-';
    const toplamYuksek = allMahalleler.reduce((s,m) => s + (m.yuksek_risk||0) + (m.cok_yuksek_risk||0), 0);
    const sorted = [...allMahalleler].sort((a,b) => b.ortalama_risk - a.ortalama_risk);
    
    const reports = {
        ozet: `
            <div style="border-left:3px solid var(--accent-cyan); padding-left:12px;">
                <strong style="color:var(--accent-cyan)">📊 Detaylı Özet Rapor</strong><br>
                <span style="font-size:10px; color:var(--text-muted)">${date} • ${allMahalleler.length} mahalle • Tüm etaplar dahil</span>
            </div>
            <div style="margin-top:10px; font-size:10px; line-height:1.5; max-height:80px; overflow-y:auto;">
                • Toplam Bina: <strong>${toplamBina}</strong><br>
                • Yüksek Riskli: <strong style="color:#ef4444">${toplamYuksek.toLocaleString('tr-TR')}</strong><br>
                • En Riskli: <strong>${sorted[0]?.ad?.replace(' Mahallesi', '')}</strong> (${sorted[0]?.ortalama_risk?.toFixed(1)})<br>
                • Harita görüntüsü dahil edilecek
            </div>
            <button class="btn btn-primary" style="margin-top:10px; width:100%" onclick="downloadDetailedReport('ozet')">
                📥 Detaylı PDF İndir (${allMahalleler.length} sayfa)
            </button>
        `,
        mahalle: `
            <div style="border-left:3px solid var(--accent-emerald); padding-left:12px;">
                <strong style="color:var(--accent-emerald)">🏘️ Mahalle Detay Raporu</strong><br>
                <span style="font-size:10px; color:var(--text-muted)">${date} • Tüm mahalleler</span>
            </div>
            <div style="margin-top:10px; font-size:10px; line-height:1.5; max-height:80px; overflow-y:auto;">
                ${allMahalleler.slice(0,5).map(m => `• ${m.ad.replace(' Mahallesi', '')}: ${m.bina_sayisi} bina`).join('<br>')}
                <br>• ... ve ${allMahalleler.length - 5} mahalle daha
            </div>
            <button class="btn btn-primary" style="margin-top:10px; width:100%" onclick="downloadDetailedReport('mahalle')">
                📥 Tüm Mahalleler PDF (${allMahalleler.length} sayfa)
            </button>
        `,
        oncelik: `
            <div style="border-left:3px solid var(--accent-amber); padding-left:12px;">
                <strong style="color:var(--accent-amber)">⭐ Öncelik Sıralaması Raporu</strong><br>
                <span style="font-size:10px; color:var(--text-muted)">${date} • Mahalle + Etap bazlı</span>
            </div>
            <div style="margin-top:10px; font-size:10px; line-height:1.5; max-height:80px; overflow-y:auto;">
                <strong>İlk 5 Öncelikli:</strong><br>
                ${sorted.slice(0,5).map((m,i) => `${i+1}. ${m.ad.replace(' Mahallesi', '')} - Risk: ${m.ortalama_risk.toFixed(1)}`).join('<br>')}
            </div>
            <button class="btn btn-primary" style="margin-top:10px; width:100%" onclick="downloadDetailedReport('oncelik')">
                📥 Öncelik Raporu PDF (Etaplar dahil)
            </button>
        `,
        maliyet: `
            <div style="border-left:3px solid var(--accent-rose); padding-left:12px;">
                <strong style="color:var(--accent-rose)">💰 Maliyet Analiz Raporu</strong><br>
                <span style="font-size:10px; color:var(--text-muted)">${date} • Detaylı finansal analiz</span>
            </div>
            <div style="margin-top:10px; font-size:10px; line-height:1.5;">
                • Toplam Maliyet: <strong>${document.getElementById('costTotal')?.textContent || '-'}</strong><br>
                • Beklenen Fayda: <strong>${document.getElementById('costBenefit')?.textContent || '-'}</strong><br>
                • ROI: <strong style="color:#22c55e">${document.getElementById('costROI')?.textContent || '-'}</strong><br>
                • Mahalle bazlı maliyet dökümü dahil
            </div>
            <button class="btn btn-primary" style="margin-top:10px; width:100%" onclick="downloadDetailedReport('maliyet')">
                📥 Maliyet Raporu PDF (Detaylı)
            </button>
        `
    };
    
    preview.innerHTML = reports[type] || '<p style="font-size:11px; color:var(--text-muted); text-align:center;">Rapor türü seçin...</p>';
}

// Türkçe karakter düzeltme
function turkishToAscii(text) {
    const map = {'ç':'c','Ç':'C','ğ':'g','Ğ':'G','ı':'i','İ':'I','ö':'o','Ö':'O','ş':'s','Ş':'S','ü':'u','Ü':'U'};
    return text.replace(/[çÇğĞıİöÖşŞüÜ]/g, c => map[c] || c);
}

async function downloadDetailedReport(type) {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) { alert('PDF kutuphanesi yuklenemedi'); return; }
    
    const doc = new jsPDF();
    const date = new Date().toLocaleDateString('tr-TR');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Başlık sayfası
    doc.setFillColor(10, 14, 23);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    doc.setTextColor(241, 245, 249);
    doc.setFontSize(28);
    doc.text('BAYRAKLI KENTSEL DONUSUM', pageWidth/2, 60, { align: 'center' });
    doc.setFontSize(22);
    doc.text('KARAR DESTEK SISTEMI', pageWidth/2, 75, { align: 'center' });
    
    doc.setFontSize(16);
    doc.setTextColor(6, 182, 212);
    const titles = { ozet: 'OZET RAPOR', mahalle: 'MAHALLE DETAY RAPORU', oncelik: 'ONCELIK RAPORU', maliyet: 'MALIYET ANALIZ RAPORU' };
    doc.text(titles[type], pageWidth/2, 110, { align: 'center' });
    
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(12);
    doc.text(`Olusturma Tarihi: ${date}`, pageWidth/2, 140, { align: 'center' });
    doc.text(`Toplam Mahalle: ${allMahalleler.length}`, pageWidth/2, 152, { align: 'center' });
    doc.text(`Toplam Bina: ${globalStats?.toplam_bina?.toLocaleString('tr-TR') || '-'}`, pageWidth/2, 164, { align: 'center' });
    
    // Rapor türüne göre içerik
    if (type === 'ozet') await generateOzetReport(doc);
    else if (type === 'mahalle') await generateMahalleReport(doc);
    else if (type === 'oncelik') await generateOncelikReport(doc);
    else if (type === 'maliyet') await generateMaliyetReport(doc);
    
    doc.save(`Bayrakli_KDS_${titles[type].replace(/ /g, '_')}_${Date.now()}.pdf`);
}

// ÖZET RAPOR
async function generateOzetReport(doc) {
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Sayfa 2: Genel İstatistikler
    doc.addPage();
    addPageHeader(doc, 'GENEL ISTATISTIKLER');
    
    let y = 45;
    doc.setFontSize(11);
    doc.setTextColor(241, 245, 249);
    
    const toplamBina = globalStats?.toplam_bina || 0;
    const dusukRisk = allMahalleler.reduce((s,m) => s + (m.dusuk_risk||0), 0);
    const ortaRisk = allMahalleler.reduce((s,m) => s + (m.orta_risk||0), 0);
    const yuksekRisk = allMahalleler.reduce((s,m) => s + (m.yuksek_risk||0), 0);
    const cokYuksekRisk = allMahalleler.reduce((s,m) => s + (m.cok_yuksek_risk||0), 0);
    
    const stats = [
        ['Toplam Bina Sayisi', toplamBina.toLocaleString('tr-TR')],
        ['Mahalle Sayisi', allMahalleler.length.toString()],
        ['Dusuk Riskli Bina', `${dusukRisk.toLocaleString('tr-TR')} (%${(dusukRisk/toplamBina*100).toFixed(1)})`],
        ['Orta Riskli Bina', `${ortaRisk.toLocaleString('tr-TR')} (%${(ortaRisk/toplamBina*100).toFixed(1)})`],
        ['Yuksek Riskli Bina', `${yuksekRisk.toLocaleString('tr-TR')} (%${(yuksekRisk/toplamBina*100).toFixed(1)})`],
        ['Cok Yuksek Riskli Bina', `${cokYuksekRisk.toLocaleString('tr-TR')} (%${(cokYuksekRisk/toplamBina*100).toFixed(1)})`]
    ];
    
    stats.forEach(([label, value]) => {
        doc.setTextColor(148, 163, 184);
        doc.text(label + ':', 20, y);
        doc.setTextColor(6, 182, 212);
        doc.text(value, 100, y);
        y += 10;
    });
    
    // Sayfa 3: Mahalle Özet Tablosu
    doc.addPage();
    addPageHeader(doc, 'MAHALLE OZET TABLOSU');
    
    y = 45;
    doc.setFontSize(9);
    
    // Tablo başlıkları
    doc.setFillColor(26, 34, 53);
    doc.rect(15, y-5, pageWidth-30, 10, 'F');
    doc.setTextColor(6, 182, 212);
    doc.text('Mahalle', 20, y);
    doc.text('Bina', 80, y);
    doc.text('Risk Ort.', 105, y);
    doc.text('Yuksek', 135, y);
    doc.text('Dusuk', 160, y);
    y += 12;
    
    const sorted = [...allMahalleler].sort((a,b) => b.ortalama_risk - a.ortalama_risk);
    
    sorted.forEach((m, i) => {
        if (y > 270) { doc.addPage(); addPageHeader(doc, 'MAHALLE OZET TABLOSU (devam)'); y = 45; }
        
        doc.setTextColor(241, 245, 249);
        const name = turkishToAscii(m.ad.replace(' Mahallesi', '')).substring(0, 20);
        doc.text(name, 20, y);
        doc.text(m.bina_sayisi.toString(), 80, y);
        
        // Risk rengine göre
        if (m.ortalama_risk > 60) doc.setTextColor(239, 68, 68);
        else if (m.ortalama_risk > 40) doc.setTextColor(245, 158, 11);
        else doc.setTextColor(34, 197, 94);
        doc.text(m.ortalama_risk.toFixed(1), 105, y);
        
        doc.setTextColor(239, 68, 68);
        doc.text((m.yuksek_risk + m.cok_yuksek_risk).toString(), 135, y);
        doc.setTextColor(34, 197, 94);
        doc.text(m.dusuk_risk.toString(), 160, y);
        y += 8;
    });
    
    // Etap analizi sayfası
    const etapData = await loadEtapDataForReport();
    if (etapData && etapData.etaplar) {
        doc.addPage();
        addPageHeader(doc, 'ETAP ANALIZI OZETI');
        y = 45;
        
        doc.setFontSize(10);
        doc.setTextColor(148, 163, 184);
        doc.text(`Toplam Etap Sayisi: ${etapData.toplam_etap}`, 20, y);
        doc.text(`Acil Etap: ${etapData.ozet.acil_etap_sayisi}`, 100, y);
        doc.text(`Oncelikli: ${etapData.ozet.oncelikli_etap_sayisi}`, 150, y);
        y += 15;
        
        doc.setFontSize(9);
        etapData.etaplar.slice(0, 20).forEach((e, i) => {
            if (y > 270) { doc.addPage(); addPageHeader(doc, 'ETAP ANALIZI (devam)'); y = 45; }
            
            doc.setTextColor(241, 245, 249);
            const etapName = turkishToAscii(e.etap_adi).substring(0, 25);
            doc.text(`${i+1}. ${etapName}`, 20, y);
            doc.text(`${e.bina_sayisi} bina`, 100, y);
            
            if (e.oneri === 'Acil') doc.setTextColor(239, 68, 68);
            else if (e.oneri === 'Oncelikli') doc.setTextColor(245, 158, 11);
            else doc.setTextColor(34, 197, 94);
            doc.text(e.oneri, 140, y);
            doc.text(`Skor: ${e.oncelik_skoru}`, 170, y);
            y += 8;
        });
    }
}

// MAHALLE DETAY RAPORU
async function generateMahalleReport(doc) {
    const sorted = [...allMahalleler].sort((a,b) => b.ortalama_risk - a.ortalama_risk);
    
    for (let i = 0; i < sorted.length; i++) {
        const m = sorted[i];
        doc.addPage();
        addPageHeader(doc, turkishToAscii(m.ad.toUpperCase()));
        
        let y = 50;
        doc.setFontSize(11);
        
        // Sol kolon
        doc.setTextColor(148, 163, 184);
        doc.text('Genel Bilgiler', 20, y);
        y += 10;
        doc.setFontSize(10);
        
        const info = [
            ['Toplam Bina', m.bina_sayisi.toLocaleString('tr-TR')],
            ['Ortalama Risk Puani', m.ortalama_risk.toFixed(2)],
            ['Risk Siralaması', `${i+1}/${sorted.length}`]
        ];
        
        info.forEach(([label, value]) => {
            doc.setTextColor(148, 163, 184);
            doc.text(label + ':', 25, y);
            doc.setTextColor(241, 245, 249);
            doc.text(value, 80, y);
            y += 8;
        });
        
        // Risk dağılımı
        y += 10;
        doc.setFontSize(11);
        doc.setTextColor(148, 163, 184);
        doc.text('Risk Dagilimi', 20, y);
        y += 10;
        doc.setFontSize(10);
        
        const risks = [
            ['Dusuk Risk', m.dusuk_risk, '#22c55e'],
            ['Orta Risk', m.orta_risk, '#eab308'],
            ['Yuksek Risk', m.yuksek_risk, '#ef4444'],
            ['Cok Yuksek Risk', m.cok_yuksek_risk, '#991b1b']
        ];
        
        risks.forEach(([label, value, color]) => {
            const pct = ((value / m.bina_sayisi) * 100).toFixed(1);
            doc.setTextColor(148, 163, 184);
            doc.text(label + ':', 25, y);
            doc.setTextColor(241, 245, 249);
            doc.text(`${value} (%${pct})`, 80, y);
            
            // Mini bar
            const barWidth = (value / m.bina_sayisi) * 80;
            const rgb = hexToRgb(color);
            doc.setFillColor(rgb.r, rgb.g, rgb.b);
            doc.rect(120, y-3, barWidth, 4, 'F');
            y += 8;
        });
        
        // Öneri
        y += 15;
        doc.setFillColor(26, 34, 53);
        doc.rect(15, y-5, 180, 30, 'F');
        doc.setFontSize(10);
        doc.setTextColor(6, 182, 212);
        doc.text('ONERI:', 20, y+5);
        doc.setTextColor(241, 245, 249);
        doc.setFontSize(9);
        
        let oneri = '';
        if (m.ortalama_risk > 60) oneri = 'ACIL MUDAHALE GEREKLI - Birinci oncelikli donusum alani olarak belirlenmeli.';
        else if (m.ortalama_risk > 45) oneri = 'ONCELIKLI - Ikinci asama donusum programina dahil edilmeli.';
        else if (m.ortalama_risk > 35) oneri = 'NORMAL ONCELIK - Orta vadeli donusum planina alinmali.';
        else oneri = 'DUSUK ONCELIK - Uzun vadeli plana dahil edilebilir veya pilot bolge olarak kullanilabilir.';
        
        doc.text(oneri, 20, y+15, { maxWidth: 170 });
    }
}

// ÖNCELİK RAPORU
async function generateOncelikReport(doc) {
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Mahalle öncelik sıralaması
    doc.addPage();
    addPageHeader(doc, 'MAHALLE ONCELIK SIRALAMASI');
    
    let y = 45;
    const sorted = [...allMahalleler].sort((a,b) => b.ortalama_risk - a.ortalama_risk);
    
    doc.setFontSize(9);
    
    // Tablo başlığı
    doc.setFillColor(26, 34, 53);
    doc.rect(15, y-5, pageWidth-30, 10, 'F');
    doc.setTextColor(6, 182, 212);
    doc.text('Sira', 20, y);
    doc.text('Mahalle', 35, y);
    doc.text('Risk', 100, y);
    doc.text('Yuksek R.', 125, y);
    doc.text('Durum', 160, y);
    y += 12;
    
    sorted.forEach((m, i) => {
        if (y > 270) { doc.addPage(); addPageHeader(doc, 'MAHALLE ONCELIK SIRALAMASI (devam)'); y = 45; }
        
        doc.setTextColor(241, 245, 249);
        doc.text(`${i+1}`, 20, y);
        doc.text(turkishToAscii(m.ad.replace(' Mahallesi', '')).substring(0, 20), 35, y);
        doc.text(m.ortalama_risk.toFixed(1), 100, y);
        doc.text((m.yuksek_risk + m.cok_yuksek_risk).toString(), 125, y);
        
        let durum = 'Normal';
        if (m.ortalama_risk > 60) { durum = 'ACIL'; doc.setTextColor(239, 68, 68); }
        else if (m.ortalama_risk > 45) { durum = 'Oncelikli'; doc.setTextColor(245, 158, 11); }
        else if (m.ortalama_risk > 35) { durum = 'Normal'; doc.setTextColor(34, 197, 94); }
        else { durum = 'Bekleyebilir'; doc.setTextColor(100, 116, 139); }
        doc.text(durum, 160, y);
        y += 8;
    });
    
    // Etap öncelik sıralaması
    const etapData = await loadEtapDataForReport();
    if (etapData && etapData.etaplar) {
        doc.addPage();
        addPageHeader(doc, 'ETAP ONCELIK SIRALAMASI');
        y = 45;
        
        doc.setFillColor(26, 34, 53);
        doc.rect(15, y-5, pageWidth-30, 10, 'F');
        doc.setTextColor(6, 182, 212);
        doc.text('Sira', 20, y);
        doc.text('Etap', 35, y);
        doc.text('Mahalle', 90, y);
        doc.text('Bina', 135, y);
        doc.text('Skor', 155, y);
        doc.text('Durum', 175, y);
        y += 12;
        
        etapData.etaplar.forEach((e, i) => {
            if (y > 270) { doc.addPage(); addPageHeader(doc, 'ETAP ONCELIK SIRALAMASI (devam)'); y = 45; }
            
            doc.setTextColor(241, 245, 249);
            doc.text(`${i+1}`, 20, y);
            doc.text(turkishToAscii(e.etap_adi).substring(0, 18), 35, y);
            doc.text(turkishToAscii(e.mahalle_adi.replace(' Mahallesi', '')).substring(0, 12), 90, y);
            doc.text(e.bina_sayisi.toString(), 135, y);
            doc.text(e.oncelik_skoru.toString(), 155, y);
            
            if (e.oneri === 'Acil') doc.setTextColor(239, 68, 68);
            else if (e.oneri === 'Oncelikli') doc.setTextColor(245, 158, 11);
            else doc.setTextColor(34, 197, 94);
            doc.text(e.oneri, 175, y);
            y += 7;
        });
    }
}

// MALİYET RAPORU
async function generateMaliyetReport(doc) {
    const pageWidth = doc.internal.pageSize.getWidth();
    
    doc.addPage();
    addPageHeader(doc, 'MALIYET ANALIZI');
    
    let y = 50;
    
    // Genel maliyet
    const totalBina = globalStats?.toplam_bina || 31681;
    const dusukRisk = allMahalleler.reduce((s,m) => s + (m.dusuk_risk||0), 0);
    const ortaRisk = allMahalleler.reduce((s,m) => s + (m.orta_risk||0), 0);
    const yuksekRisk = allMahalleler.reduce((s,m) => s + (m.yuksek_risk||0), 0);
    const cokYuksekRisk = allMahalleler.reduce((s,m) => s + (m.cok_yuksek_risk||0), 0);
    
    const maliyetDusuk = dusukRisk * 500000;
    const maliyetOrta = ortaRisk * 1000000;
    const maliyetYuksek = yuksekRisk * 2000000;
    const maliyetCokYuksek = cokYuksekRisk * 3000000;
    const toplamMaliyet = maliyetDusuk + maliyetOrta + maliyetYuksek + maliyetCokYuksek;
    const toplamFayda = toplamMaliyet * 1.35;
    
    doc.setFontSize(12);
    doc.setTextColor(148, 163, 184);
    doc.text('Genel Maliyet Ozeti', 20, y);
    y += 15;
    
    doc.setFontSize(10);
    const costs = [
        ['Dusuk Riskli Binalar', dusukRisk, 500000, maliyetDusuk],
        ['Orta Riskli Binalar', ortaRisk, 1000000, maliyetOrta],
        ['Yuksek Riskli Binalar', yuksekRisk, 2000000, maliyetYuksek],
        ['Cok Yuksek Riskli Binalar', cokYuksekRisk, 3000000, maliyetCokYuksek]
    ];
    
    costs.forEach(([label, count, unit, total]) => {
        doc.setTextColor(148, 163, 184);
        doc.text(label, 25, y);
        doc.setTextColor(241, 245, 249);
        doc.text(`${count.toLocaleString('tr-TR')} x ${(unit/1000000).toFixed(1)}M TL = `, 100, y);
        doc.setTextColor(6, 182, 212);
        doc.text(formatMoneyPDF(total), 160, y);
        y += 10;
    });
    
    y += 10;
    doc.setDrawColor(45, 58, 79);
    doc.line(20, y, 190, y);
    y += 10;
    
    doc.setFontSize(11);
    doc.setTextColor(148, 163, 184);
    doc.text('TOPLAM TAHMINI MALIYET:', 25, y);
    doc.setTextColor(239, 68, 68);
    doc.text(formatMoneyPDF(toplamMaliyet), 120, y);
    y += 12;
    
    doc.setTextColor(148, 163, 184);
    doc.text('BEKLENEN FAYDA (%35 ROI):', 25, y);
    doc.setTextColor(34, 197, 94);
    doc.text(formatMoneyPDF(toplamFayda), 120, y);
    y += 12;
    
    doc.setTextColor(148, 163, 184);
    doc.text('NET KAZANC:', 25, y);
    doc.setTextColor(6, 182, 212);
    doc.text(formatMoneyPDF(toplamFayda - toplamMaliyet), 120, y);
    
    // Mahalle bazlı maliyet
    doc.addPage();
    addPageHeader(doc, 'MAHALLE BAZLI MALIYET DOKUMU');
    y = 45;
    
    doc.setFontSize(9);
    doc.setFillColor(26, 34, 53);
    doc.rect(15, y-5, pageWidth-30, 10, 'F');
    doc.setTextColor(6, 182, 212);
    doc.text('Mahalle', 20, y);
    doc.text('Bina', 80, y);
    doc.text('Tahmini Maliyet', 110, y);
    doc.text('Oncelik', 165, y);
    y += 12;
    
    const sorted = [...allMahalleler].sort((a,b) => b.ortalama_risk - a.ortalama_risk);
    
    sorted.forEach((m, i) => {
        if (y > 270) { doc.addPage(); addPageHeader(doc, 'MAHALLE BAZLI MALIYET (devam)'); y = 45; }
        
        const maliyet = (m.dusuk_risk * 500000) + (m.orta_risk * 1000000) + 
                        (m.yuksek_risk * 2000000) + (m.cok_yuksek_risk * 3000000);
        
        doc.setTextColor(241, 245, 249);
        doc.text(turkishToAscii(m.ad.replace(' Mahallesi', '')).substring(0, 20), 20, y);
        doc.text(m.bina_sayisi.toString(), 80, y);
        doc.setTextColor(6, 182, 212);
        doc.text(formatMoneyPDF(maliyet), 110, y);
        
        doc.setTextColor(241, 245, 249);
        doc.text(`${i+1}`, 170, y);
        y += 8;
    });
}

// Yardımcı fonksiyonlar
function addPageHeader(doc, title) {
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFillColor(26, 34, 53);
    doc.rect(0, 0, pageWidth, 35, 'F');
    doc.setTextColor(6, 182, 212);
    doc.setFontSize(14);
    doc.text(title, 20, 22);
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(9);
    doc.text(`Bayrakli KDS - ${new Date().toLocaleDateString('tr-TR')}`, pageWidth - 60, 22);
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 0, g: 0, b: 0 };
}

function formatMoneyPDF(value) {
    if (value >= 1e12) return (value / 1e12).toFixed(2) + ' Trilyon TL';
    if (value >= 1e9) return (value / 1e9).toFixed(2) + ' Milyar TL';
    if (value >= 1e6) return (value / 1e6).toFixed(1) + ' Milyon TL';
    return value.toLocaleString('tr-TR') + ' TL';
}

// ========== SLIDER & SEARCH ==========
function setupSliders() {
    // Filtreleme slider'ı
    document.getElementById('filterRisk')?.addEventListener('input', () => {
        const val = document.getElementById('filterRisk').value;
        if (document.getElementById('filterRiskVal')) {
            document.getElementById('filterRiskVal').textContent = val;
        }
    });
    
    // Checkbox'lar için event listener
    ['filterDusuk', 'filterOrta', 'filterYuksek', 'filterCokYuksek'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', applyFilters);
    });
}

// ========== BAŞLAT ==========
// ========== ACİL MÜDAHALE BİNALARI ==========
async function loadUrgentBuildings() {
    try {
        const response = await fetch('/api/urgent-buildings');
        const data = await response.json();
        const listContainer = document.getElementById('urgentBuildingsList');
        
        if (!listContainer) return;
        
        if (!data.buildings || data.buildings.length === 0) {
            listContainer.innerHTML = `
                <div class="urgent-empty-state">
                    <div class="urgent-empty-icon">✅</div>
                    <div class="urgent-empty-text">Acil müdahale gerektiren bina bulunmuyor.</div>
                </div>
            `;
            return;
        }
        
        listContainer.innerHTML = data.buildings.map((building, index) => {
            const isCritical = building.risk_puani >= 90;
            const badgeClass = isCritical ? 'urgent-badge-critical animate-pulse' : 'urgent-badge-high';
            const riskText = isCritical ? 'KRİTİK' : 'YÜKSEK';
            const rank = index + 1;
            
            return `
                <div class="urgent-card-item" data-bina-id="${building.bina_id}" data-rank="${rank}" style="cursor: pointer;">
                    <div class="urgent-item-left">
                        <div class="urgent-item-location">${building.mahalle_adi || 'Bilinmeyen Mahalle'}</div>
                        <div class="urgent-item-details">
                            <div class="urgent-detail-row">
                                <span class="urgent-detail-label">Bina ID:</span>
                                <span class="urgent-detail-value">${building.bina_id || '-'}</span>
                            </div>
                            <div class="urgent-detail-row">
                                <span class="urgent-detail-label">Yaş:</span>
                                <span class="urgent-detail-value">${building.bina_yasi || 0} yıl</span>
                            </div>
                            <div class="urgent-detail-row">
                                <span class="urgent-detail-label">Kat:</span>
                                <span class="urgent-detail-value">${building.kat_sayisi || '-'} kat</span>
                            </div>
                            <div class="urgent-detail-row">
                                <span class="urgent-detail-label">Yapı:</span>
                                <span class="urgent-detail-value">${building.yapi_turu || '-'}</span>
                            </div>
                            ${building.etap_adi ? `
                            <div class="urgent-detail-row">
                                <span class="urgent-detail-label">Etap:</span>
                                <span class="urgent-detail-value">${building.etap_adi}</span>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                    <div class="urgent-item-badge ${badgeClass}">
                        ${riskText}
                    </div>
                </div>
            `;
        }).join('');
        
        // Click event listener'ları ekle
        listContainer.querySelectorAll('.urgent-card-item').forEach(item => {
            item.addEventListener('click', async function() {
                const binaId = parseInt(this.dataset.binaId);
                const rank = parseInt(this.dataset.rank);
                await highlightUrgentBuilding(binaId, rank);
            });
        });
    } catch (error) {
        console.error('Acil müdahale binaları yüklenemedi:', error);
        const listContainer = document.getElementById('urgentBuildingsList');
        if (listContainer) {
            listContainer.innerHTML = `
                <div class="urgent-empty-state">
                    <div class="urgent-empty-icon">⚠️</div>
                    <div class="urgent-empty-text">Veri yüklenirken bir hata oluştu.</div>
                </div>
            `;
        }
    }
}

// Acil müdahale listesindeki binayı haritada göster
async function highlightUrgentBuilding(binaId, rank) {
    try {
        // Bina detaylarını API'den çek
        const response = await fetch(`/api/bina/${binaId}`);
        if (!response.ok) {
            throw new Error('Bina bulunamadı');
        }
        const binaData = await response.json();
        
        // Eğer mahalle seçili değilse, binanın mahallesini seç
        if (!currentMahalle || currentMahalle !== binaData.mahalle_adi) {
            await selectMahalle(binaData.mahalle_adi);
            // Mahalle yüklendikten sonra binayı bulmak için kısa bir bekleme
            await new Promise(resolve => setTimeout(resolve, 800));
        }
        
        // Haritada binayı bul ve highlight et
        let foundLayer = null;
        binalarLayer.eachLayer(geoLayer => {
            if (geoLayer.eachLayer) {
                geoLayer.eachLayer(layer => {
                    const layerBinaId = layer.options?.binaData?.bina_id || 
                                      layer.feature?.properties?.bina_id;
                    if (layerBinaId === binaId) {
                        foundLayer = layer;
                    }
                });
            } else {
                const layerBinaId = geoLayer.feature?.properties?.bina_id;
                if (layerBinaId === binaId) {
                    foundLayer = geoLayer;
                }
            }
        });
        
        if (foundLayer) {
            // Binayı highlight et
            foundLayer.setStyle({
                weight: 4,
                fillOpacity: 1,
                color: '#ff0000',
                fillColor: '#ff0000'
            });
            foundLayer.bringToFront();
            
            // Binanın merkezine zoom yap
            const bounds = foundLayer.getBounds();
            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [100, 100], maxZoom: 18 });
            }
            
            // Bilgi kartını göster
            const binaInfo = {
                ...binaData,
                urgentRank: rank
            };
            showUrgentBuildingInfo(binaInfo);
        } else {
            // Bina layer'da bulunamadı, mahalle binalarından ara
            const mahalleResponse = await fetch(`/api/mahalle/${encodeURIComponent(binaData.mahalle_adi)}/binalar`);
            if (mahalleResponse.ok) {
                const mahalleBinalar = await mahalleResponse.json();
                const binaFeature = mahalleBinalar.features?.find(f => 
                    f.properties?.bina_id === binaId
                );
                
                if (binaFeature) {
                    const layer = L.geoJSON(binaFeature, {
                        style: {
                            weight: 4,
                            fillOpacity: 1,
                            color: '#ff0000',
                            fillColor: '#ff0000'
                        }
                    }).addTo(binalarLayer);
                    
                    const bounds = layer.getBounds();
                    if (bounds.isValid()) {
                        map.fitBounds(bounds, { padding: [100, 100], maxZoom: 18 });
                    }
                    
                    const binaInfo = {
                        ...binaData,
                        urgentRank: rank
                    };
                    showUrgentBuildingInfo(binaInfo);
                } else {
                    alert('Bina haritada bulunamadı.');
                }
            }
        }
    } catch (error) {
        console.error('Bina haritada gösterilemedi:', error);
        alert('Bina haritada bulunamadı.');
    }
}

// Acil müdahale binası için özel bilgi kartı
function showUrgentBuildingInfo(binaData) {
    document.getElementById('buildingTitle').textContent = `Bina #${binaData.bina_id}`;
    const etapInfo = binaData.etap_adi ? ` | ${binaData.etap_adi}` : '';
    document.getElementById('buildingType').textContent = `${binaData.yapi_turu || '-'} - ${binaData.mahalle_adi || ''}${etapInfo}`;
    const emoji = { 'Düşük': '🟢', 'Orta': '🟡', 'Yüksek': '🔴', 'Çok Yüksek': '⛔' }[binaData.risk_kategorisi] || '🟢';
    
    // Acil müdahale sırası bilgisini ekle
    const urgentInfo = binaData.urgentRank ? 
        `<div class="detail-item" style="background: rgba(220, 38, 38, 0.1); border-left: 3px solid #dc2626;">
            <div class="detail-label" style="color: #dc2626; font-weight: 700;">🚨 Acil Müdahale</div>
            <div class="detail-value" style="color: #dc2626; font-weight: 700;">Bu bina acil müdahale listesinde ${binaData.urgentRank}. sırada</div>
        </div>` : '';
    
    const details = [
        ['ID', binaData.bina_id], 
        ['Mahalle', binaData.mahalle_adi || '-'], 
        ['Etap', binaData.etap_adi || '-'],
        ['Risk', `${emoji} ${binaData.risk_kategorisi}`],
        ['Puan', binaData.risk_puani || 0], 
        ['Yapı', binaData.yapi_turu || '-'], 
        ['Kat', binaData.kat_sayisi || '-'],
        ['Yaş', binaData.bina_yasi ? `${binaData.bina_yasi} yıl` : '-']
    ];
    
    document.getElementById('buildingDetails').innerHTML = urgentInfo + details
        .map(([l, v]) => `<div class="detail-item"><div class="detail-label">${l}</div><div class="detail-value">${v}</div></div>`)
        .join('');
    document.getElementById('buildingPanel').classList.add('visible');
}

// ========== FİNANSAL FİZİBİLİTE ÖZETİ ==========
async function loadFinancialSummary(mahalle = null, etap = null) {
    try {
        // Query parametrelerini hazırla
        const params = new URLSearchParams();
        const selectedMahalle = mahalle || currentMahalle;
        const selectedEtap = etap || currentEtap;
        if (selectedMahalle) {
            params.append('mahalle_adi', selectedMahalle);
        }
        if (selectedEtap) {
            params.append('etap_adi', selectedEtap);
        }
        
        const url = `/api/financial-summary${params.toString() ? '?' + params.toString() : ''}`;
        const response = await fetch(url);
        const data = await response.json();
        const contentContainer = document.getElementById('financialSummaryContent');
        
        if (!contentContainer) return;
        
        // Para formatı fonksiyonu
        const formatMoney = (value) => {
            if (value >= 1e12) return (value / 1e12).toFixed(2) + ' Trilyon TL';
            if (value >= 1e9) return (value / 1e9).toFixed(2) + ' Milyar TL';
            if (value >= 1e6) return (value / 1e6).toFixed(1) + ' Milyon TL';
            return value.toLocaleString('tr-TR') + ' TL';
        };
        
        const toplamYatirim = parseFloat(data.toplam_yatirim || 0);
        const ortalamaMaliyet = parseFloat(data.ortalama_maliyet || 0);
        const toplamBina = parseInt(data.toplam_bina || 0);
        
        // Bağlam bilgisi (hangi seviyede gösteriliyor)
        let contextText = 'Tüm ilçe için';
        if (currentEtap && currentMahalle) {
            contextText = `${currentMahalle} - ${currentEtap} için`;
        } else if (currentMahalle) {
            contextText = `${currentMahalle} mahallesi için`;
        }
        
        if (toplamBina === 0) {
            contentContainer.innerHTML = `
                <div class="urgent-empty-state">
                    <div class="urgent-empty-icon">📊</div>
                    <div class="urgent-empty-text">${contextText} finansal veri bulunamadı.</div>
                </div>
            `;
            return;
        }
        
        contentContainer.innerHTML = `
            <div class="financial-stat-row">
                <div class="financial-stat">
                    <div class="financial-stat-label">Toplam Yatırım</div>
                    <div class="financial-stat-value">${formatMoney(toplamYatirim)}</div>
                    <div class="financial-stat-subtext">${contextText}</div>
                </div>
                <div class="financial-stat financial-stat-right">
                    <div class="financial-stat-label">Toplam Bina Sayısı</div>
                    <div class="financial-stat-value">${toplamBina.toLocaleString('tr-TR')}</div>
                    <div class="financial-stat-subtext">Dönüşüm planında</div>
                </div>
            </div>
            <div class="financial-stat">
                <div class="financial-stat-label">Ortalama Bina Maliyeti</div>
                <div class="financial-stat-value">${formatMoney(ortalamaMaliyet)}</div>
                <div class="financial-stat-subtext">Bina başına ortalama</div>
            </div>
        `;
    } catch (error) {
        console.error('Finansal özet yüklenemedi:', error);
        const contentContainer = document.getElementById('financialSummaryContent');
        if (contentContainer) {
            contentContainer.innerHTML = `
                <div class="urgent-empty-state">
                    <div class="urgent-empty-icon">⚠️</div>
                    <div class="urgent-empty-text">Veri yüklenirken bir hata oluştu.</div>
                </div>
            `;
        }
    }
}

// ========== YAPILAŞMA STRATEJİSİ KARAR ==========
async function loadModelDecision(mahalle = null, etap = null) {
    try {
        console.log('Strateji karar verisi yükleniyor...');
        
        // Query parametrelerini hazırla
        const params = new URLSearchParams();
        const selectedMahalle = mahalle || currentMahalle;
        const selectedEtap = etap || currentEtap;
        if (selectedMahalle) {
            params.append('mahalle_adi', selectedMahalle);
        }
        if (selectedEtap) {
            params.append('etap_adi', selectedEtap);
        }
        
        const url = `/api/strategy-decision${params.toString() ? '?' + params.toString() : ''}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Model karar verisi:', data);
        
        const contentContainer = document.getElementById('modelDecisionContent');
        
        if (!contentContainer) {
            console.error('modelDecisionContent elementi bulunamadı!');
            return;
        }
        
        if (!data || !data.talep_dagilimi) {
            console.warn('Strateji karar verisi bulunamadı:', data);
            contentContainer.innerHTML = `
                <div class="urgent-empty-state">
                    <div class="urgent-empty-icon">📊</div>
                    <div class="urgent-empty-text">Strateji karar verisi bulunamadı.</div>
                </div>
            `;
            return;
        }
        
        const yerindeYuzde = data.talep_dagilimi.yerinde.yuzde || 0;
        const rezervYuzde = data.talep_dagilimi.rezerv.yuzde || 0;
        const nakitYuzde = data.talep_dagilimi.nakit.yuzde || 0;
        const sistemOnerisi = data.sistem_onerisi || 'Belirlenemedi';
        const gerekce = data.gerekce || '';
        const renk = data.renk || '#06b6d4';
        
        // Chart container HTML'i
        const chartHtml = `
            <div class="model-chart-container">
                <canvas id="modelDecisionChart"></canvas>
            </div>
        `;
        
        // Decision box HTML'i
        const decisionHtml = `
            <div class="model-decision-box">
                <div class="decision-alert" style="border-left-color: ${renk};">
                    <div class="decision-alert-title">Sistem Önerisi</div>
                    <div class="decision-alert-value" style="color: ${renk};">${sistemOnerisi}</div>
                    <div class="decision-alert-reason">${gerekce}</div>
                </div>
            </div>
        `;
        
        contentContainer.innerHTML = chartHtml + decisionHtml;
        
        // Chart.js ile Pie Chart oluştur - kısa bir gecikme ile canvas'ın render edilmesini bekle
        setTimeout(() => {
            if (typeof Chart === 'undefined') {
                console.error('Chart.js yüklenmemiş!');
                return;
            }
            
            const ctx = document.getElementById('modelDecisionChart');
            if (!ctx) {
                console.error('modelDecisionChart canvas elementi bulunamadı!');
                return;
            }
            
            console.log('Chart oluşturuluyor - Yerinde:', yerindeYuzde, 'Rezerv:', rezervYuzde, 'Nakit:', nakitYuzde);
            
            // Eğer önceki chart varsa destroy et
            if (charts.modelDecision) {
                charts.modelDecision.destroy();
            }
            
            // Eğer veri yoksa, varsayılan değerler göster
            const yerindeData = yerindeYuzde > 0 ? yerindeYuzde : 0;
            const rezervData = rezervYuzde > 0 ? rezervYuzde : 0;
            const nakitData = nakitYuzde > 0 ? nakitYuzde : 0;
            
            // Eğer hiç veri yoksa, eşit dağıt
            const totalData = yerindeData + rezervData + nakitData;
            const finalYerinde = totalData > 0 ? yerindeData : 33.3;
            const finalRezerv = totalData > 0 ? rezervData : 33.3;
            const finalNakit = totalData > 0 ? nakitData : 33.4;
            
            charts.modelDecision = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Yerinde Dönüşüm', 'Rezerv Alan', 'Nakit Devir'],
                    datasets: [{
                        data: [finalYerinde, finalRezerv, finalNakit],
                        backgroundColor: [
                            '#3b82f6', // Mavi - Yerinde Dönüşüm
                            '#f59e0b', // Turuncu - Rezerv Alan
                            '#10b981'  // Yeşil - Nakit Devir
                        ],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'bottom',
                            labels: {
                                color: '#f1f5f9',
                                font: {
                                    family: 'Inter',
                                    size: 11
                                },
                                padding: 12
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return context.label + ': %' + context.parsed.toFixed(1);
                                }
                            }
                        }
                    },
                    cutout: '60%'
                },
                plugins: [{
                    id: 'centerText',
                    beforeDraw: function(chart) {
                        const ctx = chart.ctx;
                        const centerX = chart.chartArea.left + (chart.chartArea.right - chart.chartArea.left) / 2;
                        const centerY = chart.chartArea.top + (chart.chartArea.bottom - chart.chartArea.top) / 2;
                        
                        ctx.save();
                        ctx.font = 'bold 16px Inter';
                        ctx.fillStyle = '#f1f5f9';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        
                        const total = finalYerinde + finalRezerv + finalNakit;
                        if (total > 0) {
                            ctx.fillText('%' + total.toFixed(1), centerX, centerY - 8);
                            ctx.font = '11px Inter';
                            ctx.fillStyle = '#64748b';
                            ctx.fillText('Toplam Talep', centerX, centerY + 8);
                        }
                        
                        ctx.restore();
                    }
                }]
            });
            
            console.log('Chart başarıyla oluşturuldu');
        }, 100);
    } catch (error) {
        console.error('Model karar verisi yüklenemedi:', error);
        const contentContainer = document.getElementById('modelDecisionContent');
        if (contentContainer) {
            contentContainer.innerHTML = `
                <div class="urgent-empty-state">
                    <div class="urgent-empty-icon">⚠️</div>
                    <div class="urgent-empty-text">Veri yüklenirken bir hata oluştu.</div>
                </div>
            `;
        }
    }
}

// ========== HUKUKİ TIKANIKLIK RİSKİ ==========
async function loadLegalRisk(mahalle = null, etap = null) {
    try {
        console.log('Hukuki risk verisi yükleniyor...');
        
        // Query parametrelerini hazırla
        const params = new URLSearchParams();
        const selectedMahalle = mahalle || currentMahalle;
        const selectedEtap = etap || currentEtap;
        if (selectedMahalle) {
            params.append('mahalle_adi', selectedMahalle);
        }
        if (selectedEtap) {
            params.append('etap_adi', selectedEtap);
        }
        
        const url = `/api/legal-risk${params.toString() ? '?' + params.toString() : ''}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Hukuki risk verisi:', data);
        
        const contentContainer = document.getElementById('legalRiskContent');
        
        if (!contentContainer) {
            console.error('legalRiskContent elementi bulunamadı!');
            return;
        }
        
        if (!data || data.total_buildings === undefined) {
            console.warn('Hukuki risk verisi bulunamadı:', data);
            contentContainer.innerHTML = `
                <div class="urgent-empty-state">
                    <div class="urgent-empty-icon">📊</div>
                    <div class="urgent-empty-text">Hukuki risk verisi bulunamadı.</div>
                </div>
            `;
            return;
        }
        
        const riskScore = data.risk_score || 0;
        const davaliCount = data.davali_count || 0;
        const riskliMulkiyet = data.riskli_mulkiyet || 0;
        const avgHissedar = data.avg_hissedar || 0;
        const riskMesaji = data.risk_mesaji || '';
        const riskRenk = data.risk_renk || '#06b6d4';
        
        // Gauge chart HTML'i
        const gaugeHtml = `
            <div class="legal-gauge-container">
                <canvas id="legalRiskGauge"></canvas>
            </div>
        `;
        
        // Stats box HTML'i
        const statsHtml = `
            <div class="legal-stats-box">
                <div class="legal-stat-item">
                    <div class="legal-stat-icon">🛑</div>
                    <div class="legal-stat-info">
                        <div class="legal-stat-label">Davalı Dosya</div>
                        <div class="legal-stat-value">${davaliCount}</div>
                    </div>
                </div>
                <div class="legal-stat-item">
                    <div class="legal-stat-icon">⚠️</div>
                    <div class="legal-stat-info">
                        <div class="legal-stat-label">Kritik Mülkiyet</div>
                        <div class="legal-stat-value">${riskliMulkiyet}</div>
                    </div>
                </div>
                <div class="legal-stat-item">
                    <div class="legal-stat-icon">👥</div>
                    <div class="legal-stat-info">
                        <div class="legal-stat-label">Ort. Hissedar</div>
                        <div class="legal-stat-value">${avgHissedar}</div>
                    </div>
                </div>
            </div>
        `;
        
        // Footer HTML'i
        const footerHtml = `
            <div class="legal-risk-footer">
                <div class="legal-risk-message" style="color: ${riskRenk};">${riskMesaji}</div>
            </div>
        `;
        
        contentContainer.innerHTML = gaugeHtml + statsHtml + footerHtml;
        
        // Chart.js ile Gauge Chart oluştur (Doughnut chart kullanarak)
        setTimeout(() => {
            if (typeof Chart === 'undefined') {
                console.error('Chart.js yüklenmemiş!');
                return;
            }
            
            const ctx = document.getElementById('legalRiskGauge');
            if (!ctx) {
                console.error('legalRiskGauge canvas elementi bulunamadı!');
                return;
            }
            
            console.log('Gauge chart oluşturuluyor - Risk Score:', riskScore);
            
            // Eğer önceki chart varsa destroy et
            if (charts.legalRisk) {
                charts.legalRisk.destroy();
            }
            
            // Gauge için renk belirleme
            let gaugeColor = '#10b981'; // Yeşil
            if (riskScore >= 70) {
                gaugeColor = '#f43f5e'; // Kırmızı
            } else if (riskScore >= 40) {
                gaugeColor = '#f59e0b'; // Sarı
            }
            
            // Gauge chart (doughnut chart ile simüle edilmiş)
            // Risk skorunu daha görünür yapmak için minimum %10 göster
            const displayScore = Math.max(riskScore, 10);
            const remaining = 100 - displayScore;
            
            charts.legalRisk = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Risk Skoru', 'Kalan'],
                    datasets: [{
                        data: [displayScore, remaining],
                        backgroundColor: [
                            gaugeColor,
                            'rgba(45, 58, 79, 0.3)' // Daha görünür koyu gri
                        ],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    cutout: '75%',
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            enabled: true,
                            callbacks: {
                                label: function(context) {
                                    if (context.label === 'Risk Skoru') {
                                        return `Risk Skoru: ${riskScore.toFixed(1)}/100`;
                                    }
                                    return '';
                                }
                            }
                        }
                    }
                },
                plugins: [{
                    id: 'centerText',
                    beforeDraw: function(chart) {
                        const ctx = chart.ctx;
                        const centerX = chart.chartArea.left + (chart.chartArea.right - chart.chartArea.left) / 2;
                        const centerY = chart.chartArea.top + (chart.chartArea.bottom - chart.chartArea.top) / 2;
                        
                        ctx.save();
                        ctx.font = 'bold 32px Inter';
                        ctx.fillStyle = gaugeColor;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(riskScore.toFixed(2) + '%', centerX, centerY - 10);
                        
                        ctx.font = '12px Inter';
                        ctx.fillStyle = '#64748b';
                        ctx.fillText('Risk Skoru', centerX, centerY + 15);
                        
                        ctx.restore();
                    }
                }]
            });
            
            console.log('Gauge chart başarıyla oluşturuldu');
        }, 100);
    } catch (error) {
        console.error('Hukuki risk verisi yüklenemedi:', error);
        const contentContainer = document.getElementById('legalRiskContent');
        if (contentContainer) {
            contentContainer.innerHTML = `
                <div class="urgent-empty-state">
                    <div class="urgent-empty-icon">⚠️</div>
                    <div class="urgent-empty-text">Veri yüklenirken bir hata oluştu.</div>
                </div>
            `;
        }
    }
}

// ========== AKILLI İNŞAAT TAKVİMİ ==========
async function loadConstructionSchedule(mahalle = null, etap = null) {
    try {
        console.log('İnşaat takvimi verisi yükleniyor...');
        
        // Query parametrelerini hazırla
        const params = new URLSearchParams();
        const selectedMahalle = mahalle || currentMahalle;
        const selectedEtap = etap || currentEtap;
        if (selectedMahalle) {
            params.append('mahalle_adi', selectedMahalle);
        }
        if (selectedEtap) {
            params.append('etap_adi', selectedEtap);
        }
        
        const url = `/api/construction-schedule${params.toString() ? '?' + params.toString() : ''}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('İnşaat takvimi verisi:', data);
        
        const contentContainer = document.getElementById('constructionScheduleContent');
        
        if (!contentContainer) {
            console.error('constructionScheduleContent elementi bulunamadı!');
            return;
        }
        
        if (!data || !data.recommended_start_date) {
            console.warn('İnşaat takvimi verisi bulunamadı:', data);
            contentContainer.innerHTML = `
                <div class="urgent-empty-state">
                    <div class="urgent-empty-icon">📅</div>
                    <div class="urgent-empty-text">İnşaat takvimi verisi bulunamadı.</div>
                </div>
            `;
            return;
        }
        
        // Tarih formatlama
        const formatDate = (dateString) => {
            const date = new Date(dateString);
            const ayIsimleri = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 
                               'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
            return `${date.getDate()} ${ayIsimleri[date.getMonth()]} ${date.getFullYear()}`;
        };
        
        const startDate = formatDate(data.recommended_start_date);
        const toplamSure = data.toplam_sure_ay || 0;
        const mevsimTercihi = data.mevsim_tercihi || 'İlkbahar';
        const avgYikim = data.avg_yikim || 45;
        const avgYapim = data.avg_yapim || 18;
        const dateAdjusted = data.date_adjusted || false;
        const adjustmentReason = data.adjustment_reason || '';
        
        // Süreleri gün cinsinden hesapla (timeline genişlikleri için)
        const yikimGun = avgYikim;
        const ruhsatGun = 30; // Sabit
        const insaatGun = avgYapim * 30; // Ay'ı güne çevir
        const toplamGun = yikimGun + ruhsatGun + insaatGun;
        
        // Genişlik yüzdeleri
        const yikimYuzde = (yikimGun / toplamGun) * 100;
        const ruhsatYuzde = (ruhsatGun / toplamGun) * 100;
        const insaatYuzde = (insaatGun / toplamGun) * 100;
        
        // Alternatif tarihleri hesapla
        const recommendedDate = new Date(data.recommended_start_date);
        const alternativeDates = [];
        
        // 1 ay önce
        const alt1 = new Date(recommendedDate);
        alt1.setMonth(alt1.getMonth() - 1);
        alternativeDates.push({ date: alt1, label: '1 Ay Önce' });
        
        // 2 ay önce
        const alt2 = new Date(recommendedDate);
        alt2.setMonth(alt2.getMonth() - 2);
        alternativeDates.push({ date: alt2, label: '2 Ay Önce' });
        
        // 1 ay sonra
        const alt3 = new Date(recommendedDate);
        alt3.setMonth(alt3.getMonth() + 1);
        alternativeDates.push({ date: alt3, label: '1 Ay Sonra' });
        
        // Mevsim sebebi açıklaması
        const mevsimSebebi = mevsimTercihi === 'İlkbahar' 
            ? 'İlkbahar ayları (Mart-Nisan-Mayıs) inşaat için en uygun dönemdir. Hava koşulları elverişli ve beton dökümü için ideal sıcaklıklar sağlanır.'
            : mevsimTercihi === 'Yaz'
            ? 'Yaz ayları (Haziran-Temmuz-Ağustos) hızlı ilerleme sağlar ancak aşırı sıcaklar beton kalitesini etkileyebilir. Gölgelendirme ve su takviyesi gerekebilir.'
            : mevsimTercihi === 'Sonbahar'
            ? 'Sonbahar ayları (Eylül-Ekim-Kasım) dengeli bir seçenektir. Hava koşulları genellikle uygundur ancak yağış riski artabilir.'
            : 'Kış ayları (Aralık-Ocak-Şubat) inşaat için en zorlu dönemdir. Soğuk hava beton dökümünü engelleyebilir ve iş güvenliği riskleri artar.';
        
        // Başlangıç tarihi sebebi
        const baslangicSebebi = dateAdjusted 
            ? adjustmentReason
            : `Önerilen başlangıç tarihi, yıkım süresi (${avgYikim} gün) ve temel kazısı dönemini (30 gün) göz önünde bulundurarak hesaplanmıştır. Temel kazısı ve beton dökümü kış aylarına denk gelmeyecek şekilde planlanmıştır.`;
        
        // Sol taraf (küçültülmüş kartlar)
        const leftSectionHtml = `
            <div class="timeline-left-section">
                <div class="timeline-summary-badges">
                    <div class="timeline-badge">
                        <div class="timeline-badge-label">🚀 Önerilen Başlangıç</div>
                        <div class="timeline-badge-value green">${startDate}</div>
                    </div>
                    <div class="timeline-badge">
                        <div class="timeline-badge-label">⏳ Toplam Süre</div>
                        <div class="timeline-badge-value">${toplamSure} Ay</div>
                    </div>
                    <div class="timeline-badge">
                        <div class="timeline-badge-label">🌦️ İdeal Mevsim</div>
                        <div class="timeline-badge-value">${mevsimTercihi}</div>
                    </div>
                </div>
                
                <div class="timeline-visual">
                    <div class="timeline-phase yikim" style="flex: ${yikimYuzde}">
                        Yıkım: ${avgYikim} Gün
                    </div>
                    <div class="timeline-phase ruhsat" style="flex: ${ruhsatYuzde}">
                        Prosedür: 30 Gün
                    </div>
                    <div class="timeline-phase insaat" style="flex: ${insaatYuzde}">
                        Yapım: ${avgYapim} Ay
                    </div>
                </div>
            </div>
        `;
        
        // Sağ taraf (detaylar - 2 sütunlu)
        const rightSectionHtml = `
            <div class="timeline-right-section">
                <div class="timeline-right-left">
                    <div class="timeline-detail-card">
                        <div class="timeline-detail-title">📋 Önerilen Başlangıç Tarihinin Sebebi</div>
                        <div class="timeline-detail-content">${baslangicSebebi}</div>
                    </div>
                    
                    <div class="timeline-detail-card">
                        <div class="timeline-detail-title">🌦️ İdeal Mevsimin Sebebi</div>
                        <div class="timeline-detail-content">${mevsimSebebi}</div>
                    </div>
                </div>
                
                <div class="timeline-right-right">
                    <div class="timeline-detail-card">
                        <div class="timeline-detail-title">📅 Alternatif Başlangıç Tarihleri</div>
                        <div class="timeline-alternative-dates">
                            ${alternativeDates.map(alt => `
                                <div class="timeline-alt-date">
                                    <div class="timeline-alt-label">${alt.label}</div>
                                    <div class="timeline-alt-value">${formatDate(alt.date.toISOString())}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Ana içerik (flexbox ile yan yana)
        const mainContentHtml = `
            <div class="timeline-main-content">
                ${leftSectionHtml}
                ${rightSectionHtml}
            </div>
        `;
        
        contentContainer.innerHTML = mainContentHtml;
        
        console.log('İnşaat takvimi başarıyla yüklendi');
    } catch (error) {
        console.error('İnşaat takvimi verisi yüklenemedi:', error);
        const contentContainer = document.getElementById('constructionScheduleContent');
        if (contentContainer) {
            contentContainer.innerHTML = `
                <div class="urgent-empty-state">
                    <div class="urgent-empty-icon">⚠️</div>
                    <div class="urgent-empty-text">Veri yüklenirken bir hata oluştu.</div>
                </div>
            `;
        }
    }
}

// ========== SOSYAL ANALİZ VE İKNA STRATEJİSİ ==========
async function loadSocialProfile(mahalle = null, etap = null) {
    try {
        console.log('Sosyal profil verisi yükleniyor...');
        
        // Query parametrelerini hazırla
        const params = new URLSearchParams();
        const selectedMahalle = mahalle || currentMahalle;
        const selectedEtap = etap || currentEtap;
        if (selectedMahalle) {
            params.append('mahalle_adi', selectedMahalle);
        }
        if (selectedEtap) {
            params.append('etap_adi', selectedEtap);
        }
        
        const url = `/api/social-profile${params.toString() ? '?' + params.toString() : ''}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Sosyal profil verisi:', data);
        
        const contentContainer = document.getElementById('socialProfileContent');
        const cardHeader = document.querySelector('.social-card-header');
        
        if (!contentContainer) {
            console.error('socialProfileContent elementi bulunamadı!');
            return;
        }
        
        // Bağlam bilgisi (hangi seviyede gösteriliyor)
        let contextText = '';
        if (currentEtap && currentMahalle) {
            contextText = `${currentMahalle} - ${currentEtap}`;
        } else if (currentMahalle) {
            contextText = currentMahalle;
        }
        
        // Kart başlığına mahalle adını ekle
        if (cardHeader) {
            let contextElement = cardHeader.querySelector('.social-card-context');
            if (contextText) {
                if (!contextElement) {
                    contextElement = document.createElement('div');
                    contextElement.className = 'social-card-context';
                    cardHeader.appendChild(contextElement);
                }
                contextElement.textContent = contextText;
            } else if (contextElement) {
                contextElement.remove();
            }
        }
        
        if (!data || !data.avg_age) {
            console.warn('Sosyal profil verisi bulunamadı:', data);
            contentContainer.innerHTML = `
                <div class="urgent-empty-state">
                    <div class="urgent-empty-icon">👥</div>
                    <div class="urgent-empty-text">Sosyal profil verisi bulunamadı.</div>
                </div>
            `;
            return;
        }
        
        const avgAge = data.avg_age || 0;
        const dusukYuzde = data.income_distribution.dusuk.yuzde || 0;
        const ortaYuzde = data.income_distribution.orta.yuzde || 0;
        const yuksekYuzde = data.income_distribution.yuksek.yuzde || 0;
        const strategy = data.strategy || { oneri: '', mesaj: '', renk: '#10b981' };
        
        // İçerik HTML - Yaş ortalaması, gelir grafiği ve kampanya dili birlikte
        const contentHtml = `
            <div class="social-content-wrapper">
                <div class="social-age-text">
                    <span class="social-age-label-inline">Yaş Ortalaması:</span>
                    <span class="social-age-value-inline">${Math.round(avgAge)} Yaş</span>
                </div>
                
                <div class="social-income-section">
                    <div class="social-income-chart-label">Gelir Düzeyi</div>
                    <div class="social-chart-strategy-row">
                        <div class="social-income-chart-container">
                            <div class="social-income-chart">
                                <canvas id="socialIncomeChart"></canvas>
                            </div>
                        </div>
                        <div class="social-strategy-inline" style="border-left-color: ${strategy.renk};">
                            <div class="social-strategy-title">Önerilen Kampanya Dili</div>
                            <div class="social-strategy-message">${strategy.mesaj}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        contentContainer.innerHTML = contentHtml;
        
        // Chart.js ile Pie Chart oluştur
        setTimeout(() => {
            if (typeof Chart === 'undefined') {
                console.error('Chart.js yüklenmemiş!');
                return;
            }
            
            const ctx = document.getElementById('socialIncomeChart');
            if (!ctx) {
                console.error('socialIncomeChart canvas elementi bulunamadı!');
                return;
            }
            
            console.log('Gelir dağılımı chart oluşturuluyor - Düşük:', dusukYuzde, 'Orta:', ortaYuzde, 'Yüksek:', yuksekYuzde);
            
            // Eğer önceki chart varsa destroy et
            if (charts.socialIncome) {
                charts.socialIncome.destroy();
            }
            
            // Eğer veri yoksa, varsayılan değerler göster
            const dusukData = dusukYuzde > 0 ? dusukYuzde : 0;
            const ortaData = ortaYuzde > 0 ? ortaYuzde : 0;
            const yuksekData = yuksekYuzde > 0 ? yuksekYuzde : 0;
            
            // Eğer hiç veri yoksa, eşit dağıt
            const totalData = dusukData + ortaData + yuksekData;
            const finalDusuk = totalData > 0 ? dusukData : 33.3;
            const finalOrta = totalData > 0 ? ortaData : 33.3;
            const finalYuksek = totalData > 0 ? yuksekData : 33.4;
            
            charts.socialIncome = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Düşük', 'Orta', 'Yüksek'],
                    datasets: [{
                        label: 'Gelir Dağılımı (%)',
                        data: [finalDusuk, finalOrta, finalYuksek],
                        backgroundColor: [
                            '#ef4444', // Kırmızı - Düşük
                            '#f59e0b', // Turuncu - Orta
                            '#10b981'  // Yeşil - Yüksek
                        ],
                        borderWidth: 0,
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return context.label + ': %' + context.parsed.y.toFixed(1);
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                            ticks: {
                                color: '#94a3b8',
                                font: {
                                    family: 'Inter',
                                    size: 10
                                },
                                callback: function(value) {
                                    return value + '%';
                                }
                            },
                            grid: {
                                color: 'rgba(148, 163, 184, 0.1)'
                            }
                        },
                        x: {
                            ticks: {
                                color: '#94a3b8',
                                font: {
                                    family: 'Inter',
                                    size: 11
                                }
                            },
                            grid: {
                                display: false
                            }
                        }
                    }
                }
            });
            
            console.log('Gelir dağılımı chart başarıyla oluşturuldu');
        }, 100);
    } catch (error) {
        console.error('Sosyal profil verisi yüklenemedi:', error);
        const contentContainer = document.getElementById('socialProfileContent');
        if (contentContainer) {
            contentContainer.innerHTML = `
                <div class="urgent-empty-state">
                    <div class="urgent-empty-icon">⚠️</div>
                    <div class="urgent-empty-text">Veri yüklenirken bir hata oluştu.</div>
                </div>
            `;
        }
    }
}



async function init() {
    try {
        initMap();
        setupPage();
        
        document.getElementById('backBtn')?.addEventListener('click', resetToMahalleler);
        document.getElementById('closeBuildingPanel')?.addEventListener('click', closeBuildingPanel);

        await loadStatistics();
        await loadMahalleSinirlari();
        await loadUrgentBuildings();
        
        await loadFinancialSummary();
        await loadModelDecision();
        await loadLegalRisk();
        await loadConstructionSchedule();
        await loadSocialProfile();
        await loadInfrastructureImpact();

        setTimeout(() => document.getElementById('loadingOverlay')?.classList.add('hidden'), 500);
    } catch (error) {
        console.error('Başlatma hatası:', error);
        document.getElementById('loadingOverlay')?.classList.add('hidden');
    }
}

// Şehircilik Etki Simülasyonu Kartı
async function loadInfrastructureImpact(mahalle = null, etap = null) {
    try {
        let url = '/api/infrastructure-impact';
        const params = new URLSearchParams();
        
        const selectedMahalle = mahalle || currentMahalle;
        const selectedEtap = etap || currentEtap;
        if (selectedMahalle) {
            params.append('mahalle_adi', selectedMahalle);
        }
        if (selectedEtap) {
            params.append('etap_adi', selectedEtap);
        }
        
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Altyapı etki simülasyonu verisi:', data);
        
        const contentContainer = document.getElementById('infrastructureImpactContent');
        const cardHeader = document.querySelector('.infrastructure-card-header');
        
        if (!contentContainer) {
            console.error('infrastructureImpactContent elementi bulunamadı!');
            return;
        }
        
        // Bağlam bilgisi (hangi seviyede gösteriliyor)
        let contextText = '';
        if (currentEtap && currentMahalle) {
            contextText = `${currentMahalle} - ${currentEtap}`;
        } else if (currentMahalle) {
            contextText = currentMahalle;
        }
        
        // Kart başlığına mahalle adını ekle
        if (cardHeader) {
            let contextElement = cardHeader.querySelector('.infrastructure-card-context');
            if (contextText) {
                if (!contextElement) {
                    contextElement = document.createElement('div');
                    contextElement.className = 'infrastructure-card-context';
                    cardHeader.appendChild(contextElement);
                }
                contextElement.textContent = contextText;
            } else if (contextElement) {
                contextElement.remove();
            }
        }
        
        if (!data || !data.population) {
            console.warn('Altyapı etki simülasyonu verisi bulunamadı:', data);
            contentContainer.innerHTML = `
                <div class="urgent-empty-state">
                    <div class="urgent-empty-icon">🏙️</div>
                    <div class="urgent-empty-text">Altyapı etki simülasyonu verisi bulunamadı.</div>
                </div>
            `;
            return;
        }
        
        const { population, infrastructure, message } = data;
        
        // İstatistik kartları HTML
        const statsHtml = `
            <div class="infrastructure-stats-grid">
                <div class="infrastructure-stat-card">
                    <div class="infrastructure-stat-label">Mevcut Nüfus</div>
                    <div class="infrastructure-stat-value">${population.current.toLocaleString('tr-TR')}</div>
                    <div class="infrastructure-stat-change">→ ${population.future.toLocaleString('tr-TR')} (${population.change_rate}% artış)</div>
                </div>
                <div class="infrastructure-stat-card">
                    <div class="infrastructure-stat-label">Okul İhtiyacı</div>
                    <div class="infrastructure-stat-value">${infrastructure.school_need.current}</div>
                    <div class="infrastructure-stat-change">→ ${infrastructure.school_need.future} okul</div>
                </div>
                <div class="infrastructure-stat-card">
                    <div class="infrastructure-stat-label">Yeşil Alan İhtiyacı</div>
                    <div class="infrastructure-stat-value">${infrastructure.green_space.required_hectar.toFixed(2)}</div>
                    <div class="infrastructure-stat-change">hektar (${infrastructure.green_space.required_m2.toLocaleString('tr-TR')} m²)</div>
                </div>
            </div>
        `;
        
        // Uyarı kutusu HTML
        const alertClass = infrastructure.school_need.status === 'CRITICAL' ? 'infrastructure-alert-critical' : 'infrastructure-alert-ok';
        const alertHtml = `
            <div class="infrastructure-alert-box ${alertClass}">
                <div class="infrastructure-alert-title">⚠️ Altyapı Değerlendirmesi</div>
                <div class="infrastructure-alert-message">${message}</div>
            </div>
        `;
        
        contentContainer.innerHTML = statsHtml + alertHtml;
        
    } catch (error) {
        console.error('Altyapı etki simülasyonu verisi yüklenemedi:', error);
        const contentContainer = document.getElementById('infrastructureImpactContent');
        if (contentContainer) {
            contentContainer.innerHTML = `
                <div class="urgent-empty-state">
                    <div class="urgent-empty-icon">⚠️</div>
                    <div class="urgent-empty-text">Veri yüklenirken bir hata oluştu.</div>
                </div>
            `;
        }
    }
}

// ========== RAPOR SİSTEMİ ==========
let reportData = null;

// Rapor modal açma/kapama
document.getElementById('reportBtn')?.addEventListener('click', () => {
    const modal = document.getElementById('reportModal');
    if (modal) {
        modal.classList.add('active');
        loadReportOptions();
    }
});

document.getElementById('reportModalClose')?.addEventListener('click', closeReportModal);
document.getElementById('cancelReportBtn')?.addEventListener('click', closeReportModal);

function closeReportModal() {
    const modal = document.getElementById('reportModal');
    if (modal) {
        modal.classList.remove('active');
        document.getElementById('reportPreview').style.display = 'none';
        document.getElementById('reportMahalle').value = '';
        document.getElementById('reportEtap').value = '';
    }
}

// Mahalle ve etap seçeneklerini yükle
async function loadReportOptions() {
    const mahalleSelect = document.getElementById('reportMahalle');
    const etapSelect = document.getElementById('reportEtap');
    
    if (!mahalleSelect || !etapSelect) return;
    
    // Mahalleleri yükle
    mahalleSelect.innerHTML = '<option value="">Tüm Mahalleler</option>';
    if (allMahalleler && allMahalleler.length > 0) {
        allMahalleler.forEach(mahalle => {
            const option = document.createElement('option');
            option.value = mahalle.ad || mahalle.mahalle_adi;
            option.textContent = mahalle.ad || mahalle.mahalle_adi;
            mahalleSelect.appendChild(option);
        });
    }
    
    // Etapları yükle (mahalle seçilince)
    mahalleSelect.addEventListener('change', async () => {
        const selectedMahalle = mahalleSelect.value;
        etapSelect.innerHTML = '<option value="">Tüm Etaplar</option>';
        
        if (selectedMahalle) {
            try {
                const response = await fetch(`/api/etaplar?mahalle_adi=${encodeURIComponent(selectedMahalle)}`);
                const etaplar = await response.json();
                if (etaplar && etaplar.length > 0) {
                    etaplar.forEach(etap => {
                        const option = document.createElement('option');
                        option.value = etap.etap_adi;
                        option.textContent = etap.etap_adi;
                        etapSelect.appendChild(option);
                    });
                }
            } catch (error) {
                console.error('Etaplar yüklenemedi:', error);
            }
        }
    });
}

// Rapor oluştur
document.getElementById('generateReportBtn')?.addEventListener('click', async () => {
    const mahalle = document.getElementById('reportMahalle')?.value || '';
    const etap = document.getElementById('reportEtap')?.value || '';
    
    if (!mahalle && !etap) {
        alert('Lütfen en az bir mahalle veya etap seçin.');
        return;
    }
    
    try {
        // Tüm verileri topla
        const reportParams = new URLSearchParams();
        if (mahalle) reportParams.append('mahalle_adi', mahalle);
        if (etap) reportParams.append('etap_adi', etap);
        
        const [financial, model, legal, schedule, social, infrastructure, urgent] = await Promise.all([
            fetch(`/api/financial-summary?${reportParams}`).then(r => r.json()),
            fetch(`/api/strategy-decision?${reportParams}`).then(r => r.json()),
            fetch(`/api/legal-risk?${reportParams}`).then(r => r.json()),
            fetch(`/api/construction-schedule?${reportParams}`).then(r => r.json()),
            fetch(`/api/social-profile?${reportParams}`).then(r => r.json()),
            fetch(`/api/infrastructure-impact?${reportParams}`).then(r => r.json()),
            fetch(`/api/urgent-buildings?${reportParams}`).then(r => r.json())
        ]);
        
        reportData = {
            mahalle,
            etap,
            financial,
            model,
            legal,
            schedule,
            social,
            infrastructure,
            urgent
        };
        
        generateReportPreview();
        document.getElementById('reportPreview').style.display = 'block';
    } catch (error) {
        console.error('Rapor oluşturma hatası:', error);
        alert('Rapor oluşturulurken bir hata oluştu.');
    }
});

// Rapor önizlemesi oluştur
function generateReportPreview() {
    const preview = document.getElementById('reportPreviewContent');
    if (!preview || !reportData) return;
    
    const { mahalle, etap, financial, model, legal, schedule, social, infrastructure, urgent } = reportData;
    
    const reportTitle = etap ? `${mahalle} - ${etap}` : mahalle || 'Tüm İlçe';
    const reportDate = new Date().toLocaleDateString('tr-TR', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    let html = `
        <div style="margin-bottom: 30px;">
            <h1 style="font-size: 24px; color: var(--accent-cyan); margin-bottom: 8px;">Bayraklı KDS Raporu</h1>
            <p style="color: var(--text-muted); font-size: 14px;">${reportTitle} • ${reportDate}</p>
        </div>
        
        <div style="margin-bottom: 30px;">
            <h2 style="font-size: 18px; color: var(--text-primary); margin-bottom: 16px; border-bottom: 2px solid var(--accent-cyan); padding-bottom: 8px;">💰 Finansal Fizibilite</h2>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
                <div style="background: var(--bg-primary); padding: 16px; border-radius: 8px;">
                    <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">Toplam Yatırım</div>
                    <div style="font-size: 20px; font-weight: 700; color: var(--accent-cyan);">${(financial?.toplam_yatirim || 0).toLocaleString('tr-TR')} ₺</div>
                </div>
                <div style="background: var(--bg-primary); padding: 16px; border-radius: 8px;">
                    <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">Ortalama Bina Maliyeti</div>
                    <div style="font-size: 20px; font-weight: 700; color: var(--accent-cyan);">${(financial?.ortalama_maliyet || 0).toLocaleString('tr-TR')} ₺</div>
                </div>
                <div style="background: var(--bg-primary); padding: 16px; border-radius: 8px;">
                    <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">Toplam Bina Sayısı</div>
                    <div style="font-size: 20px; font-weight: 700; color: var(--accent-cyan);">${(financial?.toplam_bina || 0).toLocaleString('tr-TR')}</div>
                </div>
            </div>
        </div>
        
        <div style="margin-bottom: 30px;">
            <h2 style="font-size: 18px; color: var(--text-primary); margin-bottom: 16px; border-bottom: 2px solid var(--accent-cyan); padding-bottom: 8px;">🏗️ Yapılaşma Stratejisi Analizi</h2>
            <div style="background: var(--bg-primary); padding: 16px; border-radius: 8px;">
                <div style="font-size: 16px; font-weight: 700; color: ${model?.renk || '#10b981'}; margin-bottom: 12px; padding: 12px; background: var(--bg-card); border-radius: 8px; border-left: 4px solid ${model?.renk || '#10b981'};">
                    Sistem Önerisi: ${model?.sistem_onerisi || 'N/A'}
                </div>
                <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.6;">
                    <strong>Gerekçe:</strong> ${model?.gerekce || 'Veri bulunamadı.'}
                </div>
                ${model?.talep_dagilimi ? `
                    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color);">
                        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px; font-weight: 600;">Talep Dağılımı:</div>
                        <div style="font-size: 13px; color: var(--text-secondary);">
                            ${model.talep_dagilimi.yerinde ? `<div style="margin-bottom: 4px;">• Yerinde Dönüşüm: ${model.talep_dagilimi.yerinde.sayi || 0} kişi (${model.talep_dagilimi.yerinde.yuzde || 0}%)</div>` : ''}
                            ${model.talep_dagilimi.rezerv ? `<div style="margin-bottom: 4px;">• Rezerv Alan: ${model.talep_dagilimi.rezerv.sayi || 0} kişi (${model.talep_dagilimi.rezerv.yuzde || 0}%)</div>` : ''}
                            ${model.talep_dagilimi.nakit ? `<div style="margin-bottom: 4px;">• Nakit Devir: ${model.talep_dagilimi.nakit.sayi || 0} kişi (${model.talep_dagilimi.nakit.yuzde || 0}%)</div>` : ''}
                            ${model.talep_dagilimi.toplam ? `<div style="margin-top: 8px; font-weight: 600; color: var(--text-primary);">Toplam: ${model.talep_dagilimi.toplam} kişi</div>` : ''}
                        </div>
                    </div>
                ` : ''}
                ${model?.zemin_risk_puani !== undefined ? `
                    <div style="margin-top: 8px; font-size: 13px; color: var(--text-secondary);">
                        <strong>Zemin Risk Puanı:</strong> ${model.zemin_risk_puani.toFixed(2)}
                    </div>
                ` : ''}
            </div>
        </div>
        
        <div style="margin-bottom: 30px;">
            <h2 style="font-size: 18px; color: var(--text-primary); margin-bottom: 16px; border-bottom: 2px solid var(--accent-cyan); padding-bottom: 8px;">⚖️ Hukuki Tıkanıklık İndeksi</h2>
            <div style="background: var(--bg-primary); padding: 16px; border-radius: 8px;">
                <div style="font-size: 32px; font-weight: 700; color: ${legal?.risk_renk || legal?.riskColor || '#ef4444'}; margin-bottom: 12px;">${(legal?.risk_score || legal?.riskScore || 0).toFixed(2)}%</div>
                <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Davalı Dosya: ${legal?.davali_count || 0}</div>
                <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Kritik Mülkiyet: ${legal?.riskli_mulkiyet || 0}</div>
                <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Ort. Hissedar: ${(legal?.avg_hissedar || 0).toFixed(1)}</div>
                <div style="font-size: 14px; color: ${legal?.risk_renk || legal?.riskColor || '#ef4444'}; font-weight: 600; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color);">${legal?.risk_mesaji || legal?.riskMessage || 'Değerlendirme yapılamadı.'}</div>
            </div>
        </div>
        
        <div style="margin-bottom: 30px;">
            <h2 style="font-size: 18px; color: var(--text-primary); margin-bottom: 16px; border-bottom: 2px solid var(--accent-cyan); padding-bottom: 8px;">📅 Operasyonel Zaman Çizelgesi ve Mevsim Analizi</h2>
            <div style="background: var(--bg-primary); padding: 16px; border-radius: 8px;">
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px;">
                    <div style="padding: 12px; background: var(--bg-card); border-radius: 8px;">
                        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Önerilen Başlangıç</div>
                        <div style="font-size: 14px; font-weight: 700; color: #10b981;">${schedule?.recommended_start_date ? new Date(schedule.recommended_start_date).toLocaleDateString('tr-TR') : 'N/A'}</div>
                    </div>
                    <div style="padding: 12px; background: var(--bg-card); border-radius: 8px;">
                        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Toplam Süre</div>
                        <div style="font-size: 14px; font-weight: 700; color: var(--text-primary);">${schedule?.toplam_sure_ay || 0} Ay</div>
                    </div>
                    <div style="padding: 12px; background: var(--bg-card); border-radius: 8px;">
                        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">İdeal Mevsim</div>
                        <div style="font-size: 14px; font-weight: 700; color: var(--text-primary);">${schedule?.mevsim_tercihi || 'N/A'}</div>
                    </div>
                </div>
                ${schedule?.date_adjusted ? `
                    <div style="padding: 12px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b; margin-top: 12px;">
                        <div style="font-size: 13px; color: #92400e; font-weight: 600; margin-bottom: 4px;">⚠️ Dikkat</div>
                        <div style="font-size: 12px; color: #78350f;">${schedule?.adjustment_reason || 'Başlangıç tarihi optimize edilmiştir.'}</div>
                    </div>
                ` : ''}
                ${schedule?.phases ? `
                    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-color);">
                        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px; font-weight: 600;">Proje Aşamaları:</div>
                        <div style="font-size: 13px; color: var(--text-secondary);">
                            ${schedule.phases.yikim_bitis ? `<div>• Yıkım Bitiş: ${new Date(schedule.phases.yikim_bitis).toLocaleDateString('tr-TR')}</div>` : ''}
                            ${schedule.phases.ruhsat_bitis ? `<div>• Ruhsat Bitiş: ${new Date(schedule.phases.ruhsat_bitis).toLocaleDateString('tr-TR')}</div>` : ''}
                            ${schedule.phases.kaba_insaat_bitis ? `<div>• Kaba İnşaat Bitiş: ${new Date(schedule.phases.kaba_insaat_bitis).toLocaleDateString('tr-TR')}</div>` : ''}
                        </div>
                    </div>
                ` : ''}
            </div>
        </div>
        
        <div style="margin-bottom: 30px;">
            <h2 style="font-size: 18px; color: var(--text-primary); margin-bottom: 16px; border-bottom: 2px solid var(--accent-cyan); padding-bottom: 8px;">🤝 Hak Sahibi Profili & İkna Stratejisi</h2>
            <div style="background: var(--bg-primary); padding: 16px; border-radius: 8px;">
                <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 12px;">
                    <strong>Yaş Ortalaması:</strong> ${Math.round(social?.avg_age || 0)} Yaş
                </div>
                ${social?.income_distribution ? `
                    <div style="margin-bottom: 16px; padding: 12px; background: var(--bg-card); border-radius: 8px;">
                        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px; font-weight: 600;">Gelir Dağılımı:</div>
                        <div style="font-size: 13px; color: var(--text-secondary);">
                            ${social.income_distribution.dusuk ? `<div>• Düşük Gelir: ${social.income_distribution.dusuk.sayi || 0} kişi (${social.income_distribution.dusuk.yuzde || 0}%)</div>` : ''}
                            ${social.income_distribution.orta ? `<div>• Orta Gelir: ${social.income_distribution.orta.sayi || 0} kişi (${social.income_distribution.orta.yuzde || 0}%)</div>` : ''}
                            ${social.income_distribution.yuksek ? `<div>• Yüksek Gelir: ${social.income_distribution.yuksek.sayi || 0} kişi (${social.income_distribution.yuksek.yuzde || 0}%)</div>` : ''}
                        </div>
                    </div>
                ` : ''}
                <div style="padding: 12px; background: var(--bg-card); border-radius: 8px; border-left: 4px solid ${social?.strategy?.renk || '#10b981'};">
                    <div style="font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">Önerilen Kampanya Dili:</div>
                    <div style="font-size: 14px; font-weight: 700; color: ${social?.strategy?.renk || '#10b981'}; margin-bottom: 8px;">${social?.strategy?.oneri || 'N/A'}</div>
                    <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.6;">${social?.strategy?.mesaj || 'Veri bulunamadı.'}</div>
                </div>
            </div>
        </div>
        
        <div style="margin-bottom: 30px;">
            <h2 style="font-size: 18px; color: var(--text-primary); margin-bottom: 16px; border-bottom: 2px solid var(--accent-cyan); padding-bottom: 8px;">🏙️ Şehircilik Etki Simülasyonu</h2>
            <div style="background: var(--bg-primary); padding: 16px; border-radius: 8px;">
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px;">
                    <div style="padding: 12px; background: var(--bg-card); border-radius: 8px;">
                        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Mevcut Nüfus</div>
                        <div style="font-size: 16px; font-weight: 700; color: var(--accent-cyan);">${(infrastructure?.population?.current || 0).toLocaleString('tr-TR')}</div>
                    </div>
                    <div style="padding: 12px; background: var(--bg-card); border-radius: 8px;">
                        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Gelecek Nüfus</div>
                        <div style="font-size: 16px; font-weight: 700; color: var(--accent-emerald);">${(infrastructure?.population?.future || 0).toLocaleString('tr-TR')}</div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">+${infrastructure?.population?.change_rate || 0}% artış</div>
                    </div>
                    <div style="padding: 12px; background: var(--bg-card); border-radius: 8px;">
                        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Okul İhtiyacı</div>
                        <div style="font-size: 16px; font-weight: 700; color: ${infrastructure?.infrastructure?.school_need?.status === 'CRITICAL' ? '#ef4444' : '#10b981'};">
                            ${infrastructure?.infrastructure?.school_need?.current || 0} → ${infrastructure?.infrastructure?.school_need?.future || 0}
                        </div>
                    </div>
                </div>
                ${infrastructure?.infrastructure?.green_space ? `
                    <div style="margin-bottom: 12px; padding: 12px; background: var(--bg-card); border-radius: 8px;">
                        <div style="font-size: 13px; color: var(--text-secondary);">
                            <strong>Yeşil Alan İhtiyacı:</strong> ${infrastructure.infrastructure.green_space.required_hectar.toFixed(2)} hektar 
                            (${infrastructure.infrastructure.green_space.required_m2.toLocaleString('tr-TR')} m²)
                        </div>
                    </div>
                ` : ''}
                <div style="padding: 12px; background: ${infrastructure?.infrastructure?.school_need?.status === 'CRITICAL' ? '#fee2e2' : '#d1fae5'}; border-radius: 8px; border-left: 4px solid ${infrastructure?.infrastructure?.school_need?.status === 'CRITICAL' ? '#ef4444' : '#10b981'};">
                    <div style="font-size: 13px; color: ${infrastructure?.infrastructure?.school_need?.status === 'CRITICAL' ? '#991b1b' : '#065f46'}; line-height: 1.6;">
                        ${infrastructure?.message || 'Veri bulunamadı.'}
                    </div>
                </div>
            </div>
        </div>
        
        <div style="margin-bottom: 30px;">
            <h2 style="font-size: 18px; color: var(--text-primary); margin-bottom: 16px; border-bottom: 2px solid var(--accent-cyan); padding-bottom: 8px;">🚨 Acil Müdahale Listesi</h2>
            <div style="background: var(--bg-primary); padding: 16px; border-radius: 8px;">
                ${urgent && urgent.length > 0 ? urgent.slice(0, 10).map((bina, idx) => `
                    <div style="padding: 8px 0; border-bottom: 1px solid var(--border-color);">
                        <div style="font-size: 14px; font-weight: 600; color: var(--text-primary);">${idx + 1}. ${bina.mahalle_adi || 'N/A'}</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">Risk: ${bina.risk_puani || 0} | Yaş: ${bina.bina_yasi || 0} Yıl</div>
                    </div>
                `).join('') : '<div style="font-size: 14px; color: var(--text-secondary);">Acil müdahale gerektiren bina bulunamadı.</div>'}
            </div>
        </div>
    `;
    
    preview.innerHTML = html;
}

// PDF indirme
document.getElementById('downloadReportBtn')?.addEventListener('click', () => {
    if (!reportData) return;
    
    // jsPDF kütüphanesi yüklü mü kontrol et
    if (typeof window.jsPDF === 'undefined') {
        // jsPDF CDN'den yükle
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script.onload = () => {
            downloadPDF().catch(err => console.error('PDF olusturma hatasi:', err));
        };
        document.head.appendChild(script);
    } else {
        downloadPDF().catch(err => console.error('PDF olusturma hatasi:', err));
    }
});

// Türkçe karakterleri temizle (PDF için)
function cleanTurkishChars(text) {
    if (!text) return '';
    return String(text)
        .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
        .replace(/ü/g, 'u').replace(/Ü/g, 'U')
        .replace(/ş/g, 's').replace(/Ş/g, 'S')
        .replace(/ı/g, 'i').replace(/İ/g, 'I')
        .replace(/ö/g, 'o').replace(/Ö/g, 'O')
        .replace(/ç/g, 'c').replace(/Ç/g, 'C');
}

// Sayı formatla (virgülden sonra 2 hane, binlik ayırıcı nokta)
function formatNumber(num) {
    if (num === null || num === undefined) return '0,00';
    const numValue = parseFloat(num);
    if (isNaN(numValue)) return '0,00';
    return numValue.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

async function downloadPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Türkçe karakter desteği için encoding ayarları
    // jsPDF'in varsayılan fontları Türkçe karakterleri desteklemediği için
    // 'helvetica' fontunu kullanıyoruz ve metinleri doğrudan kullanıyoruz
    // Not: jsPDF'in varsayılan fontları Türkçe karakterleri desteklemediği için
    // karakterler bozuk görünebilir. İdeal çözüm özel font eklemektir.
    doc.setFont('helvetica');
    
    const { mahalle, etap, financial, model, legal, schedule, social, infrastructure, urgent } = reportData;
    const reportTitle = etap ? `${mahalle} - ${etap}` : mahalle || 'Tum Ilce';
    const reportDate = new Date().toLocaleDateString('tr-TR');
    
    let y = 20;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 20;
    
    // Türkçe karakterleri ASCII karakterlere çeviren yardımcı fonksiyon
    // jsPDF'in varsayılan fontları Türkçe karakterleri desteklemediği için
    // Türkçe karakterleri ASCII karakterlere çeviriyoruz
    function encodeTurkish(text) {
        if (!text) return '';
        return String(text)
            .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
            .replace(/ü/g, 'u').replace(/Ü/g, 'U')
            .replace(/ş/g, 's').replace(/Ş/g, 'S')
            .replace(/ı/g, 'i').replace(/İ/g, 'I')
            .replace(/ö/g, 'o').replace(/Ö/g, 'O')
            .replace(/ç/g, 'c').replace(/Ç/g, 'C');
    }
    
    // Sayfa sonu kontrolü ve yeni sayfa ekleme
    function checkPageBreak(requiredSpace = 20) {
        if (y + requiredSpace > pageHeight - margin) {
            doc.addPage();
            y = 20;
        }
    }
    
    // Başlık
    doc.setFontSize(20);
    doc.setTextColor(6, 182, 212);
    doc.text(encodeTurkish('Bayraklı KDS Raporu'), 14, y);
    y += 10;
    
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(encodeTurkish(`${reportTitle} • ${reportDate}`), 14, y);
    y += 15;
    
    // Finansal Fizibilite
    checkPageBreak(30);
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text(encodeTurkish('Finansal Fizibilite'), 14, y);
    y += 10;
    
    doc.setFontSize(11);
    const toplamYatirim = formatNumber(financial?.toplam_yatirim || 0);
    doc.text(encodeTurkish(`Toplam Yatırım: ${toplamYatirim} TL`), 14, y);
    y += 7;
    const ortalamaMaliyet = formatNumber(financial?.ortalama_maliyet || 0);
    doc.text(encodeTurkish(`Ortalama Bina Maliyeti: ${ortalamaMaliyet} TL`), 14, y);
    y += 7;
    doc.text(encodeTurkish(`Toplam Bina Sayısı: ${(financial?.toplam_bina || 0).toLocaleString('tr-TR')}`), 14, y);
    y += 15;
    
    // Yapılaşma Stratejisi
    checkPageBreak(50);
    doc.setFontSize(16);
    doc.text(encodeTurkish('Yapılaşma Stratejisi Analizi'), 14, y);
    y += 10;
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(encodeTurkish(`Sistem Önerisi: ${model?.sistem_onerisi || 'N/A'}`), 14, y);
    y += 8;
    
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.text(encodeTurkish('Gerekçe:'), 14, y);
    y += 7;
    checkPageBreak(10);
    const gerekceText = model?.gerekce || 'Veri bulunamadı.';
    const gerekceLines = doc.splitTextToSize(encodeTurkish(gerekceText), 180);
    gerekceLines.forEach((line) => {
        checkPageBreak(7);
        doc.text(line, 14, y);
        y += 7;
    });
    y += 10;
    
    if (model?.zemin_risk_puani !== undefined) {
        checkPageBreak(7);
        doc.text(encodeTurkish(`Zemin Risk Puanı: ${model.zemin_risk_puani.toFixed(2)}`), 14, y);
        y += 7;
    }
    
    if (model?.talep_dagilimi) {
        checkPageBreak(25);
        doc.text(encodeTurkish('Talep Dağılımı:'), 14, y);
        y += 7;
        
        const talepYerinde = model.talep_dagilimi.yerinde || { sayi: 0, yuzde: 0 };
        const talepRezerv = model.talep_dagilimi.rezerv || { sayi: 0, yuzde: 0 };
        const talepNakit = model.talep_dagilimi.nakit || { sayi: 0, yuzde: 0 };
        const toplamTalep = model.talep_dagilimi.toplam || 0;
        
        if (talepYerinde.sayi > 0 || talepYerinde.yuzde > 0) {
            checkPageBreak(7);
            doc.text(encodeTurkish(`  - Yerinde Dönüşüm: ${talepYerinde.sayi} kişi (${talepYerinde.yuzde}%)`), 14, y);
            y += 6;
        }
        if (talepRezerv.sayi > 0 || talepRezerv.yuzde > 0) {
            checkPageBreak(7);
            doc.text(encodeTurkish(`  - Rezerv Alan: ${talepRezerv.sayi} kişi (${talepRezerv.yuzde}%)`), 14, y);
            y += 6;
        }
        if (talepNakit.sayi > 0 || talepNakit.yuzde > 0) {
            checkPageBreak(7);
            doc.text(encodeTurkish(`  - Nakit Devir: ${talepNakit.sayi} kişi (${talepNakit.yuzde}%)`), 14, y);
            y += 6;
        }
        if (toplamTalep > 0) {
            checkPageBreak(7);
            doc.text(encodeTurkish(`  - Toplam: ${toplamTalep} kişi`), 14, y);
            y += 6;
        }
    }
    y += 8;
    
    // Hukuki Tıkanıklık
    checkPageBreak(40);
    doc.setFontSize(16);
    doc.text(encodeTurkish('Hukuki Tıkanıklık İndeksi'), 14, y);
    y += 10;
    
    doc.setFontSize(11);
    const riskScore = legal?.risk_score || legal?.riskScore || 0;
    doc.text(encodeTurkish(`Risk Skoru: ${riskScore.toFixed(2)}%`), 14, y);
    y += 7;
    doc.text(encodeTurkish(`Davalı Dosya: ${legal?.davali_count || 0}`), 14, y);
    y += 7;
    doc.text(encodeTurkish(`Kritik Mülkiyet: ${legal?.riskli_mulkiyet || 0}`), 14, y);
    y += 7;
    doc.text(encodeTurkish(`Ort. Hissedar: ${(legal?.avg_hissedar || 0).toFixed(1)}`), 14, y);
    y += 7;
    if (legal?.risk_mesaji || legal?.riskMessage) {
        checkPageBreak(10);
        const riskMesajText = legal?.risk_mesaji || legal?.riskMessage || 'Veri bulunamadı.';
        const riskMesajLines = doc.splitTextToSize(encodeTurkish(riskMesajText), 180);
        riskMesajLines.forEach((line) => {
            checkPageBreak(7);
            doc.text(line, 14, y);
            y += 7;
        });
        y += 3;
    }
    y += 8;
    
    // Zaman Çizelgesi
    checkPageBreak(50);
    doc.setFontSize(16);
    doc.text(encodeTurkish('Operasyonel Zaman Çizelgesi ve Mevsim Analizi'), 14, y);
    y += 10;
    
    doc.setFontSize(11);
    const startDate = schedule?.recommended_start_date ? new Date(schedule.recommended_start_date).toLocaleDateString('tr-TR') : 'N/A';
    doc.text(encodeTurkish(`Önerilen Başlangıç: ${startDate}`), 14, y);
    y += 7;
    doc.text(encodeTurkish(`Toplam Süre: ${schedule?.toplam_sure_ay || 0} Ay`), 14, y);
    y += 7;
    doc.text(encodeTurkish(`İdeal Mevsim: ${schedule?.mevsim_tercihi || 'N/A'}`), 14, y);
    y += 7;
    
    if (schedule?.date_adjusted && schedule?.adjustment_reason) {
        checkPageBreak(10);
        doc.setTextColor(245, 158, 11);
        const adjustmentText = `Dikkat: ${schedule.adjustment_reason}`;
        const adjustmentLines = doc.splitTextToSize(encodeTurkish(adjustmentText), 180);
        adjustmentLines.forEach((line) => {
            checkPageBreak(7);
            doc.text(line, 14, y);
            y += 7;
        });
        doc.setTextColor(0, 0, 0);
        y += 3;
    }
    
    if (schedule?.phases) {
        checkPageBreak(20);
        doc.text(encodeTurkish('Proje Aşamaları:'), 14, y);
        y += 7;
        if (schedule.phases.yikim_bitis) {
            checkPageBreak(7);
            doc.text(encodeTurkish(`  - Yıkım Bitiş: ${new Date(schedule.phases.yikim_bitis).toLocaleDateString('tr-TR')}`), 14, y);
            y += 6;
        }
        if (schedule.phases.ruhsat_bitis) {
            checkPageBreak(7);
            doc.text(encodeTurkish(`  - Ruhsat Bitiş: ${new Date(schedule.phases.ruhsat_bitis).toLocaleDateString('tr-TR')}`), 14, y);
            y += 6;
        }
        if (schedule.phases.kaba_insaat_bitis) {
            checkPageBreak(7);
            doc.text(encodeTurkish(`  - Kaba İnşaat Bitiş: ${new Date(schedule.phases.kaba_insaat_bitis).toLocaleDateString('tr-TR')}`), 14, y);
            y += 6;
        }
    }
    y += 8;
    
    // Hak Sahibi Profili
    checkPageBreak(50);
    doc.setFontSize(16);
    doc.text(encodeTurkish('Hak Sahibi Profili ve İkna Stratejisi'), 14, y);
    y += 10;
    
    doc.setFontSize(11);
    const yasOrtalamasi = social?.avg_age ? Math.round(social.avg_age) : 0;
    doc.text(encodeTurkish(`Yaş Ortalaması: ${yasOrtalamasi} Yaş`), 14, y);
    y += 7;
    
    if (social && social.income_distribution) {
        checkPageBreak(30);
        doc.text(encodeTurkish('Gelir Dağılımı:'), 14, y);
        y += 7;
        if (social.income_distribution.dusuk) {
            checkPageBreak(7);
            const dusukSayi = social.income_distribution.dusuk.sayi || 0;
            const dusukYuzde = social.income_distribution.dusuk.yuzde || 0;
            doc.text(encodeTurkish(`  - Düşük Gelir: ${dusukSayi} kişi (${dusukYuzde}%)`), 14, y);
            y += 6;
        }
        if (social.income_distribution.orta) {
            checkPageBreak(7);
            const ortaSayi = social.income_distribution.orta.sayi || 0;
            const ortaYuzde = social.income_distribution.orta.yuzde || 0;
            doc.text(encodeTurkish(`  - Orta Gelir: ${ortaSayi} kişi (${ortaYuzde}%)`), 14, y);
            y += 6;
        }
        if (social.income_distribution.yuksek) {
            checkPageBreak(7);
            const yuksekSayi = social.income_distribution.yuksek.sayi || 0;
            const yuksekYuzde = social.income_distribution.yuksek.yuzde || 0;
            doc.text(encodeTurkish(`  - Yüksek Gelir: ${yuksekSayi} kişi (${yuksekYuzde}%)`), 14, y);
            y += 6;
        }
    }
    
    checkPageBreak(25);
    doc.setFont(undefined, 'bold');
    const kampanyaOneri = social?.strategy?.oneri || 'N/A';
    doc.text(encodeTurkish(`Önerilen Kampanya Dili: ${kampanyaOneri}`), 14, y);
    doc.setFont(undefined, 'normal');
    y += 7;
    
    checkPageBreak(20);
    const kampanyaMesaj = social?.strategy?.mesaj || 'Veri bulunamadı.';
    const mesajLines = doc.splitTextToSize(encodeTurkish(kampanyaMesaj), 180);
    mesajLines.forEach((line) => {
        checkPageBreak(7);
        doc.text(line, 14, y);
        y += 7;
    });
    y += 8;
    
    // Şehircilik Etki
    checkPageBreak(40);
    doc.setFontSize(16);
    doc.text(encodeTurkish('Şehircilik Etki Simülasyonu'), 14, y);
    y += 10;
    
    doc.setFontSize(11);
    const mevcutNufus = Math.round(infrastructure?.population?.current || 0);
    const mevcutNufusStr = mevcutNufus.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    doc.text(encodeTurkish(`Mevcut Nüfus: ${mevcutNufusStr}`), 14, y);
    y += 7;
    checkPageBreak(7);
    const gelecekNufus = Math.round(infrastructure?.population?.future || 0);
    const gelecekNufusStr = gelecekNufus.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const nufusArtis = infrastructure?.population?.change_rate || 0;
    doc.text(encodeTurkish(`Gelecek Nüfus: ${gelecekNufusStr} (+${nufusArtis}% artış)`), 14, y);
    y += 7;
    
    if (infrastructure?.infrastructure?.school_need) {
        checkPageBreak(7);
        const mevcutOkul = Math.round(infrastructure.infrastructure.school_need.current || 0);
        const gelecekOkul = Math.round(infrastructure.infrastructure.school_need.future || 0);
        doc.text(encodeTurkish(`Okul İhtiyacı: ${mevcutOkul} den ${gelecekOkul} okula`), 14, y);
        y += 7;
        if (infrastructure.infrastructure.school_need.status === 'CRITICAL') {
            checkPageBreak(7);
            doc.setTextColor(239, 68, 68);
            doc.text(encodeTurkish('KRİTİK: Yeni okul gereklidir!'), 14, y);
            doc.setTextColor(0, 0, 0);
            y += 7;
        }
    }
    
    if (infrastructure?.infrastructure?.green_space) {
        checkPageBreak(7);
        const yesilAlanHektar = parseFloat(infrastructure.infrastructure.green_space.required_hectar || 0);
        doc.text(encodeTurkish(`Yeşil Alan İhtiyacı: ${yesilAlanHektar.toFixed(2)} hektar`), 14, y);
        y += 7;
    }
    
    checkPageBreak(15);
    const infraMesaj = infrastructure?.message || 'Veri bulunamadı.';
    const infraMesajLines = doc.splitTextToSize(encodeTurkish(infraMesaj), 180);
    infraMesajLines.forEach((line) => {
        checkPageBreak(7);
        doc.text(line, 14, y);
        y += 7;
    });
    y += 8;
    
    // Acil Müdahale Listesi
    checkPageBreak(40);
    doc.setFontSize(16);
    doc.text(encodeTurkish('Acil Müdahale Listesi'), 14, y);
    y += 10;
    
    doc.setFontSize(11);
    if (urgent && urgent.length > 0) {
        urgent.slice(0, 10).forEach((bina, idx) => {
            checkPageBreak(10);
            const binaText = `${idx + 1}. ${bina.mahalle_adi || 'N/A'} - Risk: ${bina.risk_puani || 0}, Yaş: ${bina.bina_yasi || 0} Yıl`;
            const binaLines = doc.splitTextToSize(encodeTurkish(binaText), 180);
            binaLines.forEach((line) => {
                checkPageBreak(7);
                doc.text(line, 14, y);
                y += 7;
            });
        });
    } else {
        doc.text(encodeTurkish('Acil müdahale gerektiren bina bulunamadı.'), 14, y);
    }
    
    // PDF'i indir
    const fileName = `Bayrakli_KDS_Raporu_${reportTitle.replace(/[ğĞüÜşŞıİöÖçÇ\s]/g, (m) => {
        const map = { 'ğ': 'g', 'Ğ': 'G', 'ü': 'u', 'Ü': 'U', 'ş': 's', 'Ş': 'S', 'ı': 'i', 'İ': 'I', 'ö': 'o', 'Ö': 'O', 'ç': 'c', 'Ç': 'C', ' ': '_' };
        return map[m] || m;
    })}_${new Date().getTime()}.pdf`;
    doc.save(fileName);
}

document.addEventListener('DOMContentLoaded', init);
