# Belgelik Restic Tek Asset Kurtarma Testi

Planlanan test tarihi: 10 Temmuz 2026

## Amaç

Bu senaryo, Belgelik uygulamasında bir kullanıcının yüklediği varlığın daha sonra uygulama arayüzünden kalıcı olarak silindiği durumda yalnızca o varlığın geri getirilmesini doğrular.

Test iki ayrı yedek bileşenini kullanır:

- Restic snapshot: `/app/uploads` altındaki fiziksel dosyayı geri getirir.
- Aynı yedek çalışmasına ait PostgreSQL dump: silinen `assets` satırını geri getirir.

Restic tek başına uygulamadan kalıcı silinen bir asseti tamamen kurtaramaz. Kalıcı silme işlemi hem dosyayı hem `assets` kaydını siler. Bu nedenle fiziksel dosya ve veritabanı kaydı birlikte kurtarılmalıdır.

Bu ilk testte bağımlı kayıt üretmeyen küçük bir `.txt` varlığı kullanılacaktır. Video, PDF, OCR, altyazı ve doküman versiyonları sonraki genişletilmiş testin kapsamındadır.

## Kullanılan yollar

```text
App container: kaisha-app
PostgreSQL container: kaisha-postgres
Uploads: /app/uploads
Restic repository: /home/belge/depo/netapp/belgelik-restic/restic-repo
DB dump dizini: /home/belge/depo/netapp/belgelik-restic/db-backups
Restic parola dosyası: /run/secrets/restic_password
```

Yönetim ekranındaki yollar farklıysa testten önce aşağıdaki değişkenler güncellenmelidir.

## 1. Ön kontroller

Sunucuda:

```bash
docker ps --format "table {{.Names}}\t{{.Status}}"

docker exec -it kaisha-app sh -lc '
restic version
test -r /run/secrets/restic_password
test -d /home/belge/depo/netapp/belgelik-restic
restic \
  -r /home/belge/depo/netapp/belgelik-restic/restic-repo \
  snapshots
'
```

Başarılı sonuçta Restic sürümü ve mevcut snapshot listesi görünmelidir.

Repository henüz oluşturulmamışsa önce Yönetim > Ayarlar > Yedekleme üzerinden bir yedek alınmalıdır. Uygulama repository'yi otomatik başlatır.

## 2. Test varlığını yükleme

Yerel bilgisayarda şu dosyayı oluşturun:

```bash
printf 'Belgelik Restic tek asset kurtarma testi - 2026-07-10\n' \
  > restic-tek-asset-testi.txt
```

Dosyayı Belgelik web arayüzünden `Diğer` türünde yükleyin.

Başlık:

```text
Restic Tek Asset Testi 2026-07-10
```

Yükleme tamamlandıktan sonra asset kimliğini ve dosya yolunu alın:

```bash
docker exec -it kaisha-postgres psql -U postgres -d mam_mvp -x -c "
SELECT id, title, media_url, file_name, mime_type, created_at
FROM assets
WHERE title = 'Restic Tek Asset Testi 2026-07-10'
ORDER BY created_at DESC
LIMIT 1;
"
```

Çıktıdaki `id` ve `media_url` değerlerini kaydedin:

```bash
ASSET_ID='BURAYA_ASSET_ID'
MEDIA_URL='/uploads/YYYY/M/D/other/DOSYA_ADI.txt'
MEDIA_PATH="/app${MEDIA_URL}"
```

Dosyanın mevcut olduğunu ve başlangıç hash değerini doğrulayın:

```bash
docker exec -it kaisha-app sh -lc "
ls -lah '$MEDIA_PATH'
sha256sum '$MEDIA_PATH'
"
```

Hash değerini test notlarına kaydedin.

## 3. Eş zamanlı DB ve Restic yedeği alma

Yönetim > Ayarlar > Yedekleme ekranında şunlar açık olmalıdır:

- MAM veritabanı yedeği
- Uploads artımlı yedek (Restic)
- Klasik uploads `.tar.gz` yedeği bu test için zorunlu değildir.

`Şimdi yedekle` komutunu çalıştırın ve işlem tamamlanana kadar bekleyin.

En yeni DB dump dosyasını belirleyin:

```bash
docker exec -it kaisha-app sh -lc '
ls -1t /home/belge/depo/netapp/belgelik-restic/db-backups/*-mam-db.dump | head -1
'
```

En yeni Restic snapshot'ı belirleyin:

