const path = require("path");
const express = require("express");
const db = require("./database");

const app = express();
const port = Number(process.env.PORT) || 3000;

/**
 * Basis-Pfad für alle Routen (z. B. INES-Einbettung).
 * Standard: /pkw-demo  →  /pkw-demo/plan?fallnr=…
 * Überschreiben: BASE_PATH=/andere/pfad
 * Root ohne Präfix: BASE_PATH=/
 */
function normalizeBasePath(raw) {
  if (raw === undefined || raw === "") return "/pkw-demo";
  const s = String(raw).trim();
  if (s === "/" || s === "") return "";
  let out = s.startsWith("/") ? s : `/${s}`;
  out = out.replace(/\/$/, "");
  return out;
}

const BASE = normalizeBasePath(process.env.BASE_PATH);

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));

app.locals.basePath = BASE;
app.locals.formatDatum = formatDatum;
app.locals.statusClass = statusClass;
app.locals.range10 = Array.from({ length: 10 }, (_, i) => i + 1);

function requireFallnrQuery(req, res, next) {
  const fallnr = req.query.fallnr;
  if (!fallnr || String(fallnr).trim() === "") {
    return res.status(400).render("no-patient");
  }
  next();
}

function requireFallnrBody(req, res, next) {
  const fallnr = req.body && req.body.fallnr;
  if (!fallnr || String(fallnr).trim() === "") {
    return res.status(400).render("no-patient");
  }
  next();
}

function normalizeUser(query) {
  const u = query && query.user != null ? String(query.user).trim() : "";
  return u || "—";
}

function formatDatum(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return new Intl.DateTimeFormat("de-CH", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(d);
  } catch {
    return String(iso);
  }
}

function statusClass(status) {
  if (status === "Offen") return "offen";
  if (status === "In Arbeit") return "arbeit";
  if (status === "Erledigt") return "erledigt";
  return "offen";
}

function parseSectionAudit(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

function redirectToPlan(res, { fallnr, user }, extra = {}) {
  const q = new URLSearchParams();
  q.set("fallnr", String(fallnr));
  if (user != null && String(user) !== "") q.set("user", String(user));
  Object.entries(extra).forEach(([k, v]) => {
    if (v != null && v !== "") q.set(k, String(v));
  });
  const prefix = BASE || "";
  res.redirect(303, `${prefix}/plan?${q.toString()}`);
}

function flashFromQuery(msg) {
  const map = {
    saved: "Eintrag wurde hinzugefügt.",
    updated: "Status wurde aktualisiert.",
    deleted: "Eintrag wurde gelöscht.",
    saved_austritt: "Austrittsplanung gespeichert.",
    saved_assessment: "Beurteilung gespeichert.",
    saved_interprof: "Interprofessionelle Planung gespeichert.",
    saved_system: "Systemgespräch erfasst.",
    deleted_system: "Systemgespräch gelöscht.",
  };
  return map[msg] || null;
}

function errorFromQuery(err) {
  const map = {
    missing: "Bitte Ziel und Maßnahme ausfüllen.",
    save: "Eintrag konnte nicht gespeichert werden.",
    status: "Status konnte nicht aktualisiert werden.",
    delete: "Eintrag konnte nicht gelöscht werden.",
    fallakte: "Fallakte konnte nicht gespeichert werden.",
    system: "Systemgespräch konnte nicht gespeichert werden.",
    systemdel: "Eintrag konnte nicht gelöscht werden.",
  };
  return map[err] || null;
}

const router = express.Router();

router.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "klinikwyss",
    module: "behandlungsplanung",
    basePath: BASE || "/",
  });
});

router.get("/plan", requireFallnrQuery, async (req, res) => {
  const fallnr = String(req.query.fallnr).trim();
  const userRaw = req.query.user != null ? String(req.query.user) : "";
  const userLabel = normalizeUser(req.query);
  const { msg, err } = req.query;

  const flash = flashFromQuery(msg);
  const errorMsg = errorFromQuery(err);

  try {
    const planungen = await db.listByFallnr(fallnr);
    const aktenRow = await db.getFallakte(fallnr);
    const akten = aktenRow || {};
    if (akten.aust_notfallplan == null) akten.aust_notfallplan = 0;
    const prioRows = db.parsePriorisierungJson(akten.ip_priorisierung_json);
    const systemgespraeche = await db.listSystemgespraeche(fallnr);
    const sectionAudit = parseSectionAudit(akten.section_audit_json);

    res.render("index", {
      fallnr,
      userLabel,
      userRaw,
      planungen,
      statusOptions: db.STATUS_VALUES,
      flash,
      error: errorMsg,
      akten,
      prioRows,
      systemgespraeche,
      sectionAudit,
    });
  } catch (e) {
    console.error(e);
    res.render("index", {
      fallnr,
      userLabel,
      userRaw,
      planungen: [],
      statusOptions: db.STATUS_VALUES,
      flash: null,
      error: errorMsg || "Daten konnten nicht geladen werden.",
      akten: {},
      prioRows: db.parsePriorisierungJson("[]"),
      systemgespraeche: [],
      sectionAudit: {},
    });
  }
});

