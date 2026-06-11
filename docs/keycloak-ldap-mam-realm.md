# Keycloak `mam` Realm İçinde LDAP Kurulum Yönergesi

Bu doküman, şirket LDAP/Active Directory bağlantısını mevcut `mam` realm içine eklemek için hazırlanmıştır. Amaç, mevcut Keycloak kullanıcılarını, gruplarını, `mam-web` client ayarlarını ve MAM uygulama yetkilerini bozmadan LDAP kullanıcılarını devreye almaktır.

## Karar

Yeni realm açma. LDAP bağlantısını mevcut `mam` realm içinde `User federation` olarak ekle.

Bu kurulumda uygulama ve oauth2-proxy zaten `mam` realm'e bağlıdır:

- `KEYCLOAK_REALM=mam`
- `OAUTH2_PROXY_CLIENT_ID=mam-web`
- Issuer/JWKS adresleri `.../realms/mam` üzerinden çalışır.

Yeni realm açılırsa `mam-web`, redirect URI, grup/yetki yapısı, mobile client, tema, session ayarları ve oauth2-proxy ayarlarının tamamını yeniden taşımak gerekir. LDAP için buna gerek yoktur.

## Güvenli Çalışma Prensipleri

- `mam` realm silinmeyecek.
- Keycloak PostgreSQL volume silinmeyecek.
- `keycloak-postgres` verisi korunacak.
- `mamsup` gibi en az bir lokal superadmin kullanıcı korunacak.
- LDAP ilk etapta `READ_ONLY` ve `Import Users=ON` ile kurulacak.
- `Sync Registrations=OFF` kalacak; Keycloak LDAP içine yeni kullanıcı yazmayacak.
- İlk test bir veya birkaç kullanıcıyla yapılacak; toplu sync daha sonra yapılacak.

Keycloak dokümanına göre Keycloak LDAP/AD provider'ı aynı realm içinde User Federation olarak eklenebilir. Keycloak yerel kullanıcı DB'sini önce kontrol eder; LDAP provider arızalanırsa yerel admin hesabının korunması önerilir. Ayrıca `Import Users`, `Edit Mode` ve mapper ayarları provider oluşturulurken dikkatle seçilmelidir.

Referans:

- https://www.keycloak.org/docs/latest/server_admin/

## 1. Ön Kontrol

Sunucuda servislerin çalıştığını kontrol et:

```bash
cd ~/mam_deneme

docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Beklenen temel container'lar:

- `kaisha-keycloak`
- `kaisha-keycloak-postgres`
- `kaisha-oauth2-proxy`
- `kaisha-app`
- `kaisha-postgres`

Keycloak admin şifresi:

```bash
cat deploy/secrets/keycloak_admin_password
```

Keycloak admin paneli:

- Reverse proxy hazırsa: `https://authbelgelik.<kurum-domain>/admin/`
- Direkt IP testinde: `http://10.0.6.200:8081/admin/`

Admin realm:

- Admin girişi genellikle `master` realm içindeki `admin` kullanıcısıyladır.
- LDAP kurulumu ise `mam` realm içinde yapılacaktır.

## 2. Değişiklik Öncesi Yedek

Önce Keycloak DB yedeği al:

```bash
cd ~/mam_deneme
mkdir -p deploy/backups

docker exec kaisha-keycloak-postgres pg_dump \
  -U keycloak \
  -d keycloak \
  -Fc \
  > "deploy/backups/keycloak-before-ldap-$(date +%F-%H%M).dump"
```

Yedeğin oluştuğunu kontrol et:

```bash
ls -lh deploy/backups/keycloak-before-ldap-*.dump
```

İstersen ayrıca mevcut realm ayarlarını JSON olarak gözlem amaçlı al:

```bash
docker exec kaisha-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user admin \
  --password "$(cat deploy/secrets/keycloak_admin_password)"

docker exec kaisha-keycloak /opt/keycloak/bin/kcadm.sh get realms/mam \
  > "deploy/backups/mam-realm-before-ldap-$(date +%F-%H%M).json"
```

Not: `kc.sh export` komutu tam export için kullanılabilir, fakat Keycloak resmi dokümanları export/import işlerinde node'ların durdurulmasını önerir. Canlı sistemde hızlı ve güvenli başlangıç için PostgreSQL dump daha pratik geri dönüş noktasıdır.

