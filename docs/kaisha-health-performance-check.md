# Kaisha / Belgelik Sağlık ve Performans Ölçüm Rehberi

Bu doküman Belgelik uygulamasının Kaisha sunucusunda ayrıntılı sağlık ve performans ölçümünü standartlaştırır. Amaç tek tek komut hatırlamak yerine aynı test setini düzenli çalıştırmak, çıktıları karşılaştırılabilir raporlar halinde saklamak ve sorun olduğunda hangi katmanda arama yapılacağını hızlı belirlemektir.

İlgili script:

```bash
./deploy/kaisha-health-performance-check.sh
```

## 1. Ne Ölçülür?

Script aşağıdaki başlıkları tek bir Markdown raporunda toplar:

- Host kaynakları: CPU load, memory, disk, swap, en yoğun process'ler
- Docker durumu: çalışan container'lar, anlık container CPU/memory/I/O değerleri
- Compose render: `docker-compose.yml` + `docker-compose.kaisha.yml` effective config
- Container sağlığı: `kaisha-*` container status ve health state
- HTTP süreleri: public ve direct endpointler için DNS/connect/TLS/TTFB/toplam süre
- Assets listeleme performansı: tekrarlı `/api/assets?limit=20&offset=0` ölçümü
- PostgreSQL: asset sayısı, job durumları, aktif sorgular, tablo vacuum/analyze bilgisi
- Elasticsearch: cluster health, index listesi, `mam_assets` arama yanıtı
- OnlyOffice: `8082`, `api.js`, internal PostgreSQL cluster, socket, SSL key izinleri, loglar
- Keycloak/OAuth2 Proxy: well-known endpointler, OAuth env, auth/session/CSRF logları
- Uygulama logları: hata, uyarı, timeout, ffmpeg, metadata, OCR, altyazı ve unknown user izleri
- Nginx: mümkünse server block, body size, buffering, maintenance include ve son access logları
- Admin API: token verilirse system health, ffmpeg health ve runtime diagnostics

## 2. Hızlı Çalıştırma

Repo kökünde:

```bash
cd ~/mam_deneme
git switch takmasakal/kaisha
git pull --ff-only
chmod +x deploy/kaisha-health-performance-check.sh
./deploy/kaisha-health-performance-check.sh
```

Rapor varsayılan olarak şuraya yazılır:

```text
deploy/reports/kaisha-health-YYYYMMDD-HHMMSS/report.md
```

Ham çıktılar:

```text
deploy/reports/kaisha-health-YYYYMMDD-HHMMSS/raw/
```

## 3. API Token ile Derin Ölçüm

Token verilmezse auth gerektiren endpointler `401/403` dönebilir ve admin endpointleri atlanır. API token ile çalıştırmak için:

```bash
MAM_API_TOKEN='TOKEN_BURAYA' ./deploy/kaisha-health-performance-check.sh
```

Token kullanan endpointler:

- `/api/assets`
- `/api/admin/system-health`
- `/api/admin/ffmpeg-health`
- `/api/admin/runtime-diagnostics`

API token kullanıcısı Kaisha tarafında tanımlı olmalı ve gerekli admin/yetki kapsamına sahip olmalıdır.

## 4. Parametreler

Script environment değişkenleriyle ayarlanır:

```bash
BASE_URL=https://belgelik.trt.net.tr
AUTH_URL=https://authbelgelik.trt.net.tr
OFFICE_URL=https://officebelgelik.trt.net.tr
DIRECT_APP_URL=http://127.0.0.1:3000
DIRECT_OFFICE_URL=http://127.0.0.1:8082
DIRECT_KEYCLOAK_URL=http://127.0.0.1:8081
ELASTIC_URL=http://127.0.0.1:9200
TIMING_RUNS=5
LOG_TAIL=160
REPORT_DIR=deploy/reports
MAM_API_TOKEN=...
```

Örnek:

```bash
TIMING_RUNS=10 LOG_TAIL=300 MAM_API_TOKEN='TOKEN_BURAYA' \
  ./deploy/kaisha-health-performance-check.sh
```

## 5. Yanıt Sürelerini Yorumlama

Script `curl -w` ile şu alanları raporlar:

```text
status=200 total=0.048s dns=0.001s connect=0.003s tls=0.010s starttransfer=0.045s size=77138
```

Alanların anlamı:

- `status`: HTTP durum kodu
- `dns`: DNS çözümleme süresi
- `connect`: TCP bağlantı kurma süresi
- `tls`: HTTPS el sıkışma süresi
- `starttransfer`: ilk byte gelene kadar geçen süre, backend/gecikme için en yararlı metrik
- `total`: toplam istek süresi
- `size`: indirilen yanıt boyutu

