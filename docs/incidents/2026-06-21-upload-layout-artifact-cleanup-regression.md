# Incident: Upload Klasor Yapisi Sonrasi Artifact Temizleme ve OCR Arama Regresyonu

Tarih: 2026-06-21

Kapsam: MetMAM lokal (`/Users/erinc/OyunAlanım/mam_deneme`)

## Ozet

Uploads klasor yapisi tarihli ve artifact odakli hale getirildikten sonra bazi kod yollarinda eski sabit kok klasor kontrolleri kalmisti. Bu nedenle:

- Video araclari penceresinde silinen altyazi dosyalari metadata'dan kalkiyor, ancak `uploads` altinda fiziksel olarak kalabiliyordu.
- Yeni OCR dosyalari `uploads/YYYY/M/D/ocr/...` altinda olustugunda OCR arama/index akisi eski `uploads/ocr` kok kontrolune takilabiliyordu.
- Asset versiyonu silindiginde ilgili version snapshot dosyalari `uploads` altinda kalabiliyordu.
- Yeni thumbnail/proxy uretildiginde eski thumbnail/proxy dosyalari baska bir kayit tarafindan kullanilmiyorsa bile temizlenmeyebiliyordu.

## Etki

- Diskte yetim altyazi/OCR/thumbnail/proxy/version dosyalari birikebilirdi.
- Yeni klasor yapisinda uretilen OCR dosyalari arama sonuclarina girmeyebilirdi.
- Yonetim ekraninda OCR/altiyazi icerigi okuma-duzenleme-silme islemleri yeni tarihli yollarda tutarsiz davranabilirdi.

## Kok Neden

Kodun bir kismi yeni genel `/uploads/YYYY/M/D/<artifact>/...` yapiyasina gecirilmis olsa da, bazi guard kontrolleri hala eski artifact koklerini bekliyordu:

- `OCR_DIR` icin eski `uploads/ocr`
- `SUBTITLES_DIR` icin eski `uploads/subtitles`
- Version delete akisi sadece DB kaydini siliyor, dosya temizligi yapmiyordu.
- Thumbnail/proxy yenileme akislari eski dosyanin hala referans edilip edilmedigini kontrol ederek fiziksel cleanup yapmiyordu.

## Cozum

1. Ortak cleanup servisine `cleanupUnreferencedAssetFiles` eklendi.
   - Dosya sadece guvenli upload kokleri altindaysa silinir.
   - Dosya herhangi bir `assets` veya `asset_versions` kaydi tarafindan hala referans ediliyorsa korunur.

2. OCR ve altyazi dosya kontrolleri yeni klasor yapisina uyumlu hale getirildi.
   - Dosyanin `/uploads` altinda olmasi ve yolunda ilgili artifact klasorunun (`ocr`, `subtitles`) bulunmasi yeterli.

3. OCR arama/index akisi yeni tarihli OCR klasorlerini de tarayacak sekilde genisletildi.
   - Eski `uploads/ocr` fallback'i korunurken yeni `uploads/YYYY/M/D/ocr` dosyalari da adaylara eklendi.

4. Asset version delete akisi dosya temizligi yapacak sekilde guncellendi.
   - Silinen version kaydinin snapshot dosyalari, baska bir kayit kullanmiyorsa fiziksel olarak silinir.

5. Thumbnail/proxy yenileme akislari eski artifact dosyalarini temizleyecek sekilde guncellendi.
   - Yeni dosya DB'ye yazildiktan sonra eski URL baska kayit tarafindan kullanilmiyorsa silinir.

## Degisen Ana Dosyalar

- `src/services/assetDeletionService.js`
- `src/server.js`
- `src/routes/assets.js`
- `src/routes/admin.js`
- `src/routes/textProcessing.js`

## Dogrulama

Statik kontroller:

```bash
node --check src/server.js
node --check src/routes/assets.js
node --check src/routes/admin.js
node --check src/services/assetDeletionService.js
git diff --check -- src/server.js src/routes/assets.js src/routes/admin.js src/routes/textProcessing.js src/services/assetDeletionService.js
```

Runtime kontrol:

```bash
docker compose up -d app
curl -sS -I http://127.0.0.1:3001/api/health
docker logs --tail=120 mam-app
```

Sonuc:

- `mam-app` basariyla ayaga kalkti.
- `/api/health` HTTP 200 dondu.
- Startup logunda uygulama hatasi gorulmedi.

## Kalan Risk / Manuel Test

Asagidaki islemler UI uzerinden ayrica denenmeli:

- Video araclari penceresinden altyazi silme ve dosyanin `uploads` altindan kalktigini dogrulama.
- Yeni OCR uretip OCR aramada sonuc geldigini dogrulama.
- Bir dokuman versiyonunu silip ilgili snapshot dosyasinin baska kayit tarafindan kullanilmiyorsa silindigini dogrulama.
- Ayni asset icin tekrar thumbnail/proxy uretip eski dosyanin referans yoksa temizlendigini dogrulama.
