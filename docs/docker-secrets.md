# MAM Docker Secrets Runbook

Bu dokuman MAM kurulumunda parolalarin Docker secrets ile nasil yonetilecegini anlatir.

Iki ayri durum vardir:

1. Sifirdan kurulum: Veritabani/Keycloak volume'lari henuz yoktur. Secret dosyalari uretilir, container'lar ilk acilista bu degerleri kullanir.
2. Mevcut sistemde sifre degistirme: Veriler korunur. Secret dosyasini degistirmek tek basina yetmez; ilgili sistemin kendi icindeki parola/client secret degeri de ayni degere cekilmelidir.

## 1. Docker Secrets Ne Yapar, Ne Yapmaz?

Docker Compose secrets bu projede `deploy/secrets/` altindaki dosyalari container icine `/run/secrets/...` olarak mount eder.

Yaptigi seyler:

- Parolalar `docker-compose.yml` icinde durmaz.
- Parolalar `.env`, `.env.easy`, `.env.rpi` icinde durmaz.
- `docker compose config` ciktisinda parola degeri gorunmez.
- Uygulama, Postgres, Keycloak ve oauth2-proxy gerekli degeri `/run/secrets/...` dosyasindan okur.

Yapmadigi seyler:

- Postgres icindeki mevcut kullanici parolasini otomatik degistirmez.
- Keycloak icindeki mevcut admin parolasini otomatik degistirmez.
- Keycloak `mam-web` client secret degerini otomatik degistirmez.
- Keycloak kullanici parolalarini otomatik senkronize etmez.

Kisa kural:

```text
Sifirdan kurulumda secret dosyasi gercek kaynak olur.
Mevcut sistemde secret dosyasi sadece container'in okuyacagi dosyadir; sistem icindeki mevcut parola ayrica degistirilmelidir.
```

## 2. Secret Dosyalari

`deploy/secrets/` git'e eklenmez ve lokal/server uzerinde kalir.

Kullanilan dosyalar:

| Dosya | Ne icin kullanilir |
| --- | --- |
| `deploy/secrets/mam_postgres_password` | MAM ana PostgreSQL `postgres` kullanici parolasi |
| `deploy/secrets/keycloak_db_password` | Keycloak PostgreSQL `keycloak` kullanici parolasi |
| `deploy/secrets/keycloak_admin_password` | Keycloak master realm admin parolasi |
| `deploy/secrets/oauth2_proxy_client_secret` | Keycloak `mam-web` client secret degeri |
| `deploy/secrets/oauth2_proxy_cookie_secret` | oauth2-proxy cookie imzalama secret'i |
| `deploy/secrets/mam_admin_password` | Ilk realm import icin MAM admin kullanici parolasi |
| `deploy/secrets/mam_user_password` | Ilk realm import icin standart kullanici parolasi |
| `deploy/secrets/mam_text_admin_password` | Ilk realm import icin OCR/altyazi yoneticisi parolasi |

Dosya izinleri:

```bash
chmod 700 deploy/secrets
chmod 600 deploy/secrets/*
```

## 3. Sifirdan Kurulumda Secret Olusturma

Sifirdan kurulumda volume'lar henuz yoktur. En kolay yol init scriptini calistirmaktir.

Yerel/easy kurulum:

```bash
./deploy/init.sh localhost
docker compose build app oauth2-proxy
docker compose up -d
```

Raspberry Pi kurulum:

```bash
./deploy/init-rpi.sh
./deploy/mam-rpi.sh up
```

Init scriptleri sunlari yapar:

- `deploy/.env.easy` veya `deploy/.env.rpi` dosyasini secret olmayan degerlerle yazar.
- `deploy/secrets/` dizinini olusturur.
- Varsayilan/zayif parola varsa random degerle degistirir.
- Parolalari ekrana yazmaz.
- Keycloak realm import sirasinda gerekli client/user secretlerini container icinde olusturulan import JSON'una uygular.

Sifirdan kurulum sonrasi parolalari gormek icin:

