# Doküman Yöneticisi Görünürlük Kapsamı

Tarih: 2026-06-24
Kapsam: MetMAM doküman yetkileri yönetim alanı
Amaç: Doküman yöneticilerinin yalnızca normal uygulamada görme yetkisine sahip oldukları dokümanların yetkilerini yönetebilmesi.

## 1. Sorun

Doküman yöneticisi yönetim sayfasındaki `Doküman Yetkileri` alanına girdiğinde sistemdeki bütün dokümanlar listeleniyordu.

Doküman yöneticisi olma yetkisi ile dokümanı görme yetkisi birbirinden farklı kavramlardır:

- **Yönetim alanına erişim:** Kullanıcı doküman yetkileri ekranını açabilir mi?
- **Varlık görünürlüğü:** Kullanıcı belirli bir dokümanı normal uygulamada görebilir mi?
- **Yetki düzenleme:** Kullanıcı gördüğü dokümanın kullanıcı bazlı yetkilerini değiştirebilir mi?

Önceki sorgu yalnızca varlığın doküman olup olmadığını kontrol ediyordu:

```sql
WHERE <doküman türü koşulu>
```

Varlığın görünürlüğü, izinli kullanıcıları, izinli grupları, engellenen kullanıcıları, engellenen grupları ve tür seviyesindeki görünürlük kuralları uygulanmıyordu.

## 2. Uygulanan Kural

Yeni kural:

```text
Doküman yöneticisi
VE doküman yetkileri ekranına erişebiliyor
VE ilgili dokümanı normal varlık erişim kurallarına göre görebiliyor
= dokümanın yetkilerini görüntüleyebilir ve düzenleyebilir
```

Superadmin istisnası:

```text
Superadmin bütün dokümanları görmeye ve yönetmeye devam eder.
```

## 3. Uygulanan Güvenlik Katmanları

Kontrol yalnızca kullanıcı arayüzünde yapılmadı. Üç backend işleminde uygulanır.

### 3.1 Doküman listesinin yüklenmesi

Endpoint:

```text
GET /api/admin/document-rights/assets
```

Doküman türü koşuluna normal varlık görünürlük filtresi eklenir:

```javascript
const visibilityContext = getDocumentRightsVisibilityContext(gate);
assetAccessService.appendAssetAccessWhere(
  where,
  values,
  visibilityContext,
  'assets'
);
```

Bu filtre şu kuralları uygular:

- Varlık türü seviyesindeki izin ve engeller
- `assets.denied_users`
- `assets.denied_groups`
- `visibility = public`
- Varlık sahibi kullanıcı
- Sahip gruplar
- İzinli kullanıcılar
- İzinli gruplar
- Değiştirme izni verilmiş kullanıcı ve gruplar

### 3.2 Doğrudan yetki güncelleme

Endpoint:

```text
PATCH /api/admin/document-rights/assets/:id/access
```

Bir kullanıcı tarayıcı arayüzünü atlayıp bildiği bir asset ID ile doğrudan istek gönderse bile varlık yeniden okunur ve erişim kontrolü yapılır:

```javascript
if (!assetAccessService.canViewAsset(assetRow, visibilityContext)) {
  return res.status(404).json({ error: 'Document asset not found' });
}
```

Erişim yokken `404` dönülmesi bilinçlidir. Böylece kullanıcıya erişemediği bir asset ID'sinin sistemde bulunup bulunmadığı açıklanmaz.

### 3.3 Doğrudan kilit açma

Endpoint:

```text
DELETE /api/admin/document-rights/assets/:id/edit-lock
```

Aynı görünürlük kontrolü kilit açma işleminde de uygulanır. Doküman yöneticisi görmediği bir dokümanın düzenleme kilidini ID yazarak kaldıramaz.

## 4. Görünürlük Bağlamı

Normal yönetici erişim bağlamında `canManageAllAssetVisibility` değeri bazı yönetim işlemleri için `true` olabilir. Bu değer doküman yetkileri ekranında doğrudan kullanılırsa standart yönetici bütün dokümanları görebilir.

Bu nedenle doküman yöneticileri için ayrı bir görünürlük bağlamı oluşturuldu:

```javascript
function getDocumentRightsVisibilityContext(gate = {}) {
  if (gate?.effective?.isSuperAdmin) return gate.context || {};
  return {
    ...(gate.context || {}),
    canBypassAssetTypeAccess: false,
    canManageAllAssetVisibility: false
  };
}
```

