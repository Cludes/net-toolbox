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
