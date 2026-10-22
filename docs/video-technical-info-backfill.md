# Video teknik bilgilerini önceden çıkarma

`scripts/vidteknikbilgicikar.py`, videoların ffprobe teknik bilgilerini varlık
ve video sürümü bazında `dc_metadata.mediaTechnicalInfo` alanına yazar. Böylece
teknik bilgi ilk kez istenirken bekleme yaşanmaz.

Betik varsayılan olarak dry-run çalışır; `--apply` olmadan veritabanına yazmaz.
Geçerli dosya parmak iziyle eşleşen kayıtları tekrar hesaplamaz. Yalnızca
eksik/değişmiş kaynak ve proxy bilgilerini tamamlar; medya dosyalarını değiştirmez.

Kaisha sunucusunda yalın `docker compose build app` veya `docker compose up`
kullanmayın. Temel Compose tanımları MetMAM servislerini de içerir. Kaisha
deposunun kök dizininde `mam-kaisha.sh` sarmalayıcısını kullanın; bu, doğru
Kaisha compose/env birleşimini seçer ve app kaynakları değiştiğinde imajı kurar:

```sh
./deploy/mam-kaisha.sh up
docker compose --env-file deploy/.env.kaisha -f docker-compose.yml -f docker-compose.kaisha.yml exec -T app python3 scripts/vidteknikbilgicikar.py --limit 2 --verbose
```

Dry-run çıktısı doğru görünüyorsa:

```sh
docker compose --env-file deploy/.env.kaisha -f docker-compose.yml -f docker-compose.kaisha.yml exec -T app python3 scripts/vidteknikbilgicikar.py --apply --verbose
```

Tek varlık için `--asset-id ASSET_ID` eklenebilir. Büyük arşivlerde işlem uzun
sürebilir; seri çalışan betik tekrar başlatıldığında güncel parmak izli kayıtları
atlayarak devam eder. `ffprobe failures` sıfır değilse dosya yolu ve konteynerin
video dosyalarına erişimi kontrol edilmelidir.
