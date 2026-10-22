# Video teknik bilgilerini önceden çıkarma

`scripts/vidteknikbilgicikar.py`, videoların ffprobe teknik bilgilerini varlık ve
video sürümü bazında `dc_metadata.mediaTechnicalInfo` alanına yazar. Böylece
teknik bilgi ilk kez istenirken bekleme yaşanmaz.

Betik varsayılan olarak **dry-run** çalışır. `--apply` verilmeden PostgreSQL'e
yazmaz. Geçerli dosya parmak iziyle eşleşen kayıtları tekrar hesaplamaz; dosya
değişmişse veya teknik bilgi eksikse kaynak ve proxy için ffprobe çalıştırır.
Varlık dosyalarına dokunmaz. Varsayılan sürümün kaynak süresini de uygulamanın
mevcut davranışıyla uyumlu biçimde `assets.duration_seconds` alanına yazar.

## Çalıştırma

MetMAM için, MetMAM deposunun kök dizininde:

```sh
docker compose build app
docker compose up -d app
```

Önce sınırlı bir dry-run ile doğrulayın:

```sh
docker compose exec -T app python3 scripts/vidteknikbilgicikar.py --limit 2 --verbose
```

Tek bir varlığı incelemek için:

```sh
docker compose exec -T app python3 scripts/vidteknikbilgicikar.py --asset-id ASSET_ID --verbose
```

Çıktı beklenen varlıkları gösteriyorsa tüm videolar için kalıcı çalıştırın:

```sh
docker compose exec -T app python3 scripts/vidteknikbilgicikar.py --apply --verbose
```

Bu yalın `docker compose` komutlarını Belgelik/Kaisha sunucusunda kullanmayın.
Kaisha için onun `mam-kaisha.sh` sarmalayıcısını ve Kaisha compose birleşimini
kullanan komutları izleyin.

Sonuç özetindeki `failures` sıfır değilse, ilgili dosya için ffprobe erişimini
ve uygulama konteynerindeki dosya yolunu kontrol edin. Büyük arşivlerde işlem
uzun sürebilir; betik seri çalışır ve tekrar başlatıldığında geçerli kayıtları
atlayarak kaldığı yerden güvenle devam eder.
