# Incident: Seçili Grup/Kullanıcı Görünürlüğünde Sahip Grupların Varlığı Görmeye Devam Etmesi

Tarih: 2026-08-17  
Etkilenen uygulamalar: MetMAM web, Belgelik/Kaisha web  
Durum: Düzeltildi ve push edildi

## Özet

Yönetim > Varlık yetkileri ekranında bir varlığın görünürlüğü `Seçili grup/kullanıcı` olarak ayarlanıp `Görebilen kullanıcılar` alanına tek bir kullanıcı yazıldığında, beklenen davranış varlığı yalnızca bu kullanıcının görebilmesiydi.

Gerçek davranışta ise varlığın daha önce `Sahip gruplar` alanında bulunan grupları da varlığı görmeye devam edebiliyordu. Bu nedenle `Seçili grup/kullanıcı` görünürlüğü tam kısıtlama sağlamıyordu.

## Beklenen Davranış

Görünürlük modu `Seçili grup/kullanıcı` olduğunda:

- `Görebilen kullanıcılar` alanındaki kullanıcılar görebilmeli.
- `Görebilen gruplar` alanındaki gruplar görebilmeli.
- `Sahip kullanıcı` ve `Sahip gruplar` artık otomatik görüntüleme izni vermemeli.
- Superadmin ve sistem bypass yetkileri korunmalı.

Görünürlük modu `Sahip gruplar` olduğunda:

- `Sahip gruplar` varlığı görmeye devam etmeli.

## Kök Neden

Yetki çekirdeğinde `owner_user` ve `owner_groups`, tüm görünürlük modlarında açık görüntüleme izni gibi değerlendiriliyordu.

İlgili dosya:

```text
src/services/assetAccessService.js
```

Sorunlu mantık iki yerde etkiliydi:

1. JavaScript karar fonksiyonu:

```js
hasExplicitAssetViewGrant(asset, identity)
```

Bu fonksiyon `asset.ownerUser` ve `asset.ownerGroups` değerlerini görünürlük `groups` olsa bile view grant sayıyordu.

2. SQL listeleme filtresi:

```js
appendExplicitAssetViewConditions(...)
```

Bu fonksiyon asset listesi oluşturulurken `owner_user` ve `owner_groups` eşleşmelerini görünürlük moduna bakmadan listeleme koşuluna ekliyordu.

Bu yüzden sadece `canViewAsset()` düzelse bile liste tarafı yanlış kalabilirdi. Bu nedenle hem karar fonksiyonu hem SQL WHERE üretimi birlikte düzeltildi.

## Yapılan Düzeltme

`visibility = 'groups'` yani `Seçili grup/kullanıcı` modunda owner scope devre dışı bırakıldı.

Yeni mantık:

```js
const canUseOwnerScope = asset.visibility !== 'groups';
```

Bu değer `false` olduğunda:

- `ownerUser` view grant sayılmaz.
- `ownerGroups` view grant sayılmaz.
- Sadece `allowedUsers` ve `allowedGroups` görünürlük verir.

SQL tarafında da owner koşulları şu kısıtla sarıldı:

```sql
COALESCE(assets.visibility, 'public') <> 'groups'
```

Böylece listeleme ve detay erişimi aynı davranışı gösterir.

## Doğrulama

Her iki repoda da aynı davranış testi çalıştırıldı.

Test senaryosu:

- Asset görünürlüğü: `groups`
- Asset sahibi grup: `standart yönetici`
- Görebilen kullanıcı: `target1`

Beklenen:

- `standart yönetici` grubu görememeli.
- `target1` görebilmeli.
- Görünürlük `group` olduğunda `standart yönetici` grubu hâlâ görebilmeli.

Çıktı:

```text
ok groups visibility blocks owner group
ok groups visibility allows allowed user
ok group visibility still allows owner group
```

## Commitler

MetMAM:

```text
590ef36 Restrict selected asset visibility to allowed principals
```

Belgelik/Kaisha:

```text
3d162e5 Restrict selected asset visibility to allowed principals
```

## Operasyonel Not

Canlı Belgelik tarafında güncelleme sonrası test için:

1. Superadmin ile Yönetim > Varlık yetkileri ekranına gir.
2. Test varlığını seç.
3. Görünürlük değerini `Seçili grup/kullanıcı` yap.
4. `Görebilen kullanıcılar` alanına tek bir kullanıcı yaz.
5. `Sahip gruplar` alanında önceki sahip grup kalsa bile, o gruptaki başka kullanıcıyla varlığın görünmediğini doğrula.
6. `Görebilen kullanıcılar` alanındaki kullanıcıyla varlığın göründüğünü doğrula.

## Risk ve Yan Etki

Bu değişiklik owner/sahip grup davranışını yalnızca `Seçili grup/kullanıcı` görünürlük modunda değiştirir.

`Sahip gruplar`, `Herkese açık` ve superadmin bypass davranışları korunmuştur.

