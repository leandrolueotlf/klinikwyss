const path = require("path");
const express = require("express");
const db = require("./database");
const { ROLE_LABELS, normalizeRole } = require("./lib/segmentMerge");

const app = express();
const port = Number(process.env.PORT) || 3000;

/**
 * Basis-Pfad für alle Routen (z. B. INES-Einbettung).
 * Standard: /pkw-demo  →  /pkw-demo/plan/beurteilung?fallnr=…&user=…&role=…
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
app.locals.roleLabels = ROLE_LABELS;

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

function parseFieldSegments(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderSegmentsHtml(segments) {
  if (!segments || !segments.length) {
    return '<span class="segment-preview-empty text-slate-400 text-xs">Nach dem Speichern erscheint die Farbcodierung.</span>';
  }
  return segments
    .map((seg) => {
      const r = seg.r || "unknown";
      const label = ROLE_LABELS[r] || ROLE_LABELS.unknown;
      const tit = escapeHtml(
        `${label} · ${seg.by || "—"} · ${formatDatum(seg.at)}`
      );
      const txt = escapeHtml(seg.t || "").replace(/\n/g, "<br/>");
      return `<span class="seg seg-${r}" title="${tit}">${txt || "&nbsp;"}</span>`;
    })
    .join('<span class="seg-linebreak" aria-hidden="true"><br/></span>');
}

app.locals.renderSegmentsHtml = renderSegmentsHtml;
app.locals.escapeHtml = escapeHtml;

/** HTML für contenteditable: farbige Spans, ein Feld wie Word (mehrere Autor*innen) */
function renderSegmentsEditorHtml(segments, defaultRole, defaultBy) {
  const ts = new Date().toISOString();
  const r0 = normalizeRole(defaultRole);
  const byEsc = escapeHtml(String(defaultBy || "—"));
  const tsEsc = escapeHtml(ts);
  if (!segments || !segments.length) {
    return `<span class="seg seg-${r0}" data-by="${byEsc}" data-at="${tsEsc}">\u200b</span>`;
  }
  return segments
    .map((s) => {
      const r = normalizeRole(s.r);
      const byS = escapeHtml(String(s.by || ""));
      const atS = escapeHtml(String(s.at || ""));
      const label = ROLE_LABELS[r] || ROLE_LABELS.unknown;
      const tit = escapeHtml(`${label} · ${s.by || "—"} · ${formatDatum(s.at)}`);
      const txt = escapeHtml(String(s.t || "")).replace(/\n/g, "<br/>");
      const inner = txt || "\u200b";
      return `<span class="seg seg-${r}" data-by="${byS}" data-at="${atS}" title="${tit}">${inner}</span>`;
    })
    .join("");
}

app.locals.renderSegmentsEditorHtml = renderSegmentsEditorHtml;

/**
 * Immer gleiche URL-Form: fallnr, user (INES-Name), role — damit Links teilbar sind
 * und im Browser sichtbar ist, wer mit welcher Rolle arbeitet.
 */
function planQueryString(fallnr, userRaw, role) {
  const q = new URLSearchParams();
  q.set("fallnr", String(fallnr));
  q.set("user", userRaw != null ? String(userRaw) : "");
  q.set("role", normalizeRole(role));
  return q.toString();
}

function redirectToPlan(res, { fallnr, user, role }, pageSlug, extra = {}) {
  const q = new URLSearchParams();
  q.set("fallnr", String(fallnr));
  q.set("user", user != null ? String(user) : "");
  q.set("role", normalizeRole(role));
  Object.entries(extra).forEach(([k, v]) => {
    if (v != null && v !== "") q.set(k, String(v));
  });
  const prefix = BASE || "";
  const slug = pageSlug || "beurteilung";
  res.redirect(303, `${prefix}/plan/${slug}?${q.toString()}`);
}

function strBody(body, key) {
  if (!body || body[key] == null) return "";
  return String(body[key]);
}

function redirectPageFromBody(body) {
  const p = strBody(body, "redirect_page").trim();
  if (!p) return "beurteilung";
  const allowed = new Set([
    "beurteilung",
    "interprof",
    "massnahmen",
    "system",
    "austritt",
  ]);
  return allowed.has(p) ? p : "beurteilung";
}

