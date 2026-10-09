/* محرر احتياطي: يعمل تلقائيًا إذا تعذّر تحميل Monaco (شبكة محجوبة، إلخ).
   textarea حقيقي + طبقة تلوين + أرقام أسطر + إكمال تلقائي وقوالب. */
function createFallbackEditor(container) {
  const LH = 22;
  const root = document.createElement("div");
  root.className = "fb-root";
  root.innerHTML =
    '<div class="fb-code" dir="rtl">' +
    '<div class="fb-band" hidden></div>' +
    '<pre class="fb-hl" aria-hidden="true"></pre>' +
    '<textarea class="fb-ta" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off" aria-label="محرر الكود"></textarea>' +
    '<ul class="ac-list fb-ac" hidden></ul>' +
    '</div>' +
    '<div class="fb-gutter" aria-hidden="true"><div class="fb-gutter-inner"></div></div>';
  container.appendChild(root);

  const code = root.querySelector(".fb-code");
  const band = root.querySelector(".fb-band");
  const hl = root.querySelector(".fb-hl");
  const ta = root.querySelector(".fb-ta");
  const acList = root.querySelector(".fb-ac");
  const gutterInner = root.querySelector(".fb-gutter-inner");

  let errorLine = 0;
  const inputCbs = [];
  const cursorCbs = [];

  function lineCount() { return ta.value.split("\n").length; }

  function renderGutter() {
    const n = lineCount();
    let html = "";
    for (let i = 1; i <= n; i++) {
      html += '<div class="fb-ln' + (i === errorLine ? " err" : "") + '">' + toArabicIndicDigits(String(i)) + "</div>";
    }
    gutterInner.innerHTML = html;
  }

  function positionBand() {
    if (!errorLine) { band.hidden = true; return; }
    band.hidden = false;
    band.style.top = 10 + (errorLine - 1) * LH - ta.scrollTop + "px";
  }

  function sync() {
    hl.innerHTML = highlightToHTML(ta.value);
    renderGutter();
    positionBand();
    syncScroll();
  }

  function syncScroll() {
    hl.style.transform = "translate(" + -ta.scrollLeft + "px," + -ta.scrollTop + "px)";
    gutterInner.style.transform = "translateY(" + -ta.scrollTop + "px)";
    positionBand();
  }

  function cursorInfo() {
    const before = ta.value.slice(0, ta.selectionStart);
    const lines = before.split("\n");
    return { line: lines.length, column: lines[lines.length - 1].length + 1 };
  }
  function emitCursor() { const c = cursorInfo(); cursorCbs.forEach((f) => f(c)); }

  ta.addEventListener("input", () => { sync(); inputCbs.forEach((f) => f()); emitCursor(); });
  ta.addEventListener("scroll", syncScroll);
  ["keyup", "click", "focus"].forEach((ev) => ta.addEventListener(ev, emitCursor));

  ta.addEventListener("keydown", (e) => {
    if (e.key === "Tab" && acList.hidden) {
      e.preventDefault();
      document.execCommand("insertText", false, "    ");
    } else if (e.key === "Enter" && acList.hidden && !e.ctrlKey && !e.metaKey) {
      // إبقاء المسافة البادئة للسطر السابق
      const s = ta.selectionStart;
      const lineStart = ta.value.lastIndexOf("\n", s - 1) + 1;
      const indent = (ta.value.slice(lineStart, s).match(/^[ \t]*/) || [""])[0];
      const extra = /\{\s*$/.test(ta.value.slice(lineStart, s)) ? "    " : "";
      e.preventDefault();
      document.execCommand("insertText", false, "\n" + indent + extra);
    }
  });

  setupAutocomplete(ta, acList, code);
  sync();

  return {
    kind: "fallback",
    getValue: () => ta.value,
    setValue: (v) => { ta.value = v; ta.setSelectionRange(0, 0); ta.scrollTop = 0; ta.scrollLeft = 0; sync(); emitCursor(); },
    onInput: (f) => inputCbs.push(f),
    onCursor: (f) => cursorCbs.push(f),
    focus: () => ta.focus(),
    revealLine: (n) => {
      const lines = ta.value.split("\n");
      let pos = 0;
      for (let i = 0; i < n - 1 && i < lines.length; i++) pos += lines[i].length + 1;
      ta.focus();
      ta.setSelectionRange(pos, pos);
      ta.scrollTop = Math.max(0, (n - 4) * LH);
      syncScroll();
      emitCursor();
    },
    setErrorLine: (n) => { errorLine = n || 0; renderGutter(); positionBand(); },
    undo: () => { ta.focus(); document.execCommand("undo"); },
    redo: () => { ta.focus(); document.execCommand("redo"); },
    selectAll: () => { ta.focus(); ta.select(); },
    show: (v) => { root.style.display = v ? "" : "none"; },
    insertAtCursor: (t) => { ta.focus(); document.execCommand("insertText", false, t); },
  };
}
