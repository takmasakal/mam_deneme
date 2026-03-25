# OCR Test Lab

Bu mini uygulama sadece video + altyazı + OCR testleri için hazırlanmıştır.

## Özellikler
- Video asset listesi (MAM API'den)
- Video player (proxy/media)
- Altyazı yükleme / üretme / arama
- OCR çıkarma (paddle, preprocess, Turkish fix)
- OCR sonucu indirme, DB'ye kaydetme, OCR metninde arama

## Çalıştırma
```bash
cd /Users/erinc/OyunAlanım/mam_deneme/ocrtest_lab
npm install
npm start
```

Tarayıcı:
- `http://localhost:3310`

## Ortam değişkenleri
- `PORT` (default: `3310`)
- `MAM_UPSTREAM` (default: `http://127.0.0.1:3001`)
- `OCRTEST_PROXY_USER` (default: `mamadmin`)
- `OCRTEST_PROXY_EMAIL` (default: `mamadmin@ocrtest.local`)

## Not
- Varsayılan ayarda test lab proxy gerekli kullanıcı başlıklarını eklediği için token zorunlu değildir.
- Bu araç MAM backend'e `/api` ve `/uploads` yollarını proxy eder.
