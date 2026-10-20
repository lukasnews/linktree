// Linkseite: liest links.json und baut Startseite, App-Anleitungen (#/app/<id>)
// und den Bearbeiten-Bereich (#/admin, siehe admin.js).
const root = document.getElementById("app");
let data;

const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "value") n.value = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid);
  return n;
};

// Emoji oder Bild-URL
const icon = (value) => {
  if (!value) return el("span", { class: "icon" });
  const isImg = /[./]/.test(value);
  return el("span", { class: "icon", "aria-hidden": "true" },
    isImg ? el("img", { src: value, alt: "" }) : value);
};

// replaceChildren ohne null-Einträge (sonst steht "null" auf der Seite)
const show = (...kids) => root.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));

const detectPlatform = () => {
  const ua = navigator.userAgent || "";
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  return null;
};

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// Plattform-Einstellung einer App. Modi:
//   android: "play" (Google-Gruppe + Play-Test) | "web" | "none"
//   ios:     "testflight" | "web" | "none"
const DEFAULT_MODE = { android: "play", ios: "testflight" };
const MODE_LABEL = { play: "", testflight: "", web: " (Web)" };
function platform(app, p) {
  const cfg = app[p];
  if (!cfg) return null;
  const mode = cfg.mode || DEFAULT_MODE[p];
  return mode === "none" ? null : { ...cfg, mode };
}

const platformsLabel = (a) => {
  const parts = ["android", "ios"]
    .map((p) => { const c = platform(a, p); return c && (p === "android" ? "Android" : "iOS") + MODE_LABEL[c.mode]; })
    .filter(Boolean);
  return parts.length ? parts.join(" · ") + " – Tester werden" : "Bald verfügbar";
};

function renderHome() {
  const p = data.profile || {};
  document.title = p.name || "Links";
  const sections = (data.sections || []).map((s) =>
    el("section", {},
      s.title ? el("h2", {}, s.title) : null,
      el("div", { class: "list" }, (s.links || []).map((l) =>
        el("a", { class: "item", href: l.url, target: "_blank", rel: "noopener" },
          icon(l.icon),
          el("span", { class: "item-text" },
            el("span", { class: "item-title" }, l.title),
            l.description ? el("span", { class: "item-desc" }, l.description) : null),
          el("span", { class: "chev", "aria-hidden": "true" }, "↗"))))));

  const apps = (data.apps || []).length
    ? el("section", {},
        el("h2", {}, data.appsTitle || "Testapps"),
        el("div", { class: "list" }, data.apps.map((a) =>
          el("a", { class: "item", href: `#/app/${encodeURIComponent(a.id)}` },
            icon(a.icon),
            el("span", { class: "item-text" },
              el("span", { class: "item-title" }, a.name),
              el("span", { class: "item-desc" }, platformsLabel(a))),
            el("span", { class: "chev", "aria-hidden": "true" }, "→")))))
    : null;

  show(
    // Überschrift nur zeigen, wenn mindestens ein Feld ausgefüllt ist
    p.name || p.bio || p.avatar
      ? el("header", { class: "profile" },
          p.avatar ? el("img", { src: p.avatar, alt: "" }) : null,
          p.name ? el("h1", {}, p.name) : null,
          p.bio ? el("p", {}, p.bio) : null)
      : null,
    ...sections,
    apps,
    el("footer", {},
      data.footer ? el("div", {}, data.footer) : null,
      el("a", { class: "admin-link", href: "#/admin", "aria-label": "Bearbeiten" }, "🔒")));
}

const webSteps = (url, browser, how) => [
  { title: `In ${browser} öffnen`, text: `Öffne die Web-App in ${browser}.`, url, button: "Web-App öffnen" },
  { title: "Zum Home-Bildschirm", text: how },
  { title: "Starten", text: "Öffne die App ab jetzt über das neue Icon auf deinem Home-Bildschirm." },
];

