'use strict';
const $ = id => document.getElementById(id);
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const kv = (k, v, hi) => `<div class="kv"><span class="k">${k}</span><span class="v ${hi ? 'hi' : ''}">${v}</span></div>`;

// ── nav ──
document.querySelectorAll('.navi').forEach(n => n.addEventListener('click', () => {
  document.querySelectorAll('.navi').forEach(x => x.classList.remove('on'));
  document.querySelectorAll('.panel').forEach(x => x.classList.remove('on'));
  n.classList.add('on'); $(n.dataset.p).classList.add('on');
}));

// ── 1. Subnet / CIDR ──
const ipToInt = ip => {
  const p = ip.split('.'); if (p.length !== 4) return null;
  let n = 0; for (const o of p) { const x = +o; if (!/^\d+$/.test(o) || x > 255) return null; n = n * 256 + x; }
  return n >>> 0;
};
const intToIp = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
function ipType(ip) {
  const a = (ip >>> 24) & 255, b = (ip >>> 16) & 255;
  if (a === 10) return 'Private (10/8)';
  if (a === 172 && b >= 16 && b <= 31) return 'Private (172.16/12)';
  if (a === 192 && b === 168) return 'Private (192.168/16)';
  if (a === 127) return 'Loopback';
  if (a === 169 && b === 254) return 'Link-local';
  if (a >= 224 && a <= 239) return 'Multicast';
  return 'Public';
}
function subnet() {
  const v = $('cidr').value.trim();
  let ipStr = v, prefix = 24;
  if (v.includes('/')) { const [a, b] = v.split('/'); ipStr = a; prefix = +b; }
  const ip = ipToInt(ipStr.trim());
  const out = $('subnet-out');
  if (ip === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) { out.innerHTML = '<div class="err">Enter a valid IPv4 CIDR, e.g. 10.0.0.0/24</div>'; return; }
  const mask = prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;
  const network = (ip & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const total = Math.pow(2, 32 - prefix);
  const usable = prefix >= 31 ? total : total - 2;
  const first = prefix >= 31 ? network : (network + 1) >>> 0;
  const last = prefix >= 31 ? broadcast : (broadcast - 1) >>> 0;
  out.innerHTML =
    kv('Address', intToIp(ip)) +
    kv('Netmask', `${intToIp(mask)} /${prefix}`, true) +
    kv('Network', intToIp(network), true) +
    kv('Broadcast', intToIp(broadcast)) +
    kv('Host range', `${intToIp(first)} – ${intToIp(last)}`) +
    kv('Usable hosts', usable.toLocaleString(), true) +
    kv('Total addresses', total.toLocaleString()) +
    kv('Wildcard', intToIp((~mask) >>> 0)) +
    kv('Type', ipType(ip));
}
$('cidr').addEventListener('input', subnet); subnet();

// ── 2. IP / ASN lookup ──
async function iplookup() {
  const q = $('ipq').value.trim();
  const out = $('ip-out'); out.innerHTML = '<div class="kv"><span class="k">Looking up…</span></div>';
  try {
    const r = await fetch(`/api/ip${q ? '?q=' + encodeURIComponent(q) : ''}`);
    const d = await r.json();
    if (!d.success) throw new Error(d.message || 'lookup failed');
    const c = d.connection || {};
    out.innerHTML =
      kv('IP', d.ip, true) +
      kv('Type', d.type) +
      kv('ASN', c.asn ? 'AS' + c.asn : '-', true) +
      kv('Org', c.org || '-') +
      kv('ISP', c.isp || '-') +
      kv('Domain', c.domain || '-') +
      kv('Location', `${d.flag?.emoji || ''} ${[d.city, d.region, d.country].filter(Boolean).join(', ')}`) +
      kv('Coords', `${d.latitude}, ${d.longitude}`) +
      kv('Timezone', d.timezone?.id || '-') +
      kv('Postal', d.postal || '-');
  } catch (e) { out.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}
$('ipgo').addEventListener('click', iplookup);
$('ipq').addEventListener('keydown', e => { if (e.key === 'Enter') iplookup(); });

// ── 3. Base converter ──
function parseBig(v, base) {
  v = v.replace(/\s/g, '');
  const pfx = { 2: '0b', 8: '0o', 16: '0x', 10: '' }[base];
  if (base === 16 && !/^[0-9a-fA-F]+$/.test(v)) throw 0;
  if (base === 2 && !/^[01]+$/.test(v)) throw 0;
  if (base === 8 && !/^[0-7]+$/.test(v)) throw 0;
  if (base === 10 && !/^\d+$/.test(v)) throw 0;
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

// ── 4. Timestamp ──
function tick() { const d = new Date(); $('t-now').textContent = `${Math.floor(d / 1000)}  ·  ${d.toISOString().replace('T', ' ').slice(0, 19)}Z`; }
setInterval(tick, 1000); tick();
$('t-epoch').addEventListener('input', e => {
  const v = e.target.value.trim(); const out = $('t-from-epoch');
  if (!/^\d+$/.test(v)) { out.innerHTML = ''; return; }
  const ms = v.length >= 13 ? +v : +v * 1000; const d = new Date(ms);
  out.innerHTML = kv('Local', d.toLocaleString(), true) + kv('UTC', d.toUTCString()) + kv('ISO', d.toISOString());
});
$('t-date').addEventListener('input', e => {
  const out = $('t-from-date'); if (!e.target.value) { out.innerHTML = ''; return; }
  const d = new Date(e.target.value);
  out.innerHTML = kv('Epoch (s)', Math.floor(d / 1000), true) + kv('Epoch (ms)', +d) + kv('ISO', d.toISOString());
});

// ── 5. Base64 / URL ──
const b64enc = s => btoa(unescape(encodeURIComponent(s)));
const b64dec = s => decodeURIComponent(escape(atob(s)));
document.querySelectorAll('[data-enc]').forEach(b => b.addEventListener('click', () => {
  const s = $('enc-in').value; let r = '';
  try {
    r = b.dataset.enc === 'b64' ? b64enc(s) : b.dataset.enc === 'b64d' ? b64dec(s)
      : b.dataset.enc === 'url' ? encodeURIComponent(s) : decodeURIComponent(s);
  } catch (e) { r = 'Error: ' + e.message; }
  $('enc-out').value = r;
}));

// ── 6. JSON ──
document.querySelectorAll('[data-json]').forEach(b => b.addEventListener('click', () => {
  const msg = $('json-msg');
  try {
    const o = JSON.parse($('json-in').value);
    $('json-out').value = JSON.stringify(o, null, b.dataset.json === 'pretty' ? 2 : 0);
    msg.className = 'msg ok'; msg.textContent = 'valid JSON';
  } catch (e) { msg.className = 'msg bad'; msg.textContent = e.message; }
}));

// ── 7. Regex ──
function rxRun() {
  const pat = $('rx-pat').value, flags = $('rx-flags').value, test = $('rx-test').value;
  const msg = $('rx-msg'), out = $('rx-out');
  if (!pat) { out.innerHTML = esc(test); msg.textContent = ''; return; }
  let re; try { re = new RegExp(pat, flags); } catch (e) { msg.className = 'msg bad'; msg.textContent = e.message; return; }
  let html = '', last = 0, count = 0;
  try {
    if (flags.includes('g')) {
      for (const m of test.matchAll(re)) { count++; html += esc(test.slice(last, m.index)) + '<mark>' + esc(m[0]) + '</mark>'; last = m.index + m[0].length; if (!m[0].length) { last++; } }
    } else { const m = re.exec(test); if (m) { count = 1; html = esc(test.slice(0, m.index)) + '<mark>' + esc(m[0]) + '</mark>'; last = m.index + m[0].length; } }
  } catch (e) { msg.className = 'msg bad'; msg.textContent = e.message; return; }
  html += esc(test.slice(last));
  out.innerHTML = html; msg.className = 'msg ok'; msg.textContent = `${count} match${count !== 1 ? 'es' : ''}`;
}
['rx-pat', 'rx-flags', 'rx-test'].forEach(id => $(id).addEventListener('input', rxRun));

// ── 8. Generators ──
const newUuid = () => { $('g-uuid').value = crypto.randomUUID(); };
$('g-uuid-btn').addEventListener('click', newUuid); newUuid();
const newHex = () => { const b = crypto.getRandomValues(new Uint8Array(32)); $('g-hex').value = [...b].map(x => x.toString(16).padStart(2, '0')).join(''); };
$('g-hex-btn').addEventListener('click', newHex); newHex();
$('g-pwlen').addEventListener('input', e => $('g-pwlen-l').textContent = e.target.value);
$('g-pw-btn').addEventListener('click', () => {
  const len = +$('g-pwlen').value;
  const cs = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+';
  const r = crypto.getRandomValues(new Uint32Array(len));
  $('g-pw').value = [...r].map(x => cs[x % cs.length]).join('');
});
