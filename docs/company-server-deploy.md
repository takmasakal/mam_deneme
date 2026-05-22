# MAM Deneme Şirket Server Kurulumu

Güncel tarih: 22.05.2026

Bu doküman `mam_deneme` uygulamasını şirket sunucusuna kurmak için güncel prosedürü anlatır. Bu sürümde HTTPS reverse proxy katmanı şirket tarafından yönetilir. Repo artık Nginx/Traefik container, sertifika dosyası veya reverse proxy compose profili taşımaz.

## 1. Mimari

```mermaid
flowchart LR
  U["Browser / MetMAM Mobil"] --> RP["Şirket Reverse Proxy / Load Balancer"]
  RP -->|https://mam.company.local| OP["oauth2-proxy :3000 host"]
  RP -->|https://auth.company.local| KC["Keycloak :8081 host"]
  RP -->|https://office.company.local| OO["OnlyOffice :8082 host"]
  OP --> APP["mam-app :3000 container"]
  APP --> PG["PostgreSQL mam_mvp"]
  APP --> ES["Elasticsearch"]
  APP --> UP["uploads volume"]
  KC --> KCPG["Keycloak PostgreSQL"]
  KC --> LDAP["LDAP / Active Directory"]
```

Repo tarafında kalan servisler:
- `app`: MAM backend/frontend
- `oauth2-proxy`: Browser login koruması
- `keycloak`: OIDC ve LDAP entegrasyonu
- `postgres`: MAM DB
- `keycloak-postgres`: Keycloak DB
- `elasticsearch`: arama
- `onlyoffice`: opsiyonel Office edit
- `libreoffice`: opsiyonel offline doküman preview/görüntüleme akışı

Şirketin sağlayacağı dış katman:
- TLS/HTTPS sertifikaları
- DNS yönlendirme
- Reverse proxy / load balancer routing
- Gerekirse WAF, header limitleri, upload limitleri

## 2. DNS ve Public URL Planı

Önerilen DNS adları:

```text
mam.company.local       -> MAM web ve API
auth.company.local      -> Keycloak
office.company.local    -> OnlyOffice, sadece kullanılacaksa
```

MetMAM mobil uygulama ayarı:

```text
Host/IP:       https://mam.company.local
API base URL:  https://mam.company.local
OIDC issuer:   https://auth.company.local/realms/mam
```

## 3. Şirket Reverse Proxy Gereksinimleri

Şirket reverse proxy şu upstreamlere yönlendirmeli:

```text
https://mam.company.local       -> http://SERVER_IP:3000
https://auth.company.local      -> http://SERVER_IP:8081
https://office.company.local    -> http://SERVER_IP:8082
```

Zorunlu headerlar:

```text
Host:               orijinal host
X-Forwarded-Proto:  https
X-Forwarded-Host:   orijinal host
X-Forwarded-Port:   443
X-Forwarded-For:    client IP zinciri
X-Real-IP:          client IP
```

Önerilen limitler:
- `mam.company.local`: büyük medya yüklemeleri için en az `20g` upload limiti
- `office.company.local`: büyük dokümanlar için en az `2g`, pratikte `20g` da kullanılabilir
- `auth.company.local`: `100m` yeterli olur
- Proxy timeout: medya upload/processing için en az `3600s`
- WebSocket/Upgrade headerları: OnlyOffice için açık olmalı

## 4. Server Gereksinimleri

Minimum öneri:
- Ubuntu Server 22.04 LTS veya 24.04 LTS
- Docker Engine
- Docker Compose plugin
- 4 CPU
- 16 GB RAM
- SSD disk

Pratik öneri:
- Orta kullanım: 8 CPU / 32 GB RAM / 1 TB SSD
- OCR/altyazı yoğun kullanım: daha fazla CPU/RAM veya ayrı worker mimarisi

## 5. Kurulum

Repo çekilir:

```bash
git clone https://github.com/takmasakal/mam_deneme.git
cd mam_deneme
```

Kaisha ayar dosyası oluşturulur:

```bash
./deploy/mam-kaisha.sh init mam.company.local auth.company.local office.company.local .company.local
```

Bu komut şunu üretir:

```text
deploy/.env.kaisha
```

Servisler başlatılır:

```bash
docker compose --env-file deploy/.env.kaisha \
  -f docker-compose.yml \
  -f docker-compose.kaisha.yml \
  up -d --build
```

Kısa komut alternatifi:

```bash
./deploy/mam-kaisha.sh up
```

URL kontrolü:

```bash
./deploy/mam-kaisha.sh urls
```

Servis kontrolü:

```bash
./deploy/mam-kaisha.sh ps
./deploy/mam-kaisha.sh logs app
./deploy/mam-kaisha.sh logs oauth2-proxy keycloak
```

## 6. Keycloak Production Notları

Şirket kurulumunda Keycloak public adresi `https://auth.company.local` olmalıdır.

`docker-compose.kaisha.yml` şu değerleri verir:

```yaml
KC_HOSTNAME: ${PUBLIC_KEYCLOAK_HOST}
KC_HOSTNAME_STRICT: "true"
KC_PROXY_HEADERS: xforwarded
KC_HTTP_ENABLED: "true"
```

