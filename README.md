# Bayraklı Kentsel Dönüşüm Karar Destek Sistemi (KDS)

Kentsel dönüşüm süreçlerinde karar alma mekanizmalarını desteklemek için geliştirilmiş web tabanlı analiz ve yönetim sistemi.

## Özellikler

- **Harita Arayüzü**: Mahalle ve bina bazlı risk analizi görüntüleme.
- **Karar Destek Paneli**: Finansal, hukuki ve sosyal verilerin analizi.
- **Raporlama**: PDF formatında detaylı analiz raporu oluşturma.
- **Veri Yönetimi**: Mahalle, etap ve bina verilerinin filtrelenmesi.

## Teknik Altyapı

**Backend**
- Node.js & Express.js
- MySQL Veritabanı

**Frontend**
- Vanilla JavaScript
- Leaflet.js (Harita)
- Chart.js (Grafikler)

## Kurulum Adımları

1. Repoyu klonlayın ve proje dizinine gidin.
2. Gerekli paketleri yükleyin:
   ```bash
   npm install
   ```
3. `.env` dosyasını oluşturun ve veritabanı ayarlarını yapın.
4. Uygulamayı başlatın:
   ```bash
   npm start
   ```
5. Tarayıcıda `http://localhost:3000` adresine gidin.

## API Dokümantasyonu

- **GET /api/mahalleler**: Tüm mahalle listesi.
- **GET /api/binalar/:id**: Bina detay bilgileri.
- **GET /api/statistics**: Genel sistem istatistikleri.
- **GET /api/urgent-buildings**: Acil müdahale listesi.

## Lisans

ISC
