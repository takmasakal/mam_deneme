# Incident: Varlık Görünürlüğü Admin Bypass Sorunu

Tarih: 2026-06-27
Kapsam: MetMAM varlık görünürlüğü, varlık yetkileri yönetimi, yükleme/tür yetkileri

## Özet

`Ayarlar > Varlık Yetkileri` ekranında bir varlık için `Görünürlük = Sahip gruplar` seçilip sahip grup yalnızca `superadmin` bırakıldığında, normalde bu varlığı görmemesi gereken doküman yöneticisi varlığı görmeye devam edebiliyordu.

Örnek kayıt:

```sql
SELECT id,title,visibility,owner_user,owner_groups,allowed_groups,allowed_users,denied_groups,denied_users,type
FROM assets
WHERE lower(title) LIKE '%uysal%'
ORDER BY updated_at DESC
LIMIT 5;
```

Gözlenen çıktı:

```text
id                    | title     | visibility | owner_user | owner_groups | allowed_groups | type
qtghDq3HWXDMCKDiMaDUc | Uysal Kız | group      | erinç      | {superadmin} | {superadmin}   | Document
```

Bu durumda doküman yöneticisinin normal varlık listesinde bu asset'i görmemesi gerekir.

## Kök Neden

Ortak erişim servisinde iki farklı kavram tek bayrakla temsil ediliyordu:

```text
canManageAllAssetVisibility
```

Bu bayrak hem:

1. Yönetim panelinde varlık yetkilerini değiştirebilme,
2. Normal varlık listesinde görünürlük kurallarını atlayabilme

anlamında kullanılıyordu.

Bu nedenle `admin.access` sahibi bir kullanıcı yönetim paneli için gerekli yetkiye sahip olduğu anda normal asset görünürlük kontrolünü de atlayabiliyordu.

İkinci sorun tür ve varlık seviyesindeki düzenleme izninin görünürlük izni gibi kullanılmasıydı. Örneğin `asset_type_access.edit_allowed_groups={dokadmin}` olan `document` türünde dokadmin dokümanları düzenleyebildiği için `owner_groups={superadmin}` olan `Uysal Kız` dokümanını da görebiliyordu.

İlgili eski davranış yüzeyleri:

```text
src/services/assetAccessService.js
- resolveAccessContext()
- appendAssetAccessWhere()
- canViewAsset()
```

## Düzeltme

Yeni davranışta iki kavram ayrıldı:

```text
canManageAllAssetVisibility
```

Yönetim panelinde varlık yetkilerini yönetebilme anlamını korur.

```text
canBypassAssetVisibility
```

Normal varlık görünürlük kurallarını atlama anlamına gelir ve yalnızca `superadmin` için `true` olur.

Uygulanan ana değişiklikler:

```javascript
canBypassAssetTypeAccess: Boolean(user.isSuperAdmin),
canBypassAssetVisibility: Boolean(user.isSuperAdmin),
canManageAllAssetVisibility: Boolean(user.isSuperAdmin || user.canAccessAdmin || user.isAdmin)
```

Liste SQL filtresi artık yönetici olmayı değil, yalnızca `canBypassAssetVisibility` değerini dikkate alır:

```javascript
if (context?.canBypassAssetVisibility) return;
```

Tekil varlık kontrolü de aynı ayrımı kullanır:

```javascript
if (context?.canBypassAssetVisibility) return true;
```

Ek olarak `edit_allowed_users`, `edit_allowed_groups` ve tür seviyesindeki `edit_allowed_*` alanları görünürlük izni olmaktan çıkarıldı. Bu alanlar artık sadece kullanıcı varlığı zaten görebiliyorsa düzenleme hakkı verir.

2026-06-27 ek kapsam: Tekil asset satırında verilen açık izinlerin tür seviyesindeki genel kısıtları ezmesi istendi. Buna göre `allowed_*`, `download_allowed_*` ve `edit_allowed_*` alanları ilgili tekil asset için tür seviyesindeki görünürlük/indirme/düzenleme yasaklarını ezebilir. Tekil asset seviyesindeki deny alanları en üst öncelikli engel olarak korunur.

## Ek Düzeltme

`Ayarlar > Varlık Yetkileri` ekranındaki varlık kaydetme endpoint'i yalnızca superadmin istiyordu:

