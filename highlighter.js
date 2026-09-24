function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightToHTML(src) {
  const BUILTINS = new Set(["اطبع", "طول", "أضف", "نص", "عدد", "احفظ_ملف"]);
  let i = 0;
  const n = src.length;
  const out = [];

  function push(text, cls) {
    if (text === "") return;
    const esc = escapeHtml(text);
    out.push(cls ? `<span class="${cls}">${esc}</span>` : esc);
  }

  while (i < n) {
    const ch = src[i];

    if (ch === "\n") { push("\n", null); i++; continue; }
    if (ch === " " || ch === "\t" || ch === "\r") { push(ch, null); i++; continue; }

    if (ch === "#") {
      const start = i;
      while (i < n && src[i] !== "\n") i++;
      push(src.slice(start, i), "tok-comment");
      continue;
    }

    if (isDigitChar(ch)) {
      const start = i;
      while (i < n && (isDigitChar(src[i]) || src[i] === ".")) i++;
      push(src.slice(start, i), "tok-number");
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\" && i + 1 < n) i += 2; else i++;
      }
      if (i < n) i++;
      push(src.slice(start, i), "tok-string");
      continue;
    }

    if (isIdentStart(ch)) {
      const start = i;
      while (i < n && isIdentPart(src[i])) i++;
      const word = src.slice(start, i);
      if (KEYWORDS[word]) push(word, "tok-keyword");
      else if (BUILTINS.has(word)) push(word, "tok-builtin");
      else push(word, "tok-ident");
      continue;
    }

    if ("(){}[]".includes(ch)) { push(ch, "tok-bracket"); i++; continue; }
    if ("+-*/%=<>!.:;,،".includes(ch)) { push(ch, "tok-op"); i++; continue; }

    push(ch, null);
    i++;
  }

  return out.join("") + "\n";
}
