const MONACO_BASE = "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.47.0/min";

const MONACO_SNIPPETS = {
  "دالة": "دالة ${1:اسم_الدالة}(${2:معامل}) {\n\t$0\n}",
  "إذا": "إذا (${1:شرط}) {\n\t$0\n} وإلا {\n\t\n}",
  "طالما": "طالما (${1:شرط}) {\n\t$0\n}",
  "من_أجل": "من_أجل (${1:i} من ${2:١} إلى ${3:١٠}) {\n\t$0\n}",
  "متغير": "متغير ${1:الاسم} = $0",
};

function loadMonaco(timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    if (window.monaco) return resolve(window.monaco);
    const timer = setTimeout(() => reject(new Error("انتهت مهلة تحميل Monaco")), timeoutMs);
    const s = document.createElement("script");
    s.src = MONACO_BASE + "/vs/loader.min.js";
    s.onerror = () => { clearTimeout(timer); reject(new Error("تعذّر تحميل Monaco")); };
    s.onload = () => {
      try {
        window.MonacoEnvironment = {
          getWorkerUrl: function () {
            const code = "self.MonacoEnvironment={baseUrl:'" + MONACO_BASE + "/'};importScripts('" + MONACO_BASE + "/vs/base/worker/workerMain.js');";
            return URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
          },
        };
        window.require.config({ paths: { vs: MONACO_BASE + "/vs" } });
        window.require(["vs/editor/editor.main"], () => { clearTimeout(timer); resolve(window.monaco); }, (e) => { clearTimeout(timer); reject(e); });
      } catch (e) { clearTimeout(timer); reject(e); }
    };
    document.head.appendChild(s);
  });
}

function dhadBuiltinNames() {
  return Array.from(new VM().globals.keys());
}

function collectUserIdentifiersFrom(src) {
  const names = new Set();
  const funcRe = /دالة\s+([^\s(]+)/g;
  const varRe = /متغير\s+([^\s=]+)/g;
  let m;
  while ((m = funcRe.exec(src))) names.add(m[1]);
  while ((m = varRe.exec(src))) names.add(m[1]);
  return [...names];
}

function registerDhadLanguage(monaco) {
  const keywords = Object.keys(KEYWORDS);
  const builtins = dhadBuiltinNames();
  const LETTER = "[\\u0621-\\u064A\\u064B-\\u0652\\u0671-\\u06D3_a-zA-Z]";
  const LETTER_OR_DIGIT = "[\\u0621-\\u064A\\u064B-\\u0652\\u0671-\\u06D3_a-zA-Z0-9\\u0660-\\u0669]";

  monaco.languages.register({ id: "dhad", extensions: [".dhad"], aliases: ["ضاد", "Dhad"] });

  monaco.languages.setLanguageConfiguration("dhad", {
    wordPattern: new RegExp("(" + LETTER + LETTER_OR_DIGIT + "*)|([\\u0660-\\u06690-9.]+)", "g"),
    comments: { lineComment: "#" },
    brackets: [["{", "}"], ["[", "]"], ["(", ")"]],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"', notIn: ["string", "comment"] },
      { open: "'", close: "'", notIn: ["string", "comment"] },
    ],
    surroundingPairs: [
      { open: "{", close: "}" }, { open: "[", close: "]" }, { open: "(", close: ")" },
      { open: '"', close: '"' }, { open: "'", close: "'" },
    ],
    indentationRules: {
      increaseIndentPattern: /\{[^}"']*$/,
      decreaseIndentPattern: /^\s*\}/,
    },
  });

  monaco.languages.setMonarchTokensProvider("dhad", {
    keywords: keywords,
    builtins: builtins,
    tokenizer: {
      root: [
        [/#.*$/, "comment"],
        [/[\u0660-\u06690-9]+(\.[\u0660-\u06690-9]+)?/, "number"],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/"/, { token: "string.quote", next: "@dq" }],
        [/'/, { token: "string.quote", next: "@sq" }],
        [new RegExp(LETTER + LETTER_OR_DIGIT + "*"), { cases: { "@keywords": "keyword", "@builtins": "predefined", "@default": "identifier" } }],
        [/[{}()\[\]]/, "@brackets"],
        [/==|!=|<=|>=|&&|\|\||[+\-*\/%=<>!]/, "operator"],
        [/[.,\u060C:;]/, "delimiter"],
      ],
      dq: [[/[^\\"]+/, "string"], [/\\./, "string.escape"], [/"/, { token: "string.quote", next: "@pop" }]],
      sq: [[/[^\\']+/, "string"], [/\\./, "string.escape"], [/'/, { token: "string.quote", next: "@pop" }]],
    },
  });

  monaco.editor.defineTheme("dhad-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "C79A3E", fontStyle: "bold" },
      { token: "predefined", foreground: "4EC9B0" },
      { token: "number", foreground: "B5CEA8" },
      { token: "string", foreground: "CE9178" },
      { token: "comment", foreground: "6A9955", fontStyle: "italic" },
    ],
    colors: {},
  });

  monaco.languages.registerCompletionItemProvider("dhad", {
    provideCompletionItems: function (model, position) {
      const word = model.getWordUntilPosition(position);
      const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
      const K = monaco.languages.CompletionItemKind;
      const suggestions = [];
      keywords.forEach((k) => {
        const snip = MONACO_SNIPPETS[k];
        suggestions.push({
          label: k, kind: snip ? K.Snippet : K.Keyword, detail: snip ? "قالب كود" : "كلمة مفتاحية",
          insertText: snip || k,
          insertTextRules: snip ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
          range: range,
        });
      });
      builtins.forEach((b) => suggestions.push({ label: b, kind: K.Function, detail: "دالة مدمجة", insertText: b + "($0)", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range: range }));
      collectUserIdentifiersFrom(model.getValue()).forEach((id) => suggestions.push({ label: id, kind: K.Variable, detail: "معرّف", insertText: id, range: range }));
      return { suggestions: suggestions };
    },
  });
}

function createMonacoAdapter(monaco, container, initialValue, onRun) {
  registerDhadLanguage(monaco);
  const editor = monaco.editor.create(container, {
    value: initialValue,
    language: "dhad",
    theme: "dhad-dark",
    fontFamily: "Cairo, 'Courier New', monospace",
    fontSize: 15,
    lineHeight: 26,
    disableMonospaceOptimizations: true,
    minimap: { enabled: true },
    automaticLayout: true,
    tabSize: 4,
    insertSpaces: true,
    scrollBeyondLastLine: false,
    renderLineHighlight: "all",
    bracketPairColorization: { enabled: true },
    lineNumbers: function (n) { return toArabicIndicDigits(String(n)); },
    padding: { top: 12 },
  });
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, onRun);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => monaco.editor.remeasureFonts());
  return {
    kind: "monaco",
    getValue: () => editor.getValue(),
    setValue: (v) => editor.setValue(v),
  };
}

function createFallbackAdapter(container, initialValue, onRun) {
  const ta = document.createElement("textarea");
  ta.value = initialValue;
  ta.spellcheck = false;
  ta.dir = "rtl";
  ta.style.cssText = "width:100%;height:100%;box-sizing:border-box;resize:none;border:none;outline:none;padding:16px;background:#1F2530;color:#E7E3D8;font:15px/1.8 Cairo,monospace;tab-size:4;";
  ta.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); onRun(); }
    if (e.key === "Tab") { e.preventDefault(); const s = ta.selectionStart; ta.value = ta.value.slice(0, s) + "    " + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = s + 4; }
  });
  container.appendChild(ta);
  return { kind: "fallback", getValue: () => ta.value, setValue: (v) => { ta.value = v; } };
}
