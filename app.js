'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const kv = (k, v, hi) => `<div class="kv"><span class="k">${k}</span><span class="v ${hi ? 'hi' : ''}">${v}</span></div>`;

// ── nav + filter ──
document.querySelectorAll('.navi').forEach(n => n.addEventListener('click', () => {
  document.querySelectorAll('.navi').forEach(x => x.classList.remove('on'));
  document.querySelectorAll('.panel').forEach(x => x.classList.remove('on'));
  n.classList.add('on'); $(n.dataset.p).classList.add('on');
}));
$('filter').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('.navi').forEach(n => n.classList.toggle('hide', !n.textContent.toLowerCase().includes(q)));
});

// ── copy + toast ──
document.addEventListener('click', e => {
  const b = e.target.closest('[data-copy]'); if (!b) return;
  const el = $(b.dataset.copy); const val = el.value !== undefined ? el.value : el.textContent;
  if (val) navigator.clipboard.writeText(val).then(toast);
});
function toast() { const t = $('toast'); t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 1100); }

// ── Subnet / CIDR ──
const ipToInt = ip => { const p = ip.split('.'); if (p.length !== 4) return null; let n = 0; for (const o of p) { const x = +o; if (!/^\d+$/.test(o) || x > 255) return null; n = n * 256 + x; } return n >>> 0; };
const intToIp = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
function ipType(ip) {
  const a = (ip >>> 24) & 255, b = (ip >>> 16) & 255;
  if (a === 10) return 'Private (10/8)'; if (a === 172 && b >= 16 && b <= 31) return 'Private (172.16/12)';
  if (a === 192 && b === 168) return 'Private (192.168/16)'; if (a === 127) return 'Loopback';
  if (a === 169 && b === 254) return 'Link-local'; if (a >= 224 && a <= 239) return 'Multicast';
  return 'Public';
}
function subnet() {
  const v = $('cidr').value.trim(); let ipStr = v, prefix = 24;
  if (v.includes('/')) { const [a, b] = v.split('/'); ipStr = a; prefix = +b; }
  const ip = ipToInt(ipStr.trim()); const out = $('subnet-out');
  if (ip === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) { out.innerHTML = '<div class="err">Enter a valid IPv4 CIDR, e.g. 10.0.0.0/24</div>'; return; }
  const mask = prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;
  const network = (ip & mask) >>> 0, broadcast = (network | (~mask >>> 0)) >>> 0;
  const total = Math.pow(2, 32 - prefix), usable = prefix >= 31 ? total : total - 2;
  const first = prefix >= 31 ? network : (network + 1) >>> 0, last = prefix >= 31 ? broadcast : (broadcast - 1) >>> 0;
  out.innerHTML = kv('Address', intToIp(ip)) + kv('Netmask', `${intToIp(mask)} /${prefix}`, true) +
    kv('Network', intToIp(network), true) + kv('Broadcast', intToIp(broadcast)) +
    kv('Host range', `${intToIp(first)} – ${intToIp(last)}`) + kv('Usable hosts', usable.toLocaleString(), true) +
    kv('Total addresses', total.toLocaleString()) + kv('Wildcard', intToIp((~mask) >>> 0)) + kv('Type', ipType(ip));
}
$('cidr').addEventListener('input', subnet); subnet();

// ── IP / ASN lookup (proxy Function) ──
async function iplookup() {
  const q = $('ipq').value.trim(); const out = $('ip-out'); out.innerHTML = kv('Looking up…', '');
  try {
    const r = await fetch(`/api/ip${q ? '?q=' + encodeURIComponent(q) : ''}`); const d = await r.json();
    if (!d.success) throw new Error(d.message || 'lookup failed');
    const c = d.connection || {};
    out.innerHTML = kv('IP', d.ip, true) + kv('Type', d.type) + kv('ASN', c.asn ? 'AS' + c.asn : '-', true) +
      kv('Org', c.org || '-') + kv('ISP', c.isp || '-') + kv('Domain', c.domain || '-') +
      kv('Location', `${d.flag?.emoji || ''} ${[d.city, d.region, d.country].filter(Boolean).join(', ')}`) +
      kv('Coords', `${d.latitude}, ${d.longitude}`) + kv('Timezone', d.timezone?.id || '-') + kv('Postal', d.postal || '-');
  } catch (e) { out.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}
$('ipgo').addEventListener('click', iplookup);
$('ipq').addEventListener('keydown', e => { if (e.key === 'Enter') iplookup(); });

// ── DNS lookup (Cloudflare DoH) ──
const DNS_TYPE = { 1: 'A', 28: 'AAAA', 5: 'CNAME', 15: 'MX', 16: 'TXT', 2: 'NS', 6: 'SOA', 257: 'CAA', 33: 'SRV', 12: 'PTR' };
async function dns() {
  const name = $('dnsq').value.trim(), type = $('dnstype').value, out = $('dns-out');
  if (!name) { out.innerHTML = ''; return; }
  out.innerHTML = kv('Resolving…', '');
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: 'application/dns-json' } });
    const d = await r.json(); const ans = d.Answer || [];
    if (!ans.length) { out.innerHTML = `<div class="err">No ${type} records found</div>`; return; }
    out.innerHTML = ans.map(a => kv(`${DNS_TYPE[a.type] || a.type} · TTL ${a.TTL}`, esc(a.data), true)).join('');
  } catch (e) { out.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}
