# MAM Yetkilendirme ve Keycloak İzin Referansı

Tarih: 2026-06-27
Kapsam: MetMAM ve Kaisha/Belgelik ortak yetkilendirme modeli

Bu doküman uygulamadaki kullanıcı/grup yetkilendirmesinin Keycloak'tan başlayıp varlık listesine, yükleme kararına, indirme kararına ve yönetim ekranlarına kadar hangi aşamalardan geçtiğini açıklar.

## 1. Ana Kavramlar

### Kimlik

Kullanıcı Keycloak/OIDC üzerinden gelir. Uygulamanın kullandığı temel alanlar:

```text
username
email
displayName
groups
roles
```

Bu alanlar `/api/me` cevabında görünür.

### Uygulama permission değerleri

Genel uygulama yetkileri `src/permissions.js` içinde tanımlanır.

Önemli permission key'leri:

```text
admin.access
metadata.edit
office.edit
asset.delete
pdf.advanced
text.admin
```

Kod yeri:

```text
src/permissions.js:1-31
```

Grup/rol -> permission eşlemesi:

```text
src/permissions.js:35-45
```

Örnek:

```javascript
superadmin: PERMISSION_KEYS
admin: ['admin.access']
'standart yönetici': ['admin.access']
```

### Varlık erişimi

Tekil varlık erişim alanları `assets` tablosunda tutulur:

```text
visibility
owner_user
owner_groups
allowed_users
allowed_groups
denied_users
denied_groups
edit_allowed_users
edit_allowed_groups
edit_denied_users
edit_denied_groups
download_allowed_users
download_allowed_groups
download_denied_users
download_denied_groups
```

### Tür erişimi

Tür bazlı erişim `asset_type_access` tablosunda tutulur:

```text
type_group
visibility
owner_groups
allowed_users
allowed_groups
denied_users
denied_groups
edit_allowed_users
edit_allowed_groups
edit_denied_users
edit_denied_groups
download_allowed_users
download_allowed_groups
download_denied_users
download_denied_groups
upload_allowed_users
upload_allowed_groups
upload_denied_users
upload_denied_groups
```

Yükleme yetkisi yalnızca tür seviyesinde bulunur. Bunun nedeni yükleme sırasında tekil asset henüz oluşmamış olmasıdır. Bu yüzden arayüzde `Yükleyebilen/Yükleyemeyen` sütunları `Varlık Yetkileri` tablosunun `Tür / yükleme` modunda görünür; tekil varlık satırlarında görünmez.

## 2. Grup Adı Normalizasyonu

Uygulama grup ve kullanıcı adlarını karşılaştırmadan önce normalize eder.

Kod:

```text
src/services/assetAccessService.js:1-16
```

Özet:

- Başındaki `/` kaldırılır.
- Küçük harfe çevrilir.
- Virgül, noktalı virgül ve satır sonu ile ayrılan değerler listeye çevrilir.
- Tekrarlanan değerler temizlenir.

Sonuç:

```text
/standart yönetici
standart yönetici
```

aynı yetki karşılaştırmasına girer.

Boşluklu grup adları desteklenir. Önemli olan DB'deki değer ile Keycloak'tan gelen normalize edilmiş değerin aynı olmasıdır. Örneğin `standart yönetici` tek bir grup adı olarak kullanılabilir; sistem bunu iki ayrı grup gibi yorumlamaz.

## 3. Keycloak'tan Permission Çözümü

Keycloak grupları ve realm rolleri `resolvePermissionKeysFromPrincipals()` ile uygulama permission değerlerine çevrilir.

Kod:

```text
src/permissions.js:71-82
```

Örnekler:

```text
/superadmin -> tüm permission key'leri
/standart yönetici -> admin.access
/altyazı_ocr_operator -> text.admin
```

Yeni bir Keycloak grubu oluşturduğunuzda iki ayrı soru vardır:

1. Bu grup genel uygulama yetkisi verecek mi?
2. Bu grup varlık/tür erişiminde kullanılacak mı?

Genel uygulama yetkisi verecekse `src/permissions.js` içindeki `PRINCIPAL_PERMISSION_MAP` listesine eklenmelidir.

