# Yetki Yedekleme Arayüzü ve Grup Üyesi Kullanıcı Export Raporu

Tarih: 2026-06-24
Kapsam: MetMAM / Belgelik web yönetim paneli
Durum: Kod değişiklikleri tamamlandı, statik kontroller geçti, henüz commit edilmedi.

## 1. İstek

Yönetim sayfasındaki `Ayarlar > Yedekleme` alanında iki iyileştirme istendi:

1. Varlık yetkileri ile kullanıcı/grup yetkileri için kullanılan dışa ve içe aktarma kontrolleri çok büyük görünüyordu. Dosya adı, dışa aktar, dosya seç ve içe aktar kontrollerinin aynı satırda ve kompakt görünmesi gerekiyordu.
2. Kullanıcı/grup yetkileri export dosyası yalnızca işlemi yapan kullanıcıyı değil, Belgelik uygulamasında bir Keycloak grubuna eklenmiş kullanıcıları ve grup üyeliklerini içermeliydi. Tüm LDAP/Keycloak kullanıcı dizininin export edilmesi istenmedi.

Ek güvenlik koşulu:

- Yetki export/import alanı ve API uçları yalnızca `superadmin` kullanıcıları tarafından kullanılabilmelidir.

## 2. Yapılan Değişikliklerin Özeti

### 2.1 Kompakt export/import arayüzü

Her yedekleme türü tek satır halinde düzenlendi:

```text
Yetki türü | İsteğe bağlı dosya adı | Dışa Aktar | Dosya Seç | İçe Aktar
```

İki ayrı satır bulunur:

- Varlık yetkileri
- Kullanıcı ve grup yetkileri

Butonlar içerik genişliğine indirildi. Dosya alanları kalan alanı kullanır. Dar ekranlarda satırlar kontrollü olarak iki veya üç satıra kırılır.

İlgili dosyalar:

- `public/admin.html`
  - `permissionBackupGroup`
  - `permission-backup-row`
- `public/admin.css`
  - `.permission-backup-row`
  - responsive medya kuralları
- `public/admin.js`
  - export/import buton olayları
  - dosya indirme ve JSON okuma işlemleri

### 2.2 Superadmin sınırı

Arayüz başlangıçta HTML seviyesinde kapalıdır:

```html
<fieldset id="permissionBackupGroup" class="settings-group" hidden>
```

`/api/me` ile alınan kullanıcı profilinde `isSuperAdmin=true` olduğunda JavaScript alanı açar:

```javascript
permissionBackupGroup.hidden = !currentAdminProfile?.isSuperAdmin;
```

Bu yalnızca görsel bir önlem değildir. Backend export ve import uçlarında ayrıca:

```javascript
const effective = await requireSuperAdminRequest(req, res);
if (!effective) return null;
```

kontrolü çalışır. Superadmin olmayan doğrudan API isteği `403` alır.

İlgili backend uçları:

```text
GET  /api/admin/permission-exports/asset-rights
GET  /api/admin/permission-exports/principal-rights
POST /api/admin/permission-imports/asset-rights
POST /api/admin/permission-imports/principal-rights
```

## 3. Kullanıcı ve Grup Export Kapsamı

### 3.1 İlk yaklaşım neden değiştirildi?

İlk uygulamada `fetchKeycloakUsers()` çağrısı kullanılıyordu. Arama parametresi verilmediğinde bu fonksiyon, yapılandırılmış Keycloak realm'lerindeki bütün kullanıcıları sayfalayarak alabiliyor.

Bu yaklaşım şu nedenle uygun değildi:

- LDAP üzerinden Keycloak'a bağlanan ancak Belgelik grubuna alınmamış kullanıcılar da export dosyasına girebilirdi.
- Gereksiz kişisel veri ve büyük bir JSON dosyası oluşabilirdi.
- Export'un amacı LDAP dizinini yedeklemek değil, Belgelik yetki kapsamını yedeklemektir.

### 3.2 Yeni sorgulama yöntemi

Yeni akış kullanıcı dizinini doğrudan listelemez.

1. Keycloak Admin API'den MAM realm grupları alınır.
2. Her grup için yalnızca o grubun üyeleri sorgulanır.
3. Aynı kullanıcı birden fazla gruptaysa tek kullanıcı kaydı oluşturulur.
4. Kullanıcının bulunduğu bütün grup yolları `groups` listesine eklenir.
5. Grup üyesi olmayan LDAP/Keycloak kullanıcıları export'a girmez.

Akış:

```text
fetchKeycloakGroups()
        |
        v
MAM realm grup adları/yolları
        |
        v
fetchKeycloakGroupMembers(groupNames)
        |
        +--> /admin/realms/{realm}/groups/{groupId}/members
        |
        v
Tekilleştirilmiş grup üyeleri + kullanıcının grup yolları
```

Kullanılan Keycloak Admin REST API uçları:

```text
GET /admin/realms/{realm}/groups?briefRepresentation=false
GET /admin/realms/{realm}/groups/{groupId}/members?first=0&max=1000&briefRepresentation=true
```

