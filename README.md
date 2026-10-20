# Linktree

Kleine, statische Linkseite für meine Webseiten und Testapps. Kein Build, kein Server. Inhalte stehen in `links.json` und werden **direkt auf der Seite** bearbeitet.

## Bearbeiten (mit PIN)

Unten auf der Startseite auf 🔒 tippen (oder `…/#/admin` öffnen).

**Einmalig einrichten:**
1. Auf GitHub einen [Fine-grained Token](https://github.com/settings/personal-access-tokens/new) erstellen:
   *Repository access* → nur `linktree`, *Permissions* → **Contents: Read and write**.
2. Auf der Seite Token eingeben und eine PIN (mind. 6 Zeichen) wählen.

Der Token wird mit der PIN verschlüsselt (PBKDF2 + AES-GCM) als `admin.json` im Repo gespeichert. Danach reicht auf jedem Gerät die PIN. „Speichern“ schreibt `links.json` ins Repo, nach 1–2 Minuten ist die Änderung online.

Hinweis: `admin.json` ist öffentlich lesbar. Eine längere PIN bzw. ein Passwort schützt besser gegen Durchprobieren. Der Token darf nur dieses Repo ändern. Läuft er ab: „Zugang/PIN ändern“.

## Testapps

Pro App einstellbar:
- **Android:** Play-Test (1. Google-Gruppe → 2. Tester werden → 3. Play Store) · Web-App · kein Android
- **iOS:** TestFlight · Web-App (Anleitung „Zum Home-Bildschirm“) · kein iOS

Die Plattform wird anhand des Geräts vorausgewählt. Jede App hat einen teilbaren Link: `…/#/app/<id>`.

## Eigene Domain (chaoten.online)

1. GitHub → Repo → Settings → Pages → *Source*: **GitHub Actions**.
2. Unter *Custom domain* die Domain eintragen, danach **Enforce HTTPS** aktivieren.
3. Beim Domain-Anbieter DNS setzen:
   - Subdomain (z. B. `links.chaoten.online`): `CNAME` → `lukasnews.github.io`
   - Hauptdomain `chaoten.online`: `A`-Einträge `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`

## Lokal ansehen

```sh
python3 -m http.server 8000   # dann http://localhost:8000
```

## Raspberry Pi (Alternative)

Repo klonen, Ordner mit nginx/Caddy ausliefern, regelmäßig `git pull` (z. B. per Cron), damit Änderungen aus dem Bearbeiten-Bereich ankommen.
