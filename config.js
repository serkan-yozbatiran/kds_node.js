// .env dosyasını yükle
require('dotenv').config();

// Veritabanı ve sunucu ayarları
module.exports = {
    db: {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_DATABASE || 'kentsel_donusum_db'
    },
    server: {
        port: process.env.PORT || 3000
    }
};