Bu işlem LDAP sunucusuna doğrudan sorgu göndermez. Keycloak, federasyon ile gördüğü kullanıcı ve grup üyeliklerini kendi Admin API'si üzerinden döndürür.

## 4. Neden SQL Kullanılmadı?

LDAP kullanıcıları ve grup üyelikleri uygulamanın `kaisha-postgres` veya `mam-postgres` veritabanında ana kaynak olarak tutulmaz.

Bu nedenle aşağıdaki türde bir PostgreSQL sorgusu doğru çözüm değildir:

```sql
SELECT *
FROM users
WHERE ldap_group = 'superadmin';
```

Uygulama PostgreSQL'inde böyle güvenilir bir LDAP üyelik tablosu yoktur. Keycloak veritabanına doğrudan SQL yazmak da önerilmez:

- Keycloak şeması ürünün iç implementasyonudur.
- LDAP federasyon kullanıcıları ve üyelikleri lazy import/cache davranışına göre eksik görünebilir.
- Keycloak sürüm değişimlerinde tablo yapısı değişebilir.
- Doğrudan veritabanı sorgusu Keycloak'ın yetkilendirme ve federasyon katmanını atlar.

Doğru kaynak Keycloak Admin REST API'dir.

## 5. Uygulama PostgreSQL'inden Alınan Veriler

Kullanıcı/grup export dosyasında Keycloak verisine ek olarak uygulamanın kendi tuttuğu iki yetki kaynağı bulunur.

### 5.1 Kullanıcı yetki override kayıtları

Kaynak:

```sql
SELECT value
FROM admin_settings
WHERE key = 'user_permissions'
LIMIT 1;
```

Bu JSON, yönetim panelinde kullanıcıya özel kaydedilen uygulama permission değerlerini içerir.

Docker üzerinden kontrol:

```bash
docker exec -it kaisha-postgres \
  psql -U postgres -d mam_mvp -x -c "
SELECT key, value, updated_at
FROM admin_settings
WHERE key = 'user_permissions';
"
```

MetMAM lokal için container adı:

```bash
docker exec -it mam-postgres \
  psql -U postgres -d mam_mvp -x -c "
SELECT key, value, updated_at
FROM admin_settings
WHERE key = 'user_permissions';
"
```

### 5.2 Grup yöneticisi kayıtları

Kaynak:

```sql
SELECT id, group_name, username, created_at, created_by
FROM group_admins
ORDER BY group_name, username;
```

Docker üzerinden kontrol:

```bash
docker exec -it kaisha-postgres \
  psql -U postgres -d mam_mvp -c "
SELECT id, group_name, username, created_at, created_by
FROM group_admins
ORDER BY group_name, username;
"
```

Bu SQL sorguları LDAP kullanıcı listesini çıkarmaz. Yalnızca MAM uygulamasında ayrıca kaydedilmiş yetki verilerini gösterir.

## 6. Keycloak Grup Üyeliğini Elle Doğrulama

Kod geliştirilirken çalışan sunucuya karşı Docker dışından SQL veya LDAP sorgusu çalıştırılmadı. Değişiklik mevcut kod akışı ve Keycloak Admin API sözleşmesi üzerinden yapıldı.

İstenirse çalışan Kaisha sunucusunda aynı grup üyeliği verisi `kcadm.sh` ile doğrulanabilir.

### 6.1 Keycloak admin oturumu

Sunucuda proje klasöründe:

```bash
cd ~/mam_deneme

KC_ADMIN_PASSWORD="$(cat deploy/secrets/keycloak_admin_password)"

docker exec kaisha-keycloak \
  /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://127.0.0.1:8080 \
  --realm master \
  --user admin \
  --password "$KC_ADMIN_PASSWORD"
```

Komut geçmişinde şifre bırakmamak için şifreyi doğrudan komuta yazmamak gerekir.

### 6.2 MAM realm gruplarını listeleme

```bash
docker exec kaisha-keycloak \
  /opt/keycloak/bin/kcadm.sh get groups \
  -r mam \
  --fields id,name,path
```

### 6.3 Belirli bir grubun üyelerini listeleme

Önce yukarıdaki komuttan grup ID'si alınır:

```bash
GROUP_ID="KEYCLOAK_GRUP_ID"

docker exec kaisha-keycloak \
  /opt/keycloak/bin/kcadm.sh get \
  "groups/${GROUP_ID}/members?first=0&max=1000&briefRepresentation=true" \
  -r mam
```

Bu çıktı yalnızca seçilen grubun üyelerini verir. Uygulama kodu aynı işlemi bütün MAM realm grupları için yapar ve kullanıcıları tekilleştirir.

### 6.4 Bir kullanıcının üyeliklerini kontrol etme

Önce kullanıcı bulunur:

```bash
docker exec kaisha-keycloak \
  /opt/keycloak/bin/kcadm.sh get users \
  -r mam \
  -q username=KULLANICI_ADI \
  --fields id,username,email,firstName,lastName
```

Çıktıdaki kullanıcı ID'si ile:

```bash
USER_ID="KEYCLOAK_USER_ID"

docker exec kaisha-keycloak \
  /opt/keycloak/bin/kcadm.sh get \
  "users/${USER_ID}/groups" \
  -r mam
```