Sadece varlık görünürlüğü, indirme, düzenleme veya yükleme kuralında kullanılacaksa kod değişikliği gerekmez. Grup adını yönetim panelindeki ilgili alana yazmak yeterlidir.

## 4. Erişim Bağlamı

Her istek için ortak erişim bağlamı `resolveAccessContext()` ile oluşturulur.

Kod:

```text
src/services/assetAccessService.js:204-220
```

Bu bağlam şu ayrımı özellikle yapar:

```text
canBypassAssetTypeAccess
canBypassAssetVisibility
canManageAllAssetVisibility
```

Anlamları:

```text
canBypassAssetTypeAccess
```

Tür bazlı görünürlük/yasak kurallarını atlama hakkıdır. Yalnızca superadmin için true olur.

```text
canBypassAssetVisibility
```

Tekil varlık görünürlük kurallarını atlama hakkıdır. Yalnızca superadmin için true olur.

```text
canManageAllAssetVisibility
```

Yönetim panelinde varlık yetkilerini yönetebilme anlamına gelir. Superadmin, admin ve standart yönetici için true olabilir. Bu değer artık normal varlık listesinde görünürlük atlama anlamına gelmez.

## 5. Varlık Görme Kararı

Liste sorguları ve tekil varlık kontrolleri aynı mantığı kullanır.

Liste SQL filtresi:

```text
src/services/assetAccessService.js:264-301
```

Tekil varlık kontrolü:

```text
src/services/assetAccessService.js:443-455
```

Karar sırası:

1. Superadmin ise görünür.
2. Kullanıcı veya grubu `denied_*` alanlarında varsa görünmez.
3. Tekil asset üzerinde kullanıcı/grup `owner_*` veya `allowed_*` alanlarında açıkça varsa görünür. Bu açık tekil izin, tür seviyesindeki görememe kuralını ezer.
4. Tür seviyesi görünürlük kuralı geçilmezse görünmez.
5. Asset `public` ise görünür.
8. Aksi halde görünmez.

Önemli ayrım: `edit_allowed_users`, `edit_allowed_groups` ve tür seviyesindeki `edit_allowed_*` alanları varlığı görme hakkı vermez. Bu alanlar yalnızca kullanıcı varlığı zaten görebiliyorsa düzenleme hakkı verir.

Tekil asset önceliği: `asset_type_access` içinde bir grup doküman türünü göremiyor olsa bile, belirli bir asset satırında aynı grup `allowed_groups` veya kullanıcı `allowed_users` içine eklenirse o tekil asset görünür. Aynı mantık indirme ve düzenleme için de geçerlidir: tekil asset satırındaki `download_allowed_*` ve `edit_allowed_*` alanları, tür seviyesindeki download/edit yasaklarını o asset özelinde ezebilir. Tekil asset seviyesindeki `denied_*`, `download_denied_*` ve `edit_denied_*` alanları ise en üst öncelikli engeldir.

## 6. Görünürlük Dropdown Anlamı

Yönetim panelindeki `Görünürlük` alanı şu değerleri kullanır:

```text
private
group
groups
public
```

Türkçe karşılıklar:

```text
Özel
Sahip gruplar
Seçili grup/kullanıcı
Herkese açık
```

Uygulamadaki pratik anlam:

```text
private
```

Varlığı yalnızca sahibi veya açıkça izin verilen kullanıcı/grup görebilir.

```text
group
```

Varlığı sahip kullanıcı/gruplar ve açıkça izin verilen kullanıcı/gruplar görebilir.

```text
groups
```

Varlığı seçili kullanıcı/grup listeleri üzerinden görenler görür.

```text
public
```

Tür seviyesi engeller ve tekil denied kuralları yoksa herkes görebilir.

Not: Kod seviyesinde `group` ve `groups` için görünürlük kararı aynı görünürlük alanlarını kullanır; fark arayüzdeki niyeti anlatır. İkisi de `owner_*` ve `allowed_*` alanlarıyla değerlendirilir. `edit_allowed_*` alanları görünürlük izni değildir.

## 7. Alanların Anlamı

### Sahip gruplar

`owner_groups`

Varlığın doğal sahibi olan gruplardır. `Görünürlük = Sahip gruplar` senaryosunda en kritik alandır.

