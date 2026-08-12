# Belgelik Refactor Transfer Log

## 2026-08-12 - MetMAM OCR/altyazı/media job refactor aktarımı

MetMAM'da test edilen refactor Belgelik tarafına taşındı. Amaç `src/server.js` içindeki OCR, altyazı arama/indeksleme ve medya artifact path helper bloklarını servis katmanına almak, route dosyalarını daha ince hale getirmek ve aynı davranışı servis testleriyle sabitlemekti.

Taşınan servisler:

- `src/services/mediaArtifactService.js`: upload artifact kökleri, tarih bazlı path üretimi, public upload URL çözümleme.
- `src/services/textAssetIndexService.js`: video/foto OCR dosyası bulma, OCR segment indeksleme, OCR fuzzy/suggestion arama.
- `src/services/subtitleIndexService.js`: aktif altyazı cue indeksleme, global ve asset bazlı altyazı arama/suggestion.

MetMAM'dan çıkarılan ders:

- `asset_subtitle_cues` tablosunda primary key `(asset_id, seq)` olduğu için çok dilli aktif altyazılarda her dil için `seq` tekrar 1'den başlatılmamalı. İngilizce ve Türkçe aktif altyazılar aynı asset altında indekslenirken tek asset-wide sıra kullanılmalı. Yeni `subtitleIndexService` bunu tek sayaçla yapıyor ve test bunu simüle ediyor.

Belgelik uyarlaması:

- `src/server.js` yeni servisleri oluşturup route bağımlılıklarına geçiriyor.
- `/api/assets/subtitle-suggest` ve `/api/assets/:id/subtitles/suggest` doğrudan SQL yerine `searchSubtitleMatchesForAssetRow` kullanıyor. Böylece çok dilli aktif altyazı indeks davranışı tüm öneri endpoint'lerine yansıyor.
- `video-ocr/latest` tarafındaki `mapVideoOcrJobFromDbRow` bağımlılığı korunuyor; Belgelik'te daha önce eklenen fallback/log davranışı bozulmadı.

Doğrulama:

```bash
node --check src/server.js
node --check src/routes/assets.js
node --check src/routes/textProcessing.js
node --check src/services/mediaArtifactService.js
node --check src/services/textAssetIndexService.js
node --check src/services/subtitleIndexService.js
npm run test:media-artifacts
npm run test:text-asset-index
npm run test:subtitle-index
npm run check
```

`npm run check` sırasında yalnızca lokal ortamda `OAUTH2_PROXY_CLIENT_ID` değişkeni set edilmediği için compose uyarısı görüldü; komut başarıyla tamamlandı.
