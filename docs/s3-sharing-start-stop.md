# S3 Paylaşımını Başlatma ve Durdurma

Bu belge MetMAM ve Belgelik'te S3 paylaşım özelliğini isteğe bağlı açıp kapatma adımlarını özetler. Normal uygulama başlatmasında paylaşım kapalıdır; paylaşım yeteneği ve arayüzdeki paylaşım kontrolleri görünmez.

## Belgelik

Komutları depo kök dizininde çalıştırın.

### S3 paylaşımı kapalı başlatma

```bash
./deploy/mam-kaisha.sh up
```

Bu komut uygulamayı normal modda başlatır ve daha önce çalışıyorsa isteğe bağlı S3 worker'ını durdurur.

### S3 paylaşımı açık başlatma

```bash
./deploy/mam-kaisha.sh up -s3
```

Script S3 worker imajını oluşturur, uygulamayı S3 paylaşımı açık olacak şekilde başlatır ve worker'ı çalıştırır. Yeniden başlatırken de `./deploy/mam-kaisha.sh restart -s3` kullanabilirsiniz.

## MetMAM

Komutları depo kök dizininde çalıştırın.

### Normal başlatma

```bash
docker compose up -d
```

### S3 paylaşımını açma

İlk çalıştırmada veya bu secret dosyası yoksa, önce `./deploy/mam.sh up` komutunu çalıştırın. Bu script eksik S3 şifreleme anahtarını oluşturur ve normal modu başlatır; ardından aşağıdaki komutla S3 moduna geçebilirsiniz.

```bash
S3_SHARING_ENABLED=true docker compose --profile s3-sharing up -d --build
```

Bu komut uygulamanın paylaşım API ve arayüzünü açar, S3 worker'ını profille başlatır.

### S3 paylaşımını kapatma

Önce worker'ı durdurun, ardından uygulamayı normal modda yeniden başlatın:

```bash
docker compose --profile s3-sharing stop s3-share-worker
docker compose --profile s3-sharing rm -sf s3-share-worker
docker compose up -d
```

## Durumu kontrol etme

MetMAM worker durumu ve logları:

```bash
docker compose ps s3-share-worker
docker compose logs --tail=100 s3-share-worker
```

Belgelik worker durumu ve logları:

```bash
./deploy/mam-kaisha.sh ps
./deploy/mam-kaisha.sh logs s3-share-worker
```

## Orphan container uyarısı

Compose, devre dışı bir profile ait mevcut worker container'ını normal `up` sırasında orphan olarak raporlayabilir. Worker'ı yalnızca durdurmak container'ı kaldırmadığı için bu uyarı sürer. Belgelik'te güncel `./deploy/mam-kaisha.sh up` ve `restart` komutları, S3 kapalıyken yalnızca `kaisha` projesinin S3 worker container'ını kaldırır. MetMAM'da normal moda geçerken de önce yukarıdaki `rm -sf` komutunu çalıştırın.

Genel `--remove-orphans` seçeneğini kullanmayın; aynı Compose projesindeki başka eski servis container'larını da kaldırabilir.

## Gereksinim

Uygulama ve worker aynı kalıcı S3 kimlik bilgisi şifreleme anahtarını kullanmalıdır. Anahtar dosyasını silmeyin veya yeniden üretmeyin; mevcut S3 sağlayıcı kimlik bilgileri bu anahtarla şifrelenmiştir.

`deploy/secrets/s3_share_credentials_key` mevcut bir kurulumda kaybolduysa, yeni anahtar üretmek yerine yedekten geri yükleyin. Yeni anahtar daha önce kaydedilmiş S3 sağlayıcı kimlik bilgilerini çözemez.
