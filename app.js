'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const kv = (k, v, hi) => `<div class="kv"><span class="k">${k}</span><span class="v ${hi ? 'hi' : ''}">${v}</span></div>`;

// ── nav + filter ──
function activate(pid) {
  document.querySelectorAll('.panel').forEach(x => x.classList.toggle('on', x.id === pid));
  const home = pid === 'p-home';
  $('back').classList.toggle('hidden', home);
  $('filter').classList.toggle('hidden', !home);
  window.scrollTo(0, 0);
}
document.addEventListener('click', e => { const c = e.target.closest('[data-go]'); if (c) activate(c.dataset.go); });
$('brand').addEventListener('click', () => activate('p-home'));
$('back').addEventListener('click', () => activate('p-home'));
$('filter').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('.card').forEach(c => c.classList.toggle('hide', !c.textContent.toLowerCase().includes(q)));
  document.querySelectorAll('.group').forEach(g => g.classList.toggle('hide', ![...g.querySelectorAll('.card')].some(c => !c.classList.contains('hide'))));
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
    if (body.exp) { const ex = body.exp * 1000 < Date.now(); c.push(kv('Expires', new Date(body.exp * 1000).toLocaleString() + (ex ? ' - EXPIRED' : ''), !ex)); }
    $('jwt-claims').innerHTML = c.join('');
    msg.className = 'msg ok'; msg.textContent = 'decoded - signature NOT verified';
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
  let u; try { u = new URL(v); } catch { out.innerHTML = '<div class="err">Invalid URL - include the scheme, e.g. https://</div>'; return; }
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

// ── IPv6 expand / compress ──
function ipv6Parse(str) {
  let s = str.trim().split('%')[0];
  if (!s) return null;
  if (s.indexOf('::') !== s.lastIndexOf('::')) return null;
  let head, tail;
  if (s.includes('::')) { const [h, t] = s.split('::'); head = h ? h.split(':') : []; tail = t ? t.split(':') : []; }
  else { head = s.split(':'); tail = []; }
  const fill = 8 - head.length - tail.length;
  if (!s.includes('::')) { if (head.length !== 8) return null; }
  else if (fill < 1) return null;
  const groups = [...head, ...Array(Math.max(0, fill)).fill('0'), ...tail];
  if (groups.length !== 8) return null;
  for (const g of groups) if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
  return groups.map(g => parseInt(g, 16));
}
function ipv6Compress(nums) {
  let best = { s: -1, l: 0 }, cur = { s: -1, l: 0 };
  for (let i = 0; i < 8; i++) {
    if (nums[i] === 0) { if (cur.s < 0) cur = { s: i, l: 1 }; else cur.l++; if (cur.l > best.l) best = { s: cur.s, l: cur.l }; }
    else cur = { s: -1, l: 0 };
  }
  const p = nums.map(n => n.toString(16));
  if (best.l > 1) return (p.slice(0, best.s).join(':')) + '::' + (p.slice(best.s + best.l).join(':'));
  return p.join(':');
}
function ipv6() {
  const out = $('ipv6-out'); const nums = ipv6Parse($('ipv6-in').value);
  if (!nums) { out.innerHTML = '<div class="err">Enter a valid IPv6 address, e.g. 2001:db8::1</div>'; return; }
  out.innerHTML = kv('Expanded', nums.map(n => n.toString(16).padStart(4, '0')).join(':'), true) +
    kv('Compressed', ipv6Compress(nums), true) +
    kv('Groups', nums.map(n => n.toString(16)).join(' : '));
}
$('ipv6-in').addEventListener('input', ipv6); ipv6();

// ── Cron explainer ──
const CRON_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CRON_MON = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function cronField(expr, lo, hi) {
  const set = new Set();
  for (const part of expr.split(',')) {
    let m;
    if (part === '*') { for (let i = lo; i <= hi; i++) set.add(i); }
    else if ((m = part.match(/^\*\/(\d+)$/))) { const st = +m[1]; if (st < 1) throw 0; for (let i = lo; i <= hi; i += st) set.add(i); }
    else if ((m = part.match(/^(\d+)-(\d+)(?:\/(\d+))?$/))) { const a = +m[1], b = +m[2], st = m[3] ? +m[3] : 1; if (a < lo || b > hi || a > b || st < 1) throw 0; for (let i = a; i <= b; i += st) set.add(i); }
    else if ((m = part.match(/^(\d+)$/))) { const v = +m[1]; if (v < lo || v > hi) throw 0; set.add(v); }
    else throw 0;
  }
  return set;
}
function cron() {
  const out = $('cron-out'); const raw = $('cron-in').value.trim();
  if (!raw) { out.innerHTML = ''; return; }
  const f = raw.split(/\s+/);
  if (f.length !== 5) { out.innerHTML = '<div class="err">Enter 5 fields: minute hour day-of-month month day-of-week</div>'; return; }
  let min, hr, dom, mon, dow;
  try {
    min = cronField(f[0], 0, 59); hr = cronField(f[1], 0, 23); dom = cronField(f[2], 1, 31);
    mon = cronField(f[3], 1, 12); dow = cronField(f[4].replace(/\b7\b/g, '0'), 0, 6);
  } catch { out.innerHTML = '<div class="err">Could not parse - check the field values and ranges</div>'; return; }
  const fmt = (set, size, names) => set.size === size ? 'every' : [...set].sort((a, b) => a - b).map(v => names ? names[v] : v).join(', ');
  const domStar = f[2] === '*', dowStar = f[4] === '*';
  const runs = []; const d = new Date(); d.setSeconds(0, 0); d.setMinutes(d.getMinutes() + 1);
  for (let i = 0; i < 550000 && runs.length < 5; i++) {
    const dayOk = (domStar || dowStar) ? (dom.has(d.getDate()) && dow.has(d.getDay())) : (dom.has(d.getDate()) || dow.has(d.getDay()));
    if (min.has(d.getMinutes()) && hr.has(d.getHours()) && mon.has(d.getMonth() + 1) && dayOk) runs.push(new Date(d));
    d.setMinutes(d.getMinutes() + 1);
  }
  let html = kv('Minute', fmt(min, 60), true) + kv('Hour', fmt(hr, 24), true) +
    kv('Day of month', fmt(dom, 31)) + kv('Month', fmt(mon, 12, CRON_MON)) + kv('Day of week', fmt(dow, 7, CRON_DOW));
  html += runs.length ? runs.map((r, i) => kv(i === 0 ? 'Next run' : 'then', r.toLocaleString(), i === 0)).join('') : kv('Next runs', 'none within ~1 year');
  out.innerHTML = html;
}
let cronT; $('cron-in').addEventListener('input', () => { clearTimeout(cronT); cronT = setTimeout(cron, 200); }); cron();