$('dnsgo').addEventListener('click', dns);
$('dnsq').addEventListener('keydown', e => { if (e.key === 'Enter') dns(); });
$('dnstype').addEventListener('change', () => { if ($('dnsq').value.trim()) dns(); });

// ── Base converter ──
function parseBig(v, base) {
  v = v.replace(/\s/g, ''); const pfx = { 2: '0b', 8: '0o', 16: '0x', 10: '' }[base];
  if (base === 16 && !/^[0-9a-fA-F]+$/.test(v)) throw 0; if (base === 2 && !/^[01]+$/.test(v)) throw 0;
  if (base === 8 && !/^[0-7]+$/.test(v)) throw 0; if (base === 10 && !/^\d+$/.test(v)) throw 0;
  return BigInt(pfx + v);
}
const baseEls = { 10: $('b-dec'), 16: $('b-hex'), 2: $('b-bin'), 8: $('b-oct') };
function baseSync(e) {
  const el = e.target, base = +el.dataset.base, v = el.value.trim();
  for (const b in baseEls) baseEls[b].style.borderColor = '';
  if (!v) { for (const b in baseEls) if (baseEls[b] !== el) baseEls[b].value = ''; return; }
  let n; try { n = parseBig(v, base); } catch { el.style.borderColor = 'var(--red)'; return; }
  if (baseEls[10] !== el) baseEls[10].value = n.toString(10);
  if (baseEls[16] !== el) baseEls[16].value = n.toString(16);
  if (baseEls[2] !== el) baseEls[2].value = n.toString(2);
  if (baseEls[8] !== el) baseEls[8].value = n.toString(8);
}
for (const b in baseEls) baseEls[b].addEventListener('input', baseSync);

// ── Timestamp ──
function tick() { const d = new Date(); $('t-now').textContent = `${Math.floor(d / 1000)}  ·  ${d.toISOString().replace('T', ' ').slice(0, 19)}Z`; }
setInterval(tick, 1000); tick();
$('t-epoch').addEventListener('input', e => {
  const v = e.target.value.trim(); const out = $('t-from-epoch'); if (!/^\d+$/.test(v)) { out.innerHTML = ''; return; }
  const d = new Date(v.length >= 13 ? +v : +v * 1000);
  out.innerHTML = kv('Local', d.toLocaleString(), true) + kv('UTC', d.toUTCString()) + kv('ISO', d.toISOString());
});
$('t-date').addEventListener('input', e => {
  const out = $('t-from-date'); if (!e.target.value) { out.innerHTML = ''; return; }
  const d = new Date(e.target.value);
  out.innerHTML = kv('Epoch (s)', Math.floor(d / 1000), true) + kv('Epoch (ms)', +d) + kv('ISO', d.toISOString());
});

// ── Color ──
function hexToRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); if (!/^[0-9a-fA-F]{6}$/.test(h)) return null; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
function rgbToHsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h, s, l = (mx + mn) / 2; if (mx === mn) { h = s = 0; } else { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; } return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]; }
function color(hex) {
  const rgb = hexToRgb(hex); const out = $('c-out');
  if (!rgb) { out.innerHTML = '<div class="err">Enter a hex colour like #4ade80</div>'; $('c-swatch').style.background = 'transparent'; return; }
  const hx = '#' + rgb.map(x => x.toString(16).padStart(2, '0')).join(''); const hsl = rgbToHsl(...rgb);
  $('c-swatch').style.background = hx; $('c-pick').value = hx;
  out.innerHTML = kv('HEX', hx, true) + kv('RGB', `rgb(${rgb.join(', ')})`) + kv('HSL', `hsl(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%)`);
}
$('c-hex').addEventListener('input', e => color(e.target.value.trim()));
$('c-pick').addEventListener('input', e => { $('c-hex').value = e.target.value; color(e.target.value); });
color('#4ade80');