Pratik eşikler:

- `/api/health`: genelde 100 ms altı beklenir.
- `/api/ui-settings`, `/api/workflow`: genelde 100 ms altı beklenir.
- `/api/assets?limit=20`: veri ve thumbnail alanlarına bağlıdır; 500 ms üstü düzenli görülüyorsa DB/index/asset mapping incelenir.
- Arama endpointleri: 1 saniye üstü düzenli görülüyorsa Elasticsearch, Postgres fallback veya highlight üretimi incelenir.
- İlk istek yavaş, sonraki istekler hızlıysa cache/warmup etkisi olabilir.

## 6. Host Kaynakları

Kontrol edilecek başlıklar:

- Load average CPU çekirdek sayısına göre yüksek mi?
- `free -h` çıktısında swap kullanımı artıyor mu?
- Disk doluluk oranı yüksek mi?
- `/tmp`, repo dizini ve uploads diskleri yeterli mi?
- `docker stats` içinde `kaisha-app`, `kaisha-elasticsearch`, `kaisha-onlyoffice` memory kullanımı anormal mi?

Özellikle medya işleri sırasında:

- `kaisha-app` CPU artışı normaldir.
- FFmpeg/OCR/altyazı işlerinde kısa süreli yüksek CPU beklenir.
- Swap sürekli artıyorsa model/iş concurrency düşürülmelidir.

## 7. PostgreSQL Kontrolleri

Script şu sorguları çalıştırır:

- DB boyutu
- toplam asset sayısı
- asset type dağılımı
- medya job status dağılımı
- aktif sorgular
- tablo vacuum/analyze bilgisi

Dikkat edilecek durumlar:

- `pg_stat_activity` içinde uzun süre çalışan sorgular
- `n_dead_tup` değeri yüksek tablolar
- sürekli `active` kalan medya job kayıtları
- çok eski `last_autoanalyze` değerleri

Sorun varsa ilave komut:

```bash
docker exec kaisha-postgres psql -U postgres -d mam_mvp -c "
SELECT pid, now() - query_start AS age, state, wait_event_type, wait_event, query
FROM pg_stat_activity
WHERE state <> 'idle'
ORDER BY age DESC;
"
```

## 8. Elasticsearch Kontrolleri

Kaisha tek node Elasticsearch kullandığı için cluster status `yellow` olabilir. Tek node ortamda replica shard atanamadığı için bu beklenebilir.

Beklenenler:

- `timed_out: false`
- `number_of_nodes: 1`
- `active_primary_shards` pozitif
- pending task sayısı düşük

Kontrol:

```bash
curl -sS http://127.0.0.1:9200/_cluster/health?pretty
curl -sS http://127.0.0.1:9200/_cat/indices?v
```

`red` status varsa arama ve indeksleme davranışı güvenilir değildir.

## 9. OnlyOffice Kontrolleri

OnlyOffice tarafında script özellikle şunları kontrol eder:

- `http://127.0.0.1:8082`
- `http://127.0.0.1:8082/web-apps/apps/api/documents/api.js`
- container içindeki `pg_lsclusters`
- `:5432`, `:80`, `:8000` dinleyen socketler
- `/etc/ssl/private/ssl-cert-snakeoil.key` izinleri
- `kaisha-onlyoffice` logları

Sağlıklı durumda:

```text
16 main 5432 online
:80 dinliyor
api.js 200 dönüyor
```

Sık hata:

```text
Waiting for connection to the localhost host on port 5432
```

Bu, dışarıdaki `kaisha-postgres` değil, `kaisha-onlyoffice` container'ının kendi iç PostgreSQL servisidir.

SSL key izin hatası:

```text
private key file "/etc/ssl/private/ssl-cert-snakeoil.key" has group or world access
```

Bu durumda Kaisha compose entrypoint'i şu düzeltmeleri uygulamalıdır:

- sistem dizinlerinden group/world write iznini kaldırmak
- `ssl-cert-snakeoil.key` için `root:ssl-cert` ve `0640` kullanmak

## 10. OAuth2 Proxy / Keycloak Kontrolleri

Script şu izleri ayıklar:

- CSRF hataları
- callback hataları
- `invalid_grant`
- expired token
- issuer uyuşmazlığı
- `/api/me`
- `/api/logout-url`
- `401/403`

Özellikle Belgelik'teki geçici `unknown user` durumları için şu loglar önemlidir:

```bash
docker logs --since=30m kaisha-oauth2-proxy | grep -Ei \
'csrf|callback|invalid_grant|invalid token issuer|unable to refresh|/api/me|/api/logout-url|401|403|expired|session'
```

