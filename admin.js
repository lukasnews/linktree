// Bearbeiten-Bereich (#/admin).
// Ein GitHub-Token wird mit der PIN verschlüsselt (PBKDF2 + AES-GCM) in admin.json
// im Repo abgelegt. Mit der PIN wird er entschlüsselt; "Speichern" schreibt
// links.json dann über die GitHub-API ins Repo, GitHub Pages veröffentlicht neu.
window.Admin = (() => {
  const ITERATIONS = 600000;
  const SESSION_KEY = "lt-admin";
  const MIN_PIN = 6;

  let s = null; // { repo, branch, token, data, sha, dirty }
  let msg = null; // { text, type }
  const openSet = new WeakSet(); // aufgeklappte Einträge merken

  // ---------- Helfer ----------
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
  const utf8ToB64 = (text) => {
    const bytes = enc.encode(text);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const b64ToUtf8 = (str) => dec.decode(unb64(str.replace(/\s/g, "")));

  async function deriveKey(pin, salt, iterations) {
    const base = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }

  async function encryptToken(token, pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pin, salt, ITERATIONS);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(token));
    return { iterations: ITERATIONS, salt: b64(salt), iv: b64(iv), token: b64(ct) };
  }

  async function decryptToken(cfg, pin) {
    const key = await deriveKey(pin, unb64(cfg.salt), cfg.iterations);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(cfg.iv) }, key, unb64(cfg.token));
    return dec.decode(pt);
  }

  async function gh(repo, token, path, opts = {}) {
    const r = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      const e = new Error(body.message || `HTTP ${r.status}`);
      e.status = r.status;
      throw e;
    }
    return r.json();
  }

  async function getFile(repo, branch, token, path) {
    try {
      const f = await gh(repo, token, `contents/${path}?ref=${encodeURIComponent(branch)}`);
      return { text: b64ToUtf8(f.content), sha: f.sha };
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  async function putFile(repo, branch, token, path, text, sha, message) {
    const res = await gh(repo, token, `contents/${path}`, {
      method: "PUT",
      body: JSON.stringify({ message, content: utf8ToB64(text), branch, ...(sha ? { sha } : {}) }),
    });
    return res.content.sha;
  }

  const slug = (t) => (t || "").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  // Fehlende Felder ergänzen, damit das Formular immer vollständig ist
  function normalize(d) {
    d.profile ||= {};
    d.sections ||= [];
    d.apps ||= [];
    for (const sec of d.sections) sec.links ||= [];
    for (const a of d.apps) {
      a.android = a.android ? { mode: "play", ...a.android } : { mode: "none" };
      a.ios = a.ios ? { mode: "testflight", ...a.ios } : { mode: "none" };
    }
    return d;
  }

  // Leere Felder und abgeschaltete Plattformen entfernen
  function clean(d) {
    const strip = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v != null));
    const out = JSON.parse(JSON.stringify(d));
    out.profile = strip(out.profile);
    out.sections = out.sections.map((sec) => ({ ...strip(sec), links: sec.links.map(strip) }));
    out.apps = out.apps.map((a) => {
      const app = strip(a);
      for (const p of ["android", "ios"]) {
        if (!a[p] || a[p].mode === "none") { delete app[p]; continue; }
        const keep = { play: ["groupName", "groupUrl", "testerUrl", "storeUrl"], testflight: ["testflightUrl"], web: ["url"] }[a[p].mode];
        app[p] = strip({ mode: a[p].mode, ...Object.fromEntries(keep.map((k) => [k, a[p][k]])) });
      }
      return app;
    });
    for (const k of ["appsTitle", "footer"]) if (!out[k]) delete out[k];
    return out;
  }

  function validate(d) {
    const errors = [];
    const ids = new Set();
    d.sections.forEach((sec) => sec.links.forEach((l) => {
      if (!l.title) errors.push("Ein Link hat keinen Namen.");
      if (!l.url) errors.push(`Link „${l.title || "?"}“ hat keine URL.`);
    }));
    for (const a of d.apps) {
      if (!a.name) errors.push("Eine App hat keinen Namen.");
      a.id = slug(a.id || a.name);
      if (ids.has(a.id)) errors.push(`App-ID „${a.id}“ kommt doppelt vor.`);
      ids.add(a.id);
      const need = { play: ["groupUrl", "testerUrl", "storeUrl"], testflight: ["testflightUrl"], web: ["url"], none: [] };
      for (const p of ["android", "ios"])
        for (const k of need[a[p].mode])
          if (!a[p][k]) errors.push(`${a.name || "App"}: ${p === "android" ? "Android" : "iOS"} – Link fehlt.`);
    }
    return [...new Set(errors)];
  }

  const setMsg = (text, type = "ok") => { msg = text ? { text, type } : null; };
  const markDirty = () => {
    s.dirty = true;
    const b = document.getElementById("save-btn");
    if (b) b.disabled = false;
  };

  window.addEventListener("beforeunload", (e) => { if (s?.dirty) e.preventDefault(); });

  // ---------- Formular-Bausteine ----------
  const field = (label, obj, key, opts = {}) =>
    el("label", { class: "field" },
      el("span", {}, label),
      el("input", {
        type: opts.type || "text", value: obj[key] ?? "", placeholder: opts.placeholder || "",
        inputmode: opts.inputmode, autocomplete: "off",
        oninput: (e) => { obj[key] = e.target.value; markDirty(); opts.onInput?.(e.target.value); },
      }));

  const select = (label, value, options, onChange) =>
    el("label", { class: "field" },
      el("span", {}, label),
      el("select", { onchange: (e) => onChange(e.target.value) },
        options.map(([v, t]) => el("option", { value: v, selected: v === value }, t))));

  const moveBtns = (arr, i) => el("div", { class: "row-actions" },
    el("button", { type: "button", class: "ghost", disabled: i === 0, "aria-label": "Nach oben",
      onclick: () => { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; markDirty(); draw(); } }, "↑"),
    el("button", { type: "button", class: "ghost", disabled: i === arr.length - 1, "aria-label": "Nach unten",
      onclick: () => { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; markDirty(); draw(); } }, "↓"),
    el("button", { type: "button", class: "ghost danger", "aria-label": "Löschen",
      onclick: () => { if (confirm("Wirklich löschen?")) { arr.splice(i, 1); markDirty(); draw(); } } }, "Löschen"));

  const card = (obj, summary, body) => {
    const d = el("details", { class: "edit-card", open: openSet.has(obj),
      ontoggle: (e) => (e.target.open ? openSet.add(obj) : openSet.delete(obj)) },
      el("summary", {}, summary), el("div", { class: "edit-body" }, body));
    return d;
  };

  const liveTitle = (fallback) => {
    const span = el("span", {}, fallback);
    return [span, (v) => { span.textContent = v || "Ohne Namen"; }];
  };

  function linkEditor(links, l, i) {
    const [title, update] = liveTitle(l.title || "Neuer Link");
    return card(l, [l.icon ? `${l.icon} ` : "", title], [
      field("Name", l, "title", { onInput: update }),
      field("URL", l, "url", { type: "url", placeholder: "https://…" }),
      field("Beschreibung (optional)", l, "description"),
      field("Icon (Emoji oder Bild-URL)", l, "icon"),
      moveBtns(links, i),
    ]);
  }

  function platformFields(app, p) {
    const c = app[p];
    if (c.mode === "play") return [
      field("Name der Google-Gruppe", c, "groupName", { placeholder: "meine-app-tester" }),
      field("1 · Link zur Google-Gruppe", c, "groupUrl", { type: "url", placeholder: "https://groups.google.com/g/…" }),
      field("2 · Link „Tester werden“", c, "testerUrl", { type: "url", placeholder: "https://play.google.com/apps/testing/…" }),
      field("3 · Play-Store-Link", c, "storeUrl", { type: "url", placeholder: "https://play.google.com/store/apps/details?id=…" }),
    ];
    if (c.mode === "testflight") return [
      field("TestFlight-Einladungslink", c, "testflightUrl", { type: "url", placeholder: "https://testflight.apple.com/join/…" }),
    ];
    if (c.mode === "web") return [field("Web-App-URL", c, "url", { type: "url", placeholder: "https://…" })];
    return [];
  }

  function appEditor(app, i) {
    const [title, update] = liveTitle(app.name || "Neue App");
    const modeSelect = (p, label, opts) => select(label, app[p].mode, opts, (v) => { app[p].mode = v; markDirty(); draw(); });
    return card(app, [app.icon ? `${app.icon} ` : "", title], [
      field("Name", app, "name", { onInput: update }),
      field("Beschreibung (optional)", app, "description"),
      field("Icon (Emoji oder Bild-URL)", app, "icon"),
      field("Kurz-ID für den Link (optional)", app, "id", { placeholder: slug(app.name) || "meine-app" }),
      el("div", { class: "platform" },
        modeSelect("android", "Android", [["play", "Play-Test (Gruppe → Tester → Store)"], ["web", "Web-App"], ["none", "Kein Android"]]),
        platformFields(app, "android")),
      el("div", { class: "platform" },
        modeSelect("ios", "iOS", [["testflight", "TestFlight"], ["web", "Web-App"], ["none", "Kein iOS"]]),
        platformFields(app, "ios")),
      moveBtns(s.data.apps, i),
    ]);
  }

  // ---------- Seiten ----------
  const message = () => (msg ? el("p", { class: `msg ${msg.type}` }, msg.text) : null);

  function page(...kids) {
    show(el("a", { class: "back", href: "#", onclick: (e) => {
      if (s?.dirty && !confirm("Ungespeicherte Änderungen verwerfen?")) e.preventDefault();
      else if (s) s.dirty = false;
    } }, "← Zur Seite"), ...kids);
  }

  async function loadData() {
    const f = await getFile(s.repo, s.branch, s.token, "links.json");
    s.data = normalize(f ? JSON.parse(f.text) : {});
    s.sha = f?.sha;
    s.dirty = false;
  }

  async function render() {
    document.title = "Bearbeiten";
    if (s?.data) return draw();

    // Bereits in diesem Tab entsperrt?
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      if (saved?.token) {
        s = saved;
        page(el("p", { class: "muted" }, "Lädt…"));
        try { await loadData(); return draw(); } catch { s = null; sessionStorage.removeItem(SESSION_KEY); }
      }
    } catch {}

    page(el("p", { class: "muted" }, "Lädt…"));
    let cfg = null;
    try {
      const r = await fetch("admin.json", { cache: "no-store" });
      if (r.ok) cfg = await r.json();
    } catch {}
    cfg?.token ? drawPin(cfg) : drawSetup();
  }

  function drawPin(cfg) {
    const input = el("input", { type: "password", inputmode: "numeric", autocomplete: "current-password", placeholder: "PIN" });
    const btn = el("button", { type: "submit", class: "btn" }, "Entsperren");
    page(
      el("h1", {}, "Bearbeiten"),
      el("form", { class: "stack", onsubmit: async (e) => {
        e.preventDefault();
        btn.disabled = true; btn.textContent = "Prüfe…";
        try {
          const token = await decryptToken(cfg, input.value);
          s = { repo: cfg.repo, branch: cfg.branch, token, cfg };
          await loadData();
          sessionStorage.setItem(SESSION_KEY, JSON.stringify({ repo: s.repo, branch: s.branch, token, cfg }));
          setMsg(null);
          draw();
        } catch (err) {
          s = null;
          setMsg(err.name === "OperationError" ? "Falsche PIN." : `Fehler: ${err.message}`, "err");
          drawPin(cfg);
        }
      } }, message(), input, btn));
    input.focus();
  }

  function drawSetup(existing) {
    const f = {
      repo: existing?.repo || "lukasnews/linktree",
      branch: existing?.branch || "main",
      token: "", pin: "", pin2: "",
    };
    const btn = el("button", { type: "submit", class: "btn" }, existing ? "Zugang speichern" : "Einrichten");
    const inp = (label, key, type = "text", extra = {}) => el("label", { class: "field" }, el("span", {}, label),
      el("input", { type, value: f[key], autocomplete: "off", ...extra, oninput: (e) => { f[key] = e.target.value; } }));

    page(
      el("h1", {}, existing ? "Zugang ändern" : "Einrichten"),
      el("p", { class: "muted small" },
        "Einmalig nötig: Erstelle auf GitHub unter Settings → Developer settings → ",
        el("a", { href: "https://github.com/settings/personal-access-tokens/new", target: "_blank", rel: "noopener" }, "Fine-grained tokens"),
        " einen Token nur für dieses Repo mit der Berechtigung „Contents: Read and write“. ",
        "Er wird mit deiner PIN verschlüsselt im Repo gespeichert."),
      el("form", { class: "stack", onsubmit: async (e) => {
        e.preventDefault();
        const token = f.token.trim() || (existing && s?.token);
        if (!token) return (setMsg("Bitte Token eingeben.", "err"), drawSetup(existing));
        if (f.pin.length < MIN_PIN) return (setMsg(`Die PIN braucht mindestens ${MIN_PIN} Zeichen.`, "err"), drawSetup(existing));
        if (f.pin !== f.pin2) return (setMsg("Die PINs stimmen nicht überein.", "err"), drawSetup(existing));
        btn.disabled = true; btn.textContent = "Speichere…";
        try {
          // Token prüfen und admin.json schreiben
          const old = await getFile(f.repo, f.branch, token, "admin.json");
          const cfg = { repo: f.repo, branch: f.branch, ...(await encryptToken(token, f.pin)) };
          await putFile(f.repo, f.branch, token, "admin.json", JSON.stringify(cfg, null, 2) + "\n", old?.sha, "Zugang für Bearbeiten aktualisiert");
          s = { repo: f.repo, branch: f.branch, token, cfg };
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
          await loadData();
          setMsg("Zugang gespeichert. Ab jetzt reicht die PIN.");
          draw();
        } catch (err) {
          setMsg(err.status === 401 ? "Token ungültig." : err.status === 404 ? "Repo oder Branch nicht gefunden (oder Token hat keinen Zugriff)." : `Fehler: ${err.message}`, "err");
          drawSetup(existing);
        }
      } },
        message(),
        inp("Repository", "repo"),
        inp("Branch", "branch"),
        inp(existing ? "Neuer Token (leer = behalten)" : "GitHub-Token", "token", "password"),
        inp(`PIN (mind. ${MIN_PIN} Zeichen)`, "pin", "password", { inputmode: "numeric" }),
        inp("PIN wiederholen", "pin2", "password", { inputmode: "numeric" }),
        btn));
  }

  async function save() {
    const errors = validate(s.data);
    if (errors.length) { setMsg(errors.join(" "), "err"); return draw(); }
    const btn = document.getElementById("save-btn");
    btn.disabled = true; btn.textContent = "Speichere…";
    try {
      const text = JSON.stringify(clean(s.data), null, 2) + "\n";
      s.sha = await putFile(s.repo, s.branch, s.token, "links.json", text, s.sha, "Links aktualisiert");
      s.dirty = false;
      setMsg("Gespeichert. In 1–2 Minuten ist es online.");
    } catch (err) {
      setMsg(err.status === 409
        ? "Die Datei wurde inzwischen woanders geändert. Bitte Seite neu laden."
        : `Speichern fehlgeschlagen: ${err.message}`, "err");
    }
    draw();
  }

  function draw() {
    const d = s.data;
    const toolbar = el("div", { class: "toolbar" },
      el("button", { id: "save-btn", type: "button", class: "btn", disabled: !s.dirty, onclick: save }, "Speichern"),
      el("button", { type: "button", class: "ghost", onclick: () => { setMsg(null); drawSetup(s); } }, "Zugang/PIN ändern"),
      el("button", { type: "button", class: "ghost", onclick: () => {
        if (s.dirty && !confirm("Ungespeicherte Änderungen verwerfen?")) return;
        sessionStorage.removeItem(SESSION_KEY); s = null; setMsg(null); location.hash = "";
      } }, "Abmelden"));

    page(
      el("h1", {}, "Bearbeiten"),
      toolbar,
      message(),

      el("h2", {}, "Profil"),
      el("div", { class: "edit-card plain" }, el("div", { class: "edit-body" },
        field("Name", d.profile, "name"),
        field("Untertitel", d.profile, "bio"),
        field("Profilbild (URL)", d.profile, "avatar", { placeholder: "assets/avatar.svg" }))),

      d.sections.map((sec, si) => el("section", {},
        el("div", { class: "section-head" },
          el("input", { class: "section-title", value: sec.title || "", placeholder: "Abschnitt",
            oninput: (e) => { sec.title = e.target.value; markDirty(); } }),
          el("button", { type: "button", class: "ghost danger", onclick: () => {
            if (confirm(`Abschnitt „${sec.title || ""}“ mit allen Links löschen?`)) { d.sections.splice(si, 1); markDirty(); draw(); }
          } }, "Löschen")),
        el("div", { class: "list" }, sec.links.map((l, i) => linkEditor(sec.links, l, i))),
        el("button", { type: "button", class: "add", onclick: () => {
          const l = { title: "", url: "", icon: "🔗" }; sec.links.push(l); openSet.add(l); markDirty(); draw();
        } }, "+ Link"))),
      el("button", { type: "button", class: "add", onclick: () => {
        d.sections.push({ title: "Neuer Abschnitt", links: [] }); markDirty(); draw();
      } }, "+ Abschnitt"),

      el("section", {},
        el("div", { class: "section-head" },
          el("input", { class: "section-title", value: d.appsTitle || "", placeholder: "Testapps",
            oninput: (e) => { d.appsTitle = e.target.value; markDirty(); } })),
        el("div", { class: "list" }, d.apps.map((a, i) => appEditor(a, i))),
        el("button", { type: "button", class: "add", onclick: () => {
          const a = { id: "", name: "", icon: "📱", android: { mode: "play" }, ios: { mode: "web" } };
          d.apps.push(a); openSet.add(a); markDirty(); draw();
        } }, "+ App")),

      el("h2", {}, "Fußzeile"),
      el("div", { class: "edit-card plain" }, el("div", { class: "edit-body" },
        field("Text (optional)", d, "footer"))));
  }

  return { render };
})();
