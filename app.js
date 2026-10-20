// Linkseite: liest links.json und baut Startseite + App-Anleitungen (#/app/<id>).
const root = document.getElementById("app");
let data;

const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null) n.append(kid);
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
const show = (...kids) => root.replaceChildren(...kids.filter((k) => k != null));

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

function renderHome() {
  const p = data.profile || {};
  document.title = p.name || "Links";
  const sections = (data.sections || []).map((s) =>
    el("section", {},
      el("h2", {}, s.title),
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
    el("header", { class: "profile" },
      p.avatar ? el("img", { src: p.avatar, alt: "" }) : null,
      el("h1", {}, p.name || ""),
      p.bio ? el("p", {}, p.bio) : null),
    ...sections,
    apps,
    data.footer ? el("footer", {}, data.footer) : null);
}

const platformsLabel = (a) =>
  [a.android && "Android", a.ios && "iOS"].filter(Boolean).join(" · ") + " – Tester werden";

function stepsFor(app, platform) {
  if (platform === "android") {
    const a = app.android;
    return [
      { title: "Google-Gruppe beitreten",
        text: `Tritt der Gruppe ${a.groupName ? `„${a.groupName}“` : ""} mit deinem Google-Konto bei, das du im Play Store nutzt.`,
        url: a.groupUrl, button: "Zur Gruppe" },
      { title: "Tester werden",
        text: "Öffne den Link und tippe auf „Tester werden“. Es kann ein paar Minuten dauern, bis es aktiv ist.",
        url: a.testerUrl, button: "Tester werden" },
      { title: "App herunterladen",
        text: "Installiere die Testversion aus dem Play Store.",
        url: a.storeUrl, button: "Zum Play Store" },
    ];
  }
  const i = app.ios;
  return [
    { title: "TestFlight installieren",
      text: "Lade Apples kostenlose TestFlight-App aus dem App Store.",
      url: i.testflightAppUrl || "https://apps.apple.com/app/testflight/id899247664", button: "TestFlight laden" },
    { title: "Einladung annehmen",
      text: "Öffne den Einladungslink und tippe in TestFlight auf „Akzeptieren“.",
      url: i.testflightUrl, button: "Einladung öffnen" },
    { title: "App installieren",
      text: "Tippe in TestFlight bei der App auf „Installieren“. Fertig!",
      url: null },
  ];
}

function renderApp(id) {
  const app = (data.apps || []).find((a) => a.id === id);
  if (!app) { location.hash = ""; return; }
  document.title = `${app.name} testen`;

  const available = ["android", "ios"].filter((p) => app[p]);
  const saved = store.get("platform");
  let platform = [detectPlatform(), saved].find((p) => available.includes(p)) || available[0];
  const doneKey = (p) => `done:${app.id}:${p}`;

  const toggle = el("div", { class: "toggle", role: "group", "aria-label": "Plattform wählen" });
  const list = el("ol", { class: "steps" });

  const draw = () => {
    toggle.replaceChildren(...["android", "ios"].map((p) =>
      el("button", {
        type: "button",
        "aria-pressed": String(p === platform),
        disabled: !app[p],
        title: app[p] ? null : "Für diese Plattform nicht verfügbar",
        onclick: () => { platform = p; store.set("platform", p); draw(); },
      }, p === "android" ? "Android" : "iOS")));

    const done = new Set(store.get(doneKey(platform)) || []);
    list.replaceChildren(...stepsFor(app, platform).map((s, i) =>
      el("li", { class: "step" + (done.has(i) ? " done" : "") },
        el("span", { class: "num" }, done.has(i) ? "✓" : String(i + 1)),
        el("div", {},
          el("h3", {}, s.title),
          el("p", {}, s.text),
          s.url ? el("a", {
            class: "btn", href: s.url, target: "_blank", rel: "noopener",
            onclick: () => { done.add(i); store.set(doneKey(platform), [...done]); setTimeout(draw, 300); },
          }, s.button) : null))));
  };
  draw();

  show(
    el("a", { class: "back", href: "#" }, "← Zurück"),
    el("div", { class: "app-head" }, icon(app.icon), el("h1", {}, app.name)),
    app.description ? el("p", { class: "app-desc" }, app.description) : el("div", { style: "height:16px" }),
    available.length > 1 ? toggle : null,
    list,
    el("p", { class: "hint" }, "Erledigte Schritte werden auf diesem Gerät gemerkt."));
  window.scrollTo(0, 0);
}

function route() {
  const m = location.hash.match(/^#\/app\/(.+)$/);
  m ? renderApp(decodeURIComponent(m[1])) : renderHome();
}

fetch("links.json", { cache: "no-cache" })
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then((json) => { data = json; route(); window.addEventListener("hashchange", route); })
  .catch((e) => {
    root.replaceChildren(el("p", { class: "muted center" }, `links.json konnte nicht geladen werden (${e.message}).`));
  });