```bash
docker exec -it kaisha-app sh -lc '
restic \
  -r /home/belge/depo/netapp/belgelik-restic/restic-repo \
  snapshots --latest 1
'
```

Değerleri kaydedin:

```bash
DB_DUMP='/home/belge/depo/netapp/belgelik-restic/db-backups/mam-backup-...-mam-db.dump'
SNAPSHOT_ID='RESTIC_SNAPSHOT_ID'
```

Snapshot içinde test dosyasının bulunduğunu doğrulayın:

```bash
docker exec -it kaisha-app sh -lc "
restic \
  -r /home/belge/depo/netapp/belgelik-restic/restic-repo \
  ls '$SNAPSHOT_ID' '$MEDIA_PATH'
"
```

Bu doğrulama başarılı olmadan silme adımına geçilmemelidir.

## 4. Asseti uygulamadan kalıcı silme

Belgelik arayüzünde:

1. Test varlığını çöp kutusuna taşıyın.
2. Çöp kutusunu açın.
3. Test varlığı için kalıcı silme işlemini onaylayın.

Veritabanı satırının silindiğini doğrulayın:

```bash
docker exec -it kaisha-postgres psql -U postgres -d mam_mvp -c "
SELECT id, title, media_url
FROM assets
WHERE id = '$ASSET_ID';
"
```

Beklenen:

```text
(0 rows)
```

Fiziksel dosyanın silindiğini doğrulayın:

```bash
docker exec -it kaisha-app sh -lc "
test ! -e '$MEDIA_PATH' &&
echo 'OK: fiziksel dosya silinmiş'
"
```

## 5. DB dump'ı geçici veritabanına açma

Bu adım üretim veritabanının tamamını geri döndürmez. Dump ayrı bir geçici veritabanına açılır.

```bash
docker exec -it kaisha-app sh
```

Container shell içinde:

```sh
export PGPASSWORD="$(cat "${MAM_DB_PASSWORD_FILE:-/run/secrets/mam_postgres_password}")"
export DB_HOST="${MAM_DB_HOST:-postgres}"
export DB_PORT="${MAM_DB_PORT:-5432}"
export DB_USER="${MAM_DB_USER:-postgres}"
export PROD_DB="${MAM_DB_NAME:-mam_mvp}"
export TEMP_DB="mam_single_asset_restore_20260710"
export ASSET_ID='BURAYA_ASSET_ID'
export DB_DUMP='/home/belge/depo/netapp/belgelik-restic/db-backups/mam-backup-...-mam-db.dump'

dropdb \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
  --if-exists "$TEMP_DB"

createdb \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
  "$TEMP_DB"

pg_restore \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
  -d "$TEMP_DB" \
  --no-owner --no-privileges \
  "$DB_DUMP"
```

Geçici veritabanında test assetini doğrulayın:

```sh
psql \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEMP_DB" \
  -x -c "SELECT id, title, media_url FROM assets WHERE id = '$ASSET_ID';"
```

Tam olarak bir satır dönmelidir.

## 6. Yalnızca asset satırını üretim DB'ye geri getirme

Container shell içinde:

```sh
psql \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEMP_DB" \
  -c "\copy (SELECT * FROM assets WHERE id = '$ASSET_ID') TO '/tmp/restic-single-asset.csv' WITH (FORMAT csv)"

psql \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$PROD_DB" \
  -c "\copy assets FROM '/tmp/restic-single-asset.csv' WITH (FORMAT csv)"
```

Üretim veritabanında satırı doğrulayın:

```sh
psql \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$PROD_DB" \
  -x -c "SELECT id, title, media_url FROM assets WHERE id = '$ASSET_ID';"
```

Container shell'den çıkın:

```sh
exit
```

## 7. Restic'ten yalnızca fiziksel dosyayı geri getirme

```bash
docker exec -it kaisha-app sh
```

Container shell içinde:

```sh
export REPO='/home/belge/depo/netapp/belgelik-restic/restic-repo'
export SNAPSHOT_ID='RESTIC_SNAPSHOT_ID'
export MEDIA_PATH='/app/uploads/YYYY/M/D/other/DOSYA_ADI.txt'
export RESTORE_ROOT='/tmp/belgelik-single-asset-restore'

rm -rf "$RESTORE_ROOT"

restic \
  -r "$REPO" \
  restore "$SNAPSHOT_ID" \
  --target "$RESTORE_ROOT" \
  --include "$MEDIA_PATH"

test -f "${RESTORE_ROOT}${MEDIA_PATH}"
mkdir -p "$(dirname "$MEDIA_PATH")"
cp -p "${RESTORE_ROOT}${MEDIA_PATH}" "$MEDIA_PATH"

ls -lah "$MEDIA_PATH"
sha256sum "$MEDIA_PATH"
```

