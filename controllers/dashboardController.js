const pool = require('../config/database');
const Mahalle = require('../models/Mahalle');

class DashboardController {
    static async getFinancialSummary(req, res) {
        try {
            const { mahalle_adi, etap_adi } = req.query;
            
            let query = `
                SELECT 
                    COALESCE(SUM(dp.tahmini_maliyet), 0) as toplam_yatirim,
                    COALESCE(AVG(dp.tahmini_maliyet), 0) as ortalama_maliyet,
                    COUNT(DISTINCT b.bina_id) as toplam_bina
                FROM binalar b
                LEFT JOIN donusum_plani dp ON b.bina_id = dp.bina_id
                WHERE 1=1
            `;
            
            const params = [];
            
            if (etap_adi && mahalle_adi) {
                query += ` AND b.etap_adi = ? AND b.mahalle_adi = ?`;
                params.push(etap_adi, mahalle_adi);
            } else if (mahalle_adi) {
                query += ` AND b.mahalle_adi = ?`;
                params.push(mahalle_adi);
            }
            
            const [rows] = await pool.execute(query, params);
            res.json(rows[0] || { toplam_yatirim: 0, ortalama_maliyet: 0, toplam_bina: 0 });
        } catch (error) {
            console.error('Finansal özet yüklenemedi:', error);
            res.status(500).json({ error: 'Veri yüklenemedi' });
        }
    }

    static async getStrategyDecision(req, res) {
        try {
            const { mahalle_adi } = req.query;
            
            // Talep Analizi
            let talepQuery = `
                SELECT 
                    hs.talep_edilen_model,
                    COUNT(*) as talep_sayisi
                FROM hak_sahipleri hs
                INNER JOIN binalar b ON hs.bina_id = b.bina_id
                WHERE hs.talep_edilen_model IS NOT NULL 
                    AND hs.talep_edilen_model != ''
            `;
            
            const talepParams = [];
            if (mahalle_adi) {
                talepQuery += ` AND b.mahalle_adi = ?`;
                talepParams.push(mahalle_adi);
            }
            
            talepQuery += ` GROUP BY hs.talep_edilen_model`;
            
            const [talepData] = await pool.execute(talepQuery, talepParams);
            
            // Zemin Risk Puanı
            let zeminQuery = `
                SELECT 
                    AVG(zemin_risk_puani) as ortalama_zemin_risk
                FROM mahalleler
                WHERE zemin_risk_puani IS NOT NULL
            `;
            
            const zeminParams = [];
            if (mahalle_adi) {
                zeminQuery += ` AND mahalle_adi = ?`;
                zeminParams.push(mahalle_adi);
            }
            
            const [zeminData] = await pool.execute(zeminQuery, zeminParams);
            const ortalamaZeminRisk = parseFloat(zeminData[0]?.ortalama_zemin_risk || 0);
            
            // Talep dağılımını hesapla
            let yerindeTalep = 0;
            let rezervTalep = 0;
            let nakitTalep = 0;
            let toplamTalep = 0;
            
            talepData.forEach(row => {
                const model = (row.talep_edilen_model || '').trim();
                const sayi = parseInt(row.talep_sayisi || 0);
                toplamTalep += sayi;
                
                if (model.includes('Yerinde Dönüşüm') || model.includes('Müteahhit')) {
                    yerindeTalep += sayi;
                } else if (model.includes('Rezerv Alan') || model.includes('Devlet')) {
                    rezervTalep += sayi;
                } else if (model.includes('Nakit') || model.includes('Devir')) {
                    nakitTalep += sayi;
                }
            });
            
            const yerindeYuzde = toplamTalep > 0 ? parseFloat((yerindeTalep / toplamTalep * 100).toFixed(1)) : 0;
            const rezervYuzde = toplamTalep > 0 ? parseFloat((rezervTalep / toplamTalep * 100).toFixed(1)) : 0;
            const nakitYuzde = toplamTalep > 0 ? parseFloat((nakitTalep / toplamTalep * 100).toFixed(1)) : 0;
            const tahliyeEgilimi = rezervYuzde + nakitYuzde;
            
            // Karar Algoritması
            let sistemOnerisi = '';
            let gerekce = '';
            let renk = '';
            
            if (tahliyeEgilimi > 50) {
                sistemOnerisi = 'SEYRELTME VE TRANSFER';
                gerekce = `Halkın çoğunluğu (%${tahliyeEgilimi.toFixed(1)}%) bölgeden ayrılmayı talep ediyor. Bölge yoğunluğunu azaltıp sosyal donatı alanları artırılmalı.`;
                renk = '#8b5cf6';
            } else if (yerindeYuzde > 50 && ortalamaZeminRisk > 70) {
                sistemOnerisi = 'ADA BAZLI (BLOK) DÖNÜŞÜM';
                gerekce = `Halk yerinde kalmak istiyor ancak zemin riskli (${ortalamaZeminRisk.toFixed(1)}). Parsel bazlı yapılaşma yasaklanmalı, zemin iyileştirmeli Blok nizam uygulanmalı.`;
                renk = '#f59e0b';
            } else if (yerindeYuzde > 50 && ortalamaZeminRisk <= 70) {
                sistemOnerisi = 'PARSEL BAZLI YERİNDE DÖNÜŞÜM';
                gerekce = `Zemin sağlam ve talep yerinde dönüşüm yönünde. Vatandaş-Müteahhit işbirliği teşvik edilebilir.`;
                renk = '#10b981';
            } else {
                sistemOnerisi = 'KARMA STRATEJİ';
                gerekce = `Talep dağılımı dengeli. Bölge özelliklerine göre esnek bir dönüşüm stratejisi uygulanmalı.`;
                renk = '#06b6d4';
            }
            
            res.json({
                talep_dagilimi: {
                    yerinde: { sayi: yerindeTalep, yuzde: yerindeYuzde },
                    rezerv: { sayi: rezervTalep, yuzde: rezervYuzde },
                    nakit: { sayi: nakitTalep, yuzde: nakitYuzde },
                    toplam: toplamTalep
                },
                zemin_risk_puani: ortalamaZeminRisk,
                tahliye_egilimi: tahliyeEgilimi,
                yerinde_orani: yerindeYuzde,
                sistem_onerisi: sistemOnerisi,
                gerekce: gerekce,
                renk: renk
            });
        } catch (error) {
            console.error('Strateji karar verisi yüklenemedi:', error);
            res.status(500).json({ error: 'Veri yüklenemedi' });
        }
    }

