/* BoyGames feature flags — single-file Worker.
 * KV binding: FLAGS (namespace "boygames-flags")
 * Keys: "flags:<appId>" -> JSON object of flags.
 * Public:  GET /api/flags?app=<id>          (CORS open, cached 60s)
 * Authed:  POST /api/flags {app, flags, password}
 * Dashboard: GET /  (password-gated UI, phone-first)
 */

var PASSWORD_HASH = "3bf45dafefbde66cebf91af3978b6b0ba4e6d9eeab30cd09fd8c851278e45e9e";

var APPS = {
  "get-clocked":    { name: "Get Clocked",    flags: { adsEnabled: false } },
  "liverpool-rummy": { name: "Liverpool Rummy", flags: { adsEnabled: false } },
};

function cors(h) {
  h = h || {};
  h["access-control-allow-origin"] = "*";
  h["access-control-allow-methods"] = "GET,POST,OPTIONS";
  h["access-control-allow-headers"] = "content-type";
  return h;
}
function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: cors({ "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" }),
  });
}
async function sha256hex(s) {
  var d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}

var DASHBOARD = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>BoyGames Flags</title>
<style>
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin: 0; font-family: -apple-system, system-ui, sans-serif; background: #101014; color: #f2f2f5; padding: 20px 16px 60px; }
  h1 { font-size: 22px; margin: 4px 0 2px; }
  .sub { color: #9a9aa5; font-size: 13px; margin-bottom: 18px; }
  .card { background: #1b1b21; border: 1px solid #2a2a33; border-radius: 14px; padding: 14px; margin-bottom: 12px; }
  .card h2 { font-size: 16px; margin: 0 0 10px; }
  .row { display: flex; align-items: center; justify-content: space-between; padding: 10px 2px; border-top: 1px solid #26262e; }
  .row:first-of-type { border-top: 0; }
  .row .name { font-size: 15px; }
  .row .desc { font-size: 12px; color: #9a9aa5; }
  input[type=password] { width: 100%; font-size: 17px; padding: 12px; border-radius: 10px; border: 1px solid #2a2a33; background: #101014; color: #fff; margin-bottom: 10px; }
  button { font-size: 16px; padding: 12px 18px; border-radius: 10px; border: 0; background: #ffd60a; color: #111; font-weight: 700; width: 100%; touch-action: manipulation; }
  button:active { transform: scale(.98); }
  .switch { position: relative; width: 56px; height: 32px; flex: none; touch-action: manipulation; }
  .switch input { opacity: 0; width: 0; height: 0; }
  .track { position: absolute; inset: 0; background: #3a3a44; border-radius: 999px; transition: .15s; }
  .track:before { content: ""; position: absolute; width: 26px; height: 26px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: .15s; }
  .switch input:checked + .track { background: #30d158; }
  .switch input:checked + .track:before { transform: translateX(24px); }
  .status { text-align: center; font-size: 13px; color: #9a9aa5; min-height: 20px; margin-top: 10px; }
  .err { color: #ff6b6b; }
  .ok { color: #30d158; }
</style></head><body>
<h1>\uD83D\uDEA9 BoyGames Flags</h1>
<div class="sub">Feature kill switches for your apps. Changes apply within ~60s.</div>
<div id="lock" class="card">
  <input type="password" id="pw" placeholder="Dashboard password" autocomplete="current-password">
  <button id="unlock">Unlock</button>
  <div class="status" id="lockmsg"></div>
</div>
<div id="flags" style="display:none"></div>
<script>
var pw = sessionStorage.getItem("bgf_pw") || "";
var APPS = __APPS__;
function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
async function api(path, body) {
  var opt = { headers: { "content-type": "application/json" } };
  if (body) { opt.method = "POST"; opt.body = JSON.stringify(body); }
  var r = await fetch(path, opt);
  return r.json();
}
async function load() {
  var wrap = el("div"); wrap.id = "flags";
  for (var id of Object.keys(APPS)) {
    var card = el("div", "card");
    card.appendChild(el("h2", null, APPS[id].name));
    var data = await api("/api/flags?app=" + encodeURIComponent(id));
    var flags = Object.assign({}, APPS[id].flags, data.flags || {});
    for (var key of Object.keys(APPS[id].flags)) {
      (function (appId, k) {
        var row = el("div", "row");
        var label = el("div", null, '<div class="name">' + k + '</div><div class="desc">' + (k === "adsEnabled" ? "Show ads in this app" : "") + "</div>");
        var sw = el("label", "switch");
        var input = document.createElement("input");
        input.type = "checkbox"; input.checked = !!flags[k];
        input.addEventListener("change", function () { save(appId, k, input.checked, input); });
        var track = el("span", "track");
        sw.appendChild(input); sw.appendChild(track);
        row.appendChild(label); row.appendChild(sw);
        card.appendChild(row);
      })(id, key);
    }
    wrap.appendChild(card);
  }
  var status = el("div", "status"); status.id = "status";
  wrap.appendChild(status);
  document.body.appendChild(wrap);
  wrap.style.display = "";
}
async function save(appId, key, val, input) {
  var st = document.getElementById("status");
  st.textContent = "Saving\u2026"; st.className = "status";
  try {
    var cur = await api("/api/flags?app=" + encodeURIComponent(appId));
    var flags = Object.assign({}, cur.flags || {});
    flags[key] = val;
    var r = await api("/api/flags", { app: appId, flags: flags, password: pw });
    if (r.ok) { st.textContent = "Saved \u2713 live within ~60s"; st.className = "status ok"; }
    else { st.textContent = "Save failed"; st.className = "status err"; input.checked = !val; }
  } catch (e) { st.textContent = "Network error"; st.className = "status err"; input.checked = !val; }
}
async function unlock() {
  var msg = document.getElementById("lockmsg");
  pw = document.getElementById("pw").value;
  msg.textContent = "Checking\u2026"; msg.className = "status";
  var r = await api("/api/flags", { app: "get-clocked", flags: {}, password: pw });
  if (r.ok || !r.error) {
    sessionStorage.setItem("bgf_pw", pw);
    document.getElementById("lock").style.display = "none";
    load();
  } else { msg.textContent = "Wrong password"; msg.className = "status err"; }
}
document.getElementById("unlock").addEventListener("click", unlock);
document.getElementById("pw").addEventListener("keydown", function (e) { if (e.key === "Enter") unlock(); });
if (pw) { document.getElementById("pw").value = pw; unlock(); }
</script></body></html>`;

export default {
  async fetch(req, env) {
    var url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: cors() });

    if (url.pathname === "/api/flags" && req.method === "GET") {
      var app = url.searchParams.get("app") || "";
      var def = APPS[app] ? APPS[app].flags : {};
      var raw = env.FLAGS ? await env.FLAGS.get("flags:" + app) : null;
      var stored = {};
      try { stored = raw ? JSON.parse(raw) : {}; } catch (e) {}
      var flags = Object.assign({}, def, stored);
      return json({ app: app, flags: flags });
    }

    if (url.pathname === "/api/flags" && req.method === "POST") {
      var body = await req.json().catch(function () { return {}; });
      var given = body.password ? await sha256hex(String(body.password)) : "";
      if (given !== PASSWORD_HASH) return json({ error: "bad password" }, 401);
      var appId = String(body.app || "");
      if (!APPS[appId]) return json({ error: "unknown app" }, 400);
      var flags = body.flags && typeof body.flags === "object" ? body.flags : {};
      // only allow known flag keys, booleans only
      var clean = {};
      Object.keys(APPS[appId].flags).forEach(function (k) {
        clean[k] = !!flags[k];
      });
      if (env.FLAGS) await env.FLAGS.put("flags:" + appId, JSON.stringify(clean));
      return json({ ok: true, app: appId, flags: clean });
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      var html = DASHBOARD.replace("__APPS__", JSON.stringify(
        Object.fromEntries(Object.entries(APPS).map(function ([k, v]) { return [k, { name: v.name, flags: v.flags }]; }))
      ));
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }

    return new Response("not found", { status: 404, headers: cors() });
  }
};