## 3. LDAP İçin Kurumdan İstenen Bilgiler

Kurum LDAP/AD yöneticisinden şu bilgileri iste:

- LDAP tipi: Active Directory mi, OpenLDAP mı?
- LDAP URL:
  - Tercih: `ldaps://ldap-host:636`
  - Geçici test: `ldap://ldap-host:389`
- Base DN:
  - Örnek: `DC=trt,DC=net,DC=tr`
- Users DN:
  - Örnek: `OU=Users,DC=trt,DC=net,DC=tr`
- Bind DN:
  - Örnek: `CN=svc_keycloak,OU=Service Accounts,DC=trt,DC=net,DC=tr`
- Bind credential/parola
- Kullanıcı attribute'ları:
  - AD için genelde:
    - Username LDAP attribute: `sAMAccountName`
    - RDN LDAP attribute: `cn`
    - UUID LDAP attribute: `objectGUID`
    - Email attribute: `mail`
    - First name: `givenName`
    - Last name: `sn`
- Grup bilgileri:
  - Groups DN
  - Grup object class
  - Grup name attribute
  - Üyelik attribute'u: AD için çoğunlukla `member`
- Hangi LDAP gruplarının MAM gruplarına denk geleceği:
  - LDAP grup -> Keycloak/MAM grup
  - Örnek: `CN=MAM-SuperAdmin,...` -> `/superadmin`

## 4. LDAP Provider Ekleme

Keycloak Admin Console:

1. Sol üst realm seçicisinden `mam` realm'i seç.
2. `User federation` menüsüne gir.
3. `Add LDAP provider` seç.
4. Aşağıdaki başlangıç ayarlarını kullan.

### Genel Ayarlar

| Alan | Değer |
| --- | --- |
| Console Display Name | `company-ldap` |
| Vendor | Active Directory ise `Active Directory` |
| Enabled | ON |
| Priority | `1` veya mevcut provider yoksa varsayılan |
| Import Users | ON |
| Edit Mode | `READ_ONLY` |
| Sync Registrations | OFF |
| Remove invalid users during searches | OFF |

`READ_ONLY`, Keycloak'ın LDAP kullanıcı bilgilerini LDAP'a geri yazmasını engeller. Başlangıç için en güvenli mod budur.

### Bağlantı Ayarları

| Alan | Değer |
| --- | --- |
| Connection URL | `ldaps://<ldap-host>:636` |
| Enable StartTLS | LDAPS kullanıyorsan OFF |
| Use Truststore SPI | Genelde `Always` |
| Connection pooling | ON |
| Connection timeout | `5000` |
| Read timeout | `10000` |
| Pagination | ON |

`ldaps://` sertifika hatası verirse önce kurum CA sertifikasının Keycloak container tarafından güvenildiğinden emin olun. Test için `ldap://` kullanılabilir, fakat kalıcı kurulumda LDAPS tercih edilmelidir.

### Authentication Ayarları

| Alan | Değer |
| --- | --- |
| Bind type | `simple` |
| Bind DN | Kurumun verdiği servis hesabı DN'i |
| Bind credential | Servis hesabı parolası |

Bu aşamada önce:

1. `Test connection`
2. `Test authentication`

İkisi de başarılı olmadan kaydetme/sync adımına geçme.

### LDAP Searching and Updating

Active Directory için tipik ayarlar:

| Alan | Örnek |
| --- | --- |
| Users DN | `OU=Users,DC=trt,DC=net,DC=tr` |
| Username LDAP attribute | `sAMAccountName` |
| RDN LDAP attribute | `cn` |
| UUID LDAP attribute | `objectGUID` |
| User Object Classes | `person, organizationalPerson, user` |
| Search Scope | `Subtree` |
| Read timeout | `10000` |

Custom LDAP filter gerekiyorsa ilk testte dar kapsamlı başla:

```text
(sAMAccountName=test.kullanici)
```

Test başarılı olduktan sonra filtreyi genişlet.

Örnek daha genel AD filtresi:

```text
(&(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))
```

