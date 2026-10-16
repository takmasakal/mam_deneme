# AI ve MediaOps uzak sunucu geçişi: kalan işler

Bu doküman, MetMAM ve Belgelik için hazırlanmış AI/Media Operations altyapısının
ileride ayrı sunucularda üretime alınması sırasında kullanılacak uygulama
listesidir. Mevcut sistemde varsayılan çalışma şekli `local` kalır. Aşağıdaki
işler tamamlanmadan tüm domain için `remote` mod açılmamalıdır.

## Mevcut başlangıç noktası

Hazır olan altyapı:

- `ProcessingJob` görev ve storage referansı sözleşmesi
- AI ve MediaOps worker HTTP servisleri
- Bearer token doğrulaması ve capability/model ön kontrolü
- PostgreSQL kalıcı job store, atomik claim, retry ve lease heartbeat
- İptal, kontrollü kapanış ve yapılandırılabilir concurrency
- `primary` ve `scratch` paylaşımlı storage yönlendirmesi
- Offline model kataloğu
- Non-blocking `submit/get/cancel` ve blocking `execute` istemci yüzeyleri
- Health, sayaçlar ve job-ID tabanlı JSON logları
- Aynı sunucuda deneme için `docker-compose.processing-workers.yml`

Hazır executor görevleri:

- AI: altyazı üretme, altyazı çevirme, video/foto OCR, metadata enrichment,
  doküman özetleme
- MediaOps: proxy, video/görsel/doküman thumbnail ve preview, probe, ses
  çıkarma, genel transcode ve OCR kare çıkarma

## Kalan ana çalışma

### 1. Eski kuyrukları standart job köprüsüne bağlama

Bugünkü kullanıcı ekranları bazı işlemlerde hâlâ uygulama içindeki eski yerel
kuyruk metotlarını kullanır. Her akış aşağıdaki ortak yaşam döngüsüne taşınmalı:

1. Kaynak ve hedef dosyalar storage referansına çevrilir.
2. `ProcessingJob` oluşturulur.
3. `submit` ile worker kuyruğuna gönderilir.
4. Uygulama kendi `media_processing_jobs` kaydında remote job kimliğini saklar.
5. Durum `get` ile izlenir veya daha sonra eklenecek callback/event üzerinden
   alınır.
6. İptal isteği hem uygulama kaydına hem worker `cancel` ucuna gönderilir.

İlk taşınacak akış sırası:

1. `video.probe`
2. `video.thumbnail`
3. `video.proxy`
4. `subtitle.translate`
5. `subtitle.generate`
6. `photo.ocr`
7. `video.ocr_frames` + `video.ocr`
8. `metadata.enrich` ve `document.summarize`

Altyazı üretiminde seçili ses kanalı varsa önce MediaOps `audio.extract`, sonra
AI `subtitle.generate` çalışmalıdır. Video OCR iki bağlı iş olarak yürütülmelidir:
önce MediaOps kareleri üretir, ardından AI bu kareleri okur.

### 2. Sonuç işleyicileri

Worker yalnızca dosya ve yapılandırılmış sonuç üretir. Uygulama tarafındaki bir
sonuç işleyici aşağıdaki kalıcı işlemleri yapmalıdır:

- üretilen URL/reference değerini asset kaydına yazmak;
- altyazı track/cue kayıtlarını oluşturmak veya güncellemek;
- OCR segmentlerini ve arama indeksini senkronize etmek;
- proxy, thumbnail ve preview alanlarını güncellemek;
- metadata/etiket/özet sonuçlarını kaydetmek;
- Elasticsearch indeksini yalnızca DB işlemi başarılı olduktan sonra yenilemek;
- geçici `scratch` dosyalarını başarı, hata ve iptal durumlarında temizlemek;
- işlemi audit ve `media_processing_jobs` geçmişine eklemek.

Sonuç işleyiciler idempotent olmalıdır. Aynı tamamlanma sonucu iki kez işlenirse
ikinci altyazı, ikinci OCR kaydı veya gereksiz dosya üretmemelidir.

### 3. Uygulama ve worker job kimliği eşlemesi

`media_processing_jobs` tablosuna veya request/result payload'ına şu alanlar
açık biçimde konmalıdır:

