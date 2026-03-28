# MAM Projesi Mimari ve Kod Rehberi

Tarih: 2026-03-28
Proje yolu: `/Users/erinc/OyunAlanım/mam_deneme`
Amaç: Bu doküman, mevcut MAM uygulamasının son durumunu mimari, klasör yapısı, kod bileşenleri ve operasyon komutları açısından açıklamak için hazırlanmıştır.

## 1. Genel Bakış

Bu proje, medya varlıklarını yüklemek, metadata ile yönetmek, aramak, izlemek ve gerektiğinde türev dosyalar üretmek için geliştirilmiş bir Media Asset Management (MAM) uygulamasıdır.

Sistemin ana parçaları şunlardır:

1. Keycloak
- Kimlik doğrulama ve kullanıcı yönetimi
- Realm, kullanıcı ve rol yönetimi

2. oauth2-proxy
- Uygulamanın önünde oturan erişim katmanı
- Kullanıcıyı Keycloak'a yönlendirir
- Doğrulanmış kullanıcı bilgisini MAM uygulamasına header olarak iletir

3. Node.js / Express uygulaması
- Asıl backend
- API'ler, ingest, metadata, workflow, OCR, altyazı, proxy, version ve admin işlemleri burada yürür

4. PostgreSQL
- Ana uygulama veritabanı
- Asset kayıtları, version'lar, OCR segmentleri, altyazı cue'ları, admin ayarları ve job kayıtları burada tutulur

5. Elasticsearch
- Hızlı arama ve suggestion tarafı
- Özellikle asset, klip, OCR, altyazı ve metadata aramalarında kullanılır

6. ONLYOFFICE Document Server
- Word / Excel / PowerPoint benzeri dosyaların web üzerinde görüntülenmesi ve düzenlenmesi için kullanılır

7. Depolama alanı (`uploads/`)
- Orijinal medya dosyaları
- Proxy videolar
- Thumbnail'ler
- OCR çıktı dosyaları
- Altyazı dosyaları

8. Frontend (Vanilla HTML/CSS/JS)
- Ana uygulama sayfası
- Yönetim sayfası
- PDF viewer sayfası
- ONLYOFFICE viewer sayfası

## 2. Yüksek Seviyeli İstek Akışı

### 2.1 Giriş akışı

1. Kullanıcı `http://localhost:3000` adresine gelir.
2. İstek önce `oauth2-proxy` servisine düşer.
3. `oauth2-proxy`, kullanıcı giriş yapmamışsa Keycloak'a yönlendirir.
4. Kullanıcı Keycloak'ta doğrulanır.
5. `oauth2-proxy`, doğrulanmış kullanıcı bilgilerini header olarak `app` servisine geçirir.
6. Backend, bu header'lardan kullanıcıyı ve izinleri çözer.

### 2.2 Varlık görüntüleme akışı

1. Frontend `/api/assets` ve `/api/assets/:id` gibi endpoint'leri çağırır.
2. Backend PostgreSQL'den kayıtları çeker.
3. Gerekiyorsa Elasticsearch destekli arama sonuçlarıyla birleştirir.
4. Frontend ikinci kolonda asset listesini, üçüncü kolonda detail görünümünü oluşturur.

### 2.3 Video ingest akışı

1. Kullanıcı dosyayı birinci kolondan yükler.
2. Frontend dosyayı base64 olarak backend'e gönderir.
3. Backend dosyayı geçici/orijinal ingest alanına yazar.
4. Eğer video ise proxy ve thumbnail üretmeyi dener.
5. Ses akışı bozuksa kullanıcıdan karar alınır:
- Sessiz proxy ile devam
- Proxy olmadan yalnız metadata oluştur
- İptal
6. Sonuçta asset kaydı PostgreSQL'e yazılır.
7. Arama indeksleme ve görüntüleme akışı güncellenir.

## 3. Teknoloji Katmanları

## 3.1 Kimlik ve yetki katmanı

### Keycloak
- Realm tabanlı kullanıcı ve rol yönetimi
- Login ekranı burada yönetilir
- Tema özelleştirmesi `keycloak-theme/` altındadır

