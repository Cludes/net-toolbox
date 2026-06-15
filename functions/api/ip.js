/**
 * Cloudflare Pages Function - GET /api/ip?q=<ip>
 *
 * Proxies the keyless ipwho.is lookup server-side (it bot-challenges direct browser
 * requests). With no ?q, looks up the visitor's own IP via Cloudflare's CF-Connecting-IP.
 */
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const clientIp = context.request.headers.get('CF-Connecting-IP') || '';
  const ip = q || clientIp;

  // light validation: IPv4/IPv6-ish characters only
  if (ip && !/^[0-9a-fA-F:.]+$/.test(ip)) return json({ success: false, message: 'invalid IP' }, 400);

  let r;
  try {
    r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, { headers: { 'User-Agent': 'net-toolbox/1.0 (+https://net-toolbox.pages.dev)', 'Accept': 'application/json' } });
  } catch (e) {
    return json({ success: false, message: 'upstream fetch failed' }, 502);
  }
  const data = await r.json().catch(() => ({ success: false, message: 'bad upstream response' }));
  return json(data);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
