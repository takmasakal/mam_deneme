# AI ve Media Operations worker geçiş planı

Amaç, MetMAM ve Belgelik'in mevcut tek-sunucu davranışını korurken AI ve medya
işlerini ileride bağımsız sunucularda çalıştırabilmektir. Varsayılan çalışma modu
tüm geçiş boyunca `local` kalır.

Üretim akışlarını uzak worker'lara bağlamak için kalan ayrıntılı işler ve kabul
kriterleri `docs/processing-remote-migration-backlog.md` dosyasında tutulur.

## Durum

| Alan | Durum | Açıklama |
|---|---|---|
| ProcessingJob sözleşmesi | Tamamlandı | Görev adları, domain ve storage referansları tanımlı. |
| Primary/scratch storage | Tamamlandı | Kalıcı ve geçici paylaşımlı dosya alanları ayrıldı. |
| Local/remote adapter sınırı | Tamamlandı | Görevler tek tek remote moda geçirilebilir. |
| Remote HTTP istemcisi | Tamamlandı | Gönderme, polling, ilerleme, timeout ve iptal desteği var. |
| Worker HTTP sözleşmesi | Tamamlandı | Health, capabilities, submit, status ve cancel uçları ile Bearer auth hazır. |
| Thumbnail/proxy/probe | Tamamlandı | Standart Media Operations hattından çalışıyor. |
| Ses çıkarma | Tamamlandı | `audio.extract` ve scratch storage üzerinden çalışıyor. |
| Kalıcı worker job store | Tamamlandı | PostgreSQL persistence, atomik lease/claim, periyodik lease yenileme, retry, iptal ve süresi dolmuş lease recovery hazır. |
| Genel transcode/türevler | Tamamlandı | Genel transcode, görsel preview/thumbnail ve PDF/Office doküman preview/thumbnail worker görevleri hazır. |
| OCR aşama ayrımı | Tamamlandı | Frame hazırlama MediaOps; video ve foto OCR inference PaddleOCR ile AI worker'da. |
| Altyazı AI görevi | Tamamlandı | Whisper/WhisperX standart AI job executor üzerinden çalışabiliyor. |
| Offline model kataloğu | Tamamlandı | Kurulu modeller, görev/varyant bilgisi ve capability çıktısı katalogdan geliyor. |
| Çeviri/metadata AI işleri | Tamamlandı | Marian çeviri, Ollama metadata ve doküman özetleme standart AI job girişinde. |
| MediaOps worker entrypoint | Tamamlandı | Proxy, thumbnail, probe ve audio görevlerini bağımsız proses çalıştırabilir. |
| AI worker entrypoint/deploy | Tamamlandı | Ayrı AI prosesi ve isteğe bağlı compose worker profili hazır. |
| Mevcut iş akışlarının yönlendirilmesi | Kısmi | Adapter hazır; eski uygulama metotları güvenli geçiş için varsayılan local kalıyor. |
| Operasyonel gözlemleme | Kısmi | Health/sayaçlar ve jobId tabanlı JSON log korelasyonu hazır; harici metrics toplama ve ayrıntılı admin worker görünümü bekliyor. |

## Zorunlu uygulama sırası

1. Genel transcode, görsel/doküman türevleri ve OCR frame hazırlama.
2. AI worker entrypoint ve offline model kataloğu.
3. Altyazı, çeviri, OCR inference ve metadata enrichment geçişi.
4. Capability uyumluluk kontrolü; desteklenmeyen model/görevin erken reddi.
5. Ayrı sunucu compose/deploy örnekleri, NetApp mount ve token yönetimi.
6. Kademeli devreye alma: önce tek görev, ardından domain bazında remote mod.

Remote mod açılmadan önce paylaşımlı `primary` ve `scratch` mount'ları ile model
kataloğundaki yollar worker container'ında doğrulanmalıdır.

## İsteğe bağlı yerel worker denemesi

Varsayılan compose davranışı değişmez. Worker'ları aynı sunucuda ayrı prosesler
olarak başlatmak için güçlü bir token ve katalog tanımlayıp şu override kullanılır:

```bash
docker compose -f docker-compose.yml -f docker-compose.processing-workers.yml \
  --profile processing-workers up -d media-operations-worker ai-operations-worker
```

API tarafında görevler ancak ilgili `*_EXECUTION_MODE=remote` seçildiğinde bu
servislere yönlenir. Geçişi önce tek bir test göreviyle yapmak gerekir.

Örnek katalog (gerçek kurulu yollarla değiştirilmelidir):

```json
[
  {"id":"small","task":"subtitle.generate","provider":"local","path":"/opt/mam-models/huggingface","variant":"small"},
  {"id":"opus-mt-tc-big-en-tr","task":"subtitle.translate","provider":"local","path":"/opt/mam-models/marian/opus-mt-tc-big-en-tr"},
  {"id":"paddle-latin","task":"video.ocr","provider":"local","path":"/opt/mam-models"},
  {"id":"paddle-latin","task":"photo.ocr","provider":"local","path":"/opt/mam-models"},
  {"id":"gemma3:4b","task":"metadata.enrich","provider":"ollama"},
  {"id":"gemma3:4b","task":"document.summarize","provider":"ollama"}
]
```

## Remote worker HTTP sözleşmesi

- `GET /health`: servis ve domain sağlık bilgisi
- `GET /v1/capabilities`: desteklenen görevler ve ileride modeller
- `POST /v1/jobs`: standart ProcessingJob gönderimi
- `GET /v1/jobs/:jobId`: durum ve sonuç sorgusu
- `DELETE /v1/jobs/:jobId`: iptal isteği

`/v1/*` uçları Bearer token gerektirir. İş payload'larında mutlak dosya yolu veya
gizli bilgi bulunmaz; yalnızca adlandırılmış storage referansları taşınır.