function stepsFor(app, p) {
  const c = platform(app, p);
  if (p === "android" && c.mode === "web")
    return webSteps(c.url, "Chrome", "Tippe oben rechts auf ⋮ und dann auf „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.");
  if (p === "ios" && c.mode === "web")
    return webSteps(c.url, "Safari", "Tippe unten auf Teilen (□↑) und dann auf „Zum Home-Bildschirm“.");
  if (p === "android")
    return [
      { title: "Google-Gruppe beitreten",
        text: `Tritt der Gruppe ${c.groupName ? `„${c.groupName}“ ` : ""}mit dem Google-Konto bei, das du im Play Store nutzt.`,
        url: c.groupUrl, button: "Zur Gruppe" },
      { title: "Tester werden",
        text: "Öffne den Link und tippe auf „Tester werden“. Es kann ein paar Minuten dauern, bis es aktiv ist.",
        url: c.testerUrl, button: "Tester werden" },
      { title: "App herunterladen",
        text: "Installiere die Testversion aus dem Play Store.",
        url: c.storeUrl, button: "Zum Play Store" },
    ];
  return [
    { title: "TestFlight installieren",
      text: "Lade Apples kostenlose TestFlight-App aus dem App Store.",
      url: "https://apps.apple.com/app/testflight/id899247664", button: "TestFlight laden" },
    { title: "Einladung annehmen",
      text: "Öffne den Einladungslink und tippe in TestFlight auf „Akzeptieren“.",
      url: c.testflightUrl, button: "Einladung öffnen" },
    { title: "App installieren",
      text: "Tippe in TestFlight bei der App auf „Installieren“. Fertig!" },
  ];
}

function renderApp(id) {
  const app = (data.apps || []).find((a) => a.id === id);
  if (!app) { location.hash = ""; return; }
  document.title = `${app.name} testen`;

  const available = ["android", "ios"].filter((p) => platform(app, p));
  const device = detectPlatform();
  let current = [device, store.get("platform")].find((p) => available.includes(p)) || available[0];
  const doneKey = (p) => `done:${app.id}:${p}`;
  const name = (p) => (p === "android" ? "Android" : "iOS");

  const toggle = el("div", { class: "toggle", role: "group", "aria-label": "Plattform wählen" });
  const list = el("ol", { class: "steps" });

  const draw = () => {
    toggle.replaceChildren(...available.map((p) =>
      el("button", {
        type: "button",
        "aria-pressed": String(p === current),
        onclick: () => { current = p; store.set("platform", p); draw(); },
      }, name(p) + MODE_LABEL[platform(app, p).mode])));

    const done = new Set(store.get(doneKey(current)) || []);
    list.replaceChildren(...stepsFor(app, current).map((s, i) =>
      el("li", { class: "step" + (done.has(i) ? " done" : "") },
        el("span", { class: "num" }, done.has(i) ? "✓" : String(i + 1)),
        el("div", {},
          el("h3", {}, s.title),
          el("p", {}, s.text),
          s.url ? el("a", {
            class: "btn", href: s.url, target: "_blank", rel: "noopener",
            onclick: () => { done.add(i); store.set(doneKey(current), [...done]); setTimeout(draw, 300); },
          }, s.button) : null))));
  };
  if (current) draw();

  // Gerät erkannt, aber App gibt es dafür nicht
  const missing = device && !available.includes(device)
    ? el("p", { class: "notice" }, `Diese App gibt es (noch) nicht für ${name(device)}.`)
    : null;

  show(
    el("a", { class: "back", href: "#" }, "← Zurück"),
    el("div", { class: "app-head" }, icon(app.icon), el("h1", {}, app.name)),
    app.description ? el("p", { class: "app-desc" }, app.description) : el("div", { style: "height:16px" }),
    missing,
    available.length > 1 ? toggle : null,
    current ? list : el("p", { class: "muted" }, "Noch keine Testversion verfügbar."),
    current ? el("p", { class: "hint" }, "Erledigte Schritte werden auf diesem Gerät gemerkt.") : null);
  window.scrollTo(0, 0);
}

let loadError = null;
function route() {
  if (location.hash.startsWith("#/admin")) return window.Admin.render();
  if (loadError) return show(el("p", { class: "muted center" }, `links.json konnte nicht geladen werden (${loadError}).`));
  if (!data) return;
  const m = location.hash.match(/^#\/app\/(.+)$/);
  m ? renderApp(decodeURIComponent(m[1])) : renderHome();
}

window.addEventListener("hashchange", route);
if (location.hash.startsWith("#/admin")) route();
fetch("links.json", { cache: "no-cache" })
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then((json) => { data = json; })
  .catch((e) => { loadError = e.message; })
  .finally(() => { if (!location.hash.startsWith("#/admin")) route(); });