Keycloak issuer kontrolü:

```bash
curl -sS https://authbelgelik.trt.net.tr/realms/mam/.well-known/openid-configuration | jq '.issuer'
```

Issuer browser-facing URL ile uyumlu olmalıdır:

```text
https://authbelgelik.trt.net.tr/realms/mam
```

## 11. Nginx Kontrolleri

Script `sudo -n` çalışabiliyorsa Nginx config ve access log parçalarını rapora ekler. Parolasız sudo yoksa bu bölüm atlanır.

Elle kontrol:

```bash
sudo nginx -T 2>/dev/null | grep -n -B8 -A12 -Ei \
'server_name belgelik|server_name authbelgelik|server_name officebelgelik|client_max_body_size|proxy_request_buffering|belgelik-maintenance'
```

Beklenen önemli ayarlar:

- `belgelik.trt.net.tr -> 127.0.0.1:3000`
- `authbelgelik.trt.net.tr -> 127.0.0.1:8081`
- `officebelgelik.trt.net.tr -> 127.0.0.1:8082`
- yüksek dosya yükleme için uygun `client_max_body_size`
- uzun işlemler için `proxy_read_timeout` ve `proxy_send_timeout`
- maintenance snippet include'ları

## 12. Ölçüm Senaryoları

### 12.1 Normal Durum Baz Çizgisi

Sistem sakinken:

```bash
TIMING_RUNS=10 MAM_API_TOKEN='TOKEN_BURAYA' \
  ./deploy/kaisha-health-performance-check.sh
```

Bu rapor ilerideki değişikliklerle karşılaştırılacak baz çizgi olarak saklanır.

### 12.2 Arama Performansı

Script şu aramaları ölçer:

- genel sorgu: `q=istanbul`
- OCR: `ocr=istanbul`
- altyazı: `subtitle=istanbul`
- etiket: `tag=istanbul`
- klip: `clip=istanbul`

Bu endpointlerden biri diğerlerine göre belirgin yavaşsa ilgili indeks/fallback mantığı incelenir.

### 12.3 Medya İşleri Sırasında Ölçüm

OCR, altyazı, proxy veya metadata işi çalışırken:

```bash
LOG_TAIL=300 MAM_API_TOKEN='TOKEN_BURAYA' \
  ./deploy/kaisha-health-performance-check.sh
```

Özellikle bakılacak yerler:

- `docker stats`
- `media_processing_jobs` status dağılımı
- `kaisha-app` logları
- `pg_stat_activity`
- swap kullanımı

### 12.4 OnlyOffice Sorunu

Word/Excel önizleme çalışmıyorsa:

```bash
./deploy/kaisha-health-performance-check.sh
```

Rapor içinde önce şu bölümlere bak:

- `OnlyOffice`
- `Container Sağlığı`
- `Uygulama Logları`
- `Nginx`

## 13. Rapor Karşılaştırma

İki raporu karşılaştırmak için:

```bash
diff -u \
  deploy/reports/kaisha-health-ESKI/report.md \
  deploy/reports/kaisha-health-YENI/report.md
```

Özellikle şu alanları karşılaştır:

- `/api/assets` toplam süreleri
- arama endpoint toplam süreleri
- DB asset/job sayıları
- Elasticsearch health
- Docker memory kullanımı
- loglarda yeni hata paterni

## 14. Çıktıların Saklanması

Rapor dizinleri repo altında oluşur ama normalde commit edilmemelidir:

```text
deploy/reports/
```

Gerekirse incident için ilgili rapor sıkıştırılıp ayrıca arşivlenebilir:

```bash
tar -czf /tmp/kaisha-health-YYYYMMDD-HHMMSS.tar.gz deploy/reports/kaisha-health-YYYYMMDD-HHMMSS
```

## 15. Sonuç Değerlendirme

Script sonunda özet verir:

```text
Summary: PASS=... WARN=... FAIL=... SKIP=...
```

Yorum:

- `FAIL=0`: teknik sağlık kontrolleri geçmiştir.
- `WARN>0`: auth/token/sudo gibi ölçümü sınırlayan durumlar olabilir.
- `FAIL>0`: raporda ilgili başlık altındaki ham çıktıya bakılmalıdır.
- `SKIP>0`: komut bulunmadığı veya yetki olmadığı için bazı kontroller atlanmıştır.

Bu script performans testi aracı değil, ayrıntılı operasyonel sağlık/perf snapshot aracıdır. Yük testi gerekiyorsa ayrıca kontrollü concurrency ile `wrk`, `hey` veya benzeri araçlarla ayrı bir test planı hazırlanmalıdır.
