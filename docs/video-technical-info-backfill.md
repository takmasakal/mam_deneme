# Video teknik bilgilerini önceden çıkarma

`scripts/vidteknikbilgicikar.py`, videoların ffprobe teknik bilgilerini varlık
ve video sürümü bazında `dc_metadata.mediaTechnicalInfo` alanına yazar. Böylece
teknik bilgi ilk kez istenirken bekleme yaşanmaz.

Betik varsayılan olarak dry-run çalışır; `--apply` olmadan veritabanına yazmaz.
Geçerli dosya parmak iziyle eşleşen kayıtları tekrar hesaplamaz. Yalnızca
eksik/değişmiş kaynak ve proxy bilgilerini tamamlar; medya dosyalarını değiştirmez.

Güncel uygulama imajını oluşturup başlattıktan sonra Compose dizininde:

```sh
docker compose build app
docker compose up -d app
docker compose exec -T app python3 scripts/vidteknikbilgicikar.py --limit 2 --verbose
```

Dry-run çıktısı doğru görünüyorsa:

```sh
docker compose exec -T app python3 scripts/vidteknikbilgicikar.py --apply --verbose
```

Tek varlık için `--asset-id ASSET_ID` eklenebilir. Büyük arşivlerde işlem uzun
sürebilir; seri çalışan betik tekrar başlatıldığında güncel parmak izli kayıtları
atlayarak devam eder. `ffprobe failures` sıfır değilse dosya yolu ve konteynerin
video dosyalarına erişimi kontrol edilmelidir.
