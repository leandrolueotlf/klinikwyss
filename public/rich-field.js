/**
 * Contenteditable mit farbigen Spans pro Berufsgruppe.
 * - Farben: Tailwind/preflight überschreibt span-color → .rich-field span.seg-* mit !important in style.css
 * - Fremder Span: Tippen splittet am Cursor; neuer Text erhält PLAN_ROLE (zweifarbig im selben Feld).
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

  function currentPlanRole() {
    return window.PLAN_ROLE || "pflege";
  }

  function currentPlanUser() {
    return window.PLAN_USER || "";
  }

  function createSegSpan(role, textContent) {
    var ts = new Date().toISOString();
    var by = currentPlanUser();
    var span = document.createElement("span");
    span.className = "seg seg-" + role;
    span.dataset.by = by;
    span.dataset.at = ts;
    span.setAttribute("title", titleForSpan(role, by, ts));
    if (textContent) span.appendChild(document.createTextNode(textContent));
    return span;
  }

  /** Finde den span.seg, der den Caret umschliesst (auch verschachtelt). */
  function enclosingSeg(ed, node) {
    var el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    while (el && el !== ed) {
      if (el.classList && el.classList.contains("seg")) return el;
      el = el.parentElement;
    }
    return null;
  }

  function rangeToTextNodeAndOffset(range) {
    var startContainer = range.startContainer;
    var offset = range.startOffset;
    if (startContainer.nodeType === Node.TEXT_NODE) {
      return { node: startContainer, offset: offset };
    }
    if (startContainer.nodeType === Node.ELEMENT_NODE) {
      if (offset < startContainer.childNodes.length) {
        var ch = startContainer.childNodes[offset];
        if (ch.nodeType === Node.TEXT_NODE) return { node: ch, offset: 0 };
      } else if (startContainer.childNodes.length > 0) {
        var last = startContainer.childNodes[startContainer.childNodes.length - 1];
        if (last.nodeType === Node.TEXT_NODE) {
          return { node: last, offset: last.textContent.length };
        }
      }
    }
    return null;
  }

  /**
   * Caret in fremdem span.seg: am Cursor splitten; Suffix + neuer Text in neuem Span (aktuelle Rolle).
   */
  function splitAndInsertIfRoleMismatch(ed, e) {
    var myRole = currentPlanRole();
    var sel = window.getSelection();
    if (!sel.rangeCount) return false;
    var range = sel.getRangeAt(0);
    if (!ed.contains(range.commonAncestorContainer)) return false;

    var insertLineBreak = e.inputType === "insertLineBreak";
    var insertText =
      e.inputType === "insertText" || e.inputType === "insertCompositionText";

    if (!insertLineBreak && !insertText) return false;

    var seg = enclosingSeg(ed, range.startContainer);
    if (!seg) return false;

    var segRole = roleFromClass(seg.className);
    if (segRole === myRole) return false;

    e.preventDefault();

    var pos = rangeToTextNodeAndOffset(range);
    if (!pos || !seg.contains(pos.node)) {
      var fallback = createSegSpan(myRole, "");
      if (insertText && e.data) fallback.appendChild(document.createTextNode(e.data));
      if (insertLineBreak) fallback.appendChild(document.createElement("br"));
      ed.appendChild(fallback);
      placeCaretAtEnd(fallback);
      return true;
    }

    var textNode = pos.node;
    var textOffset = pos.offset;

    var second = textNode.splitText(textOffset);
    var newSpan = createSegSpan(myRole, "");

    if (insertText && e.data) {
      newSpan.appendChild(document.createTextNode(e.data));
    }
    if (insertLineBreak) {
      newSpan.appendChild(document.createElement("br"));
    }

    var n = second;
    while (n && n.parentNode === seg) {
      var nx = n.nextSibling;
      newSpan.appendChild(n);
      n = nx;
    }

    seg.parentNode.insertBefore(newSpan, seg.nextSibling);
    placeCaretAtEnd(newSpan);
    return true;
  }

  function placeCaretAtEnd(el) {
    var sel = window.getSelection();
    var range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function flattenRootDivs(root) {
    Array.from(root.querySelectorAll(":scope > div")).forEach(function (div) {
      var br = document.createElement("br");
      root.insertBefore(br, div);
      while (div.firstChild) root.insertBefore(div.firstChild, div);
      div.remove();
    });
  }

  /** Verschachtelte span.seg nach aussen ziehen (damit Serialisierung stimmt). */
  function flattenNestedSegs(root) {
    var inner;
    while ((inner = root.querySelector("span.seg span.seg"))) {
      var parent = inner.parentElement;
      if (parent && parent.classList.contains("seg")) {
        parent.parentNode.insertBefore(inner, parent.nextSibling);
      } else break;
    }
  }

  function normalizeOrphanNodes(root) {
    var role = currentPlanRole();
    var by = currentPlanUser();
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

  /** Nur oberste span.seg je Ast (nicht in anderem span.seg verschachtelt). */
  function topLevelSegSpans(root) {
    return Array.from(root.querySelectorAll("span.seg")).filter(function (span) {
      var p = span.parentElement;
      while (p && p !== root) {
        if (p.classList && p.classList.contains("seg")) return false;
        p = p.parentElement;
      }
      return true;
    });
  }

  function serializeField(root) {
    var out = [];
    var roleRe = /\bseg-(pflege|arzt|psychologie|unknown)\b/;
    var spans = topLevelSegSpans(root);
    spans.forEach(function (node) {
      var m = node.className.match(roleRe);
      var r = m ? m[1] : "unknown";
      var t = (node.innerText || "").replace(/\r\n/g, "\n");
      out.push({
        t: t,
        r: r,
        by: node.dataset.by || "",
        at: node.dataset.at || new Date().toISOString(),
      });
    });
    if (out.length === 0) {
      var plain = (root.innerText || "").replace(/\r\n/g, "\n");
      var role = currentPlanRole();
      var by = currentPlanUser();
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
        flattenNestedSegs(el);
        normalizeOrphanNodes(el);
        refreshTitles(el);
      }, 50)
    );
  }

  function onBeforeInput(e) {
    var el = e.target.closest("[data-rich-field]");
    if (!el) return;
    splitAndInsertIfRoleMismatch(el, e);
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
      flattenNestedSegs(el);
      normalizeOrphanNodes(el);
      refreshTitles(el);
      var segments = serializeField(el);
      var name = el.getAttribute("data-name");
      if (!name) return;
      var plain = segments
        .map(function (s) {
          return s.t;
        })
        .join("\n");
      var hPlain = form.querySelector('input[name="' + name + '"]');
      var hSeg = form.querySelector(
        'input[name="' + name + "__segments" + '"]'
      );
      if (hPlain) hPlain.value = plain;
      if (hSeg) hSeg.value = JSON.stringify(segments);
    });
  }

  function initRichFields() {
    document.addEventListener("beforeinput", onBeforeInput, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("paste", onPaste, true);
    document.querySelectorAll("[data-rich-field]").forEach(function (el) {
      el.addEventListener("input", function () {
        debouncedNormalize(el);
      });
      el.addEventListener("blur", function () {
        flattenRootDivs(el);
        flattenNestedSegs(el);
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
