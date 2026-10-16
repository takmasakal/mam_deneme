# Processing storage yönlendirme rehberi

Bu doküman MetMAM ve Belgelik'teki AI/medya işlerinin kullandığı dosyaları,
uygulamaya özel mutlak yollar taşımadan, adlandırılmış storage kökleri üzerinden
yönlendirme yöntemini açıklar.

## Amaç

API ile gelecekte ayrı sunucularda çalışabilecek AI ve Media Operations
worker'ları aynı dosyayı şu taşınabilir referansla tanımlar:

```json
{
  "storage": "primary",
  "relativePath": "2026-10-16/video/ornek.mp4"
}
```

`/app/uploads`, `/mnt/netapp/metmam` gibi makineye veya container'a özgü mutlak
yollar görev mesajlarına yazılmaz. Her süreç `primary` storage anahtarını kendi
yerel yapılandırmasındaki köke çevirir.

## Mevcut uygulama

Storage servisi `src/services/processingStorageService.js` dosyasındadır.
Referans biçimi ve güvenlik denetimleri
`src/services/processingJobContract.js` tarafından sağlanır.

Sunucu başlangıcında `primary` kökü şu sırayla seçilir:

1. `PROCESSING_STORAGE_PRIMARY_ROOT` tanımlıysa onun değeri kullanılır.
2. Tanımlı değilse mevcut `uploads` dizini kullanılır.

```js
const PROCESSING_STORAGE_PRIMARY_ROOT =
  process.env.PROCESSING_STORAGE_PRIMARY_ROOT || UPLOADS_DIR;
```

Bu varsayılan nedeniyle ortam değişkeni eklenmeden mevcut davranış değişmez.

> Önemli: Bu aşamada storage adapter ve ProcessingJob sözleşmesi hazırlanmıştır;
> mevcut AI/medya akışlarının tamamı henüz adapter üzerinden çalışmamaktadır.
> Akışlar kademeli olarak geçirildikçe aşağıdaki yapılandırma worker iletişiminde
> de etkili olacaktır.

## Tek sunucu veya mevcut Docker kurulumu

Mevcut compose dosyaları host'taki `./uploads` dizinini container içinde
`/app/uploads` olarak bağlar. Varsayılan yapı için ek ayar gerekmez.

Değeri açıkça tanımlamak isterseniz uygulama servisine şunu ekleyin:

```yaml
environment:
  PROCESSING_STORAGE_PRIMARY_ROOT: /app/uploads
volumes:
  - ./uploads:/app/uploads
```

Ortam değişkenindeki yol **host yolu değil, uygulama prosesinin gördüğü yol**
olmalıdır. Docker içinde `/app/uploads`, doğrudan Node.js çalıştırıldığında ise
örneğin `/srv/metmam/uploads` kullanılabilir.

## NetApp/paylaşımlı alan yönlendirmesi

### 1. Alanı host'a bağlayın

NetApp alanını işletim sistemi seviyesinde sabit bir noktaya bağlayın. Örnek:

```text
/mnt/netapp/metmam-processing
```

MetMAM ve Belgelik için veri ayrımı isteniyorsa ayrı alt dizinler kullanın:

```text
/mnt/netapp/metmam-processing/metmam
/mnt/netapp/metmam-processing/belgelik
```

### 2. İzinleri doğrulayın

API ve worker proseslerinin kullandığı UID/GID bu dizinde okuma, yazma, dizin
oluşturma ve dosya yeniden adlandırma yetkisine sahip olmalıdır. Üretime geçmeden
önce aynı kullanıcıyla küçük bir dosya oluşturma ve silme testi yapın.

### 3. Alanı container'a bağlayın

Örnek MetMAM yapılandırması:

```yaml
services:
  app:
    environment:
      PROCESSING_STORAGE_PRIMARY_ROOT: /processing-storage
    volumes:
      - /mnt/netapp/metmam-processing/metmam:/processing-storage
```

Belgelik için host tarafındaki kaynak dizini
`/mnt/netapp/metmam-processing/belgelik` olarak değiştirin.

### 4. Worker'larda aynı mantıksal storage'ı tanımlayın

