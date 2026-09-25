# Incident Report: MP4 Proxy Sesinin Safari ve iOS Tarafinda Duyulmamasi

Tarih: 2026-07-03
Branch: `takmasakal/kaisha`
Durum: Kod duzeltildi; mevcut bozuk proxy dosyalari yeniden uretilmeli
Commit: `92a941a Use AAC stereo audio for video proxies`

## Ozet

Belgelik web uzerinden uretilen bazi video proxy dosyalarinda ses Chrome web, Android Belgelik app ve `ffplay` ile duyulurken Safari web, iPhone Belgelik app, QuickTime Player ve VLC tarafinda duyulmuyordu.

Sorun proxy MP4 dosyasinin ses track'inin `Opus` codec ile yazilmasindan kaynaklandi. FFmpeg tabanli oynaticilar bu sesi decode edebiliyor, ancak Safari/iOS/QuickTime ekosistemi MP4 container icinde Opus ses track'ini guvenilir sekilde desteklemiyor.

## Etki

- Safari web'de proxy video oynuyor ancak ses duyulmuyor.
- iPhone Belgelik app tarafinda ayni proxy videoda ses duyulmuyor.
- Chrome web ve Android app tarafinda ses duyuldugu icin sorun ilk bakista dosya bozuklugu gibi gorunmuyor.
- Proxy dosyasi indirildiginde QuickTime Player ve VLC tarafinda ses yok, `ffplay` tarafinda ses var.
- Bu durum ozellikle cok kanalli kaynak seslerden uretilen proxy dosyalarinda ortaya cikiyor.

## Kullanici Tarafindan Gozlenen Bulgular

### ffprobe

Indirilen proxy dosyasi icin `ffprobe` ciktisinda ses track'i soyle goruldu:

```text
Stream #0:1[0x2](und): Audio: opus (Opus / 0x7375704F), 48000 Hz, 7.1, fltp, 197 kb/s (default)
```

Bu ciktinin anlami:

- Dosya MP4 container.
- Video track H.264 ve uyumlu.
- Ses track `Opus`.
- Ses 7.1 kanal.
- FFmpeg bu track'i okuyabiliyor.

### avmediainfo

Apple tarafindaki medya analizinde ses track'i parse edilemedi:

```text
Movie analyzed with 2 errors.
Error in Track ID 2 'soun' Error when generating format descriptions.
Error in Track ID 2 'soun' Omitting a track that encountered an error during atom parsing.
```

Bu ciktinin anlami:

- Apple medya yiginina gore video track okunabiliyor.
- Ses track'i format description uretme asamasinda eleniyor.
- Safari/iOS/QuickTime tarafinda sesin duyulmamasi codec/container uyumsuzluguyla uyumlu.

## Kok Neden

Proxy uretim kodunda cok kanalli sesler icin `libopus` seciliyordu:

```js
if (channels > 2) {
  args.push(
    '-map',
    '0:a:0',
    '-c:a',
    'libopus',
    '-ac',
    String(channels),
    '-b:a',
    channels >= 8 ? '512k' : '320k'
  );
}
```

Bu karar daha once cok kanalli sesin kanal sadakatini korumak icin alinmisti. Ancak Belgelik proxy dosyasinin asil amaci tarayici ve mobil uygulama tarafinda guvenilir onizleme oldugu icin, MP4 icinde Opus kullanmak yanlis onceliklendirme oldu.

Uyumluluk acisindan MP4 proxy icin en guvenli ses profili:

- `AAC-LC`
- `stereo`
- `48 kHz`
- makul bitrate

## Kod Duzeltmesi

Duzeltme dosyasi:

- `src/server.js`

Ilgili fonksiyon:

- `generateVideoProxy(inputPath, outputPath, options = {})`

Yeni davranis:

- Tek ses stream'i varsa: `0:a:0` AAC stereo olarak yazilir.
- Birden fazla ses stream'i varsa: stream'ler merge edilir, sonra AAC stereo olarak downmix edilir.
- Artik proxy MP4 icinde `libopus` kullanilmaz.