```bash
cat deploy/secrets/keycloak_admin_password
cat deploy/secrets/mam_user_password
cat deploy/secrets/mam_text_admin_password
```

## 4. Sifirdan Kurulumda Manuel Secret Uretmek

Init scriptini kullanmadan manuel uretmek istersen:

```bash
mkdir -p deploy/secrets
chmod 700 deploy/secrets

openssl rand -hex 24 > deploy/secrets/mam_postgres_password
openssl rand -hex 24 > deploy/secrets/keycloak_db_password
openssl rand -hex 24 > deploy/secrets/keycloak_admin_password
openssl rand -hex 24 > deploy/secrets/oauth2_proxy_client_secret
openssl rand -hex 16 > deploy/secrets/oauth2_proxy_cookie_secret
openssl rand -hex 24 > deploy/secrets/mam_admin_password
openssl rand -hex 24 > deploy/secrets/mam_user_password
openssl rand -hex 24 > deploy/secrets/mam_text_admin_password

chmod 600 deploy/secrets/*
```

Not: `oauth2_proxy_cookie_secret` 16, 24 veya 32 byte olmalidir. Bu projede `openssl rand -hex 16` kullanilir; sonuc 32 karakterdir ve oauth2-proxy tarafindan kabul edilir.

## 5. Mevcut Sistemde Sifre Degistirme Neden Tek Dosya Degisikligi Degil?

Docker secrets bir parola yoneticisi degildir; sadece dosyayi container'a guvenli sekilde verir.

Ornek: `deploy/secrets/mam_postgres_password` dosyasini degistirdin.

Bu durumda:

- `mam-app` yeni dosyayi okur.
- Ama Postgres icindeki `postgres` kullanici parolasi eski degerde kalir.
- Sonuc: `mam-app` Postgres'e baglanamaz.

Bu yuzden mevcut sistemde rotasyon iki tarafli yapilir:

```text
1. Sistemin kendi icindeki parola/client secret degistirilir.
2. Docker secret dosyasi ayni yeni degerle guncellenir.
3. Bu secret'i okuyan container recreate/restart edilir.
```

## 6. Mevcut Sistemde Veriyi Koruyarak Tam Rotasyon

Asagidaki komutlar calisan lokal compose icindir. RPI'da compose komutlari yerine `./deploy/mam-rpi.sh ...` veya `docker compose --env-file deploy/.env.rpi -f docker-compose.rpi.yml ...` kullanilir.

### 6.1 Ana MAM Postgres Parolasini Degistir

```bash
new_pw="$(openssl rand -hex 24)"
docker exec mam-postgres psql -U postgres -d mam_mvp \
  -v ON_ERROR_STOP=1 \
  -c "ALTER USER postgres WITH PASSWORD '${new_pw}';"
printf '%s\n' "${new_pw}" > deploy/secrets/mam_postgres_password
chmod 600 deploy/secrets/mam_postgres_password
docker compose build app
docker compose up -d app
```

Dogrulama:

```bash
docker logs --tail=40 mam-app
curl -sSI http://127.0.0.1:3001 | head
```

### 6.2 Keycloak Postgres Parolasini Degistir

```bash
new_pw="$(openssl rand -hex 24)"
docker exec mam-keycloak-postgres psql -U keycloak -d keycloak \
  -v ON_ERROR_STOP=1 \
  -c "ALTER USER keycloak WITH PASSWORD '${new_pw}';"
printf '%s\n' "${new_pw}" > deploy/secrets/keycloak_db_password
chmod 600 deploy/secrets/keycloak_db_password
docker compose up -d keycloak
```

Dogrulama:

```bash
docker logs --tail=80 mam-keycloak
curl -sSI http://127.0.0.1:8081 | head
```

### 6.3 Keycloak Admin Parolasini Degistir

Bu adim icin mevcut Keycloak admin parolasini bilmen gerekir.