## 7. Export JSON Yapısı

Kullanıcı/grup export dosyasının ana yapısı:

```json
{
  "schema": "mam.permission-export",
  "version": 1,
  "kind": "principal-rights",
  "exportedAt": "2026-06-24T...",
  "exportedBy": "superadmin",
  "userPermissions": {},
  "groupAdmins": [],
  "keycloakUsers": [],
  "keycloakGroups": []
}
```

Bir kullanıcı kaydı:

```json
{
  "id": "keycloak-user-id",
  "username": "kullanici",
  "firstName": "Ad",
  "lastName": "Soyad",
  "email": "kullanici@example.com",
  "enabled": true,
  "realm": "mam",
  "groups": [
    "/dokyonet",
    "/standart yönetici"
  ],
  "hasSavedPermissionOverride": true,
  "savedPermissionOverride": {
    "permissionKeys": [
      "admin.access"
    ]
  }
}
```

`keycloakUsers` alanına girebilme koşulu:

```text
Kullanıcı etkin olmalı
VE service-account kullanıcısı olmamalı
VE MAM realminde en az bir grubun üyesi olmalı
```

## 8. Import Davranışı

Export dosyasındaki alanların tamamı import sırasında Keycloak'a yazılmaz.

Import edilen uygulama verileri:

- `userPermissions`
- `groupAdmins`

Referans/bilgilendirme amacıyla export edilen fakat Keycloak'a geri yazılmayan alanlar:

- `keycloakUsers`
- `keycloakGroups`
- kullanıcıların `groups` listeleri

Bu tercih bilinçlidir. Import işleminin Keycloak veya LDAP grup üyeliklerini otomatik değiştirmesi yüksek risklidir. LDAP üyelikleri LDAP/Keycloak yönetim katmanından yönetilmeye devam eder.

## 9. Değiştirilen Kod Noktaları

### `public/admin.html`

- `permissionBackupGroup` başlangıçta `hidden`
- Her export/import türü için `.permission-backup-row`

### `public/admin.css`

- Tek satırlı grid yerleşimi
- Küçük ve içerik genişliğinde butonlar
- Dosya input alanının esnek genişliği
- Tablet ve mobil responsive kırılımlar
- `[hidden]` durumunda zorunlu gizleme

### `public/admin.js`

- Profil geldikten sonra yalnızca superadmin için alanın gösterilmesi
- Export endpoint çağrısı
- `Content-Disposition` üzerinden dosya adının alınması
- JSON import dosyasının okunması
- Import öncesi onay

### `src/routes/admin.js`

- Export ve import endpointleri
- `requireSuperAdminRequest()` koruması
- Varlık yetkileri export/import
- Kullanıcı yetki override ve grup yöneticisi export/import
- Keycloak gruplarının alınması
- Yalnızca grup üyelerinin kullanıcı export'una eklenmesi
- Kullanıcının grup üyeliklerinin JSON'a yazılması

### `src/server.js`

- `fetchKeycloakGroups()`
- `fetchKeycloakGroupMembers()`
- Grup üyelerinin sayfalı alınması
- Kullanıcıların username ile tekilleştirilmesi
- `groupPathsByUsername` ile bir kullanıcının bütün grup yollarının tutulması

## 10. Yapılan Kontroller

Çalıştırılan kontroller:

```bash
node --check src/server.js
node --check src/routes/admin.js
node --check public/admin.js
git diff --check
npm run check
```

Sonuç:

- JavaScript sözdizimi hatası bulunmadı.
- Diff whitespace hatası bulunmadı.
- Proje kontrol betiği başarılı tamamlandı.
- Kontrol sırasında yalnızca lokal `.env` içinde bulunmayan oauth2-proxy secret değişkenleri için uyarı oluştu.

Docker daemon erişilebilir olmadığı için bu çalışma sırasında canlı tarayıcı ve gerçek Keycloak export testi yapılmadı.

## 11. Önerilen Canlı Test

1. Superadmin ile yönetim paneline giriş yap.
2. `Ayarlar > Yedekleme` sayfasını aç.
3. İki export/import satırının kompakt göründüğünü doğrula.
4. Kullanıcı ve grup yetkilerini dışa aktar.
5. JSON içinde `keycloakUsers` listesini kontrol et.
6. Grupsuz bir LDAP kullanıcısının listede olmadığını doğrula.
7. Birden fazla gruba üye kullanıcının `groups` alanında bütün gruplarının bulunduğunu doğrula.
8. Normal admin ile giriş yaparak yetki yedekleme alanının görünmediğini doğrula.
9. Normal admin oturumuyla endpoint'e doğrudan istek gönderildiğinde `403` döndüğünü doğrula.

Örnek API doğrulaması:

```javascript
fetch('/api/admin/permission-exports/principal-rights', {
  cache: 'no-store'
}).then(async (response) => {
  console.log(response.status, await response.text());
});
```

Bu JavaScript tarayıcı geliştirici konsolunda çalıştırılmalıdır; Linux/macOS terminalinde çalıştırılmamalıdır.