Geri yükleme sonrası SHA-256 değeri silmeden önce kaydedilen değerle aynı olmalıdır.

Container shell'den çıkın:

```sh
exit
```

## 8. Elasticsearch indeksini yenileme

DB satırı doğrudan SQL ile eklendiği için Elasticsearch kaydı otomatik oluşmaz.

Belgelik'te superadmin olarak oturum açılmış tarayıcının geliştirici konsolunda:

```javascript
fetch('/api/admin/search/reindex', {
  method: 'POST',
  credentials: 'same-origin'
})
  .then(async (response) => ({
    status: response.status,
    body: await response.text()
  }))
  .then(console.log);
```

Beklenen HTTP durumu `200` olmalıdır.

## 9. Uygulama doğrulaması

Belgelik web arayüzünde:

1. Sayfayı yenileyin.
2. `Restic Tek Asset Testi 2026-07-10` başlığını arayın.
3. Varlığın ikinci kolonda göründüğünü doğrulayın.
4. Üçüncü kolonda detaylarını açın.
5. Dosyayı indirin.
6. İndirilen içeriğin aşağıdaki metni taşıdığını doğrulayın:

```text
Belgelik Restic tek asset kurtarma testi - 2026-07-10
```

Sunucu tarafından son doğrulama:

```bash
docker exec -it kaisha-postgres psql -U postgres -d mam_mvp -x -c "
SELECT id, title, media_url, deleted_at
FROM assets
WHERE id = '$ASSET_ID';
"

docker exec -it kaisha-app sh -lc "
ls -lah '$MEDIA_PATH'
sha256sum '$MEDIA_PATH'
"
```

Başarı ölçütleri:

- Asset DB'de tek satırdır.
- `deleted_at` boştur.
- Fiziksel dosya doğru yerde bulunmaktadır.
- SHA-256 değeri özgün dosyayla aynıdır.
- Asset web arayüzünde görünür.
- Asset aranabilir.
- Dosya indirilebilir ve içeriği doğrudur.

## 10. Test temizliği

Geçici veritabanını silin:

```bash
docker exec -it kaisha-app sh -lc '
export PGPASSWORD="$(cat "${MAM_DB_PASSWORD_FILE:-/run/secrets/mam_postgres_password}")"
dropdb \
  -h "${MAM_DB_HOST:-postgres}" \
  -p "${MAM_DB_PORT:-5432}" \
  -U "${MAM_DB_USER:-postgres}" \
  --if-exists mam_single_asset_restore_20260710
rm -f /tmp/restic-single-asset.csv
rm -rf /tmp/belgelik-single-asset-restore
'
```

Kurtarılan test asseti artık gerekmiyorsa Belgelik arayüzünden yeniden kalıcı olarak silinebilir.

## Beklenen hata noktaları

### Snapshot içinde dosya yok

Yanlış snapshot seçilmiş veya Restic yedeği DB dump ile aynı çalışmaya ait değildir. Silme öncesindeki snapshot seçilmelidir.

### Geçici DB'de asset satırı yok

Yanlış DB dump seçilmiştir. Asset yüklendikten sonra ve kalıcı silinmeden önce alınmış dump kullanılmalıdır.

### `duplicate key value violates unique constraint`

Asset satırı üretim DB'de zaten vardır. Kalıcı silme gerçekleşmemiş veya satır daha önce geri yüklenmiştir.

### Asset var ama dosya 404

`media_url` ile geri yüklenen fiziksel yol eşleşmiyordur. Kural:

```text
media_url:  /uploads/...
dosya yolu: /app/uploads/...
```

### Asset listede var ama aramada yok

Elasticsearch reindex işlemi yapılmamış veya başarısız olmuştur.

## Sonuç kaydı

Test sonunda aşağıdaki bilgiler kaydedilmelidir:

```text
Test tarihi:
Testi yapan:
Asset ID:
DB dump:
Restic snapshot ID:
Özgün SHA-256:
Geri yüklenen SHA-256:
DB satırı kurtarıldı: Evet/Hayır
Dosya kurtarıldı: Evet/Hayır
Web görünümü doğrulandı: Evet/Hayır
Arama doğrulandı: Evet/Hayır
İndirme doğrulandı: Evet/Hayır
Toplam kurtarma süresi:
Hata/not:
```
