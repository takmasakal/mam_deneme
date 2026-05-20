# Company TLS certificates

Place company-issued certificates here before starting the HTTPS reverse proxy profile.

Required filenames:

- `mam.fullchain.pem`
- `mam.privkey.pem`
- `auth.fullchain.pem`
- `auth.privkey.pem`
- `office.fullchain.pem`
- `office.privkey.pem`

If the company CA gives one wildcard certificate, copy the same pair to all three names.
Do not commit private keys.