    static async getLegalRisk(req, res) {
        try {
            const { mahalle_adi, etap_adi } = req.query;
            
            let query = `
                SELECT 
                    COUNT(DISTINCT hd.bina_id) as total_buildings,
                    SUM(CASE WHEN hd.dava_durumu = 1 THEN 1 ELSE 0 END) as davali_count,
                    SUM(CASE 
                        WHEN hd.mulkiyet_tipi = 'Verasetli' 
                        OR (hd.mulkiyet_tipi = 'Hisseli' AND hd.hissedar_sayisi > 1)
                        THEN 1 
                        ELSE 0 
                    END) as riskli_mulkiyet,
                    AVG(hd.hissedar_sayisi) as avg_hissedar
                FROM hukuki_durum hd
            `;
            
            const params = [];
            
            if (mahalle_adi || etap_adi) {
                query += ` INNER JOIN binalar b ON hd.bina_id = b.bina_id`;
                
                if (etap_adi && mahalle_adi) {
                    query += ` WHERE b.etap_adi = ? AND b.mahalle_adi = ?`;
                    params.push(etap_adi, mahalle_adi);
                } else if (etap_adi) {
                    query += ` WHERE b.etap_adi = ?`;
                    params.push(etap_adi);
                } else if (mahalle_adi) {
                    query += ` WHERE b.mahalle_adi = ?`;
                    params.push(mahalle_adi);
                }
            }
            
            const [result] = await pool.execute(query, params);
            const data = result[0];
            
            const totalBuildings = parseInt(data.total_buildings || 0);
            const davaliCount = parseInt(data.davali_count || 0);
            const riskliMulkiyet = parseInt(data.riskli_mulkiyet || 0);
            const avgHissedar = parseFloat(data.avg_hissedar || 0);
            
            // Risk hesaplama
            const davaOrani = totalBuildings > 0 ? (davaliCount / totalBuildings) * 100 : 0;
            const riskliMulkOrani = totalBuildings > 0 ? (riskliMulkiyet / totalBuildings) * 100 : 0;
            const hisselarKatkisi = Math.min(avgHissedar, 10);
            
            const riskScore = (davaOrani * 0.6) + (riskliMulkOrani * 0.3) + hisselarKatkisi;
            const finalScore = Math.min(Math.max(riskScore, 0), 100);
            
            // Risk seviyesi
            let riskSeviyesi = '';
            let riskMesaji = '';
            let riskRenk = '';
            
            if (finalScore < 40) {
                riskSeviyesi = 'Düşük Risk';
                riskMesaji = 'Hukuki süreçler sorunsuz ilerleyebilir.';
                riskRenk = '#10b981';
            } else if (finalScore < 70) {
                riskSeviyesi = 'Orta Risk';
                riskMesaji = 'Dikkatli ilerlenmeli. Süreç 6-12 ay uzayabilir.';
                riskRenk = '#f59e0b';
            } else {
                riskSeviyesi = 'Yüksek Risk';
                riskMesaji = 'Yüksek Risk: Süreç 2 yıl uzayabilir. Özel önlemler gerekli.';
                riskRenk = '#f43f5e';
            }
            
            res.json({
                total_buildings: totalBuildings,
                davali_count: davaliCount,
                riskli_mulkiyet: riskliMulkiyet,
                avg_hissedar: parseFloat(avgHissedar.toFixed(1)),
                risk_score: parseFloat(finalScore.toFixed(1)),
                risk_seviyesi: riskSeviyesi,
                risk_mesaji: riskMesaji,
                risk_renk: riskRenk,
                dava_orani: parseFloat(davaOrani.toFixed(1)),
                riskli_mulk_orani: parseFloat(riskliMulkOrani.toFixed(1))
            });
        } catch (error) {
            console.error('Hukuki risk verisi yüklenemedi:', error);
            res.status(500).json({ error: 'Veri yüklenemedi' });
        }
    }

