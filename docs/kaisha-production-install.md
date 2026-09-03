# Belgelik / Kaisha Production Kurulum Notu

Bu dokuman Belgelik'in Kaisha sunucusundaki canli kurulumunu tarif eder. Amaç, MetMAM lokal/deneme container'lari ile karismadan sadece `kaisha-*` servislerini ayaga kaldirmak, host Nginx reverse proxy, maintenance modu, LDAP/Keycloak ve ML model hazirliklarini tek yerde toplamaktir.

## 1. Repo ve Branch

Yeni sunucuda:

```bash
git clone https://github.com/takmasakal/mam_deneme.git mam_deneme
cd mam_deneme
git switch takmasakal/kaisha
```

Mevcut kurulumda guncelleme:

```bash
cd ~/mam_deneme
git fetch origin
git switch takmasakal/kaisha
git pull --ff-only
```

Kaisha icin ciplak `docker compose up -d` kullanma. Bu komut temel compose dosyasindaki `mam-*` container adlarini da devreye sokabilir ve port cakismasi yaratabilir. Kaisha icin her zaman sarmalayici scripti veya ayni compose kombinasyonunu kullan:

```bash
./deploy/mam-kaisha.sh up
```

Esdeger ham komut:

```bash
docker compose --env-file deploy/.env.kaisha -f docker-compose.yml -f docker-compose.kaisha.yml up -d
```

## 2. Ilk Ortam Hazirligi

Kaisha environment dosyasini olustur:

```bash
./deploy/mam-kaisha.sh init \
  belgelik.trt.net.tr \
  authbelgelik.trt.net.tr \
  officebelgelik.trt.net.tr \
  .trt.net.tr
```

Bu komut `deploy/.env.kaisha` dosyasini ve gerekli secret dosyalarini hazirlar. Secret dosyalari git'e alinmaz.

Kontrol:

```bash
./deploy/mam-kaisha.sh urls
./deploy/mam-kaisha.sh ps
```

## 3. Host Nginx Reverse Proxy

Kaisha mimarisinde dis trafiği host Nginx uzerinden gelir. Yeni bir reverse proxy teknolojisi ekleme; mevcut Nginx server bloklarini kullan.

Beklenen yonlendirme:

```text
belgelik.trt.net.tr       -> http://127.0.0.1:3000
authbelgelik.trt.net.tr   -> http://127.0.0.1:8081
officebelgelik.trt.net.tr -> http://127.0.0.1:8082
```

Belgelik server blogunda tipik ayarlar:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name belgelik.trt.net.tr;

    client_max_body_size 3000m;
    proxy_read_timeout 900s;
    proxy_send_timeout 900s;
    proxy_request_buffering off;

    include /etc/nginx/snippets/belgelik-maintenance-server.conf;

    location / {
        include /etc/nginx/snippets/belgelik-maintenance-location.conf;

        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Port 443;
    }
}
```

Keycloak ve OnlyOffice server bloklarinda da ilgili host adlari ayni mantikla `127.0.0.1:8081` ve `127.0.0.1:8082` portlarina proxy edilmelidir. OnlyOffice tarafinda uzun dosya islemleri icin `proxy_request_buffering off` ve `proxy_buffering off` tercih edilir.

Nginx kontrol:

```bash
sudo nginx -t
sudo nginx -s reload
sudo nginx -T 2>/dev/null | grep -n -B8 -A8 client_max_body_size
```

## 4. Maintenance Modu

Maintenance sayfasi Belgelik uygulama container'larindan bagimsiz olarak host Nginx tarafindan servis edilir. Bu sayede `kaisha-app` kapaliyken veya yeniden baslarken kullanici 502/520 yerine bakim sayfasini gorur.

Ilk kurulumda snippet ve statik asset'leri host'a kopyala:

```bash
./deploy/belgelik-maintenance.sh install
```

Bu komut varsayilan olarak:

```text
/var/www/belgelik-maintenance
/etc/nginx/snippets
```

altina gerekli dosyalari kopyalar.

Manuel ac/kapat:

```bash
./deploy/mam-kaisha.sh maintenance-on
./deploy/mam-kaisha.sh maintenance-status
./deploy/mam-kaisha.sh maintenance-off
```

Guncelleme icin onerilen akış:

```bash
./deploy/mam-kaisha.sh maintenance-restart
```

Bu akış maintenance modunu acar, restart islemini yapar, `kaisha-app` icinden `http://127.0.0.1:3000/api/health` endpoint'ini bekler ve sadece HTTP 200 + `{ "ok": true }` donerse maintenance modunu kapatir.

