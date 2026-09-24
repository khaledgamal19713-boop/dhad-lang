const BUILTIN_NAMES = ["اطبع", "طول", "أضف", "نص", "عدد", "احفظ_ملف", "جذر", "قوة", "مطلق", "الأكبر", "الأصغر", "عشوائي", "اقتطع", "استبدل", "يحوي", "افصل", "اربط", "قصÐ", "رتب", "اعكس", "عنصر_جديد", "أضف_ابن", "عيّن_نص", "عيّن_نمط", "عند_نقر", "اقرأ_قيمة", "عيّن_قيمة", "الجذر", "نفّذ"];

const SNIPPETS = {
  "دالة": { insertText: "دالة اسم_الدالة(معامل) {\n    %%CURSOR%%\n}", },
  "إذا": { insertText: "إذا (شرط) {\n    %%CURSOR%%\n} وإلا {\n    \n}", },
  "طالما": { insertText: "طالما (شرط) {\n    %%CURSOR%%\n}", },
  "من_أجل": { insertText: "من_أجل (i من ١ إلى ١٠) {\n    %%CURSOR%%\n}", },
  "متغير": { insertText: "متغير الاسم = %%CURSOR%%", },
};

function getCaretCoordinates(textarea, position) {
  const mirrorId = "__ac_mirror_div__";
  let mirror = document.getElementById(mirrorId);
  if (!mirror) {
    mirror = document.createElement("div");
    mirror.id = mirrorId;
    document.body.appendChild(mirror);
  }
  const computed = getComputedStyle(textarea);
  const props = [
    "direction", "boxSizing", "width", "borderTopWidth", "borderRightWidth",
    "borderBottomWidth", "borderLeftWidth", "paddingTop", "paddingRight",
    "paddingBottom", "paddingLeft", "fontStyle", "fontVariant", "fontWeight",
    "fontSize", "lineHeight", "fontFamily", "textAlign", "textIndent",
    "letterSpacing", "tabSize",
  ];
  const style = mirror.style;
  style.position = "absolute";
  style.visibility = "hidden";
  style.top = "-9999px";
  style.left = "-9999px";
  style.whiteSpace = "pre-wrap";
  style.wordWrap = "break-word";
  props.forEach((p) => { style[p] = computed[p]; });
  style.width = computed.width;

  mirror.textContent = textarea.value.substring(0, position);
  const span = document.createElement("span");
  span.textContent = textarea.value.substring(position) || ".";
  mirror.appendChild(span);

  const top = span.offsetTop - textarea.scrollTop;
  const left = span.offsetLeft - textarea.scrollLeft;
  const height = span.offsetHeight;

  return { top, left, height };
}

function currentWordRange(text, caret) {
  let start = caret;
  while (start > 0 && isIdentPart(text[start - 1])) start--;
  let end = caret;
  while (end < text.length && isIdentPart(text[end])) end++;
  return { start, end, word: text.slice(start, caret) };
}

function collectUserIdentifiers(src) {
  const names = new Set();
  const funcRe = /دالة\s+([^\s(]+)/g;
  const varRe = /متغير\s+([^\s=]+)/g;
  let m;
  while ((m = funcRe.exec(src))) names.add(m[1]);
  while ((m = varRe.exec(src))) names.add(m[1]);
  return [...names];
}

function setupAutocomplete(textarea, listEl, wrapEl) {
  let activeIndex = -1;
  let currentMatches = [];
  let currentRange = null;

  function hide() {
    listEl.hidden = true;
    activeIndex = -1;
    currentMatches = [];
  }

  function render() {
    listEl.innerHTML = "";
    currentMatches.forEach((item, idx) => {
      const li = document.createElement("li");
      li.textContent = item.label;
      li.className = "ac-item" + (idx === activeIndex ? " active" : "");
      li.dataset.idx = String(idx);
      const tagSpan = document.createElement("span");
      tagSpan.className = "ac-tag";
      tagSpan.textContent = item.tag;
      li.appendChild(tagSpan);
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        accept(idx);
      });
      listEl.appendChild(li);
    });
  }

  function accept(idx) {
    const item = currentMatches[idx];
    if (!item || !currentRange) return hide();
    const before = textarea.value.slice(0, currentRange.start);
    const after = textarea.value.slice(currentRange.end);

    if (item.insertText) {
      const cursorMarker = "%%CURSOR%%";
      const markerPos = item.insertText.indexOf(cursorMarker);
      const finalText = item.insertText.replace(cursorMarker, "");
      textarea.value = before + finalText + after;
      const pos = markerPos >= 0 ? before.length + markerPos : before.length + finalText.length;
      textarea.selectionStart = textarea.selectionEnd = pos;
    } else {
      textarea.value = before + item.label + after;
      const pos = before.length + item.label.length;
      textarea.selectionStart = textarea.selectionEnd = pos;
    }
    hide();
    textarea.dispatchEvent(new Event("input"));
    textarea.focus();
  }

  function update() {
    const caret = textarea.selectionStart;
    if (caret !== textarea.selectionEnd) return hide();
    const text = textarea.value;
    const range = currentWordRange(text, caret);
    if (range.word.length < 1) return hide();

    const pool = [
      ...Object.keys(KEYWORDS).map((k) => ({
        label: k,
        tag: SNIPPETS[k] ? "قالب كود" : "كلمة مفتاحية",
        insertText: SNIPPETS[k] ? SNIPPETS[k].insertText : null,
      })),
      ...BUILTIN_NAMES.map((k) => ({ label: k, tag: "دالة مدمجة" })),
      ...collectUserIdentifiers(text).map((k) => ({ label: k, tag: "معرّف" })),
    ];

    const seen = new Set();
    const matches = pool.filter((item) => {
      if (item.label === range.word) return false;
      if (!item.label.startsWith(range.word)) return false;
      if (seen.has(item.label)) return false;
      seen.add(item.label);
      return true;
    }).slice(0, 8);

    if (matches.length === 0) return hide();

    currentMatches = matches;
    currentRange = range;
    activeIndex = 0;
    render();

    const coords = getCaretCoordinates(textarea, caret);
    listEl.style.top = (coords.top + coords.height + 4) + "px";
    listEl.style.left = coords.left + "px";
    listEl.hidden = false;
  }

  textarea.addEventListener("input", update);
  textarea.addEventListener("click", hide);
  textarea.addEventListener("blur", () => setTimeout(hide, 120));

  textarea.addEventListener("keydown", (e) => {
    if (listEl.hidden) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % currentMatches.length;
      render();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + currentMatches.length) % currentMatches.length;
      render();
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (activeIndex >= 0) { e.preventDefault(); accept(activeIndex); }
    } else if (e.key === "Escape") {
      hide();
    }
  });
}
