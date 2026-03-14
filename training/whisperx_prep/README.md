# WhisperX / Whisper Fine-Tune Hazırlık (Türkçe)

Bu klasör, Türkçe ASR altyazı kalitesini artırmak için eğitim öncesi hazırlık adımlarını içerir.

## 1) Hedef

- Uzun ve dağınık konuşma bloklarını daha doğru yazım + daha iyi zamanlama ile üretmek
- Özellikle Türkçe özel isimler ve bağlaç yazımı (`de/da`, `ki`, özel karakterler) doğruluğunu artırmak

## 2) Veri Formatı

Eğitim için temel satır formatı (JSONL):

```json
{"audio_filepath": "/abs/path/audio_001.wav", "text": "Merhaba, nasılsın?", "language": "tr"}
```

Notlar:
- `audio_filepath`: mümkünse mono 16kHz WAV
- `text`: normalize edilmiş, doğru noktalama ve Türkçe karakterlerle
- `language`: `tr`

## 3) Minimum Veri Önerisi

- Başlangıç PoC: 20-50 saat temiz transkript
- Orta kalite: 100+ saat
- Kurumsal seviye: 300+ saat (farklı konuşmacı, aksan, ortam)

## 4) Split

- Train: %90
- Validation: %10
- Test setini eğitim dışında ayrı tut

## 5) Kalite Kuralları

- Metinlerde tüm Türkçe karakterler doğru olmalı (`ı, İ, ş, ğ, ö, ü, ç`)
- Çok uzun cümleleri doğal noktalama ile böl
- Zamanlama hatalı satırları çıkart
- Müzik/gürültü-only parçaları etiketle veya ayır

## 6) Eğitim Sonrası Değerlendirme

- WER/CER ölç
- Domain terim listesi (özel isim, kurum, şehir vb.) için özel doğruluk raporu çıkar
- Önceki model ile A/B karşılaştırması yap

## 7) MAM Entegrasyonu

- Eğitimli model dosyasını ayrı model dizininde tut
- `subtitle model` alanından seçilebilir hale getir
- Üretimden sonra `learned corrections` katmanı yine açık kalsın