Tamamen kapatma gerekiyorsa:

```bash
./deploy/mam-kaisha.sh down
```

Bu komut once maintenance modunu acar, sonra container'lari kapatir. Uygulama kapali kalacagi icin maintenance acik birakilir.

## 5. Docker Image, CPU/GPU Torch ve Cache

Kaisha build'i varsayilan olarak CPU-only PyTorch wheel index'i kullanir:

```text
TORCH_WHEEL_INDEX_URL=https://download.pytorch.org/whl/cpu
```

Bu ayar PyPI uzerinden gelen buyuk `nvidia-*cu12` paketlerinin CPU sunucularda indirilmesini onler.

CPU kurulumda ekstra ayar yapmadan:

```bash
./deploy/mam-kaisha.sh up
```

GPU kullanilacak bir sunucuda, surucu/CUDA uyumlulugu dogrulandiktan sonra `deploy/.env.kaisha` icinde PyTorch'un ilgili CUDA wheel index'i verilebilir:

```env
TORCH_WHEEL_INDEX_URL=https://download.pytorch.org/whl/cu124
```

PyPI varsayilanina bilerek donmek istenirse bos birakilabilir; bu durumda CUDA bagimli paketler indirilebilir ve build suresi/cikti boyutu artabilir:

```env
TORCH_WHEEL_INDEX_URL=
```

`docker system prune -a` image ve build cache'i silebilir. Bundan sonraki ilk build'in apt/pip katmanlarini yeniden indirmesi normaldir. Rutin temizlikte `-a` kullanmadan once aktif image'larin korunmasi tercih edilir.

## 6. Keycloak / OAuth2 Proxy

Kaisha production ayarlari `docker-compose.kaisha.yml` ile override edilir.

Temel public URL'ler:

```env
PUBLIC_MAM_URL=https://belgelik.trt.net.tr
PUBLIC_KEYCLOAK_URL=https://authbelgelik.trt.net.tr
PUBLIC_OFFICE_URL=https://officebelgelik.trt.net.tr
KEYCLOAK_REALM=mam
OAUTH2_PROXY_CLIENT_ID=mam-web
```

OAuth2 Proxy tarafinda onemli noktalar:

```env
OAUTH2_PROXY_OIDC_ISSUER_URL=https://authbelgelik.trt.net.tr/realms/mam
OAUTH2_PROXY_REDEEM_URL=https://authbelgelik.trt.net.tr/realms/mam/protocol/openid-connect/token
OAUTH2_PROXY_REDIRECT_URL=https://belgelik.trt.net.tr/oauth2/callback
OAUTH2_PROXY_COOKIE_REFRESH=4m
OAUTH2_PROXY_COOKIE_CSRF_EXPIRE=1h
OAUTH2_PROXY_COOKIE_CSRF_PER_REQUEST=true
```

Keycloak tarafinda:

```env
KC_HOSTNAME=authbelgelik.trt.net.tr
KC_HOSTNAME_STRICT=true
KC_PROXY_HEADERS=xforwarded
KC_HTTP_ENABLED=true
```

Keycloak client URL'lerini senkronlamak icin:

```bash
./deploy/mam-kaisha.sh sync-keycloak
```

## 7. LDAP / Active Directory

LDAP icin yeni realm acma. Mevcut `mam` realm'i icinde `User federation` olarak LDAP provider eklenir. Boylece `mam-web`, redirect URI, mobile client, tema, session ve uygulama yetki yapisi bozulmaz.

Kurulum oncesi kurum LDAP/AD yoneticisinden su bilgiler alinmalidir:

- LDAP tipi: Active Directory veya OpenLDAP
- LDAP URL: tercihen `ldaps://<ldap-host>:636`
- Base DN
- Users DN
- Bind DN
- Bind credential
- Username attribute
- Email, first name, last name attribute'lari
- Groups DN ve grup uyelik attribute'u
- LDAP grup -> Keycloak/MAM grup eslemesi

Active Directory icin tipik baslangic:

