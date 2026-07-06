# MetMAM Restic Incremental Backup

Tarih: 2026-07-06

## Amaç

MetMAM yedekleme ekranına uploads klasörü için incremental restic yedeği eklendi. Klasik PostgreSQL dump ve uploads `.tar.gz` yedeği korunur; restic seçeneği ayrıca açılıp kapatılır.

## Varsayılan Yerel Yol

Docker compose içinde mevcut local mount kullanılır:

```text
./mountvolume/backup -> /mountvolume/backup
```

Varsayılan ayarlar:

```text
MAM_BACKUP_DIR=/mountvolume/backup/db-backups
RESTIC_REPOSITORY=/mountvolume/backup/restic-repo
RESTIC_PASSWORD=metmam-local-restic-change-me
```

Canlı veya kalıcı kullanımda `RESTIC_PASSWORD` mutlaka `.env` üzerinden farklı ve saklanan bir parola olarak verilmelidir.

## Yönetim Ekranı

Yönetim > Ayarlar > Yedekleme altında yeni alanlar:

- `Uploads incremental backup (restic)`
- `Restic repository`
- `Restic daily snapshots`
- `Restic weekly snapshots`
- `Restic monthly snapshots`

Restic seçeneği işaretlenirse sistem:

1. Repository yoksa `restic init` çalıştırır.
2. `/app/uploads` klasörünü incremental olarak yedekler.
3. `_backups` ve `_audit_exports` klasörlerini hariç tutar.
4. Saklama değerlerine göre `restic forget --prune` çalıştırır.

## Lokal Doğrulama

Container yeniden build edildikten sonra:

```bash
docker exec -it mam-app sh -lc 'restic version'
docker exec -it mam-app sh -lc 'RESTIC_PASSWORD="${RESTIC_PASSWORD}" restic -r /mountvolume/backup/restic-repo snapshots'
```

İlk yedekte repository otomatik oluşacağından `snapshots` komutu ancak ilk başarılı yedekten sonra sonuç döndürür.

## Değişen Dosyalar

- `Dockerfile`
- `docker-compose.yml`
- `docker-compose.easy.yml`
- `.env.example`
- `public/admin.html`
- `public/admin.js`
- `src/server.js`