    static async getConstructionSchedule(req, res) {
        try {
            const { mahalle_adi, etap_adi } = req.query;
            
            let query = `
                SELECT 
                    AVG(dp.yikim_suresi_gun) as avg_yikim,
                    AVG(dp.yapim_suresi_ay) as avg_yapim
                FROM donusum_plani dp
            `;
            
            const params = [];
            
            if (mahalle_adi || etap_adi) {
                query += ` INNER JOIN binalar b ON dp.bina_id = b.bina_id`;
                
                if (etap_adi && mahalle_adi) {
                    query += ` WHERE b.etap_adi = ? AND b.mahalle_adi = ?`;
                    params.push(etap_adi, mahalle_adi);
                } else if (etap_adi) {
                    query += ` WHERE b.etap_adi = ?`;
                    params.push(etap_adi);
                } else if (mahalle_adi) {
                    query += ` WHERE b.mahalle_adi = ?`;
                    params.push(mahalle_adi);
                }
            }
            
            const [result] = await pool.execute(query, params);
            const avgData = result[0];
            
            // Mevsim tercihi
            let mevsimQuery = `
                SELECT en_uygun_mevsim, COUNT(*) as sayi
                FROM donusum_plani dp
            `;
            
            const mevsimParams = [];
            
            if (mahalle_adi || etap_adi) {
                mevsimQuery += ` INNER JOIN binalar b ON dp.bina_id = b.bina_id`;
                
                if (etap_adi && mahalle_adi) {
                    mevsimQuery += ` WHERE b.etap_adi = ? AND b.mahalle_adi = ? AND dp.en_uygun_mevsim IS NOT NULL AND dp.en_uygun_mevsim != ''`;
                    mevsimParams.push(etap_adi, mahalle_adi);
                } else if (etap_adi) {
                    mevsimQuery += ` WHERE b.etap_adi = ? AND dp.en_uygun_mevsim IS NOT NULL AND dp.en_uygun_mevsim != ''`;
                    mevsimParams.push(etap_adi);
                } else if (mahalle_adi) {
                    mevsimQuery += ` WHERE b.mahalle_adi = ? AND dp.en_uygun_mevsim IS NOT NULL AND dp.en_uygun_mevsim != ''`;
                    mevsimParams.push(mahalle_adi);
                }
            } else {
                mevsimQuery += ` WHERE dp.en_uygun_mevsim IS NOT NULL AND dp.en_uygun_mevsim != ''`;
            }
            
            mevsimQuery += ` GROUP BY en_uygun_mevsim ORDER BY sayi DESC LIMIT 1`;
            
            const [mevsimResult] = await pool.execute(mevsimQuery, mevsimParams);
            
            const avgYikim = parseFloat(avgData.avg_yikim || 45);
            const avgYapim = parseFloat(avgData.avg_yapim || 18);
            const mevsimTercihi = mevsimResult[0]?.en_uygun_mevsim || 'İlkbahar';
            
            // Tarih Optimizasyon Algoritması
            const today = new Date();
            let recommendedStartDate = new Date(today);
            let dateAdjusted = false;
            let adjustmentReason = '';
            
            const yikimBitis = new Date(today);
            yikimBitis.setDate(yikimBitis.getDate() + avgYikim);
            
            const temelKazisiBaslangic = new Date(yikimBitis);
            const temelKazisiBitis = new Date(yikimBitis);
            temelKazisiBitis.setDate(temelKazisiBitis.getDate() + 30);
            
            const temelKazisiAy = temelKazisiBitis.getMonth();
            const isKis = temelKazisiAy === 11 || temelKazisiAy === 0 || temelKazisiAy === 1;
            
            if (isKis) {
                const martAy = new Date(today.getFullYear(), 2, 1);
                if (martAy < today) {
                    martAy.setFullYear(martAy.getFullYear() + 1);
                }
                
                recommendedStartDate = new Date(martAy);
                recommendedStartDate.setDate(recommendedStartDate.getDate() - avgYikim - 30);
                
                dateAdjusted = true;
                const ayIsimleri = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 
                                   'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
                adjustmentReason = `Hemen başlanırsa temel kazısı kışa denk gelir. Bu yüzden başlangıç tarihi ${ayIsimleri[recommendedStartDate.getMonth()]} ayına çekilmiştir.`;
            }
            
            const yikimBitisYeni = new Date(recommendedStartDate);
            yikimBitisYeni.setDate(yikimBitisYeni.getDate() + avgYikim);
            
            const ruhsatBitis = new Date(yikimBitisYeni);
            ruhsatBitis.setDate(ruhsatBitis.getDate() + 30);
            
            const kabaInsaatBitis = new Date(ruhsatBitis);
            kabaInsaatBitis.setMonth(kabaInsaatBitis.getMonth() + Math.round(avgYapim));
            
            const projectedEndDate = new Date(kabaInsaatBitis);
            
            const toplamGun = Math.ceil((projectedEndDate - recommendedStartDate) / (1000 * 60 * 60 * 24));
            const toplamAy = (toplamGun / 30).toFixed(1);
            
            res.json({
                avg_yikim: Math.round(avgYikim),
                avg_yapim: Math.round(avgYapim),
                mevsim_tercihi: mevsimTercihi,
                recommended_start_date: recommendedStartDate.toISOString().split('T')[0],
                projected_end_date: projectedEndDate.toISOString().split('T')[0],
                toplam_sure_ay: parseFloat(toplamAy),
                date_adjusted: dateAdjusted,
                adjustment_reason: adjustmentReason,
                phases: {
                    yikim_bitis: yikimBitisYeni.toISOString().split('T')[0],
                    ruhsat_bitis: ruhsatBitis.toISOString().split('T')[0],
                    kaba_insaat_bitis: kabaInsaatBitis.toISOString().split('T')[0]
                }
            });
        } catch (error) {
            console.error('İnşaat takvimi verisi yüklenemedi:', error);
            res.status(500).json({ error: 'Veri yüklenemedi' });
        }
    }