```text
Vendor: Active Directory
Import Users: ON
Edit Mode: READ_ONLY
Sync Registrations: OFF
Username LDAP attribute: sAMAccountName
RDN LDAP attribute: cn
UUID LDAP attribute: objectGUID
User Object Classes: person, organizationalPerson, user
Search Scope: Subtree
```

Ilk canli testte otomatik grup mapper'dan once manuel dogrulama yap:

1. LDAP provider'i ekle.
2. Tek test kullanicisini Keycloak `Users` ekraninda ara.
3. Kullanici bulunduysa `/dokkullan` veya uygun MAM grubuna manuel ekle.
4. Belgelik'e login ol.
5. `/api/me` ciktisinda username ve grup bilgisini kontrol et.

Superadmin testi icin LDAP kullanicisini Keycloak'ta `/superadmin` grubuna ekle. Kullanici yonetim sayfasina girebilmeli ve tam yetki alabilmelidir.

Grup mapper daha sonra eklenmelidir:

```text
Mapper type: group-ldap-mapper
LDAP Groups DN: kurumun verdigi Groups DN
Group Name LDAP Attribute: cn
Membership LDAP Attribute: member
Membership Attribute Type: DN
User Roles Retrieve Strategy: LOAD_GROUPS_BY_MEMBER_ATTRIBUTE
Mode: READ_ONLY
```

LDAP provider sorun cikartirsa once provider'i Keycloak Admin Console'da disable et; Keycloak volume veya realm verisini silerek cozum arama.

## 8. Offline Model Hazirligi

Belgelik kapali/ag icinden calisacaksa ML modelleri runtime oncesi diskte hazir olmalidir. Varsayilan model kok dizini:

```text
/opt/mam-models
```

Marian altyazi ceviri modeli ornegi:

```bash
HF_HUB_OFFLINE=0 TRANSFORMERS_OFFLINE=0 \
./deploy/prepare-models.sh marian
```

Hazirlik tamamlandiktan sonra runtime'da offline mod korunur:

```env
MAM_OFFLINE_MODE=true
HF_HUB_OFFLINE=1
TRANSFORMERS_OFFLINE=1
```

Model diskte durur; servis acilisinda surekli bellekte hazir tutulmaz. Ilgili is tetiklendiginde Python sureci modeli yukler.

## 9. Operasyon Komutlari

Durum:

```bash
./deploy/mam-kaisha.sh ps
./deploy/mam-kaisha.sh version
```

Log:

```bash
./deploy/mam-kaisha.sh logs app
./deploy/mam-kaisha.sh logs oauth2-proxy
./deploy/mam-kaisha.sh logs keycloak
```

Health:

```bash
./deploy/belgelik-maintenance.sh wait-health
curl -sS http://127.0.0.1:3000/api/health
```

Compose config dogrulama:

```bash
docker compose --env-file deploy/.env.kaisha -f docker-compose.yml -f docker-compose.kaisha.yml config >/tmp/kaisha-compose-config.yml
```

## 10. Kurulum Kontrol Listesi

- [ ] `takmasakal/kaisha` branch'i checkout edildi.
- [ ] `deploy/.env.kaisha` olusturuldu.
- [ ] `deploy/secrets/*` dosyalari olustu ve git'e alinmadi.
- [ ] Host Nginx Belgelik, Keycloak ve OnlyOffice hostlarini dogru portlara proxy ediyor.
- [ ] Maintenance snippet'leri Nginx Belgelik server bloguna eklendi.
- [ ] `./deploy/mam-kaisha.sh maintenance-on/off` test edildi.
- [ ] `./deploy/mam-kaisha.sh up` ile sadece `kaisha-*` container'lari ayaga kalkti.
- [ ] `./deploy/mam-kaisha.sh version` branch ve commit bilgisini gosteriyor.
- [ ] `/api/health` HTTP 200 ve `ok: true` donuyor.
- [ ] Keycloak `mam-web` client URL'leri public domainlerle uyumlu.
- [ ] LDAP test kullanicisi login olabiliyor.
- [ ] LDAP test kullanicisinin Keycloak/MAM grup yetkileri `/api/me` icinde dogru gorunuyor.
- [ ] CPU sunucuda Torch build'i CPU wheel index ile yapiliyor; gereksiz CUDA paketleri indirilmiyor.
