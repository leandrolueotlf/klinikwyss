# Klinik Wyss — Node.js / Express

Express-App mit **Digitale Behandlungsplanung** (SQLite, EJS, Tailwind per CDN).

## INES-Modul

Aufruf mit Query-Parametern:

`/plan?fallnr=<Fallnummer>&user=<Kürzel>`

Beispiel: `/plan?fallnr=123&user=m.jungi`

Ohne `fallnr`: Hinweis „Kein Patient ausgewählt“.

## Lokales Testen

```bash
npm install
npm start
```

- Startseite: <http://localhost:3000>
- Planung (Demo): <http://localhost:3000/plan?fallnr=DEMO&user=demo>
- Health: <http://localhost:3000/api/health>

Die SQLite-Datei liegt unter `data/planungen.db` (nicht im Repo; Ordner `data/` ist versioniert mit `.gitkeep`). Optional: `DB_PATH=/pfad/zur/db` setzen.

## Hostinger (GitHub)

- **Install:** `npm install`
- **Start:** `npm start`
- **Node:** ≥ 18

`sqlite3` ist ein natives Modul; auf dem Hostinger-Node-Stack sollte die Installation über `npm install` funktionieren. Falls der Build fehlschlägt, mit dem Support klären, ob native Addons erlaubt sind.

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