Bunun anlamı:
- Keycloak HTTP olarak container içinde çalışır.
- HTTPS şirket reverse proxy tarafından sonlandırılır.
- Keycloak public URL ve issuer değerlerini `auth.company.local` üzerinden üretir.

## 7. Keycloak Client Ayarları

Realm: `mam`

Web client:

```text
Client ID: mam-web
Client authentication: On
Standard flow: On
Direct access grants: ihtiyaca göre Off/On
```

Redirect URI:

```text
https://mam.company.local/oauth2/callback
```

Post logout redirect URI:

```text
https://mam.company.local/*
```

Web origins:

```text
https://mam.company.local
```

Mobil client:

```text
Client ID: metmam-mobile
Client authentication: Off
Public client
Redirect URI: com.example.metmam:/oauth2redirect
```

## 8. LDAP / Active Directory

Keycloak Admin Console:

```text
Realm: mam
User federation -> Add LDAP provider
```

Önerilen yaklaşım:
- LDAP kullanıcıları Keycloak'a federated user olarak gelsin.
- LDAP dışı özel kullanıcılar Keycloak local user olarak oluşturulabilsin.
- Yetkiler LDAP grup mapper ile Keycloak grup/role yapısına taşınsın.

Önerilen LDAP grupları:

```text
mam-super-admin
mam-admin
mam-doc-admin
mam-text-admin
mam-user
```

MAM yetkileri:

```text
Super Admin: tüm yetkiler
Admin: yönetim sayfası dahil genel yönetim, ancak super-only işlemler hariç
Doc Admin: office.edit + pdf.advanced
OCR/Subtitle Admin: text.admin
Standard User: ek yönetim yetkisi yok
```

## 9. Offline Çalışma

Kurulum sonrası uygulama dışarıdan model indirmemeli.

Önemli env değerleri:

```text
MAM_OFFLINE_MODE=true
HF_HUB_OFFLINE=1
TRANSFORMERS_OFFLINE=1
PADDLE_OCR_ALLOW_FALLBACK=false
```

Model hazırlığı ilk kurulumda yapılmalı; GitHub'a model dosyası konmaz.

## 10. OnlyOffice / LibreOffice

Office web edit gerekiyorsa:

```text
OFFICE_EDITOR_PROVIDER=onlyoffice
ONLYOFFICE_PUBLIC_URL=https://office.company.local
ONLYOFFICE_INTERNAL_URL=http://onlyoffice
```

Sadece offline read-only preview istenirse LibreOffice modu kullanılabilir. Ancak Word üzerinde web edit isteniyorsa OnlyOffice gerekir.

## 11. Diagnostik Komutları

Genel durum:

```bash
./deploy/mam-kaisha.sh ps
```

App logları:

```bash
./deploy/mam-kaisha.sh logs app
```

Keycloak logları:

```bash
./deploy/mam-kaisha.sh logs keycloak
```

OAuth2 proxy logları:

```bash
./deploy/mam-kaisha.sh logs oauth2-proxy
```

DB bağlantısı:

```bash
docker exec -it mam-postgres psql -U postgres -d mam_mvp
```

Public endpoint testleri şirket reverse proxy üzerinden yapılmalı:

```bash
curl -I https://mam.company.local
curl -I https://auth.company.local/realms/mam
curl -I https://office.company.local/web-apps/apps/api/documents/api.js
```

## 12. Güncelleme

```bash
git pull
docker compose --env-file deploy/.env.kaisha \
  -f docker-compose.yml \
  -f docker-compose.kaisha.yml \
  up -d --build
```

Kısa komut:

```bash
./deploy/mam-kaisha.sh restart
```

## 13. Kaldırılan Repo Reverse Proxy Profili

Aşağıdakiler artık repo tarafından sağlanmaz:
- `docker-compose.kaisha-proxy.yml`
- repo içi Nginx container
- `deploy/nginx/*`
- `deploy/certs/*`
- repo içinde sertifika bağlama prosedürü

Bu sorumluluk şirket reverse proxy / load balancer ekibindedir.

## 14. Yönetim Sayfası Backup Ayarları

Yönetim sayfasında `Ayarlar -> Yedekleme` bölümünden yedekleme yönetilir.

Seçenekler:
- Günlük yedeklemeyi aç/kapat
- Yedekleme dizini
- Günlük çalışma saati
- Saklama süresi
- MAM PostgreSQL dump
- Keycloak PostgreSQL dump
- Uploads arşivi
- Manuel `Şimdi Yedekle`

Önerilen NFS kullanımında backup dizini:

```text
/app/uploads/_backups
```

Eğer host tarafında NFS mount şöyleyse:

```text
/data/belgelik/uploads -> container /app/uploads
```

backup dosyaları host tarafında şurada görünür:

```text
/data/belgelik/uploads/_backups
```

Notlar:
- MAM DB ve Keycloak DB yedekleri `pg_dump -Fc` formatında üretilir.
- Uploads arşivi `.tar.gz` olarak üretilir ve `_backups` klasörü arşive dahil edilmez.
- Gerçek storage-level NFS snapshot uygulama içinden alınmaz; bu şirket storage/backup altyapısında ayrıca planlanmalıdır.
- DB ve Elasticsearch ana verisi NFS üstünde tutulmamalıdır; NFS sadece uploads/backup dosyaları için önerilir.