### oauth2-proxy
- Reverse proxy olarak çalışır
- Keycloak ile OIDC konuşur
- Uygulama doğrudan anonim erişime açılmaz

### Uygulama içi izin çözümü
- Keycloak rolü + yerel override mantığı birlikte kullanılır
- Örnek izinler:
  - `admin.access`
  - `metadata.edit`
  - `office.edit`
  - `asset.delete`
  - `pdf.advanced`

## 3.2 Backend katmanı

Backend Node.js + Express ile yazılmıştır.

Ana görevleri:
- Asset CRUD
- Metadata güncelleme
- Workflow geçişleri
- Soft delete / restore / permanent delete
- Video proxy oluşturma
- Thumbnail üretme
- Subtitle üretme
- OCR çalıştırma
- PDF / Office entegrasyonları
- Admin araçları

## 3.3 Frontend katmanı

Frontend framework'süz, Vanilla HTML/CSS/JS ile yazılmıştır.

Ana özellikleri:
- 3 kolonlu düzen
- Arama ve ingest paneli
- Asset listesi
- Detail viewer
- Video kontrol arayüzü
- Metadata formu
- OCR / altyazı görüntüleme
- Admin paneli

## 3.4 Medya işleme katmanı

Video, OCR ve altyazı işlerinde şu araçlar kullanılır:

- `ffmpeg`
- `ffprobe`
- `faster-whisper`
- `whisperx`
- `PaddleOCR`
- yardımcı Python scriptleri

Bu projede Tesseract kullanılmamaktadır.

## 4. Docker Mimarisi

Ana compose servisleri:

1. `postgres`
- Ana uygulama veritabanı

2. `elasticsearch`
- Arama altyapısı

3. `app`
- Node.js / Express backend
- Frontend statik dosyalarını da servis eder

4. `onlyoffice`
- Office viewer/editor

5. `keycloak-postgres`
- Keycloak için ayrı veritabanı

6. `keycloak`
- Login, realm ve roller

7. `oauth2-proxy`
- Uygulamanın giriş kapısı

## 5. Klasör Yapısı ve Sorumluluklar

## 5.1 `src/`

### `src/server.js`
Projenin ana backend dosyasıdır.

Sorumlulukları:
- Express uygulamasını ayağa kaldırmak
- API route'larını tanımlamak
- ingest işlemleri
- proxy / thumbnail / OCR / subtitle iş akışları
- admin araçları
- version akışları
- ONLYOFFICE ve PDF route'ları
- Elasticsearch indeksleme

Not:
Bu dosya büyük bir merkez dosyadır. Uygulamanın ana iş mantığı burada toplanmıştır.

### `src/db.js`
PostgreSQL bağlantısını ve tablo oluşturma işlemlerini yönetir.

Önemli tablolar:
- `assets`
- `asset_versions`
- `asset_cuts`
- `asset_subtitle_cues`
- `asset_ocr_segments`
- `media_processing_jobs`
- `admin_settings`
- `learned_turkish_corrections`

### `src/permissions.js`
İzin tanımları ve rol -> permission çözümleme mantığı burada bulunur.

Sorumlulukları:
- permission listesi
- legacy alan eşlemeleri
- super-admin çözümleme
- permission normalizasyonu

### `src/transcribe_whisper.py`
`faster-whisper` ile altyazı üretir.

Sorumlulukları:
- medya dosyasını transcribe etmek
- VTT formatında çıktı üretmek
- cue bölme mantığını uygulamak

### `src/transcribe_whisperx.py`
WhisperX tabanlı hizalama/transkripsiyon akışı için kullanılır.

### `src/video_ocr_frame_prep.py`
OCR öncesinde frame hazırlama ve ön işleme tarafında kullanılır.

### `src/video_ocr_paddle.py`
PaddleOCR ile video OCR işlemlerini yürütür.

## 5.2 `public/`

### `public/index.html`
Ana MAM uygulama sayfasıdır.

Kolonlar:
1. Arama + ingest
2. Asset listesi
3. Asset detail