- `processingJobId`
- `processingDomain`
- `processingTask`
- `executionMode` (`local`/`remote`)
- `workerService`
- `inputReference` ve `outputReference`

Uygulamanın kullanıcıya gösterdiği job kimliği ile worker job kimliği mümkünse
aynı tutulmalıdır. Farklı olmak zorundaysa iki yönlü eşleme saklanmalıdır.

### 4. Görev bazında kademeli yönlendirme

Tüm AI veya MediaOps domain'ini tek seferde remote yapmayın. Ortam ayarına görev
allowlist'i ekleyin:

```text
AI_REMOTE_TASKS=subtitle.translate,subtitle.generate
MEDIA_REMOTE_TASKS=video.probe,video.thumbnail
```

Allowlist'te olmayan görevler local adapter üzerinden devam etmelidir. Worker
health/capability kontrolü başarısızsa davranış açıkça seçilmelidir:

- okuma/probe gibi güvenli görevlerde kontrollü local fallback düşünülebilir;
- dosya veya DB yan etkisi olan görevlerde otomatik fallback yapılmamalı,
  tekrar üretim riski nedeniyle iş açık hata vermelidir.

### 5. Polling yerine event/callback değerlendirmesi

İlk üretim sürümünde kontrollü polling kullanılabilir. İş sayısı yükseldiğinde
API'nin her job için sürekli worker sorgulaması yerine şu seçeneklerden biri
uygulanmalıdır:

- imzalı callback/webhook;
- PostgreSQL tabanlı event/outbox tüketicisi;
- güvenilir bir mesaj kuyruğu.

Callback kullanılırsa replay koruması, job kimliği doğrulaması, imza, timeout ve
idempotent sonuç işleme zorunludur.

## Altyapı hazırlığı

### Paylaşımlı storage

- API ve worker sunucuları aynı NetApp alanını görmelidir.
- Container içindeki mutlak yolların aynı olması gerekmez; `primary` ve `scratch`
  mantıksal anahtarları aynı dosyaya çözülmelidir.
- UID/GID, okuma-yazma, atomik rename ve dosya silme izinleri test edilmelidir.
- Saatler süren işler için mount kopması ve yeniden bağlanma davranışı test
  edilmelidir.
- `scratch` için yaşlandırma/temizlik politikası tanımlanmalıdır.

### Ağ ve güvenlik

- Worker portları kullanıcı ağına açılmamalıdır.
- API-worker trafiği VPN/özel ağ üzerinden yapılmalıdır.
- Her ortam için güçlü ve ayrı token kullanılmalıdır.
- Token secret manager veya korumalı environment kaynağından verilmelidir.
- Üretimde mümkünse TLS/mTLS veya reverse proxy kullanılmalıdır.
- `/health` hassas model yolu içermez; `/v1/*` uçları Bearer token gerektirir.

### Model dağıtımı

- Worker internete çıkmadan başlamalıdır.
- `AI_MODEL_CATALOG_JSON` yalnızca gerçekten kurulu modelleri listelemelidir.
- Her katalog girdisi görev, görünen model adı, varyant, provider ve yerel model
  yolunu içermelidir.
- Model dizinleri salt okunur mount edilebilir.
- Worker capability çıktısı ile admin tarafındaki model dropdown seçenekleri
  uyuşmalıdır.
- Yeni model önce staging worker'da kalite ve kaynak kullanımı testinden
  geçirilmelidir.

### PostgreSQL

- API ve worker aynı PostgreSQL'e erişecekse bağlantı limiti hesaplanmalıdır.
- AI ve MediaOps job tabloları ayrı tutulmalıdır.
- Uzun işler için lease süresi/heartbeat aralığı ölçülmelidir.
- Retry yalnızca geçici hatalara uygulanmalı; geçersiz model veya eksik dosya
  gibi kalıcı hatalar tekrar denenmemelidir.
- Job geçmişi için retention ve arşivleme politikası tanımlanmalıdır.

## Gözlemleme ve yönetim

Kalan gözlemleme işleri:

