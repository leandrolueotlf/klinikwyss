# Klinik Wyss — Node.js / Express

Express-App mit **Digitale Behandlungsplanung** (SQLite, EJS, Tailwind per CDN).

## INES-Modul

Alle Routen sind unter einem **Basis-Pfad** gebunden (Standard **`/pkw-demo`**), damit die App z. B. in INES als Unterpfad eingebunden werden kann.

Aufruf mit Query-Parametern:

`/pkw-demo/plan?fallnr=<Fallnummer>&user=<Kürzel>`

Beispiel: `/pkw-demo/plan?fallnr=123&user=m.jungi`

- **Anpassen:** Umgebungsvariable `BASE_PATH` (siehe `.env.example`). `BASE_PATH=/` legt die App an der Wurzel ab.
- **Ohne `fallnr`:** Hinweis „Kein Patient ausgewählt“.
- **Startseite:** `http://localhost:3000/` leitet auf `/pkw-demo/` weiter (lokal).

## Lokales Testen

```bash
npm install
npm start
```

- Startseite: <http://localhost:3000> → `/pkw-demo/`
- Planung (Demo): <http://localhost:3000/pkw-demo/plan?fallnr=DEMO&user=demo>
- Health: <http://localhost:3000/pkw-demo/api/health>

Die SQLite-Datei liegt unter `data/planungen.db` (nicht im Repo; Ordner `data/` ist versioniert mit `.gitkeep`). Optional: `DB_PATH=/pfad/zur/db` setzen.

## Hostinger (GitHub)

- **Install:** `npm install`
- **Build:** `npm run build` (legt `data/` an; kein Frontend-Bundle)
- **Start:** `npm start`
- **Node:** ≥ 18
- **Root-Verzeichnis (Repository root):** Ordner mit `package.json` und `server.js` (oft `/` oder leer = Repo-Wurzel).
- **Output Directory / Ausgabeordner / Publish directory:** **Leer lassen** bzw. nicht auf einen Ordner wie `dist` oder `build` setzen, **es sei denn**, ihr erzeugt dort wirklich Dateien. Dieses Projekt ist eine **Server-App ohne statischen Export-Ordner** — ein fiktiver oder falscher Output-Pfad kann Deploy oder Routing stören. In der Oberfläche oft als `null` oder leer angezeigt; das ist **in Ordnung**, solange kein nicht existierender Pfad eingetragen ist.

Falls das Panel einen **Build-Befehl** erwartet, muss `npm run build` existieren — sonst schlägt der Deploy mit „Missing script: build“ fehl.

`sqlite3` ist ein natives Modul; wenn **npm install** auf dem Server scheitert, mit dem Support klären, ob native Addons erlaubt sind.

### 503 Service Unavailable

Die Seite lädt, aber **503** heißt meist: die Node-App **läuft nicht** oder **stürzt beim Start ab**.

1. **Hostinger → Node-App → Logs** öffnen: Steht dort ein Fehler (z. B. `sqlite3`, `EADDRINUSE`, `Cannot find module`)?
2. **Start-Befehl:** `npm start` (führt `node server.js` aus).
3. **Projekt-Root:** Ordner, in dem `package.json` und `server.js` liegen (bei dir das Repo-Root mit diesen Dateien).
4. **Umgebungsvariablen:** `PORT` setzt Hostinger automatisch — nicht überschreiben. Optional: `BASE_PATH=/pkw-demo` (falls abweichend).
5. **SQLite-Schreibzugriff:** Die App legt `data/planungen.db` an — falls der Prozess dort **nicht schreiben** darf, beim Start Absturz; Logs prüfen.

Der Server bindet an **`0.0.0.0`** (alle Interfaces), damit Hostinger den Prozess erreicht.

## Projektstruktur

| Datei / Ordner | Inhalt |
|----------------|--------|
| `server.js` | Express, Middleware (`fallnr`), Routen inkl. `POST /plan/fallakte`, `POST /plan/system` |
| `database.js` | SQLite: `fallakten` (Beurteilung, Interprof, Austritt), `planungen` (Ziele/Maßnahmen), `systemgespraeche` |
| `views/index.ejs` | Hauptseite; `views/partials/` Formularabschnitte |
| `public/style.css` | Status-Badges, Formularfelder |
| `data/` | `planungen.db` (lokal, nicht im Repo) |

### Formularbereiche (eine Seite `/plan`)

1. **Beurteilung & Kontext** — psychische Situation, Arbeit, Finanzen, Ziele, Wohnen, Soziales, Erfahrung stationär/ambulant  
2. **Interprofessionelle Planung** — Situationstext, Priorisierungstabelle (1–10), qualitative Fragen  
3. **Behandlungsplan** — tabellarische Zeilen mit Thema, Ziel, Maßnahme, Frist, Evaluation, Status  
4. **Systemgespräche** — eigene Tabelle + Erfassung  
5. **Austrittsplanung** — Angehörige, externe Stellen, Nachsorge, Notfallplan, amb. Themen, Spitex
