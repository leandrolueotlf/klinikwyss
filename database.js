const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dataDir = path.join(__dirname, "data");
const dbPath = process.env.DB_PATH || path.join(dataDir, "planungen.db");

const STATUS_VALUES = ["Offen", "In Arbeit", "Erledigt"];

let db;

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function tableInfo(name) {
  const rows = await all(`PRAGMA table_info(${name})`);
  return new Set(rows.map((r) => r.name));
}

async function ensureColumn(table, name, ddl) {
  const cols = await tableInfo(table);
  if (!cols.has(name)) await run(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

async function migrate() {
  await ensureColumn("planungen", "thema", "thema TEXT DEFAULT ''");
  await ensureColumn("planungen", "bis_wann", "bis_wann TEXT DEFAULT ''");
  await ensureColumn("planungen", "evaluation", "evaluation TEXT DEFAULT ''");
  await ensureColumn(
    "planungen",
    "letzte_aenderung_von",
    "letzte_aenderung_von TEXT DEFAULT ''"
  );
  await ensureColumn(
    "planungen",
    "letzte_aenderung_am",
    "letzte_aenderung_am TEXT DEFAULT ''"
  );
  await ensureColumn(
    "fallakten",
    "section_audit_json",
    "section_audit_json TEXT DEFAULT '{}'"
  );
  await ensureColumn(
    "systemgespraeche",
    "ersteller",
    "ersteller TEXT DEFAULT ''"
  );
}

function emptyFallakte(fallnr) {
  const t = (v) => (v == null ? "" : String(v));
  return {
    fallnr: t(fallnr),
    updated_at: new Date().toISOString(),
    aust_angehoerige_welche: "",
    aust_angehoerige_kontakt: "",
    aust_externe_stellen: "",
    aust_nachsorg_wer: "",
    aust_nachsorg_ersttermin: "",
    aust_weitere_unterstuetzung: "",
    aust_notfallplan: 0,
    aust_amb_thema1: "",
    aust_amb_thema2: "",
    aust_amb_thema3: "",
    aust_spezielles: "",
    aust_spitex_wer: "",
    aust_spitex_ersttermin: "",
    psy_eintritt: "",
    psy_symptome: "",
    psy_somatik: "",
    psy_noxen: "",
    psy_bewaeltigung: "",
    psy_bedeutung: "",
    psy_risiko: "",
    psy_besonderheiten: "",
    arbeit_beruf: "",
    arbeit_grad: "",
    finanz_situation: "",
    finanz_schulden: "",
    finanz_sozialhilfe: "",
    ziele_wuenschen: "",
    ziele_aenderung: "",
    wohn_situation: "",
    sozial_situation: "",
    sozial_bezug: "",
    sozial_stellen: "",
    erf_stationaer: "",
    erf_ambulant: "",
    erf_netz: "",
    ip_situation_zusammenfassung: "",
    ip_priorisierung_json: "[]",
    ip_gemeinsam_verstaendnis: "",
    ip_ressourcen: "",
    ip_bedarf: "",
    ip_pflege: "",
    section_audit_json: "{}",
  };
}

function str(body, key) {
  if (!body || body[key] == null) return "";
  return String(body[key]);
}

function parsePriorisierungFromBody(body) {
  const indices = new Set();
  if (body && typeof body === "object") {
    Object.keys(body).forEach((k) => {
      const m = k.match(/^prio_(\d+)_problem$/);
      if (m) indices.add(Number(m[1]));
    });
  }
  const max = indices.size ? Math.max(...indices) : -1;
  const rows = [];
  for (let i = 0; i <= max; i += 1) {
    rows.push({
      problem: str(body, `prio_${i}_problem`),
      leiden: str(body, `prio_${i}_leiden`),
      alltag: str(body, `prio_${i}_alltag`),
      kontrolle: str(body, `prio_${i}_kontrolle`),
    });
  }
  return JSON.stringify(rows);
}

function parsePriorisierungJson(raw) {
  try {
    const j = JSON.parse(raw || "[]");
    if (!Array.isArray(j)) return [emptyPrioRow()];
    if (j.length === 0) return [emptyPrioRow()];
    return j.map((r) => ({
      problem: r && r.problem != null ? String(r.problem) : "",
      leiden: r && r.leiden != null ? String(r.leiden) : "",
      alltag: r && r.alltag != null ? String(r.alltag) : "",
      kontrolle: r && r.kontrolle != null ? String(r.kontrolle) : "",
    }));
  } catch {
    return [emptyPrioRow()];
  }
}

function emptyPrioRow() {
  return { problem: "", leiden: "", alltag: "", kontrolle: "" };
}

async function init() {
  console.log(
    "[db] cwd=%s __dirname=%s dataDir=%s dbPath=%s",
    process.cwd(),
    __dirname,
    dataDir,
    dbPath
  );
  try {
    ensureDataDir();
  } catch (e) {
    console.error("[db] data-Verzeichnis nicht anlegbar:", e.message);
    throw e;
  }
  await new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error("[db] SQLite öffnen fehlgeschlagen:", err.message);
        reject(err);
      } else resolve();
    });
  });

  await run(`
    CREATE TABLE IF NOT EXISTS planungen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fallnr TEXT NOT NULL,
      ersteller TEXT NOT NULL,
      datum TEXT NOT NULL,
      ziel TEXT NOT NULL,
      massnahme TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Offen'
        CHECK (status IN ('Offen', 'In Arbeit', 'Erledigt'))
    )
  `);

  await migrate();

  await run(`
    CREATE TABLE IF NOT EXISTS fallakten (
      fallnr TEXT PRIMARY KEY,
      updated_at TEXT NOT NULL,
      aust_angehoerige_welche TEXT,
      aust_angehoerige_kontakt TEXT,
      aust_externe_stellen TEXT,
      aust_nachsorg_wer TEXT,
      aust_nachsorg_ersttermin TEXT,
      aust_weitere_unterstuetzung TEXT,
      aust_notfallplan INTEGER DEFAULT 0,
      aust_amb_thema1 TEXT,
      aust_amb_thema2 TEXT,
      aust_amb_thema3 TEXT,
      aust_spezielles TEXT,
      aust_spitex_wer TEXT,
      aust_spitex_ersttermin TEXT,
      psy_eintritt TEXT,
      psy_symptome TEXT,
      psy_somatik TEXT,
      psy_noxen TEXT,
      psy_bewaeltigung TEXT,
      psy_bedeutung TEXT,
      psy_risiko TEXT,
      psy_besonderheiten TEXT,
      arbeit_beruf TEXT,
      arbeit_grad TEXT,
      finanz_situation TEXT,
      finanz_schulden TEXT,
      finanz_sozialhilfe TEXT,
      ziele_wuenschen TEXT,
      ziele_aenderung TEXT,
      wohn_situation TEXT,
      sozial_situation TEXT,
      sozial_bezug TEXT,
      sozial_stellen TEXT,
      erf_stationaer TEXT,
      erf_ambulant TEXT,
      erf_netz TEXT,
      ip_situation_zusammenfassung TEXT,
      ip_priorisierung_json TEXT,
      ip_gemeinsam_verstaendnis TEXT,
      ip_ressourcen TEXT,
      ip_bedarf TEXT,
      ip_pflege TEXT,
      section_audit_json TEXT DEFAULT '{}'
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS systemgespraeche (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fallnr TEXT NOT NULL,
      ziele_thema TEXT,
      wann TEXT,
      beteiligte TEXT,
      zusammenfassung TEXT,
      created_at TEXT NOT NULL,
      ersteller TEXT DEFAULT ''
    )
  `);
}