Yeni yüklemede varsayılan sahip grup seçimi:

1. Superadmin için Keycloak grup listesi kullanılabilir.
2. Superadmin olmayan kullanıcı için `group_admins` eşleşmesi varsa, sahip grup olarak kullanıcının yönettiği içerik grupları yazılır.
3. Superadmin olmayan kullanıcı elle sahip grup gönderirse, bu liste yalnızca yönettiği gruplarla sınırlandırılır.
4. `group_admins` eşleşmesi yoksa kullanıcının Keycloak grupları fallback olarak kullanılır.

Örnek:

```text
group_admins:
group_name = muhasebe
username   = muhasebedocadmin
```

`/muhasebedocadmin` grubundaki bir kullanıcı doküman yüklediğinde varsayılan:

```text
owner_groups = {muhasebe}
visibility   = group
```

olur. Böylece genel `dokadmin` veya başka doküman yöneticisi grupları, ayrıca `muhasebe` görünürlük grubunda değillerse bu dokümanı göremez.

### Görebilen gruplar / Görebilen kullanıcılar

Eski arayüz adı:

```text
İzinli gruplar
İzinli kullanıcılar
```

Yeni arayüz adı:

```text
Görebilen gruplar
Görebilen kullanıcılar
```

DB alanları:

```text
allowed_groups
allowed_users
```

Bu alanlar varlığı görme izni verir. İndirme veya düzenleme yetkisi anlamına gelmez.

### Göremeyen gruplar / Göremeyen kullanıcılar

DB alanları:

```text
denied_groups
denied_users
```

Bu alanlar görünürlüğü engeller. Deny, public/allowed gibi izinlerden önce uygulanır.

### Değiştirebilen gruplar / kullanıcılar

DB alanları:

```text
edit_allowed_groups
edit_allowed_users
```

Metadata/düzenleme hakkı verir. Kullanıcı veya grup bu alanlarda yer alsa bile varlığı önce sahip/görebilen/public kurallarından biriyle görebilmelidir.

### İndirebilen / İndiremeyen

DB alanları:

```text
download_allowed_groups
download_allowed_users
download_denied_groups
download_denied_users
```

İndirme kararı `canDownloadAsset()` ile verilir.

Kod:

```text
src/services/assetAccessService.js:505-525
```

İndirme kontrolü önce varlığı görme kontrolünden geçer. Görülemeyen varlık indirilemez.

Superadmin indirme kurallarını atlayabilir. Standart/admin kullanıcılar yönetim panelinde yetki düzenleyebilse bile indirme allowed/denied kurallarına tabi kalır.

Tekil asset indirme önceliği: Tür seviyesinde indirme yasaklı bir kullanıcı/grup, tekil asset satırında `download_allowed_users` veya `download_allowed_groups` içine eklenirse o asset'i indirebilir. Ancak aynı tekil asset satırında `download_denied_*` eşleşmesi varsa indirme yine engellenir.

### Yükleyebilen / Yükleyemeyen

DB alanları yalnızca `asset_type_access` tablosundadır:

```text
upload_allowed_groups
upload_allowed_users
upload_denied_groups
upload_denied_users
```

Kod:

```text
src/services/assetAccessService.js:422-440
```

Yükleme endpoint kontrolleri:

```text
src/routes/assets.js:912-921
src/routes/assets.js:999-1008
```

`/api/me` cevabındaki `uploadAllowedAssetTypes` alanı da aynı kurala göre hesaplanır:

```text
src/server.js:7840-7841
```

## 8. Varlık Türü Yetkileri

Varlık türleri:

```text
video
audio
photo
document
other
```

Tür seviyesi görünürlük ve yükleme kararları `asset_type_access` tablosundan gelir.

Eğer bir tür için `visibility = public` ise, denied alanlarına takılmayan kullanıcılar o türü görebilir.

Eğer bir tür public değilse, şu alanlardan biriyle eşleşme gerekir:

```text
allowed_users
allowed_groups
owner_groups
edit_allowed_users
edit_allowed_groups
```

## 9. Yönetim Paneli Erişimi

Yönetim paneli görünürlüğü `/api/me` cevabından beslenir.

Kod:

```text
src/server.js:7824-7843
```

