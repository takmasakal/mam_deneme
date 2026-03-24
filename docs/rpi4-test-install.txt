# Raspberry Pi 4 Test Kurulum Rehberi

Bu rehber, `codex/next-task` branch'indeki mevcut MAM sürümünü Raspberry Pi 4 üzerinde test amaçlı çalıştırmak içindir.

## Ön Koşullar

- Raspberry Pi 4
- 64-bit Raspberry Pi OS
- İnternet bağlantısı
- En az 8 GB RAM önerilir
- Mümkünse microSD yerine SSD önerilir

## 1. Sistem Paketlerini Kur

```bash
sudo apt update
sudo apt install -y git docker.io docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

Kontrol:

```bash
docker --version
docker compose version
git --version
```

## 2. Repo'yu İndir

```bash
git clone https://github.com/takmasakal/mam_deneme.git
cd mam_deneme
git checkout codex/next-task
```

Eğer repo zaten varsa:

```bash
cd mam_deneme
git fetch origin
git checkout codex/next-task
git pull
```

## 3. Disk Klasörlerini Hazırla

```bash
mkdir -p uploads/proxies uploads/thumbnails uploads/subtitles uploads/ocr
mkdir -p data
```

## 4. Test Amaçlı Stack'i Ayağa Kaldır

En kolay yol:

```bash
docker compose -f docker-compose.easy.yml up -d
```

İlk çalıştırmada image build ve Python bağımlılıkları nedeniyle süre uzun olabilir.

## 5. Servisleri Kontrol Et

```bash
docker compose -f docker-compose.easy.yml ps
docker compose -f docker-compose.easy.yml logs -f app
```

Diğer faydalı loglar:

```bash
docker compose -f docker-compose.easy.yml logs -f postgres
docker compose -f docker-compose.easy.yml logs -f elasticsearch
docker compose -f docker-compose.easy.yml logs -f keycloak
docker compose -f docker-compose.easy.yml logs -f oauth2-proxy
```

## 6. Tarayıcıdan Aç

- MAM: `http://<RPI_IP>:3000`
- Keycloak Admin: `http://<RPI_IP>:8081`

Pi IP'sini öğrenmek için:

```bash
hostname -I
```

## 7. İlk Giriş

Varsayılan Keycloak admin:

- Kullanıcı adı: `admin`
- Şifre: `admin`

İlk girişten sonra:

1. `mam` realm'ini kontrol et veya oluştur
2. Test kullanıcısı oluştur
3. Gerekirse rol ata
   - `mam-super-admin`
   - veya daha dar roller

## 8. Durdurma / Yeniden Başlatma

Durdur:

```bash
docker compose -f docker-compose.easy.yml down
```

Yeniden başlat:

```bash
docker compose -f docker-compose.easy.yml up -d
```

Tam temizleme:

```bash
docker compose -f docker-compose.easy.yml down -v
```

Not: `-v` PostgreSQL ve Elasticsearch verilerini de siler.

## 9. Güncelleme

Yeni commit geldikçe:

```bash
cd mam_deneme
git fetch origin
git checkout codex/next-task
git pull
docker compose -f docker-compose.easy.yml up -d --build
```

## 10. Raspberry Pi 4 İçin Gerçekçi Beklenti

- Arayüz ve temel kullanım çalışır
- Proxy üretimi çalışır
- OCR ve altyazı üretimi x86 makinaya göre daha yavaş olur
- PaddleOCR ve Whisper `small` yoğun kullanımda Pi 4'ü zorlayabilir

Bu yüzden Pi 4 bu aşamada en uygun kullanım:

- test
- demo
- hafif ingest
- temel UI doğrulama

Ağır OCR / subtitle batch işleri için daha güçlü bir makine daha uygundur.