    static async getSocialProfile(req, res) {
        try {
            const { mahalle_adi, etap_adi } = req.query;
            
            let query = `
                SELECT 
                    AVG(hs.yas) as avg_age,
                    COUNT(*) as total_people
                FROM hak_sahipleri hs
            `;
            
            const params = [];
            
            if (mahalle_adi || etap_adi) {
                query += ` INNER JOIN binalar b ON hs.bina_id = b.bina_id`;
                
                if (etap_adi && mahalle_adi) {
                    query += ` WHERE b.etap_adi = ? AND b.mahalle_adi = ?`;
                    params.push(etap_adi, mahalle_adi);
                } else if (etap_adi) {
                    query += ` WHERE b.etap_adi = ?`;
                    params.push(etap_adi);
                } else if (mahalle_adi) {
                    query += ` WHERE b.mahalle_adi = ?`;
                    params.push(mahalle_adi);
                }
            }
            
            const [ageResult] = await pool.execute(query, params);
            const ageData = ageResult[0];
            
            // Gelir dağılımı
            let incomeQuery = `
                SELECT 
                    hs.gelir_duzeyi,
                    COUNT(*) as sayi
                FROM hak_sahipleri hs
            `;
            
            const incomeParams = [];
            let hasWhere = false;
            
            if (mahalle_adi || etap_adi) {
                incomeQuery += ` INNER JOIN binalar b ON hs.bina_id = b.bina_id`;
                
                if (etap_adi && mahalle_adi) {
                    incomeQuery += ` WHERE b.etap_adi = ? AND b.mahalle_adi = ? AND hs.gelir_duzeyi IS NOT NULL AND hs.gelir_duzeyi != ''`;
                    incomeParams.push(etap_adi, mahalle_adi);
                    hasWhere = true;
                } else if (etap_adi) {
                    incomeQuery += ` WHERE b.etap_adi = ? AND hs.gelir_duzeyi IS NOT NULL AND hs.gelir_duzeyi != ''`;
                    incomeParams.push(etap_adi);
                    hasWhere = true;
                } else if (mahalle_adi) {
                    incomeQuery += ` WHERE b.mahalle_adi = ? AND hs.gelir_duzeyi IS NOT NULL AND hs.gelir_duzeyi != ''`;
                    incomeParams.push(mahalle_adi);
                    hasWhere = true;
                }
            } else {
                incomeQuery += ` WHERE hs.gelir_duzeyi IS NOT NULL AND hs.gelir_duzeyi != ''`;
                hasWhere = true;
            }
            
            incomeQuery += ` GROUP BY hs.gelir_duzeyi`;
            
            const [incomeResult] = await pool.execute(incomeQuery, incomeParams);
            
            const avgAge = parseFloat(ageData.avg_age || 0);
            const totalPeople = parseInt(ageData.total_people || 0);
            
            let dusukGelir = 0;
            let ortaGelir = 0;
            let yuksekGelir = 0;
            let toplamGelir = 0;
            
            incomeResult.forEach(row => {
                const gelir = (row.gelir_duzeyi || '').toLowerCase();
                const sayi = parseInt(row.sayi || 0);
                toplamGelir += sayi;
                
                if (gelir.includes('düşük') || gelir.includes('dusuk')) {
                    dusukGelir += sayi;
                } else if (gelir.includes('orta')) {
                    ortaGelir += sayi;
                } else if (gelir.includes('yüksek') || gelir.includes('yuksek')) {
                    yuksekGelir += sayi;
                }
            });
            
            const dusukGelirOrani = toplamGelir > 0 ? (dusukGelir / toplamGelir) * 100 : 0;
            const ortaGelirOrani = toplamGelir > 0 ? (ortaGelir / toplamGelir) * 100 : 0;
            const yuksekGelirOrani = toplamGelir > 0 ? (yuksekGelir / toplamGelir) * 100 : 0;
            const ortaYuksekToplam = ortaGelirOrani + yuksekGelirOrani;
            
            // Profilleme Algoritması
            let strategy = {
                oneri: '',
                mesaj: '',
                renk: ''
            };
            
            if (avgAge > 60 && dusukGelirOrani > 50) {
                strategy.oneri = 'SOSYAL DESTEKLİ / YERİNDE';
                strategy.mesaj = 'Bölge halkı yaşlı ve düşük gelirli. Borçlanma kapasiteleri yok. Devlet sübvansiyonlu modeller ve "Asansörlü/Erişilebilir" yapılar öne çıkarılmalı.';
                strategy.renk = '#f43f5e';
            } else if (avgAge < 45 && ortaYuksekToplam > 60) {
                strategy.oneri = 'MODERN / PRESTİJ PROJESİ';
                strategy.mesaj = 'Ödeme gücü yüksek bir kitle. Sosyal donatıları (Otopark, Havuz) bol, değer artışı odaklı lüks proje sunulabilir.';
                strategy.renk = '#8b5cf6';
            } else {
                strategy.oneri = 'STANDART DÖNÜŞÜM';
                strategy.mesaj = 'Dengeli bir profil. Ortalama borçlanma ve taksitlendirme seçenekleri sunulmalı.';
                strategy.renk = '#10b981';
            }
            
            res.json({
                avg_age: Math.round(avgAge),
                total_people: totalPeople,
                income_distribution: {
                    dusuk: { sayi: dusukGelir, yuzde: parseFloat(dusukGelirOrani.toFixed(1)) },
                    orta: { sayi: ortaGelir, yuzde: parseFloat(ortaGelirOrani.toFixed(1)) },
                    yuksek: { sayi: yuksekGelir, yuzde: parseFloat(yuksekGelirOrani.toFixed(1)) },
                    toplam: toplamGelir
                },
                strategy: strategy
            });
        } catch (error) {
            console.error('Sosyal profil verisi yüklenemedi:', error);
            res.status(500).json({ error: 'Veri yüklenemedi' });
        }
    }