```bash
current_pw='MEVCUT_ADMIN_PAROLASI'
new_pw="$(openssl rand -hex 24)"
admin_user="$(grep -E '^KEYCLOAK_ADMIN=' deploy/.env.easy | tail -n1 | cut -d= -f2-)"
admin_user="${admin_user:-admin}"

docker exec mam-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user "${admin_user}" \
  --password "${current_pw}"

docker exec mam-keycloak /opt/keycloak/bin/kcadm.sh set-password \
  -r master \
  --username "${admin_user}" \
  --new-password "${new_pw}" \
  --temporary=false

printf '%s\n' "${new_pw}" > deploy/secrets/keycloak_admin_password
chmod 600 deploy/secrets/keycloak_admin_password

docker compose build app
docker compose up -d app
```

Dogrulama:

```bash
docker exec mam-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user "${admin_user}" \
  --password "$(cat deploy/secrets/keycloak_admin_password)"
```

### 6.4 Keycloak `mam-web` Client Secret Degistir

Bu adim oauth2-proxy login zinciri icin kritiktir.

```bash
admin_user="$(grep -E '^KEYCLOAK_ADMIN=' deploy/.env.easy | tail -n1 | cut -d= -f2-)"
admin_user="${admin_user:-admin}"

docker exec mam-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user "${admin_user}" \
  --password "$(cat deploy/secrets/keycloak_admin_password)"

client_uuid="$(docker exec mam-keycloak /opt/keycloak/bin/kcadm.sh get clients \
  -r mam \
  --fields id,clientId \
  --format csv \
  --noquotes | awk -F, '$2=="mam-web" {print $1; exit}')"

new_secret="$(openssl rand -hex 24)"
docker exec mam-keycloak /opt/keycloak/bin/kcadm.sh update "clients/${client_uuid}" \
  -r mam \
  -s "secret=${new_secret}"

printf '%s\n' "${new_secret}" > deploy/secrets/oauth2_proxy_client_secret
chmod 600 deploy/secrets/oauth2_proxy_client_secret

docker compose build oauth2-proxy
docker compose up -d oauth2-proxy
```

Dogrulama:

```bash
docker logs --tail=50 mam-oauth2-proxy
curl -sSI http://127.0.0.1:3000 | head
```

Beklenen: `3000` portu Keycloak login'e `302` redirect verir.

### 6.5 oauth2-proxy Cookie Secret Degistir

Cookie secret sadece oauth2-proxy tarafindadir. Keycloak icinde karsiligi yoktur.

```bash
openssl rand -hex 16 > deploy/secrets/oauth2_proxy_cookie_secret
chmod 600 deploy/secrets/oauth2_proxy_cookie_secret
docker compose build oauth2-proxy
docker compose up -d oauth2-proxy
```

Not: Bu islem mevcut browser login cookie'lerini gecersiz kilar. Kullanicilar tekrar login olur.

### 6.6 Realm Kullanici Parolalarini Degistir

Bu kullanicilar Keycloak `mam` realm icindedir. Ornek: `mamuser`, `yazıcı`.

```bash
admin_user="$(grep -E '^KEYCLOAK_ADMIN=' deploy/.env.easy | tail -n1 | cut -d= -f2-)"
admin_user="${admin_user:-admin}"

docker exec mam-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user "${admin_user}" \
  --password "$(cat deploy/secrets/keycloak_admin_password)"

new_pw="$(openssl rand -hex 24)"
docker exec mam-keycloak /opt/keycloak/bin/kcadm.sh set-password \
  -r mam \
  --username mamuser \
  --new-password "${new_pw}" \
  --temporary=false
printf '%s\n' "${new_pw}" > deploy/secrets/mam_user_password
chmod 600 deploy/secrets/mam_user_password
```

`yazıcı` kullanicisi icin:

```bash
new_pw="$(openssl rand -hex 24)"
docker exec mam-keycloak /opt/keycloak/bin/kcadm.sh set-password \
  -r mam \
  --username yazıcı \
  --new-password "${new_pw}" \
  --temporary=false
printf '%s\n' "${new_pw}" > deploy/secrets/mam_text_admin_password
chmod 600 deploy/secrets/mam_text_admin_password
```

