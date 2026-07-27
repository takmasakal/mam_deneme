# Incident: Kaisha OAuth2 Session Issuer ve Unknown Kullanıcı

**Tarih:** 2026-07-16  
**Sistem:** Belgelik Web (Kaisha)  
**Bileşenler:** Nginx, Keycloak, oauth2-proxy, MAM uygulaması  
**Durum:** Yapılandırma düzeltildi, yeni session akışı doğrulama altında

## 1. Belirti

- Kullanıcılar zaman zaman Belgelik Web üzerinde `Bilinmeyen kullanıcı` durumuna düşüyordu.
- Bazı varlıkların yükleyicisi DC metadata alanında `Unknown` görünüyordu.
- Uzun süre açık kalan oturumlarda kullanıcı login ekranına yönleniyor veya `403` hatası oluşuyordu.
- OAuth2 session yenilemesi sonrasında `/api/me` isteği `401` dönebiliyordu.

## 2. Etki

Oturum yenilemesi başarısız olduğunda kullanıcı profili uygulama tarafından çözülemiyordu. Bu durum:

- arayüzde mevcut kullanıcı adının kaybolmasına,
- yetki bilgilerinin geçici olarak kullanılamamasına,
- yeni yüklemelerde yükleyici bilgisinin eksik veya `Unknown` kaydedilmesine

neden olabiliyordu.

## 3. İnceleme Kanıtları

### 3.1. Keycloak ayarları

Keycloak container ortamı:

```text
KC_HOSTNAME=authbelgelik.trt.net.tr
KC_HOSTNAME_STRICT=true
KC_HTTP_ENABLED=true
KC_PROXY_HEADERS=xforwarded
```

Public discovery endpoint doğru HTTPS issuer döndürdü:

```json
{
  "issuer": "https://authbelgelik.trt.net.tr/realms/mam",
  "authorization_endpoint": "https://authbelgelik.trt.net.tr/realms/mam/protocol/openid-connect/auth",
  "token_endpoint": "https://authbelgelik.trt.net.tr/realms/mam/protocol/openid-connect/token",
  "jwks_uri": "https://authbelgelik.trt.net.tr/realms/mam/protocol/openid-connect/certs"
}
```

### 3.2. Nginx ayarları

Aktif konfigürasyon:

```text
/etc/nginx/sites-available/default
```

Uygulama ve Keycloak proxy bloklarında gerekli header'lar mevcuttu:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Forwarded-Proto https;
proxy_set_header X-Forwarded-Port 443;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

Bu nedenle temel problem Nginx header eksikliği değildi.

### 3.3. OAuth2-proxy logları

Kritik hata:

```text
Unable to refresh session: error refreshing tokens: unable to redeem refresh token:
oauth2: "invalid_grant" "Invalid token issuer.
Expected 'http://authbelgelik.trt.net.tr:8080/realms/mam'"
```

Ardından session silindi:

```text
session is expired, removing session
```

Ve uygulamaya:

```text
GET /api/me ... 401
```

Yeni login sonrasında `/api/me` tekrar `200` döndü.

## 4. Kök Neden

OAuth2-proxy'nin token yenileme endpoint'i Compose varsayılanı olarak internal HTTP adresini kullanıyordu:

```text
http://keycloak:8080/realms/mam/protocol/openid-connect/token
```

Login ve issuer ise dış HTTPS adresindeydi:

```text
https://authbelgelik.trt.net.tr/realms/mam
```

Bu farklılık, refresh token yenilemesi sırasında issuer uyuşmazlığı oluşturdu. Eski session'lar yenilenemedi ve oauth2-proxy tarafından silindi.

## 5. Uygulanan Düzeltme

`deploy/.env.kaisha` dosyasına şu değer eklendi:

```env
OAUTH2_PROXY_REDEEM_URL=https://authbelgelik.trt.net.tr/realms/mam/protocol/openid-connect/token
```

Ardından yalnızca oauth2-proxy yeniden oluşturuldu:

```bash
docker compose \
  --env-file deploy/.env.kaisha \
  -f docker-compose.yml \
  -f docker-compose.kaisha.yml \
  up -d --force-recreate oauth2-proxy
```

Container içindeki değer şu şekilde doğrulandı:

```bash
docker exec kaisha-oauth2-proxy printenv OAUTH2_PROXY_REDEEM_URL
```

Beklenen değer:

```text
https://authbelgelik.trt.net.tr/realms/mam/protocol/openid-connect/token
```

## 6. Doğrulama

Aşağıdaki log taraması düzeltme sonrasında hata üretmedi:

```bash
docker logs --since=10m kaisha-oauth2-proxy | grep -E \
'Invalid token issuer|Unable to refresh session|invalid_grant|/api/me'
```

Yeni login sonrasında `/api/me` isteği `200` dönmüştür. Uzun süreli refresh akışı ayrıca en az bir token ömrü boyunca izlenmelidir.

## 7. `Unknown` DC Metadata Kayıtları

Veritabanında üç eski asset'in DC metadata alanında kalıcı `Unknown` değeri bulundu:

```text
lrfuuCa2OsEcRmYE2776a | Blokzincir Blok Görselİ
VBuRHo2UcPFQDpjI0bKm9 | digital occupation
W56pDgzurJK2BjhIbBq5i | Küçük Prens
```

Bu kayıtlar eski kimlik çözümleme problemi sırasında oluşmuş olabilir. Gerçek yükleyici doğrulanmadan bu değerler değiştirilmemelidir.

## 8. Takip Aksiyonu

Upload endpoint'i kimlik çözümlenemediğinde `Unknown` fallback'i ile kayıt oluşturmamalıdır. Bunun yerine isteği durdurmalıdır:

```http
401 Authentication required
```

Bu koruma, gelecekte hatalı owner veya DC creator metadata kayıtlarının oluşmasını engeller.

Realm'de `bruteForceProtected=false` ayarı ayrıca incelenmelidir. Bu ayar mevcut issuer probleminin nedeni değildir; ancak üretim güvenliği açısından ayrı bir hardening konusudur.
