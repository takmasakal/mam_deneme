# MetMAM ve Kaisha Git Yükleme Notları

Tarih: 2026-06-24

Bu doküman aşağıdaki değişikliklerin iki ayrı branch'e kontrollü olarak yüklenmesi için kullanılan Git akışını açıklar:

- Yetki yedekleme arayüzünün kompakt hale getirilmesi
- Yetki export alanının yalnızca superadmin kullanıcılara gösterilmesi
- Kullanıcı/grup export'unun yalnızca Keycloak gruplarına üye kullanıcıları içermesi
- Export dosyasında kullanıcıların grup üyeliklerinin bulunması
- Doküman yöneticilerinin yalnızca görebildikleri dokümanları yönetebilmesi
- Yetki güncelleme ve kilit açma endpointlerinin aynı görünürlük kontrolüyle korunması
- Teknik raporların eklenmesi
- Yalnızca Kaisha için `belgelik-login.css` tasarım değişikliği

## 1. Repo ve Branch Yapısı

### MetMAM

```text
Repo:   /Users/erinc/OyunAlanım/mam_deneme
Branch: main
Remote: origin/main
```

### Kaisha / TRT Belgelik

```text
Repo:   /Users/erinc/OyunAlanım/mam_deneme_kaisha
Branch: takmasakal/kaisha
Remote: origin/takmasakal/kaisha
```

## 2. Commit Kapsamı

### Her iki uygulamaya eklenen ortak değişiklikler

```text
public/admin.css
public/admin.html
src/routes/admin.js
src/server.js
docs/permission_backup_export_report_2026-06-24.md
docs/document_rights_visibility_scope_2026-06-24.md
docs/git_upload_2026-06-24.md
```

MetMAM branch'i daha önce commit edilmemiş doküman yöneticisi bağımlılıklarını da içerdiği için aşağıdaki dosyalar MetMAM commit kapsamına ayrıca alınmıştır:

```text
public/admin.js
public/main-access-scope.js
src/db.js
src/permissions.js
src/services/assetEditLockService.js
```

### Yalnızca Kaisha'ya eklenen dosya

```text
keycloak-theme/mam/login/resources/css/belgelik-login.css
```

Bu CSS dosyası MetMAM'a taşınmamıştır.

## 3. Commit Öncesi Kontroller

Her repoda önce mevcut durum kontrol edildi:

```bash
git status --short
git branch --show-current
git remote -v
git log --oneline -5
```

JavaScript ve diff kontrolleri:

```bash
node --check public/admin.js
node --check src/routes/admin.js
node --check src/server.js
git diff --check
npm run check
```

## 4. MetMAM Git Komutları

```bash
cd /Users/erinc/OyunAlanım/mam_deneme

git status --short

git add \
  public/admin.css \
  public/admin.html \
  public/admin.js \
  public/main-access-scope.js \
  src/db.js \
  src/permissions.js \
  src/routes/admin.js \
  src/server.js \
  src/services/assetEditLockService.js \
  docs/permission_backup_export_report_2026-06-24.md \
  docs/document_rights_visibility_scope_2026-06-24.md \
  docs/git_upload_2026-06-24.md

git diff --cached --check
git diff --cached --stat

git commit -m "Scope document rights and refine permission backups"
git push origin main
```

Bu komutlar özellikle dosya adı verilerek çalıştırılmıştır. Böylece çalışma ağacındaki `.env`, secret, Pinegrow yedeği veya ilgisiz değişiklikler commit'e alınmaz.

## 5. Kaisha Git Komutları

```bash
cd /Users/erinc/OyunAlanım/mam_deneme_kaisha

git status --short

git add \
  public/admin.css \
  public/admin.html \
  src/routes/admin.js \
  src/server.js \
  keycloak-theme/mam/login/resources/css/belgelik-login.css \
  docs/permission_backup_export_report_2026-06-24.md \
  docs/document_rights_visibility_scope_2026-06-24.md \
  docs/git_upload_2026-06-24.md

git diff --cached --check
git diff --cached --stat

git commit -m "Scope document rights and refine permission backups"
git push origin takmasakal/kaisha
```

Kaisha çalışma ağacındaki başka değiştirilmiş veya yeni dokümanlar bu commit'e dahil edilmemiştir.

## 6. Commit İçeriğini Doğrulama

Commit sonrasında:

```bash
git show --stat --oneline HEAD
git status --short
```

Remote branch kontrolü:

```bash
git ls-remote --heads origin main
git ls-remote --heads origin takmasakal/kaisha
```

## 7. Kaisha Kurum Sunucusu Güncelleme

Kurum sunucusunda:

```bash
cd ~/mam_deneme

git status --short
git pull --ff-only origin takmasakal/kaisha

./deploy/mam-kaisha.sh restart
./deploy/mam-kaisha.sh version

docker compose --env-file deploy/.env.kaisha -p kaisha ps
docker logs --tail=100 kaisha-app
```

Eğer app container adı geçici olarak farklı görünürse:

```bash
docker compose --env-file deploy/.env.kaisha -p kaisha ps
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
```

çıktısındaki app servis container adı kullanılmalıdır.

## 8. Keycloak Login CSS Değişikliğini Etkinleştirme

`belgelik-login.css` bind mount ile Keycloak container'a bağlanıyorsa Keycloak restart yeterlidir:

```bash
docker compose --env-file deploy/.env.kaisha -p kaisha restart keycloak
```

Container içindeki dosyayı doğrulama:

```bash
docker exec -it kaisha-keycloak \
  grep -n "belgelik-login-brand-size\|font-weight\|gap:" \
  /opt/keycloak/themes/mam/login/resources/css/belgelik-login.css
```

Tarayıcıda eski CSS görünürse:

1. Gizli pencerede login sayfasını aç.
2. Tarayıcı cache'ini atlayarak yenile.
3. Keycloak container'ın yeni dosyayı gördüğünü yukarıdaki `grep` komutuyla doğrula.

## 9. Fonksiyonel Kontrol Listesi

### Superadmin

- `Ayarlar > Yedekleme` altında yetki export/import alanını görür.
- Varlık yetkilerini export/import edebilir.
- Kullanıcı/grup yetkilerini export/import edebilir.
- Bütün dokümanları Doküman Yetkileri alanında görebilir.

### Normal admin

- Yetki export/import alanını görmez.
- Endpoint'e doğrudan eriştiğinde `403` alır.

### Doküman yöneticisi

- Doküman Yetkileri ekranını açabilir.
- Yalnızca normal varlık listesinde görebildiği dokümanları görür.
- Göremediği dokümanı ID ile güncelleyemez.
- Göremediği dokümanın kilidini açamaz.

### Kullanıcı/grup export

- Keycloak kullanıcı dizininin tamamı export edilmez.
- Yalnızca MAM realminde en az bir gruba üye kullanıcılar bulunur.
- Her kullanıcı kaydında `groups` alanı bulunur.
- `userPermissions` ve `groupAdmins` uygulama yetki kayıtlarını içerir.