Bu örnek disabled AD kullanıcılarını dışarıda bırakmak için kullanılır. Kurum AD yapısına göre doğrulanmalıdır.

## 5. İlk Kullanıcı Testi

Provider'ı kaydet.

Sonra Keycloak'ta:

1. `Users` menüsüne gir.
2. Arama alanına test LDAP kullanıcısının username'ini yaz.
3. Kullanıcı bulunursa detayına gir.
4. `Attributes` ve `Groups` sekmelerinin beklenen şekilde geldiğini kontrol et.

Arama ile kullanıcı bulunursa Keycloak, `Import Users=ON` olduğu için kullanıcıyı lokal Keycloak DB'ye de kaydeder. Parola yine LDAP'ta doğrulanır; Keycloak parolayı import etmez.

## 6. MAM Yetki Gruplarıyla Bağlama

MAM uygulamasında temel yetkiler Keycloak grup/rol bilgisinden çözülür. Mevcut MAM grup adları:

- `/superadmin`
- `/standart yönetici`
- `/dokyonet`
- `/dokkullan`
- `/fotoyonet`
- `/fotokullan`
- `/altyazı_ocr_operator`

İlk testte otomatik grup mapper kurmadan manuel doğrula:

1. Keycloak `mam` realm -> `Users`
2. LDAP test kullanıcısını aç.
3. `Groups` sekmesine gir.
4. Örnek olarak `/dokkullan` grubuna ekle.
5. Kullanıcıyla MAM'e login ol.
6. MAM yönetim ekranında `Kimlik Özeti` veya browser console'da `/api/me` çıktısını kontrol et.

Beklenen `/api/me` örneği:

```json
{
  "username": "test.kullanici",
  "groups": ["/dokkullan"],
  "roles": []
}
```

Superadmin testi için kullanıcıyı `/superadmin` grubuna ekle. Bu kullanıcı yönetim sayfasına erişebilmelidir.

## 7. LDAP Group Mapper Kurulumu

Manuel grup testi başarılı olduktan sonra LDAP gruplarını Keycloak/MAM gruplarına eşlemek için provider altında mapper ekle.

Keycloak Admin Console:

1. `User federation`
2. `company-ldap`
3. `Mappers`
4. `Add mapper`
5. Mapper type: `group-ldap-mapper`

Active Directory için tipik başlangıç:

| Alan | Örnek |
| --- | --- |
| Name | `company-ldap-groups` |
| LDAP Groups DN | `OU=Groups,DC=trt,DC=net,DC=tr` |
| Group Name LDAP Attribute | `cn` |
| Group Object Classes | `group` |
| Membership LDAP Attribute | `member` |
| Membership Attribute Type | `DN` |
| User Roles Retrieve Strategy | `LOAD_GROUPS_BY_MEMBER_ATTRIBUTE` |
| Member-Of LDAP Attribute | `memberOf` |
| Mode | Başlangıç için `READ_ONLY` |
| Preserve Group Inheritance | Kurum grup hiyerarşisine göre |
| Drop non-existing groups during sync | Başlangıçta OFF |

Sonra:

1. Mapper kaydet.
2. `Sync LDAP Groups to Keycloak` çalıştır.
3. Keycloak `Groups` altında gelen grup adlarını kontrol et.

Önemli: MAM'in beklediği grup adları Türkçe ve birebir olabilir. Kurum LDAP grupları farklı isimdeyse iki seçenek var:

1. Keycloak içinde MAM gruplarını koru, LDAP kullanıcılarını bu gruplara manuel veya script ile ekle.
2. LDAP group mapper ile gelen grup adlarını uygulama tarafındaki yetki eşlemesine ayrıca tanıt.

İlk canlı geçiş için 1. seçenek daha az risklidir.

## 8. Toplu Kullanıcı Sync

Tek kullanıcı testi, login testi ve grup testi başarılı olmadan toplu sync yapma.

Hazır olduğunda:

1. `User federation`
2. `company-ldap`
3. `Action` veya provider ekranındaki sync seçenekleri:
   - Önce `Synchronize changed users`
   - Sonra gerekirse `Synchronize all users`

Sync sonrası:

```bash
docker logs --tail=200 kaisha-keycloak
```