Yeni ffmpeg argumanlari:

```js
'-c:a',
'aac',
'-ac',
'2',
'-ar',
'48000',
'-b:a',
'160k'
```

Commit sonrasi Kaisha kodunda ilgili satirlar:

- `src/server.js:4759-4770`
- `src/server.js:4773-4786`

## Beklenen Yeni Proxy Ozellikleri

Yeni uretilen proxy dosyasinda `ffprobe` ciktisinda ses track'i su sekilde gorunmeli:

```text
Audio: aac (LC), 48000 Hz, stereo
```

Gorulmemesi gereken eski durum:

```text
Audio: opus (Opus ...), 48000 Hz, 7.1
```

## DOGRULAMA

### 1. Kod syntax kontrolu

Lokal Kaisha repo icinde:

```bash
cd /Users/erinc/OyunAlanım/mam_deneme_kaisha
node --check src/server.js
```

Sonuc:

- Syntax hatasi yok.

### 2. Kodda `libopus` kalmadigini kontrol etme

```bash
cd /Users/erinc/OyunAlanım/mam_deneme_kaisha
rg -n "libopus|Use Opus|Multichannel in AAC" src/server.js
```

Beklenen:

- Cikti olmamali.

### 3. Sunucuda yeni surumu alma

```bash
cd ~/mam_deneme
git pull --ff-only origin takmasakal/kaisha
./deploy/mam-kaisha.sh up
```

### 4. Mevcut bozuk proxy'yi yeniden uretme

Bu kod degisikligi mevcut proxy dosyalarini otomatik donusturmez.

Yapilacak islem:

1. Belgelik web yonetim sayfasina gir.
2. Sorunlu video asset'ini bul.
3. Proxy'yi yeniden uret.
4. Yeni proxy dosyasini `ffprobe` ile kontrol et.

Sunucu uzerinden ornek kontrol:

```bash
docker exec -it kaisha-app ffprobe -hide_banner -i "/app/uploads/proxies/YYYY/M/D/PROXY_DOSYA.mp4"
```

Beklenen audio satiri:

```text
Audio: aac (LC), 48000 Hz, stereo
```

### 5. Uygulama testi

Yeni proxy uretildikten sonra asagidaki istemcilerde ses kontrol edilmeli:

- Safari web
- iPhone Belgelik app
- Chrome web
- Android Belgelik app
- QuickTime Player ile indirilen proxy
- VLC ile indirilen proxy

Beklenen:

- Hepsinde ses duyulmali.

## Neden ffplay Calarken Safari Calismadi?

`ffplay`, FFmpeg decoder'larini kullanir ve MP4 icindeki Opus track'i okuyabilir. Bu nedenle `ffplay` ile ses gelmesi dosyanin Safari/iOS uyumlu oldugu anlamina gelmez.

Safari/iOS/QuickTime tarafinda destek, codec kadar container icindeki codec kombinasyonuna da baglidir. MP4 icinde H.264 video + AAC ses guvenli kombinasyondur. MP4 icinde Opus ses ise Apple tarafinda guvenilir bir proxy formati degildir.

## Kalan Riskler

- Cok kanalli kaynak sesler proxy'de stereo'ya indirgenecek. Bu, proxy onizleme icin kabul edilebilir bir tradeoff'tur.
- Orijinal master dosya degismez; sadece proxy dosyasi stereo AAC olur.
- Daha once uretilmis Opus sesli proxy'ler yeniden uretilene kadar sorunlu kalir.

## Gelecekte Dikkat Edilecekler

- Proxy dosyalari tarayici ve mobil uygulama uyumlulugu icin uretilir; arsiv/master kalite hedefi tasimaz.
- MP4 proxy icin varsayilan ses codec'i `aac` disina cikarilmamali.
- Cok kanalli ses korunmak istenirse bu ayrica "master/original playback" veya farkli bir teslim formati olarak ele alinmali; web/mobile proxy icin kullanilmamali.
- Yeni bir proxy codec degisikliginde mutlaka Safari/iOS ve QuickTime ile test yapilmali.

