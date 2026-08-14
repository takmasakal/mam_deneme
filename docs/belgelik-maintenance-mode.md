# Belgelik Maintenance Mode

Bu düzenleme Belgelik web uygulaması güncellenirken kullanıcıya host Nginx üzerinden statik bakım ekranı gösterir. Bakım sayfası `kaisha-app`, `kaisha-oauth2-proxy` veya diğer uygulama container'larına bağlı değildir.

## Dosyalar

- `deploy/maintenance/maintenance.html`
- `deploy/maintenance/belgelik-maintenance.png`
- `deploy/nginx/belgelik-maintenance-server.conf`
- `deploy/nginx/belgelik-maintenance-location.conf`
- `deploy/belgelik-maintenance.sh`

## İlk Kurulum

Sunucuda repo kökünden:

```bash
./deploy/belgelik-maintenance.sh install
```

Bu komut bakım HTML/PNG dosyalarını varsayılan olarak `/var/www/belgelik-maintenance` altına, Nginx snippet dosyalarını ise `/etc/nginx/snippets` altına kopyalar.

Host Nginx Belgelik server bloğuna bir kez şu include eklenmelidir:

```nginx
server {
    server_name belgelik.trt.net.tr;

    include /etc/nginx/snippets/belgelik-maintenance-server.conf;

    location / {
        include /etc/nginx/snippets/belgelik-maintenance-location.conf;

        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Port 443;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Sonra:

```bash
sudo nginx -t
sudo nginx -s reload
```

## Bakım Modunu Açma

```bash
./deploy/mam-kaisha.sh maintenance-on
```

Bu komut `/var/www/belgelik-maintenance/MAINTENANCE_ON` dosyasını oluşturur ve Nginx'i reload eder. Belgelik kullanıcı trafiği HTTP `503 Service Unavailable` durum koduyla bakım sayfasına yönlenir.

## Bakım Modunu Kapatma

```bash
./deploy/mam-kaisha.sh maintenance-off
```

Bu komut flag dosyasını kaldırır ve Nginx'i reload eder. Normal Belgelik OAuth2/auth akışı tekrar `kaisha-oauth2-proxy` üzerinden çalışır.

## Health Check

```bash
./deploy/belgelik-maintenance.sh wait-health
```

Health check sadece container'ın `running` olmasına bakmaz. Varsayılan olarak `kaisha-app` container'ı içinde şu endpoint çağrılır:

```text
http://127.0.0.1:3000/api/health
```

Yanıt HTTP 200 ve JSON içinde `ok: true` dönmeden sağlıklı kabul edilmez.

## Bakım Moduyla Restart

Güncelleme sırasında önerilen komut:

```bash
./deploy/mam-kaisha.sh maintenance-restart
```

Akış:

1. Maintenance modu açılır.
2. `./deploy/mam-kaisha.sh restart` çalışır.
3. `kaisha-app` gerçekten sağlıklı olana kadar `/api/health` beklenir.
4. Health check geçerse maintenance modu kapatılır.
5. Restart veya health check başarısızsa maintenance modu açık bırakılır.

## Manuel Akış

```bash
./deploy/mam-kaisha.sh maintenance-on
./deploy/mam-kaisha.sh restart
./deploy/belgelik-maintenance.sh wait-health
./deploy/mam-kaisha.sh maintenance-off
```

## Notlar

- Bakım ekranı teknik detay, container adı, IP, sürüm veya stack trace göstermez.
- PNG isteği `/__belgelik-maintenance/belgelik-maintenance.png` üzerinden bakım yönlendirmesine takılmadan servis edilir.
- `maintenance.html` içinde dış Google Fonts çağrısı yoktur; kapalı kurum içi ağda dış bağımlılık oluşturmaz.