Hata yoksa MAM tarafında kullanıcı sayısı ve grup görünümü kontrol edilir.

## 9. MAM Tarafında Doğrulama

Login sonrası tarayıcıda veya sunucuda şunları kontrol et:

```bash
curl -I http://127.0.0.1:3000/api/me
```

Tarayıcı üzerinden login olmuş kullanıcı için DevTools Console:

```js
fetch('/api/me').then(r => r.json()).then(console.log)
```

Kontrol edilecek alanlar:

- `username`
- `displayName`
- `email`
- `groups`
- `roles`
- `canAccessAdmin`
- `isSuperAdmin`
- `permissionKeys`

## 10. `sync-keycloak` Scriptiyle İlişki

Kaisha deploy scripti şu komutu çalıştırabilir:

```bash
./deploy/mam-kaisha.sh sync-keycloak
```

Bu script mevcut `mam` realm içinde:

- MAM gruplarını garanti eder.
- Varsayılan kullanıcıları garanti eder.
- Client URL ayarlarını günceller.
- Locale ayarlarını günceller.

Bu script LDAP provider'ı silmez. Mevcut kullanıcı parolalarını da varsayılan olarak resetlemez; çünkü:

```bash
KEYCLOAK_SYNC_RESET_DEFAULT_PASSWORDS=false
```

Bu değeri özellikle `true` yapma.

## 11. Sorun Çıkarsa Geri Alma

LDAP provider login'i bozarsa önce provider'ı disable et:

1. Lokal admin ile Keycloak admin paneline gir.
2. Realm: `mam`
3. `User federation`
4. `company-ldap`
5. `Enabled`: OFF
6. Save

Lokal admin ile giriş çalışmaya devam etmelidir.

Admin paneline girilemiyorsa `kcadm` ile provider'ları listele:

```bash
docker exec kaisha-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user admin \
  --password "$(cat deploy/secrets/keycloak_admin_password)"

docker exec kaisha-keycloak /opt/keycloak/bin/kcadm.sh get components \
  -r mam \
  -q type=org.keycloak.storage.UserStorageProvider
```

İlgili LDAP component ID'sini bulduktan sonra disable etmek için admin console tercih edilir. Acil durumda component config üzerinden `enabled=false` yapılabilir; ama bu adımı uygulamadan önce mevcut JSON çıktısını kaydet.

En son çare olarak DB yedeği geri yüklenir. Bu işlem kesinti gerektirir ve önce mevcut verinin ayrıca yedeği alınmalıdır.

## 12. Canlıya Almadan Önce Kontrol Listesi

- [ ] `keycloak-before-ldap-*.dump` yedeği alındı.
- [ ] `mamsup` veya başka lokal superadmin kullanıcı çalışıyor.
- [ ] LDAP provider `mam` realm içinde eklendi.
- [ ] `Test connection` başarılı.
- [ ] `Test authentication` başarılı.
- [ ] Test LDAP kullanıcısı Keycloak'ta bulunabiliyor.
- [ ] Test LDAP kullanıcısı MAM'e login olabiliyor.
- [ ] Test kullanıcı `/dokkullan` veya uygun MAM grubuna eklenince `/api/me` içinde grup görünüyor.
- [ ] Superadmin olacak LDAP kullanıcı için `/superadmin` grup testi yapıldı.
- [ ] Group mapper kullanılacaksa küçük kapsamlı test edildi.
- [ ] Toplu sync ancak testler geçtikten sonra çalıştırıldı.

## Önerilen İlk Uygulama Sırası

1. DB yedeği al.
2. `mam` realm içinde LDAP provider ekle.
3. `READ_ONLY`, `Import Users=ON`, `Sync Registrations=OFF` ile kaydet.
4. Bağlantı ve authentication testlerini yap.
5. Tek test kullanıcıyı ara ve login dene.
6. Bu kullanıcıyı manuel `/dokkullan` grubuna ekle.
7. MAM `/api/me` çıktısını kontrol et.
8. Bir kullanıcıyı manuel `/superadmin` grubuna ekleyip yönetim erişimini test et.
9. Her şey düzgünse LDAP group mapper planını devreye al.
10. Son olarak `Synchronize changed users`, gerekirse `Synchronize all users`.
