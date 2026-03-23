# Klinik Wyss — Website (Node.js)

Express liefert statische Dateien aus `public/`. Für **Hostinger** (Node.js + GitHub):

## Lokales Testen

```bash
npm install
npm start
```

Standard: <http://localhost:3000> — Health-Check: <http://localhost:3000/api/health>

## Projektstruktur

| Pfad | Zweck |
|------|--------|
| `server.js` | Express-Server, `PORT` aus Umgebung |
| `public/` | Öffentliche Website (HTML, CSS, Bilder) |
| `public/index.html` | Startseite |
| `public/css/` | Stylesheets |
| `public/images/` | Bilder |

## Hostinger (GitHub-Deploy)

1. Repository mit diesem Inhalt verbinden (Root = Repo-Wurzel, wo `package.json` liegt).
2. **Install-Befehl:** `npm install` (oder `npm ci`, wenn `package-lock.json` committed ist).
3. **Start-Befehl:** `npm start` — Hostinger setzt `PORT` automatisch; `server.js` liest `process.env.PORT`.
4. Node-Version: mindestens **18** (siehe `package.json` → `engines`).

Falls im Panel ein eigener Build-Schritt nötig ist und kein Build vorhanden ist: Build leer lassen oder nur `npm install` nutzen — es gibt kein separates `npm run build`.