Sonuç:

- Superadmin tam erişimini korur.
- Diğer doküman yöneticileri admin unvanından dolayı görünürlük kurallarını atlayamaz.
- Varlık türü seviyesindeki doküman erişim kuralı da uygulanır.
- Varlık seviyesindeki görünürlük kuralları da uygulanır.

## 5. Gelecekte `muhasebedocadmin` Modeli

Örnek hedef:

- `muhasebedocadmin` yalnızca muhasebe dokümanlarını görsün.
- Sadece gördüğü muhasebe dokümanlarının kullanıcı yetkilerini değiştirsin.
- İnsan kaynakları veya hukuk dokümanlarını görmesin.

Önerilen model üç parçadan oluşur.

### 5.1 Keycloak grupları

Örnek:

```text
/muhasebe
/muhasebedocadmin
```

`muhasebe` içerik görünürlük grubudur.
`muhasebedocadmin` yönetim rolü grubudur.

### 5.2 Dokümanların sahip/izinli grubu

Muhasebe dokümanlarında aşağıdakilerden biri bulunmalıdır:

```text
owner_groups = {muhasebe}
```

veya:

```text
allowed_groups = {muhasebe}
```

Yönetici kullanıcının dokümanı normal erişim kurallarına göre görebilmesi gerekir. Bunun için seçenekler:

1. Kullanıcı hem `/muhasebe` hem `/muhasebedocadmin` grubuna eklenir.
2. `/muhasebedocadmin` grubu dokümanlarda ayrıca izinli grup yapılır.
3. Kurumsal Keycloak yapısı uygunsa yönetici grubu, içerik grubunun alt/nested grubu olarak modellenir ve token group claim davranışı doğrulanır.

En açık ve düşük riskli yöntem birinci seçenektir:

```text
Kullanıcı grupları:
- /muhasebe
- /muhasebedocadmin
```

### 5.3 Doküman yöneticisi grubunu tanıtma

Mevcut kod doküman yöneticisi gruplarını şu ortam değişkeninden okuyabilir:

```text
MAM_DOCUMENT_ADMIN_GROUPS
```

Örnek:

```env
MAM_DOCUMENT_ADMIN_GROUPS=dokadmin,dokyonet,muhasebedocadmin
```

Bu değer ilgili deployment `.env` dosyasında tanımlanmalı ve uygulama container'ı yeniden oluşturulmalıdır.

Örnek Compose değişkeni:

```yaml
environment:
  MAM_DOCUMENT_ADMIN_GROUPS: ${MAM_DOCUMENT_ADMIN_GROUPS:-dokadmin,dokyonet}
```

Not: Ortam değişkeninin compose içinde app container'a geçirildiği ayrıca doğrulanmalıdır.

## 6. `group_admins` Tablosunun Rolü

Uygulamadaki `group_admins` tablosu bir kullanıcı veya principal'ın hangi içerik grubunu yönettiğini belirtmek için kullanılabilir:

```sql
SELECT id, group_name, username, created_at, created_by
FROM group_admins
ORDER BY group_name, username;
```

Örnek kayıt:

```text
group_name = muhasebe
username   = muhasebedocadmin
```

Buradaki `username` alanı yalnızca bireysel kullanıcı adı olmak zorunda değildir. Erişim çözümleme kodu kullanıcı adı, kullanıcının grupları ve rolleri üzerinden eşleştirme yapar. Bu nedenle yönetici grubunun principal adı da kullanılabilir.

Ancak önemli ayrım:

```text
group_admins kaydı tek başına dokümanı görünür yapmaz.
```

Dokümanı görebilmek için kullanıcı ayrıca varlığın normal görünürlük kurallarından geçmelidir. Bu güvenlik ayrımı sayesinde “grup yöneticisi” olmak bütün içerikleri otomatik görünür hale getirmez.

## 7. SQL ile Beklenen Sonucu Kontrol Etme

### 7.1 Muhasebe grubuna bağlı dokümanlar

Kaisha:

```bash
docker exec -it kaisha-postgres \
  psql -U postgres -d mam_mvp -c "
SELECT
  id,
  title,
  visibility,
  owner_user,
  owner_groups,
  allowed_groups,
  denied_groups
FROM assets
WHERE (
  LOWER(COALESCE(type, '')) IN ('document','pdf','office','doc','docx','xls','xlsx','ppt','pptx','odt','ods','odp')
  OR LOWER(COALESCE(mime_type, '')) = 'application/pdf'
)
AND (
  owner_groups @> ARRAY['muhasebe']::text[]
  OR allowed_groups @> ARRAY['muhasebe']::text[]
)
ORDER BY title;
"
```

