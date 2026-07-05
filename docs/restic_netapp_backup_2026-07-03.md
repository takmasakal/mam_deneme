# Kaisha NetApp Restic Yedekleme Raporu - 2026-07-03

## Amaç

Kaisha / TRT Belgelik kurulumunda `uploads` klasörü için klasik `.tar.gz` arşiv yerine artımlı yedekleme yapılabilmesi hedeflendi. NetApp üzerinde ayrılan 40 TB alanın snapshot yaklaşımı yerine restic repository olarak kullanılması kararlaştırıldı.

## NetApp varsayımı

Sunucuda restic için ayrılan alan şu path altında mount edilmiş kabul edilir:

```bash
/home/belge/depo/netapp/belgelik-restic
```

Restic repository varsayılan olarak şuraya yazılır:

```bash
/home/belge/depo/netapp/belgelik-restic/restic-repo
```

Klasik DB dump yedekleri ve restic repository aynı NetApp mount altında, ayrı alt dizinlerde tutulur. Eski `/home/belge/depo/netapp/belgelik` path'i artık Kaisha yedekleme hedefi olarak kullanılmaz.

## Kod değişiklikleri

### Docker image

`Dockerfile` içinde app imajına `restic` paketi eklendi:

```dockerfile
apt-get install -y --no-install-recommends ... postgresql-client-16 restic python3 python3-pip
```

### Docker volume ve secret

`docker-compose.yml` ve `docker-compose.easy.yml` içinde app servisine NetApp restic mount'u eklendi:

```yaml
- /home/belge/depo/netapp/belgelik-restic:/home/belge/depo/netapp/belgelik-restic
```

Restic repository parolası Docker secret olarak bağlandı:

```yaml
RESTIC_PASSWORD_FILE: /run/secrets/restic_password

secrets:
  - restic_password
```

Secret tanımı:

```yaml
restic_password:
  file: ./deploy/secrets/restic_password
```

### Init akışı

`deploy/init.sh` artık `deploy/secrets/restic_password` dosyasını idempotent şekilde üretir. Mevcut secret varsa değiştirmez.

`deploy/init-kaisha.sh` mevcut kurulumlarda `restic_password` eksikse `deploy/init.sh` akışını tekrar çağırır. Böylece eski kurulumlarda da yeni secret dosyası oluşur.

### Yönetim sayfası

`Yönetim > Ayarlar > Yedekleme` alanına şu seçenekler eklendi:

- `Uploads artımlı yedek (restic)` checkbox
- `Restic deposu` input
- Günlük / haftalık / aylık restic snapshot saklama sayıları

Varsayılan değerler:

```text
Klasik DB dump dizini: /home/belge/depo/netapp/belgelik-restic/db-backups
Restic deposu: /home/belge/depo/netapp/belgelik-restic/restic-repo
Günlük snapshot: 14
Haftalık snapshot: 8
Aylık snapshot: 12
```

### Backend davranışı

`src/server.js` içinde yedekleme akışına `includeUploadsRestic` seçeneği eklendi.

Akış:

1. `RESTIC_PASSWORD_FILE` veya `RESTIC_PASSWORD` kontrol edilir.
2. Repository içinde `config` yoksa `restic init` çalıştırılır.
3. Repository varsa `restic snapshots --json` ile parola/repo erişimi doğrulanır.
4. `/app/uploads` için restic backup alınır.