// ── HMAC ──
async function hmac() {
  const out = $('hmac-out'); const key = $('hmac-key').value, msg = $('hmac-in').value, alg = $('hmac-alg').value;
  if (!key || !msg) { out.innerHTML = ''; return; }
  try {
    const enc = new TextEncoder();
    const ck = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: alg }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', ck, enc.encode(msg));
    out.innerHTML = kv('HMAC ' + alg, [...new Uint8Array(sig)].map(x => x.toString(16).padStart(2, '0')).join(''), true);
  } catch (e) { out.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}
['hmac-key', 'hmac-in'].forEach(id => $(id).addEventListener('input', hmac));
$('hmac-alg').addEventListener('change', hmac);

// ── Hex / text ──
function hexConv(op) {
  const s = $('hex-in').value; let r = '';
  try {
    if (op === 'tohex') r = [...new TextEncoder().encode(s)].map(x => x.toString(16).padStart(2, '0')).join(' ');
    else if (op === 'totext') {
      const hx = s.replace(/[^0-9a-fA-F]/g, ''); if (hx.length % 2) throw new Error('Odd number of hex digits');
      r = new TextDecoder().decode(new Uint8Array((hx.match(/../g) || []).map(h => parseInt(h, 16))));
    } else {
      const bytes = [...new TextEncoder().encode(s)]; const lines = [];
      for (let i = 0; i < bytes.length; i += 16) {
        const ch = bytes.slice(i, i + 16);
        const hp = ch.map(x => x.toString(16).padStart(2, '0')).join(' ').padEnd(47, ' ');
        const as = ch.map(x => x >= 32 && x < 127 ? String.fromCharCode(x) : '.').join('');
        lines.push(i.toString(16).padStart(8, '0') + '  ' + hp + '  ' + as);
      }
      r = lines.join('\n');
    }
  } catch (e) { r = 'Error: ' + e.message; }
  $('hex-out').value = r;
}
document.querySelectorAll('[data-hex]').forEach(b => b.addEventListener('click', () => hexConv(b.dataset.hex)));

// ── HTML entities ──
function htmlEnc(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
    .replace(/[ -￿]/g, c => '&#' + c.charCodeAt(0) + ';');
}
function htmlDec(s) { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; }
document.querySelectorAll('[data-html]').forEach(b => b.addEventListener('click', () => {
  $('html-out').value = b.dataset.html === 'enc' ? htmlEnc($('html-in').value) : htmlDec($('html-in').value);
}));

