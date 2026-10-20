# Linktree

Kleine, statische Linkseite für meine Webseiten und Testapps. Kein Build, kein Server – alle Inhalte stehen in **`links.json`**.

## Neue Webseite hinzufügen

In `links.json` unter `sections` → `links` einen Eintrag ergänzen:

```json
{ "title": "Mein Shop", "description": "optional", "url": "https://…", "icon": "🛒" }
```

`icon` ist ein Emoji oder ein Bildpfad (z. B. `assets/shop.png`). Weitere Abschnitte = weitere Objekte in `sections`.

## Neue Testapp hinzufügen

Unter `apps` einen Eintrag ergänzen. `android` oder `ios` kann weggelassen werden, wenn es die App dort nicht gibt.

```json
{
  "id": "meine-app",
  "name": "Meine App",
  "description": "Kurzer Text",
  "icon": "📱",
  "android": {
    "groupName": "meine-app-tester",
    "groupUrl":  "https://groups.google.com/g/meine-app-tester",
    "testerUrl": "https://play.google.com/apps/testing/com.example.app",
    "storeUrl":  "https://play.google.com/store/apps/details?id=com.example.app"
  },
  "ios": {
    "testflightUrl": "https://testflight.apple.com/join/XXXXXXXX"
  }
}
```

Die App-Seite ist direkt teilbar: `https://<seite>/#/app/meine-app`.
Android/iOS wird anhand des Geräts automatisch vorausgewählt und lässt sich umschalten.

## Lokal ansehen

```sh
python3 -m http.server 8000   # dann http://localhost:8000
```

(Direktes Öffnen der `index.html` per Doppelklick funktioniert nicht, weil der Browser `links.json` dann nicht laden darf.)

## Veröffentlichen

**GitHub Pages:** In den Repo-Einstellungen → *Pages* → *Source* auf **GitHub Actions** stellen. Danach wird jeder Push auf `main` automatisch veröffentlicht.

**Raspberry Pi (Alternative):** Repo klonen und den Ordner mit nginx/Caddy ausliefern; Updates per `git pull`.