## 7. Mevcut Sistemde Daha Kolay Rotasyon Icin Onerilen Script

Docker secrets ile sifre degistirmenin zor gorunmesinin sebebi Postgres ve Keycloak'in kendi state'lerini ayri tutmasidir. Bunu kolaylastirmak icin ileride tek komutluk bir script eklenebilir:

```bash
./deploy/rotate-secrets.sh all
./deploy/rotate-secrets.sh mam-postgres
./deploy/rotate-secrets.sh keycloak-admin
./deploy/rotate-secrets.sh oauth2
```

Bu script su isleri otomatik yapar:

- Yeni random deger uretir.
- Ilgili sistemin icindeki parolayi/client secret'i degistirir.
- `deploy/secrets/...` dosyasini ayni degerle yazar.
- Gerekli container'i recreate eder.
- Son durumda `curl` ve log kontrolu yapar.

Bu projede manuel runbook yukaridadir; script eklemek istenirse ayni akisi otomatiklestirmek yeterlidir.

## 8. Sik Yapilan Hatalar

### Sadece secret dosyasini degistirdim, uygulama acilmiyor

Muhtemel sebep: Sistem icindeki parola degismedi. Ornek Postgres kullanici parolasi hala eski degerdedir.

Cozum: Ilgili `ALTER USER ... PASSWORD ...` veya Keycloak `kcadm.sh set-password/update client` komutu da calistirilmalidir.

### Keycloak admin arayuzunden sifre degistirdim, app bozuldu

Keycloak DB guncellenmistir ama `deploy/secrets/keycloak_admin_password` eski kalmistir.

Cozum:

```bash
printf '%s\n' 'YENI_ADMIN_PAROLASI' > deploy/secrets/keycloak_admin_password
chmod 600 deploy/secrets/keycloak_admin_password
docker compose build app
docker compose up -d app
```

### oauth2-proxy cookie secret hatasi

Hata:

```text
cookie_secret must be 16, 24, or 32 bytes
```

Cozum:

```bash
openssl rand -hex 16 > deploy/secrets/oauth2_proxy_cookie_secret
chmod 600 deploy/secrets/oauth2_proxy_cookie_secret
docker compose build oauth2-proxy
docker compose up -d oauth2-proxy
```

### oauth2-proxy `/bin/sh` bulunamadi

Orijinal oauth2-proxy image'inda shell yoktur. Bu projede `Dockerfile.oauth2-proxy` ile Alpine tabanli wrapper image kullanilir. Compose dosyasindaki oauth2-proxy servisi `mam-oauth2-proxy:7.6.0-shell` image'ini build etmelidir.

## 9. Hangi Dosyada Secret Olmamali?

Bu dosyalarda parola/client secret bulunmamali:

- `.env`
- `deploy/.env.easy`
- `deploy/.env.rpi`
- `docker-compose.yml`
- `docker-compose.easy.yml`
- `docker-compose.rpi.yml`
- Git'e commit edilen herhangi bir dokuman veya script

Kontrol:

```bash
rg -n "PASSWORD=|CLIENT_SECRET=|COOKIE_SECRET=|postgres:postgres|admin / admin" .
```

Gercek secret degerleri sadece burada olmalidir:

```text
deploy/secrets/
```

## 10. Guvenlik Notlari

- `deploy/secrets/` git'e commit edilmez.
- Secret degerlerini chat, issue, commit mesajlari veya loglara yazmayin.
- Kurumsal ortamlarda Docker secrets dosyalarini Vault, SOPS, Ansible Vault veya CI/CD secret store ile uretmek daha dogrudur.
- Server yedeklerinde `deploy/secrets/` dizini sifreli/korumali alinmalidir; bu dosyalar kaybolursa mevcut sistem calisir ama yeniden recreate/restore sirasinda secret uyumsuzlugu cikabilir.