async function getFallakte(fallnr) {
  const row = await get(`SELECT * FROM fallakten WHERE fallnr = ?`, [
    String(fallnr),
  ]);
  return row || null;
}

async function saveFallakteMerged(fallnr, patch) {
  const base = (await getFallakte(fallnr)) || emptyFallakte(fallnr);
  const merged = { ...base, ...patch, fallnr: String(fallnr) };
  merged.updated_at = new Date().toISOString();
  if (merged.aust_notfallplan === true || merged.aust_notfallplan === "1") {
    merged.aust_notfallplan = 1;
  } else if (
    merged.aust_notfallplan === false ||
    merged.aust_notfallplan === "0" ||
    merged.aust_notfallplan === ""
  ) {
    merged.aust_notfallplan = 0;
  } else {
    merged.aust_notfallplan = Number(merged.aust_notfallplan) ? 1 : 0;
  }

  if (merged.section_audit_json == null || merged.section_audit_json === "") {
    merged.section_audit_json = "{}";
  }

  await run(
    `INSERT OR REPLACE INTO fallakten (
      fallnr, updated_at,
      aust_angehoerige_welche, aust_angehoerige_kontakt, aust_externe_stellen,
      aust_nachsorg_wer, aust_nachsorg_ersttermin, aust_weitere_unterstuetzung,
      aust_notfallplan, aust_amb_thema1, aust_amb_thema2, aust_amb_thema3,
      aust_spezielles, aust_spitex_wer, aust_spitex_ersttermin,
      psy_eintritt, psy_symptome, psy_somatik, psy_noxen, psy_bewaeltigung, psy_bedeutung, psy_risiko, psy_besonderheiten,
      arbeit_beruf, arbeit_grad, finanz_situation, finanz_schulden, finanz_sozialhilfe,
      ziele_wuenschen, ziele_aenderung, wohn_situation, sozial_situation, sozial_bezug, sozial_stellen,
      erf_stationaer, erf_ambulant, erf_netz,
      ip_situation_zusammenfassung, ip_priorisierung_json,
      ip_gemeinsam_verstaendnis, ip_ressourcen, ip_bedarf, ip_pflege,
      section_audit_json
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )`,
    [
      merged.fallnr,
      merged.updated_at,
      merged.aust_angehoerige_welche,
      merged.aust_angehoerige_kontakt,
      merged.aust_externe_stellen,
      merged.aust_nachsorg_wer,
      merged.aust_nachsorg_ersttermin,
      merged.aust_weitere_unterstuetzung,
      merged.aust_notfallplan,
      merged.aust_amb_thema1,
      merged.aust_amb_thema2,
      merged.aust_amb_thema3,
      merged.aust_spezielles,
      merged.aust_spitex_wer,
      merged.aust_spitex_ersttermin,
      merged.psy_eintritt,
      merged.psy_symptome,
      merged.psy_somatik,
      merged.psy_noxen,
      merged.psy_bewaeltigung,
      merged.psy_bedeutung,
      merged.psy_risiko,
      merged.psy_besonderheiten,
      merged.arbeit_beruf,
      merged.arbeit_grad,
      merged.finanz_situation,
      merged.finanz_schulden,
      merged.finanz_sozialhilfe,
      merged.ziele_wuenschen,
      merged.ziele_aenderung,
      merged.wohn_situation,
      merged.sozial_situation,
      merged.sozial_bezug,
      merged.sozial_stellen,
      merged.erf_stationaer,
      merged.erf_ambulant,
      merged.erf_netz,
      merged.ip_situation_zusammenfassung,
      merged.ip_priorisierung_json,
      merged.ip_gemeinsam_verstaendnis,
      merged.ip_ressourcen,
      merged.ip_bedarf,
      merged.ip_pflege,
      merged.section_audit_json,
    ]
  );
}