```text
PATCH /api/admin/assets/:id/access
```

Bu endpoint `requireSuperAdminRequest()` yerine `requireAssetRightsAdminRequest()` kullanacak şekilde düzeltildi. Böylece standart/admin yetkili kullanıcılar yönetim ekranında görebildikleri/yönetebildikleri yetki kayıtlarını kaydedebilir.

İndirme kararında da aynı bypass ayrımı uygulandı. Standart/admin kullanıcı varlığı görebilse bile `download_allowed_*` ve `download_denied_*` kurallarını atlayamaz; bu bypass yalnızca superadmin için geçerlidir.

## Alan Adı Netleştirmesi

Arayüzdeki eski etiketler:

```text
İzinli gruplar
İzinli kullanıcılar
```

şu şekilde değiştirildi:

```text
Görebilen gruplar
Görebilen kullanıcılar
```

Bu alanlar indirme veya düzenleme değil, varlığı görüntüleme izni anlamına gelir.

## Yükleme Yetkisi

Yükleme yetkisi varlık seviyesinde değil, tür seviyesinde tutulur:

```text
asset_type_access.upload_allowed_users
asset_type_access.upload_allowed_groups
asset_type_access.upload_denied_users
asset_type_access.upload_denied_groups
```

Bu nedenle yükleme yetkileri `Varlık Yetkileri > Tür / yükleme` modunda görünür. Belirli tekil bir asset henüz oluşmadan yükleme kararı verildiği için bu ayarın varlık satırında tutulması doğru değildir.

Yeni yüklenen varlığın sahip grubu için de aynı kapsam ilkesi uygulandı. Superadmin olmayan kullanıcı için `group_admins` eşleşmesi varsa `owner_groups` kullanıcının yönettiği içerik gruplarından oluşturulur. Bu, ileride `muhasebedocadmin -> muhasebe` gibi modellerde muhasebe yöneticisinin yüklediği dokümanın genel `dokadmin` tarafından otomatik görülmesini engeller.

## Doğrulama

Statik kontrol:

```bash
node --check src/services/assetAccessService.js
node --check public/admin.js
node --check src/routes/admin.js
```

Gözlenen sonuç: hata yok.

Davranış kontrolü:

```bash
node - <<'NODE'
const { createAssetAccessService, getUserAccessIdentity } = require('./src/services/assetAccessService');
const svc = createAssetAccessService({ pool: { query: async () => ({ rows: [] }) } });
const row = {
  title: 'Uysal Kız',
  type: 'Document',
  visibility: 'group',
  owner_user: 'erinç',
  owner_groups: ['superadmin'],
  allowed_groups: ['superadmin'],
  allowed_users: [],
  denied_groups: [],
  denied_users: []
};
const docAdmin = {
  isSuperAdmin: false,
  isAdmin: true,
  canAccessAdmin: true,
  groups: ['/dokadmin'],
  username: 'dokadmin',
  assetTypeAccessRules: [],
  accessIdentity: getUserAccessIdentity({ username: 'dokadmin', groups: ['/dokadmin'] }),
  canBypassAssetTypeAccess: false,
  canBypassAssetVisibility: false,
  canManageAllAssetVisibility: true
};
const superAdmin = {
  isSuperAdmin: true,
  groups: ['/superadmin'],
  username: 'sup',
  assetTypeAccessRules: [],
  accessIdentity: getUserAccessIdentity({ username: 'sup', groups: ['/superadmin'] }),
  canBypassAssetTypeAccess: true,
  canBypassAssetVisibility: true,
  canManageAllAssetVisibility: true
};
console.log(JSON.stringify({
  docAdminCanView: svc.canViewAsset(row, docAdmin),
  superAdminCanView: svc.canViewAsset(row, superAdmin)
}));
NODE
```

Beklenen ve gözlenen çıktı:

```json
{"docAdminCanView":false,"superAdminCanView":true}
```

## Sonuç

Standart/admin kullanıcı yönetim panelinde yetki yönetebilir, fakat normal varlık listesinde görünürlük kurallarını superadmin gibi atlayamaz. `Sahip gruplar = superadmin` olan bir varlık yalnızca superadmin grubu üyelerine görünür.