- admin ekranında AI ve MediaOps worker ayrıntı kartları;
- worker sürümü/commit bilgisi;
- görev bazında kuyruk uzunluğu, aktif iş ve hata oranı;
- ortalama ve yüzde 95 işlem süresi;
- retry, timeout ve iptal sayıları;
- storage boş alanı ve scratch yaşlı dosya sayısı;
- Prometheus/OpenTelemetry gibi harici metrics aktarımı;
- `jobId` ile API, worker ve sonuç işleyici loglarının birlikte aranması;
- worker erişilemezliği ve büyüyen kuyruk için alarm.

## Test planı

### Sözleşme ve birim testleri

- Her görev için geçerli/geçersiz ProcessingJob testi
- Path traversal ve bilinmeyen storage reddi
- Capability/model uyuşmazlığının submit öncesinde reddi
- Retry, lease expiry, heartbeat, iptal ve worker kapanışı
- Sonuç işleyicilerin idempotency testi

### Entegrasyon testleri

- API ve worker farklı container, aynı storage mount
- API ve worker farklı container yollarıyla aynı dosyayı okuma
- Worker yeniden başlatıldığında queued/running iş recovery
- Uzun altyazı/OCR sırasında lease yenileme
- İş sürerken iptal ve scratch temizliği
- PostgreSQL veya NetApp kısa süreli kesintisi
- Aynı asset için tekrarlanan submit
- Versiyon ve ek dosya kaynaklarında proxy/thumbnail

### Kullanıcı kabul testi

Her uygulamada en az şunlar denenmelidir:

- video yükle, proxy ve thumbnail üret;
- farklı versiyon ve video ek dosya yükle;
- altyazı üret ve İngilizceden Türkçeye çevir;
- seçili ses stream/channel ile altyazı üret;
- video OCR ve foto OCR çalıştır;
- doküman preview/thumbnail ve metadata üret;
- işlem sürerken admin sayfasına geç ve iptal et;
- worker kapalıyken anlaşılır hata gör;
- local moda dönüp aynı kullanıcı akışlarını tekrar çalıştır.

## Devreye alma sırası

1. Worker'ları mevcut sunucuda ayrı proses/container olarak başlatın.
2. Health ve capability çıktılarını doğrulayın.
3. `video.probe` görevini remote allowlist'e alın.
4. Thumbnail ve proxy görevlerini sırayla taşıyın.
5. Çeviri ile AI worker'ı düşük riskli bir görevde doğrulayın.
6. Altyazı, OCR ve metadata pipeline'larını sırayla taşıyın.
7. En az bir hafta local fallback hazır şekilde gözlemleyin.
8. Worker'ları ayrı sunucuya alın; yalnızca URL ve storage mount ayarlarını
   değiştirin.
9. Her aşamada geri dönüş testini uygulayın.

## Geri dönüş planı

- İlgili remote task allowlist'ten çıkarılır.
- Yeni işler local adapter'a yönlendirilir.
- Remote worker'daki aktif işler kontrollü biçimde tamamlanır veya iptal edilir.
- Tamamlanmış fakat sonucu işlenmemiş job'lar job kimliğiyle yeniden reconcile
  edilir.
- Worker tabloları ve üretilmiş dosyalar hemen silinmez.
- Sorunun nedeni giderildikten sonra yalnızca tek test görevi yeniden remote
  açılır.

## Tamamlanma ölçütü

Uzak sunucu hazırlığı aşağıdaki koşullar sağlandığında tamamlanmış sayılır:

- Eski UI/API kuyruklarının tamamı standart job köprüsünü kullanıyor.
- Sonuç işleyiciler ve iptal akışı idempotent çalışıyor.
- Görev bazında local/remote yönlendirme yapılabiliyor.
- NetApp, token, model ve ağ ayarları gerçek ortamda doğrulanmış.
- Worker restart, storage kesintisi ve uzun iş testleri geçmiş.
- Admin/metrics üzerinden işin hangi worker'da olduğu görülebiliyor.
- MetMAM ve Belgelik için ayrı rollback testi başarıyla uygulanmış.

## İlgili dosyalar

- `docs/processing-workers-roadmap.md`
- `docs/processing-storage-routing.md`
- `docker-compose.processing-workers.yml`
- `src/services/processingJobContract.js`
- `src/services/remoteProcessingAdapter.js`
- `src/services/processingWorkerService.js`
- `src/workers/aiOperationsWorker.js`
- `src/workers/mediaOperationsWorker.js`