Önemli alanlar:

```text
isSuperAdmin
isAdmin
canAccessAdmin
canAccessAssetRightsAdmin
canAccessDocumentRightsAdmin
allowedAssetTypes
uploadAllowedAssetTypes
```

Varlık yetkileri endpoint kapısı:

```text
src/routes/admin.js:240-246
```

Kaydetme endpoint'i:

```text
src/routes/admin.js:967-972
```

Tür yetkileri endpoint'i:

```text
src/routes/admin.js:1028-1072
```

## 10. Doküman Yöneticisi Modeli

Detaylı kapsam dokümanı:

```text
docs/document_rights_visibility_scope_2026-06-24.md
```

Özet:

Doküman yöneticisi yalnızca:

1. Doküman yetkileri ekranına erişebiliyorsa,
2. İlgili dokümanı normal görünürlük kurallarına göre görebiliyorsa,
3. Sadece doküman kullanıcıları üzerinde işlem yapıyorsa

doküman yetkisi düzenleyebilir.

Gelecekte `muhasebedocadmin` gibi grup modelleri için öneri:

```text
/muhasebe
/muhasebedocadmin
```

Kullanıcı hem içerik grubunda hem yönetici grubunda olmalıdır:

```text
/muhasebe
/muhasebedocadmin
```

Bu sayede sadece görebildiği muhasebe dokümanlarını yönetir.

## 11. Yeni Grup Eklediğimde Ne Yapmalıyım?

### Sadece görünürlük/indirme/düzenleme/yükleme kuralında kullanılacaksa

Kod değişikliği gerekmez.

Yapılacaklar:

1. Keycloak'ta grup oluştur.
2. Kullanıcıyı gruba ekle.
3. Yönetim panelinde ilgili varlık veya tür kuralına grup adını yaz.
4. Kullanıcı yeniden login olsun veya oturumu yenilensin.

### Genel admin/superadmin gibi uygulama yetkisi verecekse

Kod değişikliği gerekir:

```text
src/permissions.js
```

`PRINCIPAL_PERMISSION_MAP` içine grup adı eklenmelidir.

### Doküman yöneticisi gibi özel yönetim grubu olacaksa

Ortam değişkeni veya ilgili grup listesi de kontrol edilmelidir:

```text
MAM_DOCUMENT_ADMIN_GROUPS
MAM_DOCUMENT_USER_GROUPS
```

## 12. Doğrulama Komutları

Belirli asset'in erişim alanlarını görmek:

```bash
docker exec -it mam-postgres psql -U postgres -d mam_mvp -c "
SELECT id,title,visibility,owner_user,owner_groups,allowed_groups,allowed_users,denied_groups,denied_users,type
FROM assets
WHERE lower(title) LIKE '%uysal%'
ORDER BY updated_at DESC
LIMIT 5;
"
```

Tür bazlı yetkileri görmek:

```bash
docker exec -it mam-postgres psql -U postgres -d mam_mvp -c "
SELECT
  type_group,
  visibility,
  owner_groups,
  allowed_groups,
  denied_groups,
  edit_allowed_groups,
  download_allowed_groups,
  download_denied_groups,
  upload_allowed_groups,
  upload_denied_groups
FROM asset_type_access
ORDER BY type_group;
"
```

Kullanıcının efektif yetkisini tarayıcı konsolundan görmek:

```javascript
fetch('/api/me?ts=' + Date.now(), { cache: 'no-store' })
  .then(async r => console.log(r.status, await r.text()));
```

Kod sözdizimi kontrolü:

```bash
node --check src/services/assetAccessService.js
node --check src/routes/admin.js
node --check public/admin.js
```

## 13. Kritik Beklenen Davranış

`Uysal Kız` örneği:

```text
visibility = group
owner_groups = {superadmin}
allowed_groups = {superadmin}
```

Beklenen:

```text
superadmin -> görür
doküman yöneticisi -> görmez
standart yönetici -> görmez
```

Ancak standart yönetici `Varlık Yetkileri` ekranında yetki yönetme hakkına sahipse, yönetim ekranında yetki kayıtlarını düzenleyebilir. Bu, normal varlık listesinde varlığı görme hakkı anlamına gelmez.
