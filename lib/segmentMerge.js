/**
 * Zeilenweise Zuordnung von Text zu Berufsgruppe (Pflege / Ärzt*innen / Psycholog*innen).
 * Bei geänderter Zeilenanzahl wird das ganze Feld einer neuen Speicherung zugeordnet.
 */

const ROLE_LABELS = {
  pflege: "Pflege",
  arzt: "Ärzt*innen",
  psychologie: "Psycholog*innen",
  unknown: "Unbekannt",
};

function normalizeRole(role) {
  const s = String(role || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (s === "arzt" || s === "arzte" || s === "aerzte") return "arzt";
  if (s === "psychologie" || s === "psycholog" || s === "psych") return "psychologie";
  return "pflege";
}

function splitLines(text) {
  return String(text).replace(/\r\n/g, "\n").split("\n");
}

function joinLines(lines) {
  return lines.join("\n");
}

/**
 * @param {string} oldText
 * @param {string} newText
 * @param {Array<{t:string,r:string,by:string,at:string}>} oldSegs
 * @param {string} role
 * @param {string} by
 */
function mergeFieldSegments(oldText, newText, oldSegs, role, by) {
  const now = new Date().toISOString();
  const o = oldText == null ? "" : String(oldText);
  const n = newText == null ? "" : String(newText);
  if (o === n) {
    return Array.isArray(oldSegs) && oldSegs.length ? oldSegs : [];
  }
  if (!n) return [];

  const ol = splitLines(o);
  const nl = splitLines(n);
  const r = normalizeRole(role);
  const byStr = String(by || "—").trim() || "—";

  if (ol.length !== nl.length) {
    return [{ t: n, r, by: byStr, at: now }];
  }

  const arr = Array.isArray(oldSegs) ? oldSegs.slice() : [];
  while (arr.length < ol.length) {
    arr.push({
      t: ol[arr.length],
      r: "unknown",
      by: "—",
      at: now,
    });
  }

  const out = [];
  for (let i = 0; i < nl.length; i += 1) {
    if (ol[i] === nl[i]) {
      const prev = arr[i];
      if (prev && prev.t === ol[i]) {
        out.push(prev);
      } else {
        out.push({ t: nl[i], r, by: byStr, at: now });
      }
    } else {
      out.push({ t: nl[i], r, by: byStr, at: now });
    }
  }
  return out;
}

module.exports = {
  ROLE_LABELS,
  normalizeRole,
  splitLines,
  joinLines,
  mergeFieldSegments,
};