function patchFromSection(section, body) {
  const p = {};
  if (section === "austritt") {
    p.aust_angehoerige_welche = str(body, "aust_angehoerige_welche");
    p.aust_angehoerige_kontakt = str(body, "aust_angehoerige_kontakt");
    p.aust_externe_stellen = str(body, "aust_externe_stellen");
    p.aust_nachsorg_wer = str(body, "aust_nachsorg_wer");
    p.aust_nachsorg_ersttermin = str(body, "aust_nachsorg_ersttermin");
    p.aust_weitere_unterstuetzung = str(body, "aust_weitere_unterstuetzung");
    p.aust_notfallplan = body.aust_notfallplan === "1" ? 1 : 0;
    p.aust_amb_thema1 = str(body, "aust_amb_thema1");
    p.aust_amb_thema2 = str(body, "aust_amb_thema2");
    p.aust_amb_thema3 = str(body, "aust_amb_thema3");
    p.aust_spezielles = str(body, "aust_spezielles");
    p.aust_spitex_wer = str(body, "aust_spitex_wer");
    p.aust_spitex_ersttermin = str(body, "aust_spitex_ersttermin");
  } else if (section === "assessment") {
    p.psy_eintritt = str(body, "psy_eintritt");
    p.psy_symptome = str(body, "psy_symptome");
    p.psy_somatik = str(body, "psy_somatik");
    p.psy_noxen = str(body, "psy_noxen");
    p.psy_bewaeltigung = str(body, "psy_bewaeltigung");
    p.psy_bedeutung = str(body, "psy_bedeutung");
    p.psy_risiko = str(body, "psy_risiko");
    p.psy_besonderheiten = str(body, "psy_besonderheiten");
    p.arbeit_beruf = str(body, "arbeit_beruf");
    p.arbeit_grad = str(body, "arbeit_grad");
    p.finanz_situation = str(body, "finanz_situation");
    p.finanz_schulden = str(body, "finanz_schulden");
    p.finanz_sozialhilfe = str(body, "finanz_sozialhilfe");
    p.ziele_wuenschen = str(body, "ziele_wuenschen");
    p.ziele_aenderung = str(body, "ziele_aenderung");
    p.wohn_situation = str(body, "wohn_situation");
    p.sozial_situation = str(body, "sozial_situation");
    p.sozial_bezug = str(body, "sozial_bezug");
    p.sozial_stellen = str(body, "sozial_stellen");
    p.erf_stationaer = str(body, "erf_stationaer");
    p.erf_ambulant = str(body, "erf_ambulant");
    p.erf_netz = str(body, "erf_netz");
  } else if (section === "interprof") {
    p.ip_situation_zusammenfassung = str(body, "ip_situation_zusammenfassung");
    p.ip_priorisierung_json = parsePriorisierungFromBody(body);
    p.ip_gemeinsam_verstaendnis = str(body, "ip_gemeinsam_verstaendnis");
    p.ip_ressourcen = str(body, "ip_ressourcen");
    p.ip_bedarf = str(body, "ip_bedarf");
    p.ip_pflege = str(body, "ip_pflege");
  }
  return p;
}

