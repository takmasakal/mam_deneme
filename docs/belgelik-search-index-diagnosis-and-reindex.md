# Belgelik Arama Yanlış Eşleşme Teşhisi ve Yeniden İndeksleme

Tarih: 28.09.2026

## Olay

Genel arama alanında `kant` yazıldığında, görünür alanlarında bu ifade bulunmayan
`Magna Carta` videosu sonuç olarak dönüyordu. Kartta eşleşen bölüm ve highlight
görünmüyordu.

## Tek Tek Yapılan Kontroller

1. Üretim uygulamasının çalışan sürümü kontrol edildi:

   ```bash
   curl -sS http://10.0.6.200:3000/api/health
   ```

   İncelenen sürüm: `924d30c19a6e`, dal: `takmasakal/kaisha`.

2. Arayüzde `kant` araması tekrarlandı. Yalnızca `Magna Carta` videosunun
   döndüğü ve kartta eşleşme metni bulunmadığı doğrulandı.

3. Varlığın görünür metadata alanları incelendi. Başlık, açıklama, etiketler ve
   Dublin Core kullanıcı alanlarında `kant` bulunmadığı doğrulandı.

4. Elasticsearch sorgusu doğrudan çalıştırıldı:

   ```bash
   curl -sS -X POST 'http://10.0.6.200:9200/mam_assets/_search?pretty' \
     -H 'Content-Type: application/json' \
     -d '{"query":{"multi_match":{"query":"kant","fields":["title","description","owner","tags","dc","clips","type","status"]}}}'
   ```

   Elasticsearch `kant` için sıfır sonuç döndürdü. Yanlış eşleşmenin kaynağı
   Elasticsearch değildi.

5. `Magna Carta` Elasticsearch belgesi incelendi. `dc_metadata` içindeki teknik
   altyazı kaydının rastgele ID değeri `XWiGKAnTi-p9XUdSkgxRd` idi.

6. PostgreSQL fallback sorgusunun `dc_metadata::text LIKE '%kant%'` kullandığı
   görüldü. Büyük/küçük harf katlamasından sonra rastgele ID içindeki `KAnT`
   dizisi sorguyla eşleşiyordu.

## Kök Neden

Genel varlık araması yalnızca kullanıcı metadata’sını değil, `dc_metadata`
içindeki aşağıdaki teknik alanları da düz metin olarak tarıyordu:

- altyazı item/track ID’leri,
- altyazı ve OCR URL’leri,
- OCR item ID’leri,
- çalışma zamanı sayaçları ve motor bilgileri,
- depolama yolu içindeki rastgele kimlikler.

Bu nedenle rastgele teknik bir kimliğin kullanıcı sorgusunu içermesi yanlış
pozitif sonuç oluşturabiliyordu.

## Uygulanan Kod Düzeltmesi

Genel aramanın DC kapsamı açık bir izin listesine indirildi:

- `title`
- `creator`
- `subject`
- `description`
- `publisher`
- `contributor`
- `date`
- `type`
- `format`
- `identifier`
- `language`
- `relation`
- `coverage`
- `rights`

Teknik `source`, `subtitleItems`, `videoOcrItems`, URL ve ID alanları genel
aramaya artık katılmaz. Aynı izin listesi PostgreSQL araması, fuzzy fallback ve
Elasticsearch belge üretiminde kullanılır.

## Yeniden İndeksleme

Bu teşhis sırasında yeniden indeksleme **yapılmadı**. Kullanıcı talebiyle kod
düzeltmesi doğrulandıktan sonraya ertelendi.

Kod dağıtıldıktan sonra yetkili uygulama oturumu üzerinden:

```http
POST /api/admin/search/reindex
```

çağrılır. Başarılı yanıt biçimi:

```json
{"indexed": 288}
```

Sunucuda, geçerli yönetici oturum çerezi bulunan bir istekle örnek:

```bash
curl -sS -X POST \
  -H 'Cookie: <yetkili-oturum-cookie>' \
  https://belgelik.trt.net.tr/api/admin/search/reindex
```

Alternatif olarak yönetim arayüzüne aynı endpoint’i çağıran kontrollü bir buton
eklenebilir. Kimlik doğrulamayı atlamak için sahte proxy başlıkları kullanılmaz.

Yeniden indeksleme sonrasında kontroller:

```bash
curl -sS -X POST 'http://10.0.6.200:9200/mam_assets/_search?pretty' \
  -H 'Content-Type: application/json' \
  -d '{"query":{"multi_match":{"query":"kant","fields":["title","description","owner","tags","dc","clips","type","status"]}}}'
```

Arayüzde ayrıca `kant`, gerçek bir başlık/konu terimi ve bir özgün dosya adıyla
arama yapılarak hem yanlış pozitiflerin kaybolduğu hem gerçek eşleşmelerin
korunduğu doğrulanır.
