const express = require('express');
const cors = require('cors');
const path = require('path');

// Config
const config = require('./config');

// Routes
const mahalleRoutes = require('./routes/mahalleRoutes');
const binaRoutes = require('./routes/binaRoutes');
const statisticsRoutes = require('./routes/statisticsRoutes');
const etapRoutes = require('./routes/etapRoutes');
const geojsonRoutes = require('./routes/geojsonRoutes');

// Controllers (dashboard, urgent-buildings, etap ve mahalle-sinirlari için doğrudan kullanıyoruz)
const DashboardController = require('./controllers/dashboardController');
const BinaController = require('./controllers/binaController');
const EtapController = require('./controllers/etapController');
const MahalleController = require('./controllers/mahalleController');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/geojson', geojsonRoutes);
app.use('/api/mahalleler', mahalleRoutes);
app.get('/api/mahalle-sinirlari', MahalleController.getBoundaries);
app.use('/api/mahalle', mahalleRoutes);
app.use('/api/bina', binaRoutes);
app.use('/api/istatistikler', statisticsRoutes);
app.use('/api/etaplar', etapRoutes);
app.get('/api/mahalle/:ad/etaplar', EtapController.getByMahalle);
app.get('/api/urgent-buildings', BinaController.getUrgentBuildings);
// Dashboard routes - her route ayrı mount edilmeli
app.get('/api/financial-summary', DashboardController.getFinancialSummary);
app.get('/api/strategy-decision', DashboardController.getStrategyDecision);
app.get('/api/legal-risk', DashboardController.getLegalRisk);
app.get('/api/construction-schedule', DashboardController.getConstructionSchedule);
app.get('/api/social-profile', DashboardController.getSocialProfile);
app.get('/api/infrastructure-impact', DashboardController.getInfrastructureImpact);

// Ana sayfa
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Sunucuyu başlat
const PORT = config.server.port;
const server = app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║     🏙️  BAYRAKLI KENTSEL DÖNÜŞÜM KARAR DESTEK SİSTEMİ      ║
╠════════════════════════════════════════════════════════════╣
║  Veritabanı: ${config.db.database.padEnd(42)}║
║  Sunucu: http://localhost:${PORT}                             ║
╠════════════════════════════════════════════════════════════╣
║  API Endpoints:                                            ║
║    • GET /api/istatistikler   - Genel istatistikler        ║
║    • GET /api/mahalleler      - Mahalle listesi            ║
║    • GET /api/mahalle-sinirlari - Mahalle sınırları        ║
║    • GET /api/mahalle/:ad/binalar - Mahalle binaları       ║
║    • GET /api/bina/:id        - Bina detayı                ║
║    • GET /api/financial-summary - Finansal özet            ║
║    • GET /api/strategy-decision - Strateji kararı          ║
║    • GET /api/legal-risk      - Hukuki risk                ║
║    • GET /api/construction-schedule - İnşaat takvimi      ║
║    • GET /api/social-profile  - Sosyal profil              ║
║    • GET /api/infrastructure-impact - Altyapı etkisi       ║
╚════════════════════════════════════════════════════════════╝
    `);
});

// Hata yakalama
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ Port ${PORT} zaten kullanımda!`);
        console.error('Lütfen mevcut Node.js process\'lerini durdurun:\n');
        console.error('Windows PowerShell: Get-Process -Name node | Stop-Process -Force\n');
        process.exit(1);
    } else {
        console.error('❌ Sunucu hatası:', err);
        process.exit(1);
    }
});
