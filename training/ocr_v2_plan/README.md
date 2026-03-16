# OCR v2 Planı (Kalite Artırma)

Bu doküman, OCR kalitesini sistematik olarak artırmak için görev listesini ve uygulanacak deneyleri içerir.

## 1) Yol Haritası (Checklist)

- [ ] Ölçüm seti oluştur (ground truth)
- [ ] Mevcut pipeline için baseline CER/WER raporu al
- [ ] Ön işleme (denoise/contrast/sharpen) varyantlarını A/B test et
- [ ] PaddleOCR profil/model karşılaştırması yap
- [ ] Türkçe düzeltme katmanını (sözlük + kural) iyileştir
- [ ] Offline dil modeli ile cümle düzeltme PoC yap
- [ ] Zaman bazlı birleştirme (start/end TC) kalitesini ölç
- [ ] En iyi kombinasyonu prod pipeline'a taşı
- [ ] Düzenli kalite raporu (haftalık CER/WER trendi) ekle

---

## 2) Ground Truth Set Nasıl Hazırlanır?

Amaç: OCR çıktısını karşılaştıracağımız doğru referans metin seti.

### 2.1 Hedef Boyut
- PoC: 500 frame
- Güvenilir karşılaştırma: 1000-2000 frame

### 2.2 Örnekleme Stratejisi
- Farklı içeriklerden dengeli seç:
  - Altyazı geçen sahneler
  - Sabit logo/watermark alanları
  - Hızlı hareketli sahneler
  - Düşük kontrast / düşük ışık
  - Türkçe karakter yoğun satırlar
- Tek bir videodan değil, çoklu assetten seç.

### 2.3 Etiket Formatı (öneri)
Her satır bir örnek:

```json
{"assetId":"...","framePath":".../f_000123.jpg","timeSec":372.52,"bbox":[x1,y1,x2,y2],"text":"İstanbul'da hayat pahalılaştı."}
```

Not:
- `bbox` yoksa tüm frame OCR referansı da tutulabilir.
- Türkçe karakterler birebir doğru girilmeli (`ı/İ/ş/ğ/ö/ü/ç`).

### 2.4 Etiketleme İş Akışı
1. Frame çıkar (mevcut OCR frame mekanizması kullanılabilir).
2. Basit bir etiketleme aracıyla (veya JSON editörü ile) doğru metni gir.
3. İkinci kişiyle spot-check yap (%10 örnek).
4. Hatalı/bozuk frame'leri "ignore" olarak işaretle.

### 2.5 Ölçüm
- CER (Character Error Rate): ana metrik
- WER (Word Error Rate): destek metrik
- Ek rapor: Türkçe karakter hata oranı (`i/ı`, `I/İ`, `s/ş` vb.)

---

## 3) Offline Dil Modeli ile Cümle Düzeltme (PoC)

Amaç: OCR sonrası metni Türkçe dil yapısına daha uygun hale getirmek.

### 3.1 Nerede Devreye Girer?
- OCR çıktı alındıktan sonra
- DB'ye yazmadan önce "post-process" adımı olarak

### 3.2 Denenecek Yaklaşım
- Girdi: OCR satırı
- Çıktı: Düzeltilmiş satır
- Kural: Anlamı bozmayacak şekilde yazım/noktalama düzelt

Örnek:
- `tarafindan` -> `tarafından`
- `izmin ne senin` -> `ismin ne senin`
- Bağlaç/ek ayrımı: `de/da`, `ki`

### 3.3 Offline Model Seçenekleri
- Küçük Türkçe seq2seq/grammar düzeltme modeli (lokal inference)
- Alternatif: kural + sözlük hibrit (model yoksa daha stabil)

### 3.4 Değerlendirme
- Önce/sonra CER karşılaştır
- Türkçe karakter doğruluğu karşılaştır
- Aşırı düzeltme (yanlış düzeltme) oranını ölç

---

## 4) Uygulama Planı (MAM/OCR Test Lab)

### Faz 1: Ölçüm ve Veri
- Ground truth dosya yapısı oluştur (`training/ocr_v2_plan/ground_truth/`)
- Baseline rapor scripti ekle (CER/WER)

### Faz 2: Post-Process v2
- Kural/sözlük düzeltme iyileştirmesi
- Learned corrections + Türkçe normalize katmanını güçlendir

### Faz 3: Offline LM PoC
- Opsiyonel checkbox ile aç/kapa (OCR Test Lab)
- Çıktıya `raw_text` ve `corrected_text` birlikte yaz

### Faz 4: Prod Entegrasyon
- En iyi konfigürasyonu MAM pipeline'a taşı
- Admin'de kalite metriklerini görünür yap

---

## 5) Başlangıç İçin Pratik Hedef (Öneri)

İlk sprint:
1. 500 frame ground truth oluştur
2. Baseline CER/WER raporla
3. Türkçe düzeltme katmanını iyileştir
4. Offline LM PoC ile % iyileşmeyi ölç

