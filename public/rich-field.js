/**
 * Ein contenteditable pro Feld: farbige Spans pro Berufsgruppe (wie Word mit mehreren Autor*innen).
 * Beim Speichern: Klartext + JSON-Segmente an den Server.
 */
(function () {
  var ROLE_LABELS = {
    pflege: "Pflege",
    arzt: "Ärzt*innen",
    psychologie: "Psycholog*innen",
    unknown: "Unbekannt",
  };

  function roleFromClass(className) {
    var m = String(className || "").match(/\bseg-(pflege|arzt|psychologie|unknown)\b/);
    return m ? m[1] : "unknown";
  }

  function titleForSpan(r, by, at) {
    var label = ROLE_LABELS[r] || ROLE_LABELS.unknown;
    var t = at;
    try {
      t = new Date(at).toLocaleString("de-CH", {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch (e) {}
    return label + " · " + (by || "—") + " · " + t;
  }

  function flattenRootDivs(root) {
    Array.from(root.querySelectorAll(":scope > div")).forEach(function (div) {
      var br = document.createElement("br");
      root.insertBefore(br, div);
      while (div.firstChild) root.insertBefore(div.firstChild, div);
      div.remove();
    });
  }

  function normalizeOrphanNodes(root) {
    var role = window.PLAN_ROLE || "pflege";
    var by = window.PLAN_USER || "";
    var ts = new Date().toISOString();
    var cls = "seg seg-" + role;
    Array.from(root.childNodes).forEach(function (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        var text = node.textContent;
        if (text === "") return;
        var span = document.createElement("span");
        span.className = cls;
        span.dataset.by = by;
        span.dataset.at = ts;
        span.setAttribute("title", titleForSpan(role, by, ts));
        span.appendChild(document.createTextNode(text));
        root.replaceChild(span, node);
      }
    });
  }

  function refreshTitles(root) {
    root.querySelectorAll("span.seg").forEach(function (span) {
      var r = roleFromClass(span.className);
      span.setAttribute(
        "title",
        titleForSpan(r, span.dataset.by || "", span.dataset.at || "")
      );
    });
  }

  function serializeField(root) {
    var out = [];
    var roleRe = /\bseg-(pflege|arzt|psychologie|unknown)\b/;
    Array.from(root.children).forEach(function (node) {
      if (node.nodeType === 1 && node.classList.contains("seg")) {
        var m = node.className.match(roleRe);
        var r = m ? m[1] : "unknown";
        var t = (node.innerText || "").replace(/\r\n/g, "\n");
        out.push({
          t: t,
          r: r,
          by: node.dataset.by || "",
          at: node.dataset.at || new Date().toISOString(),
        });
      }
    });
    if (out.length === 0) {
      var plain = (root.innerText || "").replace(/\r\n/g, "\n");
      var role = window.PLAN_ROLE || "pflege";
      var by = window.PLAN_USER || "";
      var ts = new Date().toISOString();
      out.push({
        t: plain,
        r: role,
        by: by,
        at: ts,
      });
    }
    return out;
  }

  var debounceTimers = new WeakMap();
  function debouncedNormalize(el) {
    var prev = debounceTimers.get(el);
    if (prev) clearTimeout(prev);
    debounceTimers.set(
      el,
      setTimeout(function () {
        flattenRootDivs(el);
        normalizeOrphanNodes(el);
        refreshTitles(el);
      }, 60)
    );
  }

  function onKeyDown(e) {
    var el = e.target.closest("[data-rich-field]");
    if (!el) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      document.execCommand("insertLineBreak");
    }
  }

  function onPaste(e) {
    var el = e.target.closest("[data-rich-field]");
    if (!el) return;
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, text);
  }

  function prepareForm(form) {
    form.querySelectorAll("[data-rich-field]").forEach(function (el) {
      flattenRootDivs(el);
      normalizeOrphanNodes(el);
      refreshTitles(el);
      var segments = serializeField(el);
      var name = el.getAttribute("data-name");
      if (!name) return;
      var plain = segments.map(function (s) {
        return s.t;
      }).join("\n");
      var hPlain = form.querySelector('input[name="' + name + '"]');
      var hSeg = form.querySelector('input[name="' + name + "__segments" + '"]');
      if (hPlain) hPlain.value = plain;
      if (hSeg) hSeg.value = JSON.stringify(segments);
    });
  }

  function initRichFields() {
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("paste", onPaste, true);
    document.querySelectorAll("[data-rich-field]").forEach(function (el) {
      el.addEventListener("input", function () {
        debouncedNormalize(el);
      });
      el.addEventListener("blur", function () {
        flattenRootDivs(el);
        normalizeOrphanNodes(el);
        refreshTitles(el);
      });
    });
    document.querySelectorAll("form").forEach(function (form) {
      form.addEventListener("submit", function () {
        prepareForm(form);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initRichFields);
  } else {
    initRichFields();
  }
})();