// ── Data size ──
function size() {
  const v = parseFloat($('sz-val').value); const unit = $('sz-unit').value; const out = $('sz-out');
  if (!isFinite(v)) { out.innerHTML = ''; return; }
  const mult = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, TiB: 1024 ** 4 };
  const bytes = v * mult[unit]; const f = n => n >= 0.001 ? (+n.toFixed(3)).toLocaleString() : n.toExponential(2);
  out.innerHTML = kv('Bytes', Math.round(bytes).toLocaleString(), true) +
    kv('KB / MB / GB', `${f(bytes / 1e3)} / ${f(bytes / 1e6)} / ${f(bytes / 1e9)}`) +
    kv('KiB / MiB / GiB', `${f(bytes / 1024)} / ${f(bytes / 1024 ** 2)} / ${f(bytes / 1024 ** 3)}`) +
    kv('TB / TiB', `${f(bytes / 1e12)} / ${f(bytes / 1024 ** 4)}`);
}
$('sz-val').addEventListener('input', size); $('sz-unit').addEventListener('change', size); size();

// ── Base64 / URL ──
const b64enc = s => btoa(unescape(encodeURIComponent(s)));
const b64dec = s => decodeURIComponent(escape(atob(s)));
document.querySelectorAll('[data-enc]').forEach(b => b.addEventListener('click', () => {
  const s = $('enc-in').value; let r = '';
  try { r = b.dataset.enc === 'b64' ? b64enc(s) : b.dataset.enc === 'b64d' ? b64dec(s) : b.dataset.enc === 'url' ? encodeURIComponent(s) : decodeURIComponent(s); }
  catch (e) { r = 'Error: ' + e.message; }
  $('enc-out').value = r;
}));

// ── Hash (SHA) ──
async function hashRun() {
  const s = $('hash-in').value; const out = $('hash-out'); if (!s) { out.innerHTML = ''; return; }
  const data = new TextEncoder().encode(s); let html = '';
  for (const a of ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']) {
    const h = await crypto.subtle.digest(a, data);
    html += kv(a, [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join(''));
  }
  out.innerHTML = html;
}
$('hash-in').addEventListener('input', hashRun);

// ── JWT decoder ──
const b64urlDec = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); };
function jwt() {
  const t = $('jwt-in').value.trim(); const msg = $('jwt-msg');
  $('jwt-head').textContent = ''; $('jwt-body').textContent = ''; $('jwt-claims').innerHTML = '';
  if (!t) { msg.textContent = ''; return; }
  const p = t.split('.'); if (p.length < 2) { msg.className = 'msg bad'; msg.textContent = 'Not a JWT (header.payload.signature)'; return; }
  try {
    const head = JSON.parse(b64urlDec(p[0])), body = JSON.parse(b64urlDec(p[1]));
    $('jwt-head').textContent = JSON.stringify(head, null, 2);
    $('jwt-body').textContent = JSON.stringify(body, null, 2);
    const c = [];
    if (head.alg) c.push(kv('Algorithm', head.alg, true));
    if (body.iat) c.push(kv('Issued', new Date(body.iat * 1000).toLocaleString()));
    if (body.nbf) c.push(kv('Not before', new Date(body.nbf * 1000).toLocaleString()));
    if (body.exp) { const ex = body.exp * 1000 < Date.now(); c.push(kv('Expires', new Date(body.exp * 1000).toLocaleString() + (ex ? ' — EXPIRED' : ''), !ex)); }
    $('jwt-claims').innerHTML = c.join('');
    msg.className = 'msg ok'; msg.textContent = 'decoded — signature NOT verified';
  } catch (e) { msg.className = 'msg bad'; msg.textContent = 'Could not decode: ' + e.message; }
}
$('jwt-in').addEventListener('input', jwt);

// ── JSON ──
document.querySelectorAll('[data-json]').forEach(b => b.addEventListener('click', () => {
  const msg = $('json-msg');
  try { $('json-out').value = JSON.stringify(JSON.parse($('json-in').value), null, b.dataset.json === 'pretty' ? 2 : 0); msg.className = 'msg ok'; msg.textContent = 'valid JSON'; }
  catch (e) { msg.className = 'msg bad'; msg.textContent = e.message; }
}));

