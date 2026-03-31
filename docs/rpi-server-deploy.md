# Raspberry Pi Server Kurulumu

Bu kurulum yolu `mam_deneme` için Raspberry Pi üstünde daha sağlam bir sunucu akışı hazırlar.

Temel farklar:
- `docker-compose.rpi.yml` kullanılır
- dışarı sadece auth'li MAM portu açılır: `3000`
- direct `app` portu dışarı açılmaz
- Keycloak realm ve `oauth2-proxy` secret aynı kaynaktan üretilir
- IP değişirse `init-rpi.sh` tekrar çalıştırılarak yeni host ile dosyalar yenilenir

## 1. Sistem paketleri

```bash
sudo apt update
sudo apt install -y git docker.io docker-compose
sudo usermod -aG docker $USER
newgrp docker
```

## 2. Repo

```bash
cd ~
git clone https://github.com/takmasakal/mam_deneme.git
cd mam_deneme
git checkout main
git pull
```

## 3. Başlatma

```bash
./deploy/mam-rpi.sh up
```

Script şunları yapar:
- Pi IP'sini otomatik algılar
- `deploy/.env.rpi` üretir
- `deploy/keycloak/mam-rpi-realm.json` üretir
- stack'i `docker-compose.rpi.yml` ile ayağa kaldırır

## 4. Adresler

```text
MAM:      http://<pi-ip>:3000
Keycloak: http://<pi-ip>:8081
```

Not:
- `3001` dışarı açılmaz
- böylece `Unknown user` ve direct-app/logout karışıklığı olmaz

## 5. Kullanıcılar

Varsayılan realm kullanıcıları:
- `mamadmin / mamadmin`
- `mamuser / mamuser`

Keycloak admin:
- `admin / admin`

## 6. Loglar

```bash
./deploy/mam-rpi.sh logs keycloak
./deploy/mam-rpi.sh logs oauth2-proxy
./deploy/mam-rpi.sh logs app
```

## 7. IP değişirse

```bash
./deploy/mam-rpi.sh restart
```

Bu komut host adresini yeniden algılar ve gerekli dosyaları yeniler.

## 8. Harici medya deposu

Varsayılan medya yolu:
- proje içindeki `./uploads`

Harici disk veya NAS kullanacaksan `deploy/.env.rpi` içindeki:

```text
UPLOADS_DIR=/mnt/mamdata/uploads
```

değerini değiştirip:

```bash
./deploy/mam-rpi.sh restart
```

çalıştır.
