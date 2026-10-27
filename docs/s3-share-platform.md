# Geçici S3 paylaşımı

## Bu sürümdeki kapsam

MetMAM ve Belgelik'te paylaşım, varlığın aktif/varsayılan sürümünün bir kopyasını özel bir S3 uyumlu bucket'a aktarır. Ana dosya mevcut uploads/NetApp alanında kalır. Kopya, paylaşım iptal edildiğinde veya bitiş zamanı geldiğinde silinmek üzere kuyruğa alınır. Varlık çöpe taşınır ya da kalıcı silinirse o varlığın paylaşımları da iptal edilerek temizleme kuyruğuna alınır. S3 bucket'ı public yapılmaz.

Üçüncü kolondaki paylaş düğmesi 1–7 günlük süre sorar. Worker dosyayı kopyalayıp paylaşımı `active` yaptığında API, en fazla paylaşımın kalan süresi kadar geçerli S3 imzalı indirme URL'si üretir. Bu URL taşıyana erişim verir; kullanıcı bu bağlantıyı yalnız alıcıyla paylaşmalıdır. Uygulama kullanıcı oturumu/VPN'i gerekmez. Bu ilk sürüm parola, indirme sayacı, web içi kalıcı token sayfası veya önizleme modu sağlamaz.

S3 sağlayıcı ayarları Yönetim > S3 Paylaşımı içindedir. Tam yönetici (superadmin veya standart admin) ayarları görür ve değiştirir. S3 paylaşım yetkisi olan grup yöneticisi paylaşım listesini görür; yalnız erişebildiği varlıkları paylaşabilir ve kendi erişim alanındaki paylaşımları iptal edebilir.

## Yetki modeli ve OCR/Altyazı ile ilişki

- Grup yöneticisi kapsamları `asset-rights`, `document-rights`, `text-admin` ve `s3-share` olarak aynı çoklu seçim alanında saklanır. Bir kapsamı seçmek diğerlerini kaldırmaz.
- `text-admin` grup kapsamı ve superadmin'in kullanıcı/grup için verdiği `text.admin` izni mevcut `canAccessTextAdmin` hesabına birleşir. Bu değişiklik OCR/Altyazı yönetim erişimini değiştirmez.
- `s3-share` grup kapsamı ve superadmin'in verdiği `s3.share` izni aynı şekilde `canAccessS3Sharing` sonucuna birleşir. `s3.share` eklenmesi eski tam yetkili admin kayıtlarını superadmin olmaktan çıkarmaz.
- Hem UI hem API izin kontrolü yapar. Paylaşım API'si varlığın `canViewAsset` ve `canDownloadAsset` kontrolünden geçmesini ister; böylece paylaşım bağlantısı mevcut indirme kısıtını aşamaz. Arayüzdeki düğme tek başına yetki sayılmaz.
- S3 sağlayıcı ayar API'si yalnız `canAccessAdmin`/superadmin'e açıktır. Bir `s3-share` kapsam yöneticisi ayarları okuyamaz.

## Bileşenler

- `src/services/s3ShareSettingsService.js`: sağlayıcı profillerini ve TTL ayarlarını saklar. Her sağlayıcı değişikliğinde yeni profil açılır; mevcut paylaşım eski provider ID'sini korur.
- `src/services/s3CompatibleObjectStorage.js`: AWS S3 SDK üzerinden S3 uyumlu `HeadBucket`, yükleme, imzalı indirme ve silme işlemleri.
- `src/services/assetShareService.js`: paylaşım durumları, kaynak storage referansı, imzalı URL, iptal, expiry ve worker job kuyruğu.
- `src/routes/s3Shares.js`: yönetim ayarları/listesi ve varlık paylaşım API'leri; erişim doğrulaması her istekte sunucuda yapılır.
- `src/workers/s3ShareWorker.js`: kaynak dosyayı primary storage'dan S3'e kopyalar, süresi dolmuş/iptal edilmiş nesneleri siler ve geçici hataları yeniden dener.
- `docker-compose.s3-sharing.yml`: ayrı, isteğe bağlı worker container tanımı. Uygulama API'si ve worker aynı Docker secret'ını (`s3_share_credentials_key`) kullanmalıdır.

Veritabanında `s3_share_provider_profiles`, `s3_share_settings`, `asset_shares` ve `asset_share_jobs` tabloları kullanılır. Credential değerleri AES-256-GCM ile şifrelenir; anahtar Docker secret dosyasından okunur. Anahtar kaybolursa eski profillerdeki erişim bilgileri çözülemez ve onların S3 nesneleri temizlenemeyebilir. `deploy/init.sh` ve `deploy/mam.sh up` anahtarı ilk çalıştırmada üretip `deploy/secrets/s3_share_credentials_key` altında korur. Dosyayı yedekleyin, repoya eklemeyin ve yenisini üretmeyin.

## Kurulum / çalıştırma

1. `./deploy/mam.sh up` anahtarı ilk çalıştırmada üretir. Başka bir deployment yöntemi kullanıyorsanız 32-byte anahtarı `openssl rand -base64 32` ile üretip `deploy/secrets/s3_share_credentials_key` dosyasına güvenli izinlerle yerleştirin.
2. Admin ekranından endpoint, region, bucket, erişim anahtarı ve secret girin; önce kaydedip sonra bağlantı testini çalıştırın. Provider değiştirilirken eski provider profilini silmeyin.
3. Worker'ı uygulamanın ana Compose dosyası ve `docker-compose.s3-sharing.yml` ile başlatın (Belgelik kurulumunda `--env-file deploy/.env.kaisha -f docker-compose.yml -f docker-compose.kaisha.yml` seçeneklerini de kullanın): `docker compose -f docker-compose.yml -f docker-compose.s3-sharing.yml --profile s3-sharing up -d --build s3-share-worker`.
4. Test varlığı paylaşın; S3'te nesnenin private kaldığını, URL ile indirilebildiğini, iptalden sonra silindiğini ve expiry cleanup'ın çalıştığını doğrulayın.

Belgelik worker Compose tanımı `MAM_DB_*` değişkenlerini, `mam_postgres_password` secret'ını ve `/app/uploads` primary storage mount'ını kullanır. Dağıtım sunucusunda anahtar env/secret değerinin app ve worker'da aynı olduğunu doğrulayın.

## Sağlayıcı değişimi ve sonraki işler

Sağlayıcı ayarlarının güncellenmesi yeni paylaşım profilini etkinleştirir. Aktif eski paylaşımlar eski profil ve bucket üzerinden imzalanmaya/silinmeye devam eder; var olan nesneler otomatik olarak yeni sağlayıcıya taşınmaz. Tüm eski paylaşımlar bittikten ve cleanup tamamlandıktan sonra eski profil kaldırılabilir.

Bu MVP'de sonraya bırakılanlar: işlem/erişim audit detayları, indirme sayacı ve link rate-limit'i, isteğe bağlı parola, admin ekranından başarısız silme işini yeniden deneme, paylaşım yetkisi geri alındığında otomatik iptal, public token landing sayfası, ayrı indirme/önizleme seçimi. Ücretsiz bulut kotası deneme içindir; kullanım hacmi ve veri sınıflandırmasına göre sağlayıcı seçilmelidir.
