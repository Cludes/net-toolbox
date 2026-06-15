# Net Toolbox

A fast, dark, single-page toolbox for everyday network and dev work - no sign-in, no tracking,
runs entirely in the browser.

- **Subnet / CIDR** - network, broadcast, netmask, wildcard, host range, usable hosts, address type.
- **IP / ASN lookup** - any IP (or your own): ASN, org, ISP, geo, timezone (keyless [ipwho.is](https://ipwho.is)).
- **Base converter** - decimal / hex / binary / octal, synced, BigInt-safe.
- **Timestamp** - Unix epoch <-> local / UTC / ISO, live clock.
- **Base64 / URL** - encode + decode (UTF-8 safe).
- **JSON** - pretty-print, minify, validate.
- **Regex** - live tester with match highlighting.
- **Generators** - UUID v4, strong passwords, random hex (Web Crypto).

Everything is client-side except the IP lookup, which calls the keyless CORS-open ipwho.is API directly.

## Deploy
Static site -> Cloudflare Pages project `net-toolbox` via GitHub Action on push to `master`
(secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`).

Live: https://net-toolbox.pages.dev