    static async getInfrastructureImpact(req, res) {
        try {
            const { mahalle_adi, etap_adi } = req.query;
            
            const data = await Mahalle.getInfrastructureData(mahalle_adi, etap_adi);
            
            if (!data) {
                return res.status(404).json({ error: 'Mahalle verisi bulunamadı' });
            }
            
            const mevcutNufus = parseFloat(data.mevcut_nufus || 0);
            const alanHektar = parseFloat(data.alan || 0);
            const mevcutYogunluk = parseFloat(data.mevcut_yogunluk || 0);
            
            // Simülasyon Mantığı
            const transformationMultiplier = 1.25;
            const gelecekNufus = Math.round(mevcutNufus * transformationMultiplier);
            const changeRate = 25;
            
            // Okul İhtiyacı
            const mevcutOkulIhtiyaci = Math.ceil(mevcutNufus / 5000);
            const gelecekOkulIhtiyaci = Math.ceil(gelecekNufus / 5000);
            const okulDurum = gelecekOkulIhtiyaci > mevcutOkulIhtiyaci ? 'CRITICAL' : 'OK';
            
            // Yeşil Alan Yükü
            const gerekenYesilAlan = gelecekNufus * 10;
            const gerekenYesilAlanHektar = gerekenYesilAlan / 10000;
            
            // Otopark Yükü
            const mevcutOtoparkKullanim = 80;
            const gelecekOtoparkKullanim = Math.min(110, Math.round(mevcutOtoparkKullanim * transformationMultiplier));
            
            // Mesaj oluştur
            let message = '';
            if (okulDurum === 'CRITICAL') {
                const ekOkulSayisi = gelecekOkulIhtiyaci - mevcutOkulIhtiyaci;
                message += `Nüfus artışı nedeniyle bölgeye ${ekOkulSayisi} adet YENİ OKUL `;
            }
            if (gelecekOtoparkKullanim > 100) {
                message += `ve ek OTOPARK alanı planlanmalıdır.`;
            } else if (okulDurum === 'CRITICAL') {
                message += `planlanmalıdır.`;
            } else {
                message = `Nüfus artışı (%${changeRate}) altyapı kapasitesini zorlayacaktır. Yeşil alan ihtiyacı: ${gerekenYesilAlanHektar.toFixed(2)} hektar.`;
            }
            
            res.json({
                population: {
                    current: mevcutNufus,
                    future: gelecekNufus,
                    change_rate: changeRate
                },
                infrastructure: {
                    school_need: {
                        current: mevcutOkulIhtiyaci,
                        future: gelecekOkulIhtiyaci,
                        status: okulDurum
                    },
                    parking_load: {
                        current_usage: mevcutOtoparkKullanim,
                        future_usage: gelecekOtoparkKullanim
                    },
                    green_space: {
                        required_m2: gerekenYesilAlan,
                        required_hectar: gerekenYesilAlanHektar
                    }
                },
                message: message
            });
        } catch (err) {
            console.error('Altyapı etki simülasyonu hatası:', err);
            res.status(500).json({ error: 'Veritabanı hatası', message: err.message });
        }
    }
}

module.exports = DashboardController;



