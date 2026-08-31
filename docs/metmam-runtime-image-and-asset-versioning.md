# MetMAM Runtime Image ve Görsel Versiyonlama

## 1. Amaç

MetMAM uygulama image'ı yeniden oluşturulurken FFmpeg, Whisper, Torch, PaddleOCR ve LibreOffice paketlerinin her kaynak kodu değişikliğinde yeniden kurulmasını önlemek.

İkinci amaç, görsel asset versiyonlarının yeni dosyayı gerçekten temsil etmesi ve önceki sürümlerin düşük çözünürlüklü önizlenebilmesidir.

## 2. Image yapısı

Bağımlılık image'ı:

```text
mam_deneme-runtime:latest
```

Bu image içinde şunlar bulunur:

- FFmpeg
- Python ve Whisper bağımlılıkları
- Torch, Torchaudio, WhisperX
- PaddleOCR ve PaddlePaddle
- Poppler, Antiword, Restic
- LibreOffice (etkinleştirilmişse)
- Offline Whisper/Paddle/Marian model cache'leri

Uygulama image'ı (`mam_deneme-app`) yalnızca runtime image'ını temel alır ve npm bağımlılıkları ile `public`/`src` kaynaklarını ekler.

## 3. Normal uygulama güncellemesi

Kaynak kod değişikliklerinde:

```bash
docker compose build app
docker compose up -d --no-build app
```

Bu işlem runtime image'ını yeniden kurmaz. Sadece npm ve uygulama kaynak katmanları değerlendirilir.

## 4. Runtime bağımlılığı güncellemesi

FFmpeg, Whisper, Torch, PaddleOCR veya model sürümü bilinçli olarak değiştirilecekse:

```bash
./deploy/build-runtime.sh
docker compose build app
docker compose up -d --no-build app
```

`build-runtime.sh` çalıştırılmadığı sürece runtime bağımlılıkları güncellenmez.

`Dockerfile.runtime` değiştiğinde veya runtime image ilk kez kurulurken FFmpeg/Python/Torch katmanı tekrar oluşabilir. Normal uygulama kodu güncellemelerinde `docker build -f Dockerfile.runtime ...` çalıştırılmamalıdır.

## 4.1 Offline model cache hazırlama

Runtime bağımlılıklarını yeniden kurmadan, çalışan app container'ındaki kalıcı model cache volume'unu doldurmak için:

```bash
./deploy/prepare-models.sh marian
```

Bu komut İngilizce altyazıyı Türkçeye çevirmek için kullanılan Marian modelini şu dizine hazırlar:

```text
/opt/mam-models/marian/opus-mt-tc-big-en-tr
```

Diğer seçenekler:

```bash
./deploy/prepare-models.sh whisper
./deploy/prepare-models.sh paddle
./deploy/prepare-models.sh all
```

Yeni bir model eklendiğinde tercih edilen akış:

1. Model için `scripts/prepare_offline_models.py` içine açık bir preload seçeneği eklenir.
2. `deploy/prepare-models.sh` içine kısa komut eklenir.
3. Runtime kodu modeli eksikse internetten indirmez, net hata verir.
4. Model cache'i `/opt/mam-models` altında kalıcı volume'da tutulur.

## 5. Görsel versiyon oluşturma

Bir görsel asset açılır ve 3. kolondaki **Versiyon Oluştur** alanında yeni fotoğraf seçilir. Sistem:

1. İlk değişimde mevcut fotoğrafı `v1` olarak snapshot'lar.
2. Yeni fotoğrafı `v2` olarak aktif asset yapar.
3. Sonraki değişimlerde yeni dosyayı bir sonraki sürüm olarak kaydeder.
4. Asset ID, görünürlük ve yetkileri korur.
5. Orijinal dosyayı sürüm indirme için saklar.
6. Görsel için en fazla 1280 px genişliğinde preview ve yaklaşık 480 px genişliğinde thumbnail üretir.

## 6. Önceki sürüm önizlemesi

Sürüm listesindeki **Önizle** butonu şu endpoint'i kullanır:

```text
GET /api/assets/:assetId/versions/:versionId/preview
```

Endpoint önce `snapshot_thumbnail_url` dosyasını servis eder. Böylece:

- aktif sürüm değiştirilmez,
- orijinal dosya doğrudan tarayıcıya verilmez,
- önceki sürüm düşük çözünürlükte görüntülenir.

Sürüm indirme endpoint'i ise orijinal snapshot dosyasını kullanmaya devam eder.

## 7. Kontroller

Kaynak kod kontrolleri:

```bash
node --check src/routes/assets.js
node --check src/services/imageDerivativeService.js
node --check public/main-detail.js
node --check public/main.js
git diff --check
```

Test sırasında yeni fotoğraf yüklendiğinde sürüm listesinin `v1` ve `v2` kayıtlarını göstermesi, her sürümün **Önizle** butonunda farklı görsel açması ve önizlemenin orijinal dosyadan küçük olması beklenir.
