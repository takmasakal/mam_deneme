# MetMAM Donma Testi

Bu test, MetMAM'da kart tıklamasından sonra 3. kolonun güncellenmemesi veya varlık türü filtreleri değiştirilince `Failed to fetch` görülmesi sırasında uygulanır.

## Önemli Kural

Sorun oluştuğu anda test başlatılmalıdır. Sayfayı yenilemeyin. Refresh sonrası alınan `200` kayıtları yalnızca açılış akışını gösterir ve donma anındaki hatayı kanıtlamaz.

## Ortam Kontrolü

MetMAM proje dizininde:

```bash
cd ~/mam_deneme
docker compose ps
```

Beklenen temel servisler:

- `mam-oauth2-proxy`: `3000 -> 4180`
- `mam-app`: `3001 -> 3000`
- `mam-postgres`: healthy
- `mam-keycloak`: çalışıyor

Uygulama sağlık kontrolü:

```bash
curl -sS http://127.0.0.1:3001/api/health
```

Beklenen sonuç `{"ok":true,...}` içeren bir JSON yanıtıdır.

## Canlı Log İzleme

İki ayrı terminal açın. Sorun oluşmadan hemen önce aşağıdaki komutları çalıştırın.

### Terminal 1: OAuth2 Proxy

```bash
docker logs -f --tail=0 mam-oauth2-proxy 2>&1 | grep --line-buffered -Ei \
'GET /api/(assets|workflow|me)|401|403|499|502|error|failed'
```

### Terminal 2: MetMAM uygulaması

```bash
docker logs -f --tail=0 mam-app 2>&1 | grep --line-buffered -Ei \
'error|failed|api|asset|workflow'
```

`--tail=0` yalnızca test başladıktan sonra oluşan kayıtları gösterir. Böylece refresh sırasında oluşan eski veya başarılı istekler test sonucuna karışmaz.

## Tarayıcı Testi

MetMAM'ı OAuth2 proxy üzerinden açın:

```text
http://localhost:3000/
```

Tarayıcı geliştirici araçlarında:

1. **Console** sekmesini açın.
2. **Network** sekmesini açın.
3. Network kaydını temizleyin.
4. Preserve log seçeneğini açık bırakın.
5. Sayfayı yenilemeden bir varlık kartına tıklayın.
6. Başka bir karta tıklayın.
7. Tüm varlık türü checkbox'larını kaldırın.
8. Bir türü yeniden seçin.

Her adımda şu bilgileri not edin:

- Hangi işlemden sonra sorun oluştuğu
- 3. kolonun eski varlıkta kalıp kalmadığı
- Console'daki tam hata metni
- Network'te başarısız isteğin URL'si
- HTTP durum kodu
- İstek süresi
- Response gövdesi

## Özellikle Kontrol Edilecek İstekler

Kart tıklamasında:

```text
GET /api/workflow
GET /api/assets/<asset-id>
```

Filtre değişiminde:

```text
GET /api/assets?trash=active&limit=20&offset=0
GET /api/assets?trash=active&types=<type>&limit=20&offset=0
```

Tüm türler kaldırıldığında uygulamanın boş listeyi yerel olarak göstermesi beklenir; bu durumda API isteği yapılmayabilir. Bu davranış tek başına hata değildir. Hata, yeniden tür seçildiğinde oluşan isteğin sonucuyla birlikte değerlendirilmelidir.

## Sonuçların Yorumlanması

### `GET /api/assets/<id>` 401 veya 403

Oturum veya OAuth2 proxy sorunu vardır. Aynı anda proxy logunda `401`, `403`, `csrf`, `invalid_grant`, `expired` veya `temporarily_unavailable` kayıtları aranmalıdır.

### `GET /api/workflow` başarısız

Kart tıklama akışı önce workflow bilgisini beklediği için 3. kolon eski içeriğinde kalabilir. Bu durumda kart API'si hiç çağrılmamış olabilir.

### `GET /api/assets` 4xx veya 5xx

Filtre sorgusu, yetki kontrolü veya backend varlık listeleme akışı incelenmelidir. Network'teki tam query string mutlaka kaydedilmelidir.

### İstekler 200, fakat 3. kolon değişmiyor

Frontend tarafında kart click handler, seçili varlık durumu veya `openAsset()` akışında sorun aranmalıdır. Console'da JavaScript exception olup olmadığı kontrol edilir.

### `Failed to fetch` ve Network'te `canceled`, `pending` veya `opaqueredirect`

İstek tarayıcı tarafından iptal edilmiş, OAuth redirect'e düşmüş veya aynı anda başlatılan başka bir yükleme tarafından geçersiz hale getirilmiş olabilir. Test sırasında refresh yapılmamalı; tüm ilgili Network kayıtları Preserve log ile saklanmalıdır.

## Test Sonuç Formu

Test sonunda şu bilgileri birlikte kaydedin:

```text
Tarih/saat:
Tarayıcı ve sürüm:
MetMAM adresi:
Oturum açan kullanıcı:
Sorun kart tıklamasında mı, filtre değişiminde mi:
İlk başarısız URL:
HTTP durum kodu:
Console hatası:
Proxy logu:
App logu:
Sayfa refresh yapıldı mı: E/H
```

İlk başarısız isteğin log satırı ve Network response gövdesi bulunmadan kod değişikliği yapılmamalıdır.