async function saveFallakteSection(fallnr, section, body) {
  const patch = patchFromSection(section, body);
  const base = (await getFallakte(fallnr)) || emptyFallakte(fallnr);
  let audit = {};
  try {
    audit = JSON.parse(base.section_audit_json || "{}");
  } catch (e) {
    audit = {};
  }
  const by = str(body, "user");
  audit[section] = { by: by || "—", at: new Date().toISOString() };
  patch.section_audit_json = JSON.stringify(audit);
  await saveFallakteMerged(fallnr, patch);
}

function listByFallnr(fallnr) {
  return all(
    `SELECT id, fallnr, ersteller, datum, thema, ziel, massnahme, bis_wann, evaluation, status,
            letzte_aenderung_von, letzte_aenderung_am
     FROM planungen
     WHERE fallnr = ?
     ORDER BY datetime(datum) DESC, id DESC`,
    [String(fallnr)]
  );
}

function create({ fallnr, ersteller, thema, ziel, massnahme, bis_wann, evaluation }) {
  const datum = new Date().toISOString();
  const von = String(ersteller || "");
  return run(
    `INSERT INTO planungen (fallnr, ersteller, datum, thema, ziel, massnahme, bis_wann, evaluation, status, letzte_aenderung_von, letzte_aenderung_am)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Offen', ?, ?)`,
    [
      String(fallnr),
      von,
      datum,
      String(thema || ""),
      String(ziel),
      String(massnahme),
      String(bis_wann || ""),
      String(evaluation || ""),
      von,
      datum,
    ]
  );
}

function updateStatus({ id, fallnr, status, bearbeiter }) {
  if (!STATUS_VALUES.includes(status)) {
    return Promise.reject(new Error("Ungültiger Status"));
  }
  const t = new Date().toISOString();
  return run(
    `UPDATE planungen SET status = ?, letzte_aenderung_von = ?, letzte_aenderung_am = ? WHERE id = ? AND fallnr = ?`,
    [status, String(bearbeiter || ""), t, Number(id), String(fallnr)]
  );
}

function deleteRow({ id, fallnr }) {
  return run(`DELETE FROM planungen WHERE id = ? AND fallnr = ?`, [
    Number(id),
    String(fallnr),
  ]);
}

function listSystemgespraeche(fallnr) {
  return all(
    `SELECT id, fallnr, ziele_thema, wann, beteiligte, zusammenfassung, created_at, ersteller
     FROM systemgespraeche WHERE fallnr = ? ORDER BY id DESC`,
    [String(fallnr)]
  );
}

function createSystemgespraech({
  fallnr,
  ziele_thema,
  wann,
  beteiligte,
  zusammenfassung,
  ersteller,
}) {
  const created_at = new Date().toISOString();
  return run(
    `INSERT INTO systemgespraeche (fallnr, ziele_thema, wann, beteiligte, zusammenfassung, created_at, ersteller)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      String(fallnr),
      String(ziele_thema || ""),
      String(wann || ""),
      String(beteiligte || ""),
      String(zusammenfassung || ""),
      created_at,
      String(ersteller || ""),
    ]
  );
}

function deleteSystemgespraech({ id, fallnr }) {
  return run(`DELETE FROM systemgespraeche WHERE id = ? AND fallnr = ?`, [
    Number(id),
    String(fallnr),
  ]);
}

module.exports = {
  init,
  STATUS_VALUES,
  getFallakte,
  saveFallakteSection,
  parsePriorisierungJson,
  listByFallnr,
  create,
  updateStatus,
  deleteRow,
  listSystemgespraeche,
  createSystemgespraech,
  deleteSystemgespraech,
};
