#  Bayraklı Kentsel Dönüşüm Karar Destek Sistemi (KDS)

Modern web teknolojileri kullanılarak geliştirilmiş, kentsel dönüşüm projeleri için karar destek sistemi.

##  İçindekiler

- [Özellikler](#özellikler)
- [Teknolojiler](#teknolojiler)
- [Kurulum](#kurulum)
- [Yapılandırma](#yapılandırma)
- [Kullanım](#kullanım)
- [Proje Yapısı](#proje-yapısı)
- [API Endpoints](#api-endpoints)
- [Lisans](#lisans)

##  Özellikler

-  **İnteraktif Harita**: Leaflet.js ile mahalle ve bina görselleştirmesi
-  **Dashboard Kartları**: Finansal analiz, yapı modeli, hukuki risk, inşaat takvimi, sosyal analiz ve altyapı etkisi
-  **Filtreleme**: Mahalle ve etap bazlı veri filtreleme
-  **Görselleştirme**: Chart.js ile dinamik grafikler
-  **PDF Export**: Raporları PDF olarak indirme
-  **MVC Mimarisi**: Modüler ve bakımı kolay kod yapısı

##  Teknolojiler

### Backend
- **Node.js** - JavaScript runtime
- **Express.js** - Web framework
- **MySQL2** - Veritabanı bağlantısı
- **dotenv** - Environment variables yönetimi

### Frontend
- **Vanilla JavaScript** - ES6+ özellikleri
- **Leaflet.js** - İnteraktif harita
- **Chart.js** - Grafik görselleştirme
- **jsPDF & html2canvas** - PDF oluşturma

### Veritabanı
- **MySQL** - İlişkisel veritabanı

##  Kurulum

### Gereksinimler

- Node.js (v14 veya üzeri)
- MySQL (v5.7 veya üzeri)
- npm veya yarn

### Adımlar

1. **Repository'yi klonlayın:**
   ```bash
   git clone <repository-url>
   cd kds_node.js
   ```

2. **Bağımlılıkları yükleyin:**
   ```bash
   npm install
   ```

3. **Veritabanını oluşturun:**
   - MySQL'de `kentsel_donusum_db` veritabanını oluşturun
   - Gerekli tabloları import edin

4. **Environment variables'ı yapılandırın:**
   ```bash
   cp .env.example .env
   ```
   `.env` dosyasını düzenleyip veritabanı bilgilerinizi girin.

5. **Sunucuyu başlatın:**
   ```bash
   npm start
   ```

6. **Tarayıcıda açın:**
   ```
   http://localhost:3000
   ```

## Yapılandırma

### Environment Variables

`.env` dosyasında aşağıdaki değişkenleri ayarlayın:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_DATABASE=kentsel_donusum_db
PORT=3000
```

 **Önemli:** `.env` dosyası asla Git'e commit edilmemelidir. Hassas bilgiler içerir.

##  Kullanım

### Dashboard

Ana sayfa dashboard görünümünü gösterir:
- Genel istatistikler
- Finansal uygunluk analizi
- Yapı modeli kararı
- Hukuki tıkanıklık indeksi
- İnşaat takvimi
- Sosyal profil analizi
- Altyapı etkisi

### Harita

İnteraktif harita üzerinde:
- Mahalle sınırlarını görüntüleyin
- Binaları inceleyin
- Mahalle ve etap seçimi yapın
- Detaylı bilgi panellerini açın

##  Proje Yapısı

```
kds_node.js/
├── config/              # Yapılandırma dosyaları
│   └── database.js      # Veritabanı bağlantı pool'u
├── controllers/         # Controller'lar (iş mantığı)
│   ├── binaController.js
│   ├── dashboardController.js
│   ├── etapController.js
│   ├── mahalleController.js
│   └── statisticsController.js
├── models/              # Model'ler (veritabanı işlemleri)
│   ├── Bina.js
│   ├── Etap.js
│   ├── Mahalle.js
│   └── Statistics.js
├── routes/              # Route tanımları
│   ├── binaRoutes.js
│   ├── dashboardRoutes.js
│   ├── etapRoutes.js
│   ├── geojsonRoutes.js
│   ├── mahalleRoutes.js
│   └── statisticsRoutes.js
├── services/            # Servis katmanı
│   └── geojsonService.js
├── scripts/             # Yardımcı scriptler
│   ├── create-etaplar.js
│   ├── init-database.js
│   └── update-schema.js
├── public/              # Frontend dosyaları
│   ├── index.html
│   └── app.js
├── .env.example         # Environment variables şablonu
├── .gitignore          # Git ignore kuralları
├── config.js           # Ana yapılandırma
├── package.json        # NPM paket bilgileri
└── server.js           # Ana sunucu dosyası
```

##  API Endpoints

### Mahalleler
- `GET /api/mahalleler` - Tüm mahalleleri listele
- `GET /api/mahalleler/sinirlari` - Mahalle sınırlarını GeoJSON olarak getir
- `GET /api/mahalleler/:ad/binalar` - Belirli bir mahallenin binalarını getir

### Binalar
- `GET /api/binalar/:id` - Belirli bir binanın detaylarını getir
- `GET /api/urgent-buildings` - Acil müdahale gereken binaları listele

### Etaplar
- `GET /api/etaplar` - Tüm etapları listele
- `GET /api/etaplar/mahalle/:ad` - Belirli bir mahallenin etaplarını getir

### İstatistikler
- `GET /api/statistics` - Genel istatistikleri getir

### Dashboard
- `GET /api/financial-summary` - Finansal özet
- `GET /api/strategy-decision` - Strateji kararı
- `GET /api/legal-risk` - Hukuki risk analizi
- `GET /api/construction-schedule` - İnşaat takvimi
- `GET /api/social-profile` - Sosyal profil
- `GET /api/infrastructure-impact` - Altyapı etkisi

### GeoJSON
- `GET /api/geojson` - Tüm GeoJSON verilerini getir

##  Güvenlik

- `.env` dosyası `.gitignore`'da tanımlı
-  Hassas bilgiler environment variables ile yönetiliyor
-  SQL injection koruması için parametreli sorgular kullanılıyor

## Lisans

ISC

## Katkıda Bulunma

1. Fork edin
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit edin (`git commit -m 'Add amazing feature'`)
4. Push edin (`git push origin feature/amazing-feature`)
5. Pull Request açın

## İletişim

Sorularınız için issue açabilirsiniz.

---

**Not:** Bu proje kentsel dönüşüm projeleri için karar destek sistemi olarak geliştirilmiştir.