### `public/main.js`
Ana uygulamanın neredeyse tüm frontend iş mantığı burada bulunur.

Sorumlulukları:
- dil değişimi
- kullanıcı bilgisi yükleme
- arama ve suggestion akışı
- asset listesi render
- detail panel render
- metadata formu
- video player entegrasyonu
- subtitle / OCR görünümü
- version işlemleri
- upload akışı

### `public/styles.css`
Ana uygulama stilleri.

Sorumlulukları:
- panel yerleşimi
- responsive davranış
- asset kartları
- detail panel
- video araçları
- modal pencereler

### `public/admin.html`
Yönetim ekranının ana sayfası.

Ana bölümler:
- API yardım dokümanı
- Sistem sağlığı
- Genel ayarlar
- Workflow takibi
- Proxy araçları
- OCR kayıtları
- Subtitle kayıtları
- Kullanıcı izinleri

### `public/admin.js`
Yönetim ekranının frontend iş mantığı.

Sorumlulukları:
- admin tab geçişleri
- proxy job izleme
- asset generation tool
- OCR ve subtitle yönetimi
- kullanıcı yetki yönetimi
- sistem sağlığı görünümü

### `public/admin.css`
Yönetim ekranının stilleri.

### `public/pdf-viewer.html`
PDF dosyalarının web içinde görüntülenmesi için ayrı sayfa.

Sorumlulukları:
- PDF preview
- arama
- zoom
- sayfa dolaşımı
- PDF düzenleme/işaretleme entegrasyonu

### `public/office-viewer.html`
ONLYOFFICE viewer/editör gömme sayfası.

Sorumlulukları:
- `/api/assets/:id/office-config` ile config almak
- ONLYOFFICE scriptini yüklemek
- viewer/editor'ü sayfaya mount etmek

### `public/i18n.json`
İngilizce/Türkçe arayüz metinleri.

## 5.3 `keycloak-theme/`
Keycloak giriş ekranının tema özelleştirmeleri burada tutulur.

Özellikle:
- login başlığı
- tema metinleri
- Türkçe / İngilizce mesajlar

## 5.4 `scripts/`
Operasyonel yardımcı scriptler burada tutulur.

Örnekler:
- `up_latest_main.sh`
- `up-fast.sh`
- `migrate_ocr_labels.js`
- Docker image publish/doğrulama scriptleri

## 5.5 `deploy/`
Daha kolay kurulum ve turnkey deploy tarafı burada bulunur.

## 5.6 `docs/`
Dokümantasyon dosyaları burada tutulur.

## 5.7 `uploads/`
Medya ve türev dosyaların saklandığı çalışma alanı.

Alt klasörler:
- `uploads/proxies`
- `uploads/thumbnails`
- `uploads/subtitles`
- `uploads/ocr`
- tarih bazlı orijinal ingest klasörleri

## 5.8 `training/`
Eğitim ve deneysel OCR / ASR hazırlıkları için kullanılan klasörler.

## 5.9 `ocrtest_lab/`
Ana uygulamadan bağımsız test/deney alanı.

## 6. Ana Kod Bileşenleri

## 6.1 Asset modeli
Bir asset şu bilgileri taşır:
- başlık
- açıklama
- tür
- tag'ler
- sahibi
- süre
- kaynak dosya yolu
- medya URL'i
- proxy URL'i
- thumbnail URL'i
- mime type
- Dublin Core metadata
- workflow durumu
- trash durumu

## 6.2 Version sistemi
Version mantığı şu durumlarda çalışır:
- manuel version ekleme
- PDF save
- PDF restore
- Office save
- Office restore
- admin file replace

Asset'in eski snapshot'ları `asset_versions` tablosunda tutulur.

## 6.3 OCR sistemi
OCR tarafında ana yaklaşım:
1. videodan kare üretme
2. ön işleme
3. PaddleOCR
4. satır ve segment normalizasyonu
5. segmentleri DB'ye yazma
6. aramada kullanılabilir hale getirme