API ve worker aynı `storage` anahtarını (`primary`) kullanmalıdır. Container içi
mutlak yollarının aynı olması zorunlu değildir. Örneğin API'de
`/processing-storage`, worker'da `/worker-data` kullanılabilir; ikisi de aynı
NetApp alt dizinine bağlı olduğu sürece aşağıdaki referans aynı dosyayı gösterir:

```json
{
  "storage": "primary",
  "relativePath": "proxies/2026-10-16/video-proxy.mp4"
}
```

### 5. Servisleri yeniden başlatın

Compose yapılandırmasını doğruladıktan sonra ilgili uygulama ve worker
servislerini yeniden oluşturun. Sadece restart etmek, yeni volume veya environment
tanımlarını her durumda uygulamayabilir.

## Güvenli geçiş sırası

Mevcut dosyaları farklı bir köke taşıyorsanız önerilen sıra şöyledir:

1. Yeni storage dizinini ve erişim izinlerini hazırlayın.
2. Mevcut `uploads` içeriğini yeni alana, zaman damgaları ve dizin yapısı
   korunacak şekilde kopyalayın.
3. Kopyalama sürerken yazma devam ediyorsa kısa bir bakım aralığında son eşitleme
   yapın.
4. Volume bağlantısını ve `PROCESSING_STORAGE_PRIMARY_ROOT` değerini birlikte
   değiştirin.
5. Uygulamayı başlatıp mevcut bir dosyayı okuyun.
6. Küçük bir test videosu yükleyin; proxy, thumbnail, altyazı ve OCR yollarını
   kontrol edin.
7. Eski alanı hemen silmeyin; doğrulama süresince salt okunur geri dönüş kopyası
   olarak tutun.

Yalnızca ortam değişkenini yeni, boş bir dizine yönlendirmek mevcut dosyaları
taşımaz. Veritabanındaki göreli URL/yollar korunacağı için dizin yapısının da
korunması gerekir.

## Doğrulama

Storage adapter ve sözleşme testleri:

```bash
npm run test:processing-storage-service
npm run test:processing-job-contract
```

Manuel doğrulamada aşağıdakileri kontrol edin:

- Uygulama başlatılırken storage yapılandırma hatası oluşmuyor.
- Yeni yüklenen dosya beklenen paylaşımlı dizine yazılıyor.
- API'nin ürettiği referans mutlak yol değil, `storage + relativePath` içeriyor.
- Worker aynı referansı çözerek dosyayı okuyabiliyor.
- Çıktı dosyası API tarafından görülebiliyor ve indirilebiliyor.
- `../`, mutlak yol veya tanımsız storage anahtarı içeren referanslar reddediliyor.

## Geri dönüş

Sorun halinde:

1. Uygulama ve worker yazmalarını durdurun.
2. Yeni alandaki son değişiklikleri eski `uploads` alanına eşitleyin.
3. `PROCESSING_STORAGE_PRIMARY_ROOT` değişkenini kaldırın veya eski container
   yoluna döndürün.
4. Önceki volume bağlantısını geri yükleyip servisleri yeniden oluşturun.
5. Okuma, yükleme ve bir proxy üretme işlemiyle doğrulayın.

## Birden fazla storage için sonraki genişletme

Servis birden fazla adlandırılmış kökü destekler; ancak `src/server.js` şu anda
yalnızca `primary` kökünü tanımlar. İleride örneğin `archive`, `scratch` veya
`delivery` eklenecekse:

1. Her storage için ayrı ortam değişkeni tanımlanır.
2. Sunucu ve ilgili worker'ın `roots` haritasına aynı mantıksal ad eklenir.
3. Görev türünün hangi input/output storage'ını kullanacağı açıkça belirlenir.
4. Erişim ve yaşam döngüsü politikaları storage bazında test edilir.

Storage anahtarları küçük harfle başlamalı; yalnızca küçük harf, rakam, `_` ve
`-` içerebilir. Görev sözleşmesine erişim anahtarı, parola veya bağlantı parolası
yazılmamalıdır.

## İlgili dosyalar

- `src/services/processingStorageService.js`: adlandırılmış köklerin adapter'ı
- `src/services/processingJobContract.js`: görev ve storage referansı sözleşmesi
- `src/server.js`: `primary` storage başlangıç yapılandırması
- `scripts/test_processing_storage_service.js`: adapter güvenlik testleri
- `scripts/test_processing_job_contract.js`: görev/referans sözleşmesi testleri