router.post("/plan/fallakte", requireFallnrBody, async (req, res) => {
  const { fallnr, user, section } = req.body;
  const sec = String(section || "").trim();
  if (!["austritt", "assessment", "interprof"].includes(sec)) {
    return redirectToPlan(res, { fallnr, user }, { err: "fallakte" });
  }
  try {
    await db.saveFallakteSection(String(fallnr).trim(), sec, req.body);
    const key =
      sec === "austritt"
        ? "saved_austritt"
        : sec === "assessment"
          ? "saved_assessment"
          : "saved_interprof";
    return redirectToPlan(res, { fallnr, user }, { msg: key });
  } catch (e) {
    console.error(e);
    return redirectToPlan(res, { fallnr, user }, { err: "fallakte" });
  }
});

router.post("/plan/system", requireFallnrBody, async (req, res) => {
  const { fallnr, user, ziele_thema, wann, beteiligte, zusammenfassung } =
    req.body;
  try {
    await db.createSystemgespraech({
      fallnr: String(fallnr).trim(),
      ziele_thema,
      wann,
      beteiligte,
      zusammenfassung,
      ersteller: user != null ? String(user) : "",
    });
    return redirectToPlan(res, { fallnr, user }, { msg: "saved_system" });
  } catch (e) {
    console.error(e);
    return redirectToPlan(res, { fallnr, user }, { err: "system" });
  }
});

router.post("/plan/system/delete", requireFallnrBody, async (req, res) => {
  const { fallnr, user, id } = req.body;
  try {
    await db.deleteSystemgespraech({
      id,
      fallnr: String(fallnr).trim(),
    });
    return redirectToPlan(res, { fallnr, user }, { msg: "deleted_system" });
  } catch (e) {
    console.error(e);
    return redirectToPlan(res, { fallnr, user }, { err: "systemdel" });
  }
});

router.post("/plan", requireFallnrBody, async (req, res) => {
  const { fallnr, user, thema, ziel, massnahme, bis_wann, evaluation } =
    req.body;
  try {
    if (!ziel || !massnahme || String(ziel).trim() === "" || String(massnahme).trim() === "") {
      redirectToPlan(res, { fallnr, user }, { err: "missing" });
      return;
    }
    await db.create({
      fallnr: String(fallnr).trim(),
      ersteller: user != null ? String(user) : "",
      thema,
      ziel: String(ziel),
      massnahme: String(massnahme),
      bis_wann,
      evaluation,
    });
    return redirectToPlan(res, { fallnr, user }, { msg: "saved" });
  } catch (e) {
    console.error(e);
    return redirectToPlan(res, { fallnr, user }, { err: "save" });
  }
});

router.post("/plan/status", requireFallnrBody, async (req, res) => {
  const { fallnr, user, id, status } = req.body;
  try {
    await db.updateStatus({
      id,
      fallnr: String(fallnr).trim(),
      status: String(status),
      bearbeiter: user != null ? String(user) : "",
    });
    return redirectToPlan(res, { fallnr, user }, { msg: "updated" });
  } catch (e) {
    console.error(e);
    return redirectToPlan(res, { fallnr, user }, { err: "status" });
  }
});

router.post("/plan/delete", requireFallnrBody, async (req, res) => {
  const { fallnr, user, id } = req.body;
  try {
    await db.deleteRow({ id, fallnr: String(fallnr).trim() });
    return redirectToPlan(res, { fallnr, user }, { msg: "deleted" });
  } catch (e) {
    console.error(e);
    return redirectToPlan(res, { fallnr, user }, { err: "delete" });
  }
});

router.use((_req, res) => {
  res.status(404).render("404");
});

const publicDir = path.join(__dirname, "public");
if (BASE) {
  app.get("/", (_req, res) => {
    res.redirect(302, `${BASE}/`);
  });
}

app.use(BASE || "/", express.static(publicDir));
app.use(BASE || "/", router);

async function main() {
  console.log(
    "[boot] PORT=%s BASE_PATH(raw)=%s BASE=%s NODE=%s",
    process.env.PORT || "(unset)",
    process.env.BASE_PATH === undefined ? "(unset)" : JSON.stringify(process.env.BASE_PATH),
    BASE || "/",
    process.version
  );
  await db.init();
  const host = process.env.HOST || "0.0.0.0";
  app.listen(port, host, () => {
    console.log(
      `Klinik Wyss listening on http://${host}:${port} (base: ${BASE || "/"})`
    );
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