## 6.4 Subtitle sistemi
Subtitle tarafında:
1. ses kaynağı seçilir
2. whisper / whisperx akışı çalışır
3. cue listesi üretilir
4. VTT / altyazı kayıtları saklanır
5. arama ve player üstü gösterim için indekslenir

## 6.5 Office sistemi
Office tarafında:
- ONLYOFFICE config endpoint'i backend'den gelir
- viewer/editor frontend'de gömülür
- kaydetme callback'i backend tarafından işlenir
- version akışı Office save/restore ile entegredir

## 6.6 PDF sistemi
PDF tarafında:
- ayrı viewer sayfası vardır
- sayfa bazlı görüntüleme yapılır
- arama yapılabilir
- ileri seviye araçlar permission ile korunur

## 7. Yetki Modeli

Ana izinler:

1. `admin.access`
- admin sayfasına erişim
- bazı kritik yönetim işlemleri

2. `metadata.edit`
- asset metadata alanlarını düzenleme

3. `office.edit`
- Office belge düzenleme
- Office version listesini görebilme

4. `asset.delete`
- varlığı çöpe taşıma
- çöpten geri yükleme
- kalıcı silme
- bazı silme aksiyonları

5. `pdf.advanced`
- gelişmiş PDF araçları

## 8. Sayfa Bazlı Sorumluluk Özeti

### Ana sayfa (`/`)
Kullanım amacı:
- asset arama
- asset yükleme
- asset görüntüleme
- metadata düzenleme
- video izleme
- OCR ve altyazı görünümü

### Admin sayfası (`/admin.html`)
Kullanım amacı:
- sistem sağlığı
- proxy araçları
- OCR kayıt yönetimi
- subtitle kayıt yönetimi
- kullanıcı izinleri
- ayarlar

### PDF viewer (`/pdf-viewer.html`)
Kullanım amacı:
- PDF görüntüleme ve arama

### Office viewer (`/office-viewer.html`)
Kullanım amacı:
- Word/Excel/PowerPoint görünümü ve düzenleme

## 9. Docker Dışından Operasyonel Komutlar

Aşağıdaki komutlar host makineden çalıştırılır. Yani terminalde Docker container içine manuel girmeden kullanılabilir.

## 9.1 Servislerin durumunu görme

```bash
docker compose ps
```

Belirli container logları:

```bash
docker compose logs -f app
docker compose logs -f postgres
docker compose logs -f elasticsearch
docker compose logs -f keycloak
docker compose logs -f oauth2-proxy
docker compose logs -f onlyoffice
```

## 9.2 PostgreSQL sorguları

### Host üzerinden doğrudan PostgreSQL'e bağlanma

```bash
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d mam_mvp
```

### Tek satırlık örnek sorgular

Son 20 asset:

```bash
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d mam_mvp -c "SELECT id, title, type, file_name, proxy_status, updated_at FROM assets ORDER BY updated_at DESC LIMIT 20;"
```

Proxy'siz video asset'ler:

```bash
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d mam_mvp -c "SELECT id, title, media_url, proxy_url, proxy_status FROM assets WHERE lower(type) = 'video' AND coalesce(proxy_url, '') = '';"
```

Metadata-only kayıtlar:

```bash
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d mam_mvp -c "SELECT id, title, media_url, source_path, proxy_url, proxy_status FROM assets WHERE coalesce(media_url, '') = '' AND lower(type) = 'video';"
```

Version kayıtları:

```bash
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d mam_mvp -c "SELECT asset_id, label, action_type, actor_username, created_at FROM asset_versions ORDER BY created_at DESC LIMIT 30;"
```

Subtitle cue sayıları:

```bash
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d mam_mvp -c "SELECT asset_id, count(*) AS cue_count FROM asset_subtitle_cues GROUP BY asset_id ORDER BY cue_count DESC LIMIT 20;"
```

OCR segment sayıları:

```bash
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d mam_mvp -c "SELECT asset_id, count(*) AS segment_count FROM asset_ocr_segments GROUP BY asset_id ORDER BY segment_count DESC LIMIT 20;"
```

## 9.3 Elasticsearch kontrolü