// ── CSV / JSON ──
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
function csvToJson(text) {
  const rows = parseCSV(text.trim()); if (!rows.length) return '[]';
  const h = rows[0];
  return JSON.stringify(rows.slice(1).map(r => { const o = {}; h.forEach((k, i) => o[k] = r[i] ?? ''); return o; }), null, 2);
}
function jsonToCsv(text) {
  const data = JSON.parse(text); if (!Array.isArray(data)) throw new Error('JSON must be an array of objects');
  const headers = [...new Set(data.flatMap(o => Object.keys(o)))];
  const cell = v => { v = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return [headers.map(cell).join(','), ...data.map(o => headers.map(h => cell(o[h])).join(','))].join('\n');
}
document.querySelectorAll('[data-csv]').forEach(b => b.addEventListener('click', () => {
  const msg = $('csv-msg');
  try { $('csv-out').value = b.dataset.csv === 'tojson' ? csvToJson($('csv-in').value) : jsonToCsv($('csv-in').value); msg.className = 'msg ok'; msg.textContent = 'converted'; }
  catch (e) { msg.className = 'msg bad'; msg.textContent = e.message; }
}));

// ── Text diff (LCS line diff) ──
function lineDiff() {
  const A = $('diff-a').value.split('\n'), B = $('diff-b').value.split('\n'); const out = $('diff-out');
  const m = A.length, n = B.length;
  if (m + n > 4000) { out.innerHTML = '<div class="err">Too large to diff - keep each side under ~2000 lines</div>'; $('diff-msg').textContent = ''; return; }
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const line = (cls, sign, t) => `<div class="di ${cls}">${sign} ${esc(t) || '&nbsp;'}</div>`;
  let i = 0, j = 0, html = '', add = 0, del = 0;
  while (i < m && j < n) {
    if (A[i] === B[j]) { html += line('di-ctx', ' ', A[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { html += line('di-del', '-', A[i]); i++; del++; }
    else { html += line('di-add', '+', B[j]); j++; add++; }
  }
  while (i < m) { html += line('di-del', '-', A[i++]); del++; }
  while (j < n) { html += line('di-add', '+', B[j++]); add++; }
  $('diff-msg').className = 'msg'; $('diff-msg').textContent = `${add} added · ${del} removed`;
  out.innerHTML = html || '<div class="di di-ctx">(identical)</div>';
}
['diff-a', 'diff-b'].forEach(id => $(id).addEventListener('input', lineDiff));

// ── Lorem ipsum ──
const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(' ');
const lrand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
function loremSentence() {
  const w = []; const len = lrand(6, 14);
  for (let i = 0; i < len; i++) w.push(LOREM[lrand(0, LOREM.length - 1)]);
  return w.join(' ').replace(/^\w/, c => c.toUpperCase()) + '.';
}
function loremGen() {
  const n = Math.max(1, Math.min(50, +$('lorem-n').value || 1)); const type = $('lorem-type').value;
  let r;
  if (type === 'words') r = Array.from({ length: n }, () => LOREM[lrand(0, LOREM.length - 1)]).join(' ');
  else if (type === 'sentences') r = Array.from({ length: n }, loremSentence).join(' ');
  else r = Array.from({ length: n }, () => Array.from({ length: lrand(3, 6) }, loremSentence).join(' ')).join('\n\n');
  $('lorem-out').value = r;
}
$('lorem-go').addEventListener('click', loremGen); loremGen();

// ── MAC formatter ──
function macParse(s) { const h = s.replace(/[^0-9a-fA-F]/g, ''); return h.length === 12 ? h.toLowerCase() : null; }
function eui64(h) {
  const first = (parseInt(h.slice(0, 2), 16) ^ 0x02).toString(16).padStart(2, '0');
  return (first + h.slice(2, 6) + 'fffe' + h.slice(6, 12)).match(/..../g).join(':');
}
function mac() {
  const out = $('mac-out'); const h = macParse($('mac-in').value);
  if (!h) { out.innerHTML = '<div class="err">Enter 12 hex digits, e.g. 00:1a:2b:3c:4d:5e</div>'; return; }
  const p = h.match(/../g);
  out.innerHTML = kv('Colon', p.join(':'), true) + kv('Hyphen', p.join('-')) + kv('Cisco dotted', h.match(/..../g).join('.')) +
    kv('Bare', h) + kv('Uppercase', p.join(':').toUpperCase()) + kv('EUI-64', eui64(h), true);
}
$('mac-in').addEventListener('input', mac); mac();

// ── CIDR / IP range ──
function rangeToCidr(a, b) {
  const cidrs = []; let start = a;
  while (start <= b && cidrs.length < 256) {
    let size = 32;
    while (size > 0) {
      const bits = 32 - (size - 1); const mask = bits >= 32 ? 0 : (0xFFFFFFFF << bits) >>> 0;
      if (((start & mask) >>> 0) !== start) break;
      if (start + Math.pow(2, bits) - 1 > b) break;
      size--;
    }
    cidrs.push(intToIp(start) + '/' + size); start += Math.pow(2, 32 - size);
  }
  return cidrs;
}
function rangeTool() {
  const v = $('range-in').value.trim(); const out = $('range-out');
  if (v.includes('/')) {
    const [ipStr, pfx] = v.split('/'); const ip = ipToInt(ipStr.trim()); const prefix = +pfx;
    if (ip === null || !(prefix >= 0 && prefix <= 32)) { out.innerHTML = '<div class="err">Invalid CIDR, e.g. 10.0.0.0/24</div>'; return; }
    const mask = prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0; const net = (ip & mask) >>> 0; const bc = (net | (~mask >>> 0)) >>> 0;
    out.innerHTML = kv('First address', intToIp(net), true) + kv('Last address', intToIp(bc), true) + kv('Total addresses', Math.pow(2, 32 - prefix).toLocaleString());
  } else if (v.includes('-')) {
    const [a, b] = v.split('-').map(x => ipToInt(x.trim()));
    if (a === null || b === null || a > b) { out.innerHTML = '<div class="err">Invalid range, e.g. 10.0.0.0 - 10.0.0.50</div>'; return; }
    const cidrs = rangeToCidr(a, b);
    out.innerHTML = kv('Addresses', (b - a + 1).toLocaleString(), true) + kv('CIDR blocks', cidrs.length) + cidrs.map(c => kv('', c, true)).join('');
  } else { out.innerHTML = '<div class="err">Enter a CIDR (10.0.0.0/24) or a range (10.0.0.0 - 10.0.0.50)</div>'; }
}
$('range-in').addEventListener('input', rangeTool); rangeTool();

// ── chmod calculator ──
const CHMOD_ROLES = [['u', 'Owner'], ['g', 'Group'], ['o', 'Other']];
const CHMOD_PERMS = [['r', 4], ['w', 2], ['x', 1]];
function chmodFromBoxes() {
  let oct = '', sym = '';
  for (const [rk] of CHMOD_ROLES) { let v = 0; for (const [pk, pv] of CHMOD_PERMS) { if ($('cm-' + rk + pk).checked) { v += pv; sym += pk; } else sym += '-'; } oct += v; }
  $('chmod-oct').value = oct;
  $('chmod-out').innerHTML = kv('Octal', oct, true) + kv('Symbolic', sym, true);
}
function chmodFromOct() {
  const v = $('chmod-oct').value.trim();
  if (!/^[0-7]{3}$/.test(v)) { $('chmod-out').innerHTML = '<div class="err">Enter 3 octal digits, e.g. 755</div>'; return; }
  CHMOD_ROLES.forEach(([rk], i) => { const d = +v[i]; CHMOD_PERMS.forEach(([pk, pv]) => { $('cm-' + rk + pk).checked = (d & pv) !== 0; }); });
  chmodFromBoxes();
}
(function chmodBuild() {
  let html = '<table class="chmod"><tr><th></th><th>read</th><th>write</th><th>exec</th></tr>';
  for (const [rk, rn] of CHMOD_ROLES) { html += `<tr><td>${rn}</td>`; for (const [pk] of CHMOD_PERMS) html += `<td><input type="checkbox" id="cm-${rk}${pk}"></td>`; html += '</tr>'; }
  $('chmod-grid').innerHTML = html + '</table>';
  CHMOD_ROLES.forEach(([rk]) => CHMOD_PERMS.forEach(([pk]) => $('cm-' + rk + pk).addEventListener('change', chmodFromBoxes)));
  $('chmod-oct').addEventListener('input', chmodFromOct); chmodFromOct();
})();

// ── Colour contrast ──
function relLum([r, g, b]) { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
function contrast() {
  const fg = hexToRgb($('ct-fg').value.trim()), bg = hexToRgb($('ct-bg').value.trim()); const out = $('ct-out');
  if (!fg || !bg) { out.innerHTML = '<div class="err">Enter two hex colours, e.g. #ffffff and #1a1a1a</div>'; return; }
  $('ct-preview').style.background = $('ct-bg').value; $('ct-preview').style.color = $('ct-fg').value;
  const L1 = relLum(fg), L2 = relLum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  const p = t => ratio >= t ? 'pass' : 'fail';
  out.innerHTML = kv('Contrast ratio', ratio.toFixed(2) + ' : 1', true) + kv('AA normal text (4.5)', p(4.5), ratio >= 4.5) +
    kv('AA large text (3)', p(3), ratio >= 3) + kv('AAA normal text (7)', p(7), ratio >= 7) + kv('AAA large text (4.5)', p(4.5), ratio >= 4.5);
}
['ct-fg', 'ct-bg'].forEach(id => $(id).addEventListener('input', contrast)); contrast();

// ── CSS units ──
const r4 = n => (+n.toFixed(4)).toString();
function cssunit() {
  const v = parseFloat($('cu-val').value); const unit = $('cu-unit').value; const base = parseFloat($('cu-base').value) || 16; const out = $('cu-out');
  if (!isFinite(v)) { out.innerHTML = ''; return; }
  let px; if (unit === 'px') px = v; else if (unit === 'rem' || unit === 'em') px = v * base; else px = v * 96 / 72;
  out.innerHTML = kv('px', r4(px), true) + kv('rem', r4(px / base), true) + kv('em', r4(px / base)) + kv('pt', r4(px * 72 / 96));
}
['cu-val', 'cu-base'].forEach(id => $(id).addEventListener('input', cssunit)); $('cu-unit').addEventListener('change', cssunit); cssunit();

// ── Duration ──
function durFmt(sec) { sec = Math.floor(sec); const d = Math.floor(sec / 86400); sec %= 86400; const h = Math.floor(sec / 3600); sec %= 3600; const m = Math.floor(sec / 60); const s = sec % 60; return [d && d + 'd', h && h + 'h', m && m + 'm', s && s + 's'].filter(Boolean).join(' ') || '0s'; }
function durParse(str) { const re = /(\d+(?:\.\d+)?)\s*(d|h|m|s)/gi; const mult = { d: 86400, h: 3600, m: 60, s: 1 }; let m, total = 0, any = false; while ((m = re.exec(str))) { any = true; total += parseFloat(m[1]) * mult[m[2].toLowerCase()]; } return any ? total : null; }
function dur() {
  const v = $('dur-in').value.trim(); const out = $('dur-out'); if (!v) { out.innerHTML = ''; return; }
  let secs = /^\d+(\.\d+)?$/.test(v) ? parseFloat(v) : durParse(v);
  if (secs === null || !isFinite(secs)) { out.innerHTML = '<div class="err">Enter seconds (90061) or a duration (1d 2h 3m)</div>'; return; }
  out.innerHTML = kv('Human', durFmt(secs), true) + kv('Seconds', secs.toLocaleString()) + kv('Minutes', r4(secs / 60)) + kv('Hours', r4(secs / 3600)) + kv('Days', r4(secs / 86400));
}
$('dur-in').addEventListener('input', dur); dur();

// ── Base32 (shared decoder used by TOTP) ──
const B32_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(s) {
  s = s.replace(/=+$/, '').replace(/\s/g, '').toUpperCase(); let bits = 0, val = 0; const out = [];
  for (const c of s) { const idx = B32_ALPHA.indexOf(c); if (idx < 0) throw new Error('Invalid Base32 character'); val = (val << 5) | idx; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; } }
  return new Uint8Array(out);
}
function base32Encode(bytes) {
  let bits = 0, val = 0, out = '';
  for (const b of bytes) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32_ALPHA[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32_ALPHA[(val << (5 - bits)) & 31];
  while (out.length % 8) out += '=';
  return out;
}
document.querySelectorAll('[data-b32]').forEach(b => b.addEventListener('click', () => {
  const s = $('b32-in').value; let r = '';
  try { r = b.dataset.b32 === 'enc' ? base32Encode(new TextEncoder().encode(s)) : new TextDecoder().decode(base32Decode(s)); } catch (e) { r = 'Error: ' + e.message; }
  $('b32-out').value = r;
}));

// ── TOTP / 2FA ──
async function totpCode(secret, step = 30, digits = 6) {
  const key = base32Decode(secret); if (!key.length) throw new Error('empty secret');
  const t = Math.floor(Date.now() / 1000 / step); const msg = new Uint8Array(8); let x = t;
  for (let i = 7; i >= 0; i--) { msg[i] = x & 0xff; x = Math.floor(x / 256); }
  const ck = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', ck, msg));
  const off = h[h.length - 1] & 0xf;
  const bin = ((h[off] & 0x7f) << 24) | ((h[off + 1] & 0xff) << 16) | ((h[off + 2] & 0xff) << 8) | (h[off + 3] & 0xff);
  return (bin % Math.pow(10, digits)).toString().padStart(digits, '0');
}
async function totp() {
  const out = $('totp-out'); const secret = $('totp-in').value.trim(); if (!secret) { out.innerHTML = ''; return; }
  try { const code = await totpCode(secret); const left = 30 - Math.floor(Date.now() / 1000) % 30; out.innerHTML = kv('Code', code.replace(/(\d{3})(\d{3})/, '$1 $2'), true) + kv('Expires in', left + 's'); }
  catch (e) { out.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}
$('totp-in').addEventListener('input', totp);
setInterval(() => { if ($('totp-in').value.trim()) totp(); }, 1000); totp();

// ── String escape / unescape ──
function strEsc(s, t) { if (t === 'Shell') return "'" + s.replace(/'/g, "'\\''") + "'"; return JSON.stringify(s); }
function strUnesc(s, t) {
  if (t === 'Shell') { let x = s.trim(); if (x.startsWith("'") && x.endsWith("'")) x = x.slice(1, -1); return x.replace(/'\\''/g, "'"); }
  let x = s.trim(); if (!x.startsWith('"')) x = '"' + x + '"'; return JSON.parse(x);
}
document.querySelectorAll('[data-esc]').forEach(b => b.addEventListener('click', () => {
  const t = $('esc-type').value, msg = $('esc-msg');
  try { $('esc-out').value = b.dataset.esc === 'esc' ? strEsc($('esc-in').value, t) : strUnesc($('esc-in').value, t); msg.textContent = ''; }
  catch (e) { msg.className = 'msg bad'; msg.textContent = e.message; }
}));

// ── Markdown preview ──
function mdRender(src) {
  const e = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = s => e(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  let html = '', inList = false, inCode = false, code = '';
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (const raw of src.split('\n')) {
    if (/^```/.test(raw)) { if (inCode) { html += '<pre><code>' + e(code) + '</code></pre>'; code = ''; inCode = false; } else { closeList(); inCode = true; } continue; }
    if (inCode) { code += raw + '\n'; continue; }
    let m;
    if ((m = raw.match(/^(#{1,6})\s+(.*)/))) { closeList(); html += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; }
    else if (/^\s*[-*]\s+/.test(raw)) { if (!inList) { html += '<ul>'; inList = true; } html += '<li>' + inline(raw.replace(/^\s*[-*]\s+/, '')) + '</li>'; }
    else if (/^>\s?/.test(raw)) { closeList(); html += '<blockquote>' + inline(raw.replace(/^>\s?/, '')) + '</blockquote>'; }
    else if (/^(-{3,}|\*{3,})$/.test(raw.trim())) { closeList(); html += '<hr>'; }
    else if (raw.trim() === '') { closeList(); }
    else { closeList(); html += '<p>' + inline(raw) + '</p>'; }
  }
  if (inCode) html += '<pre><code>' + e(code) + '</code></pre>';
  closeList(); return html;
}
function md() { $('md-out').innerHTML = mdRender($('md-in').value); }
$('md-in').addEventListener('input', md); md();

// ── copy literal text (palette chips etc.) ──
document.addEventListener('click', e => { const c = e.target.closest('[data-copy-text]'); if (c) navigator.clipboard.writeText(c.dataset.copyText).then(toast); });

// ── HTTP status codes ──
const HTTP_CODES = { 100: 'Continue', 101: 'Switching Protocols', 103: 'Early Hints', 200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content', 206: 'Partial Content', 301: 'Moved Permanently', 302: 'Found', 303: 'See Other', 304: 'Not Modified', 307: 'Temporary Redirect', 308: 'Permanent Redirect', 400: 'Bad Request', 401: 'Unauthorized', 402: 'Payment Required', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 406: 'Not Acceptable', 408: 'Request Timeout', 409: 'Conflict', 410: 'Gone', 413: 'Payload Too Large', 414: 'URI Too Long', 415: 'Unsupported Media Type', 418: "I'm a teapot", 422: 'Unprocessable Entity', 425: 'Too Early', 429: 'Too Many Requests', 451: 'Unavailable For Legal Reasons', 500: 'Internal Server Error', 501: 'Not Implemented', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout', 511: 'Network Authentication Required' };
function httpCodes() {
  const q = $('http-q').value.trim().toLowerCase(); const out = $('http-out');
  const rows = Object.entries(HTTP_CODES).filter(([c, n]) => !q || c.includes(q) || n.toLowerCase().includes(q));
  out.innerHTML = rows.length ? rows.map(([c, n]) => kv(c, n, c[0] === '2')).join('') : '<div class="err">No matching status code</div>';
}
$('http-q').addEventListener('input', httpCodes); httpCodes();

// ── Bitwise calculator (32-bit) ──
function bwParse(v) { v = v.trim().toLowerCase(); if (!v) return null; let n; if (/^0x[0-9a-f]+$/.test(v)) n = parseInt(v, 16); else if (/^0b[01]+$/.test(v)) n = parseInt(v.slice(2), 2); else if (/^\d+$/.test(v)) n = parseInt(v, 10); else return null; return isFinite(n) ? n >>> 0 : null; }
function fmt32(n) { n = n >>> 0; return n.toString() + '  ·  0x' + n.toString(16).toUpperCase() + '  ·  0b' + n.toString(2); }
function bitwise() {
  const a = bwParse($('bw-a').value), b = bwParse($('bw-b').value); const out = $('bw-out');
  if (a === null) { out.innerHTML = '<div class="err">Enter A as decimal, 0x.. or 0b..</div>'; return; }
  let html = kv('A', fmt32(a), true);
  if (b !== null) html += kv('B', fmt32(b)) + kv('A AND B', fmt32(a & b), true) + kv('A OR B', fmt32(a | b), true) + kv('A XOR B', fmt32(a ^ b), true) + kv('A << B', fmt32(a << b)) + kv('A >>> B', fmt32(a >>> b));
  html += kv('NOT A', fmt32(~a));
  out.innerHTML = html;
}
['bw-a', 'bw-b'].forEach(id => $(id).addEventListener('input', bitwise)); bitwise();

// ── Timezone converter ──
const TZS = ['UTC', 'America/Los_Angeles', 'America/New_York', 'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Moscow', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland'];
function tzOffset(timeZone, date) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return (Date.UTC(+p.year, p.month - 1, +p.day, p.hour === '24' ? 0 : +p.hour, +p.minute, +p.second) - date.getTime()) / 60000;
}
function zonedToUtc(y, mo, d, h, mi, tz) { const guess = Date.UTC(y, mo - 1, d, h, mi); return new Date(guess - tzOffset(tz, new Date(guess)) * 60000); }
function tz() {
  const out = $('tz-out'); const v = $('tz-dt').value; if (!v) { out.innerHTML = ''; return; }
  const [date, time] = v.split('T'); const [y, mo, d] = date.split('-').map(Number); const [h, mi] = time.split(':').map(Number);
  const src = $('tz-src').value; const inst = zonedToUtc(y, mo, d, h, mi, src);
  out.innerHTML = TZS.map(z => kv(z.replace(/_/g, ' '), new Intl.DateTimeFormat('en-GB', { timeZone: z, dateStyle: 'medium', timeStyle: 'short' }).format(inst), z === src)).join('');
}
(function tzInit() {
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone; if (local && !TZS.includes(local)) TZS.unshift(local);
  $('tz-src').innerHTML = TZS.map(z => `<option${z === local ? ' selected' : ''}>${z}</option>`).join('');
  const n = new Date(), pad = x => String(x).padStart(2, '0');
  $('tz-dt').value = `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}T${pad(n.getHours())}:${pad(n.getMinutes())}`;
  $('tz-dt').addEventListener('input', tz); $('tz-src').addEventListener('change', tz); tz();
})();

// ── ASCII / Unicode inspector ──
function uni() {
  const chars = [...$('uni-in').value]; const out = $('uni-out');
  if (!chars.length) { out.innerHTML = ''; return; }
  const rows = chars.slice(0, 80).map(ch => {
    const cp = ch.codePointAt(0); const bytes = [...new TextEncoder().encode(ch)].map(b => b.toString(16).padStart(2, '0')).join(' ');
    return kv(`${esc(ch)}  U+${cp.toString(16).toUpperCase().padStart(4, '0')}`, `dec ${cp} · UTF-8 ${bytes} · &amp;#${cp};`);
  }).join('');
  out.innerHTML = rows + (chars.length > 80 ? kv('…', (chars.length - 80) + ' more characters') : '');
}
$('uni-in').addEventListener('input', uni); uni();

// ── JSON → TypeScript ──
function jsonToTs(json) {
  const data = JSON.parse(json); const interfaces = [];
  const tn = k => (k.charAt(0).toUpperCase() + k.slice(1).replace(/[^a-zA-Z0-9]/g, '')) || 'Item';
  const singular = n => n.endsWith('s') ? n.slice(0, -1) : n + 'Item';
  function infer(val, name) {
    if (val === null) return 'any';
    if (Array.isArray(val)) return (val.length ? infer(val[0], singular(name)) : 'any') + '[]';
    if (typeof val === 'object') { build(val, name); return name; }
    return typeof val === 'string' ? 'string' : typeof val === 'number' ? 'number' : typeof val === 'boolean' ? 'boolean' : 'any';
  }
  function build(obj, name) {
    const lines = Object.entries(obj).map(([k, v]) => { const safe = /^[a-zA-Z_$][\w$]*$/.test(k) ? k : JSON.stringify(k); return `  ${safe}: ${infer(v, tn(k))};`; });
    interfaces.push(`interface ${name} {\n${lines.join('\n')}\n}`);
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) { build(data, 'Root'); return interfaces.reverse().join('\n\n'); }
  if (Array.isArray(data)) { const t = infer(data, 'Root'); return (interfaces.reverse().join('\n\n') + (interfaces.length ? '\n\n' : '') + `type Root = ${t};`).trim(); }
  return `type Root = ${infer(data, 'Root')};`;
}
$('ts-go').addEventListener('click', () => { const msg = $('ts-msg'); try { $('ts-out').value = jsonToTs($('ts-in').value); msg.textContent = ''; } catch (e) { msg.className = 'msg bad'; msg.textContent = e.message; } });

// ── Colour palette ──
function hslToRgb(h, s, l) { h /= 360; s /= 100; l /= 100; let r, g, b; if (s === 0) r = g = b = l; else { const hu = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }; const q = l < .5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q; r = hu(p, q, h + 1 / 3); g = hu(p, q, h); b = hu(p, q, h - 1 / 3); } return [r, g, b].map(x => Math.round(x * 255)); }
const toHex = rgb => '#' + rgb.map(x => x.toString(16).padStart(2, '0')).join('');
function palRow(title, cols) { return `<div class="pal-row"><div class="pal-label">${title}</div><div class="pal-sw">` + cols.map(c => `<button class="sw-chip" data-copy-text="${c}" style="background:${c}"><span>${c}</span></button>`).join('') + `</div></div>`; }
function palette() {
  const rgb = hexToRgb($('pal-in').value.trim()); const out = $('pal-out');
  if (!rgb) { out.innerHTML = '<div class="err">Enter a hex colour like #6366f1</div>'; return; }
  const [h, s, l] = rgbToHsl(...rgb);
  const tints = [80, 60, 40, 20].map(t => toHex(hslToRgb(h, s, Math.min(96, l + (100 - l) * t / 100))));
  const shades = [20, 40, 60, 80].map(t => toHex(hslToRgb(h, s, Math.max(4, l * (1 - t / 100)))));
  out.innerHTML = palRow('Base', [toHex(rgb)]) + palRow('Tints', tints) + palRow('Shades', shades) +
    palRow('Analogous', [-30, 30].map(d => toHex(hslToRgb((h + d + 360) % 360, s, l)))) + palRow('Complementary', [toHex(hslToRgb((h + 180) % 360, s, l))]);
}
$('pal-in').addEventListener('input', palette);
$('pal-pick').addEventListener('input', e => { $('pal-in').value = e.target.value; palette(); }); palette();

// ── CSS gradient ──
function gradient() {
  const c1 = $('gr-c1').value, c2 = $('gr-c2').value, type = $('gr-type').value, ang = $('gr-ang').value;
  const css = type === 'linear' ? `linear-gradient(${ang}deg, ${c1}, ${c2})` : `radial-gradient(circle, ${c1}, ${c2})`;
  $('gr-prev').style.background = css; $('gr-code').textContent = 'background: ' + css + ';'; $('gr-ang-l').textContent = ang + '°';
}
['gr-c1', 'gr-c2', 'gr-type', 'gr-ang'].forEach(id => $(id).addEventListener('input', gradient)); gradient();

// ── Image → Base64 ──
function imgFile(file) {
  if (!file || !file.type.startsWith('image/')) { $('img-msg').className = 'msg bad'; $('img-msg').textContent = 'Please choose an image file'; return; }
  const r = new FileReader();
  r.onload = () => { const uri = r.result; $('img-out').value = uri; $('img-prev').innerHTML = `<img src="${uri}" alt="preview">`; $('img-msg').className = 'msg'; $('img-msg').textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KB → base64 ${(uri.length / 1024).toFixed(1)} KB`; };
  r.readAsDataURL(file);
}
function wireDrop(zoneId, fileId, handler) {
  const z = $(zoneId); $(fileId).addEventListener('change', e => handler(e.target.files[0]));
  ['dragover', 'dragenter'].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); z.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); z.classList.remove('drag'); }));
  z.addEventListener('drop', e => handler(e.dataTransfer.files[0]));
}
wireDrop('img-drop', 'img-file', imgFile);

// ── File hash ──
async function fhashFile(file) {
  if (!file) return; $('fh-msg').className = 'msg'; $('fh-msg').textContent = `Hashing ${file.name}…`;
  const buf = await file.arrayBuffer(); let html = '';
  for (const a of ['SHA-1', 'SHA-256', 'SHA-512']) { const h = await crypto.subtle.digest(a, buf); html += kv(a, [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join('')); }
  $('fh-out').innerHTML = html; $('fh-msg').textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KB`;
}
wireDrop('fh-drop', 'fh-file', fhashFile);

// ── WiFi QR ──
function wifiQr() {
  const ssid = $('wifi-ssid').value, pass = $('wifi-pass').value, sec = $('wifi-sec').value, hidden = $('wifi-hidden').checked, out = $('wifi-out');
  if (!ssid) { out.innerHTML = '<div class="msg">Enter a network name to generate the QR.</div>'; return; }
  const e2 = s => s.replace(/([\\;,:"])/g, '\\$1');
  const payload = `WIFI:T:${sec};S:${e2(ssid)};${sec !== 'nopass' ? 'P:' + e2(pass) + ';' : ''}${hidden ? 'H:true;' : ''};`;
  out.innerHTML = `<div class="qrbox"><img src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=0&data=${encodeURIComponent(payload)}" width="240" height="240" alt="WiFi QR code"></div>`;
}
['wifi-ssid', 'wifi-pass', 'wifi-hidden'].forEach(id => $(id).addEventListener('input', wifiQr));
$('wifi-sec').addEventListener('change', wifiQr); wifiQr();

// ── JSON / YAML ──
function yamlScalar(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  v = String(v);
  if (v === '' || /^[\s>|@`"'#&*!?%\-\[\]{},]/.test(v) || /:\s|\s$|^\s/.test(v) || /^(true|false|null|~|[\d.+-])/i.test(v) || v.includes('\n') || v.includes(': ')) return JSON.stringify(v);
  return v;
}
function yamlKey(k) { k = String(k); return /^[\w.\-/]+$/.test(k) ? k : JSON.stringify(k); }
function jsonToYaml(data, indent = 0) {
  const sp = '  '.repeat(indent);
  if (data === null || typeof data !== 'object') return yamlScalar(data);
  if (Array.isArray(data)) {
    if (!data.length) return '[]';
    return data.map(item => {
      if (item !== null && typeof item === 'object' && (Array.isArray(item) ? item.length : Object.keys(item).length)) {
        return sp + '- ' + jsonToYaml(item, indent + 1).slice((indent + 1) * 2);
      }
      return sp + '- ' + yamlScalar(item);
    }).join('\n');
  }
  const keys = Object.keys(data);
  if (!keys.length) return '{}';
  return keys.map(k => {
    const v = data[k];
    if (v !== null && typeof v === 'object' && (Array.isArray(v) ? v.length : Object.keys(v).length)) return sp + yamlKey(k) + ':\n' + jsonToYaml(v, indent + 1);
    return sp + yamlKey(k) + ': ' + yamlScalar(v);
  }).join('\n');
}
function yamlToJson(text) {
  const lines = text.replace(/\t/g, '  ').split('\n').filter(l => l.trim() !== '' && !/^\s*#/.test(l));
  let i = 0; const indentOf = l => l.match(/^ */)[0].length;
  function scalar(s) {
    s = s.trim();
    if (s === '' || s === '~' || s === 'null') return null;
    if (s === 'true') return true; if (s === 'false') return false;
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
    if (s[0] === '"') { try { return JSON.parse(s); } catch { return s.slice(1, -1); } }
    if (s[0] === "'") return s.slice(1, -1).replace(/''/g, "'");
    if (s[0] === '[' || s[0] === '{') { try { return JSON.parse(s); } catch { } }
    return s;
  }
  function value(rest, curIndent) { rest = rest.trim(); if (rest !== '') return scalar(rest); if (i < lines.length && indentOf(lines[i]) > curIndent) return block(indentOf(lines[i])); return null; }
  function block(indent) {
    if (lines[i].slice(indent).startsWith('-')) {
      const arr = [];
      while (i < lines.length) {
        const l = lines[i], ind = indentOf(l);
        if (ind !== indent || !l.slice(ind).startsWith('-')) break;
        let after = l.slice(ind + 1); const dashIndent = ind + 1 + (after.match(/^ */)[0].length); after = after.trim();
        if (after === '') { i++; arr.push(i < lines.length && indentOf(lines[i]) > indent ? block(indentOf(lines[i])) : null); }
        else if (/^("[^"]*"|'[^']*'|[^:\s][^:]*):(\s|$)/.test(after)) { lines[i] = ' '.repeat(dashIndent) + after; arr.push(block(dashIndent)); }
        else { arr.push(scalar(after)); i++; }
      }
      return arr;
    }
    const obj = {};
    while (i < lines.length) {
      const l = lines[i], ind = indentOf(l);
      if (ind !== indent) break;
      const m = l.slice(ind).match(/^("(?:[^"\\]|\\.)*"|'[^']*'|[^:]+?)\s*:\s*(.*)$/);
      if (!m) { i++; continue; }
      const key = (m[1][0] === '"' || m[1][0] === "'") ? scalar(m[1]) : m[1].trim();
      i++; obj[key] = value(m[2], ind);
    }
    return obj;
  }
  return lines.length ? block(indentOf(lines[0])) : null;
}
document.querySelectorAll('[data-yaml]').forEach(b => b.addEventListener('click', () => {
  const msg = $('yaml-msg');
  try { $('yaml-out').value = b.dataset.yaml === 'toyaml' ? jsonToYaml(JSON.parse($('yaml-in').value)) : JSON.stringify(yamlToJson($('yaml-in').value), null, 2); msg.textContent = ''; }
  catch (e) { msg.className = 'msg bad'; msg.textContent = e.message; }
}));

// ── Query string / JSON ──
function qsToJson(s) {
  s = s.trim().replace(/^[?#]+/, ''); const p = new URLSearchParams(s); const o = {};
  for (const k of new Set([...p.keys()])) { const vals = p.getAll(k); o[k] = vals.length > 1 ? vals : vals[0]; }
  return JSON.stringify(o, null, 2);
}
function jsonToQs(s) {
  const o = JSON.parse(s); const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) { if (Array.isArray(v)) v.forEach(x => p.append(k, x)); else p.append(k, v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : v); }
  return p.toString();
}
document.querySelectorAll('[data-qs]').forEach(b => b.addEventListener('click', () => {
  const msg = $('qs-msg');
  try { $('qs-out').value = b.dataset.qs === 'tojson' ? qsToJson($('qs-in').value) : jsonToQs($('qs-in').value); msg.textContent = ''; }
  catch (e) { msg.className = 'msg bad'; msg.textContent = e.message; }
}));

// ── JWT signer (HMAC) ──
function b64url(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
const b64urlStr = s => b64url(new TextEncoder().encode(s));
async function jwtSign() {
  const out = $('jws-out'), msg = $('jws-msg');
  let payload; try { payload = JSON.parse($('jws-payload').value); } catch { msg.className = 'msg bad'; msg.textContent = 'Payload must be valid JSON'; out.value = ''; return; }
  const alg = $('jws-alg').value; const hash = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' }[alg];
  const data = b64urlStr(JSON.stringify({ alg, typ: 'JWT' })) + '.' + b64urlStr(JSON.stringify(payload));
  try {
    const ck = await crypto.subtle.importKey('raw', new TextEncoder().encode($('jws-secret').value), { name: 'HMAC', hash }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', ck, new TextEncoder().encode(data));
    out.value = data + '.' + b64url(sig); msg.className = 'msg ok'; msg.textContent = 'signed (decode it in the JWT tool)';
  } catch (e) { msg.className = 'msg bad'; msg.textContent = e.message; }
}
['jws-payload', 'jws-secret'].forEach(id => $(id).addEventListener('input', jwtSign));
$('jws-alg').addEventListener('change', jwtSign); jwtSign();

// ── ROT13 / Caesar ──
function caesar(s, n) { return s.replace(/[a-z]/gi, c => { const base = c <= 'Z' ? 65 : 97; return String.fromCharCode((c.charCodeAt(0) - base + n) % 26 + base); }); }
function rot() { const n = +$('rot-n').value; $('rot-n-l').textContent = n; $('rot-out').value = caesar($('rot-in').value, n); }
['rot-in', 'rot-n'].forEach(id => $(id).addEventListener('input', rot)); rot();

// ── NATO phonetic ──
const NATO = { a: 'Alfa', b: 'Bravo', c: 'Charlie', d: 'Delta', e: 'Echo', f: 'Foxtrot', g: 'Golf', h: 'Hotel', i: 'India', j: 'Juliett', k: 'Kilo', l: 'Lima', m: 'Mike', n: 'November', o: 'Oscar', p: 'Papa', q: 'Quebec', r: 'Romeo', s: 'Sierra', t: 'Tango', u: 'Uniform', v: 'Victor', w: 'Whiskey', x: 'X-ray', y: 'Yankee', z: 'Zulu', '0': 'Zero', '1': 'One', '2': 'Two', '3': 'Three', '4': 'Four', '5': 'Five', '6': 'Six', '7': 'Seven', '8': 'Eight', '9': 'Nine' };
function nato() {
  const s = $('nato-in').value; const out = $('nato-out');
  if (!s) { out.innerHTML = ''; return; }
  out.innerHTML = kv('Phonetic', esc([...s].map(c => NATO[c.toLowerCase()] || (c === ' ' ? '(space)' : c)).join(' ')), true);
}
$('nato-in').addEventListener('input', nato); nato();

// ── Morse code ──
const MORSE = { a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....', i: '..', j: '.---', k: '-.-', l: '.-..', m: '--', n: '-.', o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..', '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..', '/': '-..-.', '@': '.--.-.', '-': '-....-', '=': '-...-', '+': '.-.-.', "'": '.----.', '!': '-.-.--', '(': '-.--.', ')': '-.--.-', ':': '---...' };
const MORSE_REV = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
const morseEnc = s => [...s.toLowerCase()].map(c => c === ' ' ? '/' : MORSE[c] || '').filter(x => x !== '').join(' ');
const morseDec = s => s.trim().split(/\s+/).map(t => t === '/' ? ' ' : MORSE_REV[t] || '').join('').replace(/\s+/g, ' ');
document.querySelectorAll('[data-morse]').forEach(b => b.addEventListener('click', () => { $('morse-out').value = b.dataset.morse === 'enc' ? morseEnc($('morse-in').value) : morseDec($('morse-in').value); }));
function playMorse(code) {
  const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx || !code) return;
  const ctx = new Ctx(); let t = ctx.currentTime + 0.05; const u = 0.08;
  const beep = d => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 600; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.18, t); o.start(t); t += d; o.stop(t); g.gain.setValueAtTime(0, t); };
  for (const ch of code) { if (ch === '.') { beep(u); t += u; } else if (ch === '-') { beep(u * 3); t += u; } else if (ch === ' ') t += u * 2; else if (ch === '/') t += u * 4; }
  setTimeout(() => ctx.close(), (t - ctx.currentTime) * 1000 + 300);
}
$('morse-play').addEventListener('click', () => playMorse($('morse-out').value || morseEnc($('morse-in').value)));

// ── UUID / ULID inspector ──
const CROCK = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function genUlid() {
  let t = Date.now(), ts = '';
  for (let i = 0; i < 10; i++) { ts = CROCK[t % 32] + ts; t = Math.floor(t / 32); }
  const r = crypto.getRandomValues(new Uint8Array(16)); let rnd = '';
  for (let i = 0; i < 16; i++) rnd += CROCK[r[i] % 32];
  return ts + rnd;
}
function inspectId() {
  const v = $('uuid-in').value.trim(); const out = $('uuid-out'); if (!v) { out.innerHTML = ''; return; }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
    const hex = v.replace(/-/g, '').toLowerCase(); const ver = parseInt(hex[12], 16); const vb = parseInt(hex[16], 16);
    const variant = vb < 8 ? 'NCS (legacy)' : vb < 12 ? 'RFC 4122' : vb < 14 ? 'Microsoft' : 'reserved';
    let rows = kv('Type', 'UUID', true) + kv('Version', ver) + kv('Variant', variant);
    if (ver === 1) { const intervals = BigInt('0x' + hex.slice(13, 16) + hex.slice(8, 12) + hex.slice(0, 8)); rows += kv('Timestamp', new Date(Number(intervals / 10000n) - 12219292800000).toISOString(), true); }
    if (ver === 7) rows += kv('Timestamp', new Date(parseInt(hex.slice(0, 12), 16)).toISOString(), true);
    out.innerHTML = rows;
  } else if (/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/i.test(v)) {
    let ms = 0; for (const c of v.toUpperCase().slice(0, 10)) ms = ms * 32 + CROCK.indexOf(c);
    out.innerHTML = kv('Type', 'ULID', true) + kv('Timestamp', new Date(ms).toISOString(), true) + kv('Randomness', v.slice(10));
  } else out.innerHTML = '<div class="err">Not a valid UUID or ULID</div>';
}
$('uuid-in').addEventListener('input', inspectId);
$('uuid-gen').addEventListener('click', () => { $('uuid-in').value = crypto.randomUUID(); inspectId(); });
$('ulid-gen').addEventListener('click', () => { $('uuid-in').value = genUlid(); inspectId(); });

// ── Aspect ratio ──
const gcd = (a, b) => b ? gcd(b, a % b) : a;
function arScale() { const w = parseFloat($('ar-w').value), h = parseFloat($('ar-h').value), sw = parseFloat($('ar-sw').value); if (w > 0 && h > 0 && sw > 0) $('ar-sh').value = (+(sw * h / w).toFixed(2)).toString(); }
function aspect() {
  const w = parseFloat($('ar-w').value), h = parseFloat($('ar-h').value); const out = $('ar-out');
  if (!(w > 0 && h > 0)) { out.innerHTML = '<div class="err">Enter width and height</div>'; return; }
  const g = gcd(Math.round(w), Math.round(h)) || 1;
  out.innerHTML = kv('Ratio', `${Math.round(w) / g} : ${Math.round(h) / g}`, true) + kv('Decimal', (w / h).toFixed(4)) + kv('Megapixels', (w * h / 1e6).toFixed(2));
  arScale();
}
['ar-w', 'ar-h'].forEach(id => $(id).addEventListener('input', aspect));
$('ar-sw').addEventListener('input', arScale); aspect();

// ── scroll reveal + hero CTA ──
const io = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach((el, i) => { el.style.transitionDelay = Math.min(i * 30, 220) + 'ms'; io.observe(el); });
$('cta') && $('cta').addEventListener('click', () => document.querySelector('.group').scrollIntoView({ behavior: 'smooth', block: 'start' }));

// ── theme toggle ──
const SUN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('nt-theme', t); } catch (e) {}
  const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = t === 'light' ? '#f4f5fa' : '#0a0b0f';
  $('theme').innerHTML = t === 'light' ? MOON : SUN;
}
setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
$('theme').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