async function loadPlanLocals(req) {
  const fallnr = String(req.query.fallnr).trim();
  const userRaw = req.query.user != null ? String(req.query.user) : "";
  const userLabel = normalizeUser(req.query);
  const role = normalizeRole(req.query.role);
  const roleLabel = ROLE_LABELS[role] || ROLE_LABELS.unknown;
  const planQs = planQueryString(fallnr, userRaw, role);
  const planQsPflege = planQueryString(fallnr, userRaw, "pflege");
  const planQsArzt = planQueryString(fallnr, userRaw, "arzt");
  const planQsPsychologie = planQueryString(fallnr, userRaw, "psychologie");
  const { msg, err } = req.query;

  const flash = flashFromQuery(msg);
  const errorMsg = errorFromQuery(err);

  const planungen = await db.listByFallnr(fallnr);
  const aktenRow = await db.getFallakte(fallnr);
  const akten = aktenRow || {};
  if (akten.aust_notfallplan == null) akten.aust_notfallplan = 0;
  const prioRows = db.parsePriorisierungJson(akten.ip_priorisierung_json);
  const systemgespraeche = await db.listSystemgespraeche(fallnr);
  const sectionAudit = parseSectionAudit(akten.section_audit_json);
  const fieldSegments = parseFieldSegments(akten.field_segments_json);

  return {
    fallnr,
    userLabel,
    userRaw,
    role,
    roleLabel,
    planQs,
    planQsPflege,
    planQsArzt,
    planQsPsychologie,
    flash,
    error: errorMsg,
    planungen,
    statusOptions: db.STATUS_VALUES,
    akten,
    prioRows,
    systemgespraeche,
    sectionAudit,
    fieldSegments,
  };
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

router.get("/plan", requireFallnrQuery, (req, res) => {
  const fallnr = String(req.query.fallnr).trim();
  const userRaw = req.query.user != null ? String(req.query.user) : "";
  const role = normalizeRole(req.query.role);
  const q = new URLSearchParams();
  q.set("fallnr", fallnr);
  q.set("user", userRaw);
  q.set("role", role);
  const prefix = BASE || "";
  res.redirect(302, `${prefix}/plan/beurteilung?${q.toString()}`);
});

async function renderPlanPage(req, res, activePage, template, pageTitle) {
  try {
    const locals = await loadPlanLocals(req);
    res.render(template, { ...locals, activePage, pageTitle });
  } catch (e) {
    console.error(e);
    const fallnr = String(req.query.fallnr || "").trim();
    const userRaw = req.query.user != null ? String(req.query.user) : "";
    const role = normalizeRole(req.query.role);
    res.render(template, {
      fallnr,
      userLabel: normalizeUser(req.query),
      userRaw,
      role,
      roleLabel: ROLE_LABELS[role] || ROLE_LABELS.unknown,
      planQs: planQueryString(fallnr, userRaw, role),
      planQsPflege: planQueryString(fallnr, userRaw, "pflege"),
      planQsArzt: planQueryString(fallnr, userRaw, "arzt"),
      planQsPsychologie: planQueryString(fallnr, userRaw, "psychologie"),
      flash: null,
      error: "Daten konnten nicht geladen werden.",
      planungen: [],
      statusOptions: db.STATUS_VALUES,
      akten: {},
      prioRows: db.parsePriorisierungJson("[]"),
      systemgespraeche: [],
      sectionAudit: {},
      fieldSegments: {},
      activePage,
      pageTitle,
    });
  }
}

router.get("/plan/beurteilung", requireFallnrQuery, async (req, res) => {
  await renderPlanPage(req, res, "beurteilung", "beurteilung", "Beurteilung & Kontext");
});

router.get("/plan/interprof", requireFallnrQuery, async (req, res) => {
  await renderPlanPage(req, res, "interprof", "interprof", "Interprofessionelle Planung");
});

router.get("/plan/massnahmen", requireFallnrQuery, async (req, res) => {
  await renderPlanPage(req, res, "massnahmen", "massnahmen", "Behandlungsplan");
});

router.get("/plan/system", requireFallnrQuery, async (req, res) => {
  await renderPlanPage(req, res, "system", "system", "Systemgespräche");
});

router.get("/plan/austritt", requireFallnrQuery, async (req, res) => {
  await renderPlanPage(req, res, "austritt", "austritt", "Austrittsplanung");
});

router.post("/plan/fallakte", requireFallnrBody, async (req, res) => {
  const { fallnr, user, section } = req.body;
  const sec = String(section || "").trim();
  const role = strBody(req.body, "role");
  const page = redirectPageFromBody(req.body);
  if (!["austritt", "assessment", "interprof"].includes(sec)) {
    return redirectToPlan(res, { fallnr, user, role }, page, { err: "fallakte" });
  }
  try {
    await db.saveFallakteSection(String(fallnr).trim(), sec, req.body);
    const key =
      sec === "austritt"
        ? "saved_austritt"
        : sec === "assessment"
          ? "saved_assessment"
          : "saved_interprof";
    return redirectToPlan(res, { fallnr, user, role }, page, { msg: key });
  } catch (e) {
    console.error(e);
    return redirectToPlan(res, { fallnr, user, role }, page, { err: "fallakte" });
  }
});

router.post("/plan/system", requireFallnrBody, async (req, res) => {
  const { fallnr, user, ziele_thema, wann, beteiligte, zusammenfassung } =
    req.body;
  const role = strBody(req.body, "role");
  const page = redirectPageFromBody(req.body);
  try {
    await db.createSystemgespraech({
      fallnr: String(fallnr).trim(),
      ziele_thema,
      wann,
      beteiligte,
      zusammenfassung,
      ersteller: user != null ? String(user) : "",
      ersteller_role: role,
    });
    return redirectToPlan(res, { fallnr, user, role }, page, { msg: "saved_system" });
  } catch (e) {
    console.error(e);
    return redirectToPlan(res, { fallnr, user, role }, page, { err: "system" });
  }
});

router.post("/plan/system/delete", requireFallnrBody, async (req, res) => {
  const { fallnr, user, id } = req.body;
  const role = strBody(req.body, "role");
  const page = redirectPageFromBody(req.body);
  try {
    await db.deleteSystemgespraech({
      id,
      fallnr: String(fallnr).trim(),
    });
    return redirectToPlan(res, { fallnr, user, role }, page, { msg: "deleted_system" });
  } catch (e) {
    console.error(e);
    return redirectToPlan(res, { fallnr, user, role }, page, { err: "systemdel" });
  }
});

router.post("/plan", requireFallnrBody, async (req, res) => {
  const { fallnr, user, thema, ziel, massnahme, bis_wann, evaluation } =
    req.body;
  const role = strBody(req.body, "role");
  const page = redirectPageFromBody(req.body);
  try {
    if (!ziel || !massnahme || String(ziel).trim() === "" || String(massnahme).trim() === "") {
      redirectToPlan(res, { fallnr, user, role }, page, { err: "missing" });
      return;
    }
    await db.create({
      fallnr: String(fallnr).trim(),
      ersteller: user != null ? String(user) : "",
      ersteller_role: role,
      thema,
      ziel: String(ziel),
      massnahme: String(massnahme),
      bis_wann,
      evaluation,
    });
    return redirectToPlan(res, { fallnr, user, role }, page, { msg: "saved" });
  } catch (e) {
    console.error(e);
    return redirectToPlan(res, { fallnr, user, role }, page, { err: "save" });
  }
});

router.post("/plan/status", requireFallnrBody, async (req, res) => {
  const { fallnr, user, id, status } = req.body;
  const role = strBody(req.body, "role");
  const page = redirectPageFromBody(req.body);
  try {
    await db.updateStatus({
      id,
      fallnr: String(fallnr).trim(),
      status: String(status),
      bearbeiter: user != null ? String(user) : "",
    });
    return redirectToPlan(res, { fallnr, user, role }, page, { msg: "updated" });
  } catch (e) {
    console.error(e);
    return redirectToPlan(res, { fallnr, user, role }, page, { err: "status" });
  }
});

router.post("/plan/delete", requireFallnrBody, async (req, res) => {
  const { fallnr, user, id } = req.body;
  const role = strBody(req.body, "role");
  const page = redirectPageFromBody(req.body);
  try {
    await db.deleteRow({ id, fallnr: String(fallnr).trim() });
    return redirectToPlan(res, { fallnr, user, role }, page, { msg: "deleted" });
  } catch (e) {
    console.error(e);
    return redirectToPlan(res, { fallnr, user, role }, page, { err: "delete" });
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