Cluster sağlık durumu:

```bash
curl -s http://localhost:9200/_cluster/health | jq
```

Index listesi:

```bash
curl -s http://localhost:9200/_cat/indices?v
```

Asset arama örneği:

```bash
curl -s http://localhost:9200/mam_assets/_search -H 'Content-Type: application/json' -d '{
  "size": 5,
  "query": {
    "match": {
      "title": "haber"
    }
  }
}' | jq
```

## 9.4 FFmpeg / FFprobe kontrolü

### Container içindeki ffmpeg sürümünü host terminalinden kontrol etme

```bash
docker compose exec app ffmpeg -version
```

```bash
docker compose exec app ffprobe -version
```

### Belirli bir dosyanın medya bilgisini alma

```bash
docker compose exec app ffprobe -hide_banner -show_streams -show_format /app/uploads/proxies/ornek-proxy.mp4
```

### Belirli bir asset için dosya yolunu önce DB'den bulup sonra kontrol etme

```bash
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d mam_mvp -At -c "SELECT source_path FROM assets WHERE id = 'ASSET_ID';"
```

Çıkan yol için ffprobe:

```bash
docker compose exec app ffprobe -hide_banner "DOSYA_YOLU"
```

### Video proxy üretiminde ffmpeg hatası test etme

```bash
docker compose exec app ffmpeg -hide_banner -y -i "DOSYA_YOLU" -map 0:v:0 -c:v libx264 -preset veryfast -crf 31 -pix_fmt yuv420p -profile:v main -level 4.0 -vf scale=640:-2:force_original_aspect_ratio=decrease -map 0:a:0 -c:a aac -b:a 128k -movflags +faststart /tmp/test-proxy.mp4
```

### Sadece ses akışını test etme

```bash
docker compose exec app ffmpeg -hide_banner -v error -i "DOSYA_YOLU" -map 0:a:0 -f null -
```

### Sadece video akışını test etme

```bash
docker compose exec app ffmpeg -hide_banner -v error -i "DOSYA_YOLU" -map 0:v:0 -f null -
```

## 9.5 Uygulama API'sini host üzerinden kontrol etme

Sağlık amacıyla ana sayfa:

```bash
curl -I http://localhost:3000
```

App container doğrudan:

```bash
curl -I http://localhost:3001
```

Keycloak realm config:

```bash
curl -s http://localhost:8081/realms/mam/.well-known/openid-configuration | jq
```

## 10. Bakım Notları

1. `src/server.js` büyük ve merkezi bir dosya
- Yeni projede modüllere ayrılması en doğru adım olacaktır.

2. Frontend Vanilla JS ile büyümüş durumda
- Özellikle workflow orchestrator ve HSM entegrasyonu düşünülüyorsa ileri aşamada modüler bir frontend yaklaşımı düşünülebilir.

3. `uploads/` canlı veri alanıdır
- Temizlik veya silme işlemlerinde dikkatli olunmalıdır.

4. Metadata-only video kayıtları özel bir akıştır
- Bu kayıtlar, kullanıcı proxy üretmeden metadata'yı sisteme girebilsin diye tutulur.
- Gerekirse admin aracıyla sonradan kaynak video bağlanabilir.

## 11. Sonuç

Bu proje, tek uygulama içinde hem medya yönetimi hem görüntüleme hem işleme hem de yönetim araçlarını bir araya getiren güçlü bir MAM uygulamasıdır.

Mevcut mimari şu işlerde yeterince güçlüdür:
- medya ingest
- metadata yönetimi
- video izleme
- OCR ve altyazı işleme
- Office/PDF görüntüleme
- admin operasyonları
- permission yönetimi

Ancak yapı büyüdükçe özellikle şu alanlar ayrı modül/servis olarak düşünülmelidir:
- workflow orchestrator
- HSM / tape library entegrasyonu
- bağımsız media worker servisleri
- daha modüler frontend mimarisi

Bu doküman, projenin son stabil halini anlamak ve devralmak isteyen geliştirici için başlangıç referansı olarak kullanılabilir.