// ── Regex ──
function rxRun() {
  const pat = $('rx-pat').value, flags = $('rx-flags').value, test = $('rx-test').value; const msg = $('rx-msg'), out = $('rx-out');
  if (!pat) { out.innerHTML = esc(test); msg.textContent = ''; return; }
  let re; try { re = new RegExp(pat, flags); } catch (e) { msg.className = 'msg bad'; msg.textContent = e.message; return; }
  let html = '', last = 0, count = 0;
  try {
    if (flags.includes('g')) { for (const m of test.matchAll(re)) { count++; html += esc(test.slice(last, m.index)) + '<mark>' + esc(m[0]) + '</mark>'; last = m.index + m[0].length; if (!m[0].length) last++; } }
    else { const m = re.exec(test); if (m) { count = 1; html = esc(test.slice(0, m.index)) + '<mark>' + esc(m[0]) + '</mark>'; last = m.index + m[0].length; } }
  } catch (e) { msg.className = 'msg bad'; msg.textContent = e.message; return; }
  out.innerHTML = html + esc(test.slice(last)); msg.className = 'msg ok'; msg.textContent = `${count} match${count !== 1 ? 'es' : ''}`;
}
['rx-pat', 'rx-flags', 'rx-test'].forEach(id => $(id).addEventListener('input', rxRun));

// ── URL parser ──
function urlParse() {
  const v = $('url-in').value.trim(); const out = $('url-out'); if (!v) { out.innerHTML = ''; return; }
  let u; try { u = new URL(v); } catch { out.innerHTML = '<div class="err">Invalid URL — include the scheme, e.g. https://</div>'; return; }
  let rows = kv('Protocol', u.protocol) + kv('Host', u.host, true) + kv('Hostname', u.hostname) + kv('Port', u.port || '(default)') +
    kv('Path', u.pathname || '/') + (u.hash ? kv('Hash', u.hash) : '') + (u.username ? kv('User', u.username) : '');
  const params = [...u.searchParams.entries()];
  if (params.length) rows += params.map(([k, val]) => kv('? ' + esc(k), esc(val), true)).join('');
  out.innerHTML = rows;
}
$('url-in').addEventListener('input', urlParse);

// ── Text tools ──
function txStats() { const s = $('tx-in').value; $('tx-stats').textContent = `${s.length} chars · ${(s.match(/\S+/g) || []).length} words · ${s ? s.split('\n').length : 0} lines`; }
$('tx-in').addEventListener('input', txStats); txStats();
document.querySelectorAll('[data-tx]').forEach(b => b.addEventListener('click', () => {
  const s = $('tx-in').value, lines = s.split('\n'), op = b.dataset.tx; let r = s;
  if (op === 'upper') r = s.toUpperCase();
  else if (op === 'lower') r = s.toLowerCase();
  else if (op === 'title') r = s.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
  else if (op === 'slug') r = s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  else if (op === 'sort') r = lines.slice().sort((a, c) => a.localeCompare(c)).join('\n');
  else if (op === 'dedupe') r = [...new Set(lines)].join('\n');
  else if (op === 'reverse') r = lines.slice().reverse().join('\n');
  else if (op === 'trim') r = lines.map(l => l.trim()).join('\n');
  $('tx-out').value = r;
}));

// ── Generators ──
const newUuid = () => { $('g-uuid').value = crypto.randomUUID(); };
$('g-uuid-btn').addEventListener('click', newUuid); newUuid();
const newHex = () => { $('g-hex').value = [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join(''); };
$('g-hex-btn').addEventListener('click', newHex); newHex();
$('g-pwlen').addEventListener('input', e => $('g-pwlen-l').textContent = e.target.value);
$('g-pw-btn').addEventListener('click', () => {
  const len = +$('g-pwlen').value, cs = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+';
  $('g-pw').value = [...crypto.getRandomValues(new Uint32Array(len))].map(x => cs[x % cs.length]).join('');
});

// ── QR ──
function qr() { const v = $('qr-in').value.trim(); const out = $('qr-out'); if (!v) { out.innerHTML = ''; return; } out.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=0&data=${encodeURIComponent(v)}" alt="QR code" width="240" height="240" />`; }
$('qr-go').addEventListener('click', qr);
$('qr-in').addEventListener('keydown', e => { if (e.key === 'Enter') qr(); });
qr();