MetMAM lokal:

```bash
docker exec -it mam-postgres \
  psql -U postgres -d mam_mvp -c "
SELECT id, title, visibility, owner_groups, allowed_groups, denied_groups
FROM assets
WHERE owner_groups @> ARRAY['muhasebe']::text[]
   OR allowed_groups @> ARRAY['muhasebe']::text[]
ORDER BY title;
"
```

### 7.2 Grup yöneticisi eşlemesi

```bash
docker exec -it kaisha-postgres \
  psql -U postgres -d mam_mvp -c "
SELECT group_name, username, created_at, created_by
FROM group_admins
WHERE group_name = 'muhasebe'
ORDER BY username;
"
```

### 7.3 Doküman türü erişim kuralı

```bash
docker exec -it kaisha-postgres \
  psql -U postgres -d mam_mvp -x -c "
SELECT *
FROM asset_type_access
WHERE type_group = 'document';
"
```

Bu sorgu doküman türü seviyesinde engellenen veya izin verilen grupları kontrol etmek için kullanılır.

## 8. Keycloak Üyelik Kontrolü

Önce kullanıcı bulunur:

```bash
docker exec kaisha-keycloak \
  /opt/keycloak/bin/kcadm.sh get users \
  -r mam \
  -q username=MUHASEBE_YONETICISI \
  --fields id,username,email
```

Kullanıcı ID'si ile grup üyelikleri:

```bash
USER_ID="KEYCLOAK_USER_ID"

docker exec kaisha-keycloak \
  /opt/keycloak/bin/kcadm.sh get \
  "users/${USER_ID}/groups" \
  -r mam
```

Beklenen örnek:

```text
/muhasebe
/muhasebedocadmin
```

## 9. Test Senaryosu

Hazırlık:

1. `muhasebe` ve `hukuk` isimli iki içerik grubu oluştur.
2. `muhasebedocadmin` kullanıcısını/grubunu yalnızca muhasebe içerik erişimine dahil et.
3. Bir dokümana `owner_groups={muhasebe}` ver.
4. Başka bir dokümana `owner_groups={hukuk}` ver.

Test:

1. `muhasebedocadmin` ile giriş yap.
2. Normal varlık listesinde yalnızca muhasebe dokümanının göründüğünü doğrula.
3. Yönetim sayfasında `Doküman Yetkileri` alanını aç.
4. Yalnızca muhasebe dokümanının listelendiğini doğrula.
5. Muhasebe dokümanının kullanıcı yetkisini değiştir.
6. Hukuk dokümanının ID'sini kullanarak doğrudan PATCH isteği gönder.
7. Yanıtın `404 Document asset not found` olduğunu doğrula.
8. Hukuk dokümanının kilit açma endpoint'ine doğrudan DELETE isteği gönder.
9. Yanıtın `404 Document asset not found` olduğunu doğrula.
10. Superadmin ile aynı sayfayı açıp bütün dokümanların görüntülendiğini doğrula.

## 10. Değiştirilen Kod

Ana değişiklik:

```text
src/routes/admin.js
```

Kullanılan ortak erişim servisi:

```text
src/services/assetAccessService.js
```

Yeni yardımcı:

```text
getDocumentRightsVisibilityContext()
```

Kullanılan ortak fonksiyonlar:

```text
assetAccessService.appendAssetAccessWhere()
assetAccessService.canViewAsset()
```

Bu yaklaşım yeni ve farklı bir yetkilendirme algoritması oluşturmaz. Ana varlık listesinde kullanılan erişim mantığını doküman yönetimi alanında tekrar kullanır. Böylece iki ekranın zamanla farklı güvenlik davranışı göstermesi önlenir.

## 11. Doğrulama Komutları

```bash
node --check src/routes/admin.js
node --check src/server.js
git diff --check
npm run check
```

Canlı doğrulama için Docker servisleri çalışırken:

```bash
curl -sS http://127.0.0.1:3001/api/health
docker logs --tail=100 mam-app
```

Tarayıcı oturumu gerektiren doküman yetkileri endpoint testi, giriş yapılmış tarayıcı geliştirici konsolundan veya geçerli oauth2-proxy oturum cookie'si ile yapılmalıdır.
