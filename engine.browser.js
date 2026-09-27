// ========================= المحلل الرمزي (Lexer) =========================
const KEYWORDS = {
  "دالة": "FUNC", "ارجع": "RETURN", "إذا": "IF", "وإلا": "ELSE",
  "طالما": "WHILE", "من_أجل": "FOR", "من": "FROM", "إلى": "TO",
  "متغير": "VAR", "صحيح": "TRUE", "خطأ": "FALSE", "لاشيء": "NULL",
  "و": "AND", "أو": "OR", "ليس": "NOT", "توقف": "BREAK", "أكمل": "CONTINUE",
};

const SINGLE_CHAR = {
  "(": "LPAREN", ")": "RPAREN", "{": "LBRACE", "}": "RBRACE",
  "[": "LBRACKET", "]": "RBRACKET", ",": "COMMA", "،": "COMMA", ";": "SEMI", ":": "COLON",
  "+": "PLUS", "-": "MINUS", "*": "STAR", "/": "SLASH", "%": "PERCENT",
};

class LexError extends Error {}

// دعم الأرقام العربية (الهندية) ٠١٢٣٤٥٦٧٨٩ بجانب الأرقام اللاتينية 0-9
// حتى يمكن كتابة الكود بالكامل بدون أي رمز لاتيني إن أراد المستخدم ذلك
function isDigitChar(ch) {
  return /[0-9\u0660-\u0669\u06F0-\u06F9]/.test(ch);
}
function normalizeDigits(str) {
  return str.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (ch) => {
    const code = ch.codePointAt(0);
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    if (code >= 0x06F0 && code <= 0x06F9) return String(code - 0x06F0);
    return ch;
  });
}
function toArabicIndicDigits(str) {
  return String(str).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

// علامات ترقيم عربية يجب ألا تُعامَل كجزء من المعرّفات رغم وقوعها ضمن نطاق الأحرف العربية
const ARABIC_PUNCTUATION = new Set(["،", "؛", "؟", "٪", "٫", "٬", "۔"]);

function isIdentStart(ch) {
  if (ARABIC_PUNCTUATION.has(ch)) return false;
  return /[A-Za-z_\u0600-\u06FF]/.test(ch);
}
function isIdentPart(ch) {
  return isIdentStart(ch) || /[0-9]/.test(ch);
}

function tokenize(src) {
  const tokens = [];
  let i = 0, line = 1;
  const n = src.length;

  while (i < n) {
    const ch = src[i];

    if (ch === "\n") { line++; i++; continue; }
    if (ch === " " || ch === "\t" || ch === "\r") { i++; continue; }
    if (ch === "#") { while (i < n && src[i] !== "\n") i++; continue; }

    if (isDigitChar(ch)) {
      const start = i;
      while (i < n && (isDigitChar(src[i]) || src[i] === ".")) i++;
      tokens.push({ type: "NUMBER", value: normalizeDigits(src.slice(start, i)), line });
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let buf = "";
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\" && i + 1 < n) {
          const nxt = src[i + 1];
          const esc = { n: "\n", t: "\t", "\\": "\\", '"': '"', "'": "'" }[nxt];
          buf += esc !== undefined ? esc : nxt;
          i += 2;
        } else {
          buf += src[i]; i++;
        }
      }
      if (i >= n) throw new LexError(`نص غير مغلق عند السطر ${line}`);
      i++;
      tokens.push({ type: "STRING", value: buf, line });
      continue;
    }

    if (isIdentStart(ch)) {
      const start = i;
      while (i < n && isIdentPart(src[i])) i++;
      const word = src.slice(start, i);
      const ttype = KEYWORDS[word] || "IDENT";
      tokens.push({ type: ttype, value: word, line });
      continue;
    }

    const two = src.slice(i, i + 2);
    const twoMap = { "==": "EQ", "!=": "NEQ", "<=": "LTE", ">=": "GTE", "&&": "AND", "||": "OR" };
    if (twoMap[two]) { tokens.push({ type: twoMap[two], value: two, line }); i += 2; continue; }

    if (ch === "=") { tokens.push({ type: "ASSIGN", value: "=", line }); i++; continue; }
    if (ch === "<") { tokens.push({ type: "LT", value: "<", line }); i++; continue; }
    if (ch === ">") { tokens.push({ type: "GT", value: ">", line }); i++; continue; }
    if (ch === "!") { tokens.push({ type: "NOT", value: "!", line }); i++; continue; }
    if (ch === ".") { tokens.push({ type: "DOT", value: ".", line }); i++; continue; }

    if (SINGLE_CHAR[ch]) { tokens.push({ type: SINGLE_CHAR[ch], value: ch, line }); i++; continue; }

    throw new LexError(`رمز غير معروف "${ch}" عند السطر ${line}`);
  }

  tokens.push({ type: "EOF", value: null, line });
  return tokens;
}

// ========================= المحلل النحوي (Parser) =========================
class ParseError extends Error {}

class Parser {
  constructor(tokens) { this.tokens = tokens; this.pos = 0; }
  peek() { return this.tokens[this.pos]; }
  advance() { const t = this.tokens[this.pos]; if (t.type !== "EOF") this.pos++; return t; }
  check(t) { return this.peek().type === t; }
  match(...types) { if (types.includes(this.peek().type)) return this.advance(); return null; }
  expect(ttype, msg) {
    if (this.check(ttype)) return this.advance();
    const tok = this.peek();
    throw new ParseError(msg || `متوقع ${ttype} لكن وُجد ${tok.type} (${tok.value}) عند السطر ${tok.line}`);
  }

  parseProgram() {
    const statements = [];
    while (!this.check("EOF")) statements.push(this.statement());
    return { kind: "Program", statements };
  }

  statement() {
    if (this.check("FUNC")) return this.funcDecl();
    if (this.check("IF")) return this.ifStmt();
    if (this.check("WHILE")) return this.whileStmt();
    if (this.check("FOR")) return this.forStmt();
    if (this.check("RETURN")) return this.returnStmt();
    if (this.check("VAR")) return this.varDecl();
    if (this.check("LBRACE")) return this.block();
    if (this.check("BREAK")) { this.advance(); this.match("SEMI"); return { kind: "Break" }; }
    if (this.check("CONTINUE")) { this.advance(); this.match("SEMI"); return { kind: "Continue" }; }
    return this.exprStmt();
  }

  block() {
    this.expect("LBRACE");
    const stmts = [];
    while (!this.check("RBRACE") && !this.check("EOF")) stmts.push(this.statement());
    this.expect("RBRACE");
    return { kind: "Block", statements: stmts };
  }

  funcDecl() {
    this.expect("FUNC");
    const name = this.expect("IDENT").value;
    this.expect("LPAREN");
    const params = [];
    if (!this.check("RPAREN")) {
      params.push(this.expect("IDENT").value);
      while (this.match("COMMA")) params.push(this.expect("IDENT").value);
    }
    this.expect("RPAREN");
    const body = this.block();
    return { kind: "FuncDecl", name, params, body };
  }

  ifStmt() {
    this.expect("IF"); this.expect("LPAREN");
    const cond = this.expression();
    this.expect("RPAREN");
    const thenBlock = this.block();
    let elseBlock = null;
    if (this.match("ELSE")) {
      if (this.check("IF")) elseBlock = { kind: "Block", statements: [this.ifStmt()] };
      else elseBlock = this.block();
    }
    return { kind: "If", cond, thenBlock, elseBlock };
  }

  whileStmt() {
    this.expect("WHILE"); this.expect("LPAREN");
    const cond = this.expression();
    this.expect("RPAREN");
    const body = this.block();
    return { kind: "While", cond, body };
  }

  forStmt() {
    this.expect("FOR"); this.expect("LPAREN");
    const varName = this.expect("IDENT").value;
    this.expect("FROM");
    const start = this.expression();
    this.expect("TO");
    const end = this.expression();
    this.expect("RPAREN");
    const body = this.block();
    return { kind: "For", varName, start, end, body };
  }

  returnStmt() {
    this.expect("RETURN");
    let expr = null;
    if (!this.check("SEMI") && !this.check("RBRACE")) expr = this.expression();
    this.match("SEMI");
    return { kind: "Return", expr };
  }

  varDecl() {
    this.expect("VAR");
    const name = this.expect("IDENT").value;
    this.expect("ASSIGN");
    const expr = this.expression();
    this.match("SEMI");
    return { kind: "VarDecl", name, expr };
  }

  exprStmt() {
    const expr = this.expression();
    this.match("SEMI");
    return { kind: "ExprStmt", expr };
  }

  expression() { return this.assignment(); }

  assignment() {
    const expr = this.logicOr();
    if (this.check("ASSIGN")) {
      this.advance();
      const value = this.assignment();
      if (expr.kind === "Identifier" || expr.kind === "Index") {
        return { kind: "Assign", target: expr, expr: value };
      }
      throw new ParseError("الطرف الأيسر للإسناد يجب أن يكون متغيرًا");
    }
    return expr;
  }

  logicOr() {
    let expr = this.logicAnd();
    while (this.check("OR")) { this.advance(); expr = { kind: "BinOp", op: "أو", left: expr, right: this.logicAnd() }; }
    return expr;
  }
  logicAnd() {
    let expr = this.equality();
    while (this.check("AND")) { this.advance(); expr = { kind: "BinOp", op: "و", left: expr, right: this.equality() }; }
    return expr;
  }
  equality() {
    let expr = this.comparison();
    while (this.check("EQ") || this.check("NEQ")) {
      const op = this.advance().type;
      expr = { kind: "BinOp", op, left: expr, right: this.comparison() };
    }
    return expr;
  }
  comparison() {
    let expr = this.term();
    while (["LT", "GT", "LTE", "GTE"].includes(this.peek().type)) {
      const op = this.advance().type;
      expr = { kind: "BinOp", op, left: expr, right: this.term() };
    }
    return expr;
  }
  term() {
    let expr = this.factor();
    while (["PLUS", "MINUS"].includes(this.peek().type)) {
      const op = this.advance().type;
      expr = { kind: "BinOp", op, left: expr, right: this.factor() };
    }
    return expr;
  }
  factor() {
    let expr = this.unary();
    while (["STAR", "SLASH", "PERCENT"].includes(this.peek().type)) {
      const op = this.advance().type;
      expr = { kind: "BinOp", op, left: expr, right: this.unary() };
    }
    return expr;
  }
  unary() {
    if (this.check("NOT")) { this.advance(); return { kind: "UnaryOp", op: "ليس", expr: this.unary() }; }
    if (this.check("MINUS")) { this.advance(); return { kind: "UnaryOp", op: "-", expr: this.unary() }; }
    return this.callExpr();
  }
  callExpr() {
    let expr = this.primary();
    while (true) {
      if (this.check("LPAREN")) {
        this.advance();
        const args = [];
        if (!this.check("RPAREN")) {
          args.push(this.expression());
          while (this.match("COMMA")) args.push(this.expression());
        }
        this.expect("RPAREN");
        expr = { kind: "Call", callee: expr, args };
      } else if (this.check("LBRACKET")) {
        this.advance();
        const idx = this.expression();
        this.expect("RBRACKET");
        expr = { kind: "Index", obj: expr, index: idx };
      } else break;
    }
    return expr;
  }
  primary() {
    const tok = this.peek();
    if (tok.type === "NUMBER") { this.advance(); return { kind: "Number", value: tok.value.includes(".") ? parseFloat(tok.value) : parseInt(tok.value, 10) }; }
    if (tok.type === "STRING") { this.advance(); return { kind: "String", value: tok.value }; }
    if (tok.type === "TRUE") { this.advance(); return { kind: "Boolean", value: true }; }
    if (tok.type === "FALSE") { this.advance(); return { kind: "Boolean", value: false }; }
    if (tok.type === "NULL") { this.advance(); return { kind: "Null" }; }
    if (tok.type === "IDENT") { this.advance(); return { kind: "Identifier", name: tok.value }; }
    if (tok.type === "LPAREN") { this.advance(); const e = this.expression(); this.expect("RPAREN"); return e; }
    if (tok.type === "LBRACKET") {
      this.advance();
      const elements = [];
      if (!this.check("RBRACKET")) {
        elements.push(this.expression());
        while (this.match("COMMA")) elements.push(this.expression());
      }
      this.expect("RBRACKET");
      return { kind: "ListLiteral", elements };
    }
    throw new ParseError(`تعبير غير متوقع: ${tok.type} (${tok.value}) عند السطر ${tok.line}`);
  }
}

function parse(src) {
  const tokens = tokenize(src);
  return new Parser(tokens).parseProgram();
}

// ========================= المفسّر (Interpreter) =========================
class RuntimeErrorLang extends Error {}
class BreakSignal extends Error {}
class ContinueSignal extends Error {}
class ReturnSignal extends Error { constructor(value) { super(); this.value = value; } }

class LangFunction {
  constructor(decl, closure) { this.decl = decl; this.closure = closure; this.__isLangFunction = true; }
  call(interp, args) {
    const env = new Environment(this.closure);
    this.decl.params.forEach((p, i) => env.define(p, i < args.length ? args[i] : null));
    try { interp.execBlock(this.decl.body, env); }
    catch (r) { if (r instanceof ReturnSignal) return r.value; throw r; }
    return null;
  }
}

class Environment {
  constructor(parent = null) { this.vars = new Map(); this.parent = parent; }
  define(name, value) { this.vars.set(name, value); }
  get(name) {
    let env = this;
    while (env) { if (env.vars.has(name)) return env.vars.get(name); env = env.parent; }
    throw new RuntimeErrorLang(`متغير غير معرّف: ${name}`);
  }
  set(name, value) {
    let env = this;
    while (env) { if (env.vars.has(name)) { env.vars.set(name, value); return; } env = env.parent; }
    this.vars.set(name, value);
  }
}

function truthy(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function toDisplay(v) {
  if (v === null || v === undefined) return "لاشيء";
  if (typeof v === "boolean") return v ? "صحيح" : "خطأ";
  if (Array.isArray(v)) return "[" + v.map(toDisplay).join("، ") + "]";
  if (typeof v === "number") return toArabicIndicDigits(String(v));
  if (typeof Element !== "undefined" && v instanceof Element) return `[عنصر واجهة: ${v.tagName.toLowerCase()}]`;
  return String(v);
}

class Interpreter {
  constructor(opts = {}) {
    this.globals = new Environment();
    this.onPrint = opts.onPrint || (() => {});
    this.onSaveFile = opts.onSaveFile || (() => { throw new RuntimeErrorLang("الحفظ غير مفعّل"); });
    this.maxSteps = opts.maxSteps || 2000000;
    this.steps = 0;
    this.domRoot = opts.domRoot || null; // عنصر DOM جذري تُنفَّذ بداخله دوال الواجهة الحية
    this._setupBuiltins();
  }

  _tick() {
    this.steps++;
    if (this.steps > this.maxSteps) {
      throw new RuntimeErrorLang("تجاوزت العملية الحد الأقصى لعدد الخطوات — يُحتمل وجود حلقة لا نهائية");
    }
  }

  _setupBuiltins() {
    const g = this.globals;
    g.define("اطبع", (...args) => { this.onPrint(args.map(toDisplay).join(" ")); return null; });
    g.define("طول", (x) => { if (typeof x === "string" || Array.isArray(x)) return x.length; throw new RuntimeErrorLang("طول() يحتاج نص أو قائمة"); });
    g.define("أضف", (lst, val) => { if (!Array.isArray(lst)) throw new RuntimeErrorLang("أضف() يحتاج قائمة"); lst.push(val); return lst; });
    g.define("نص", (x) => toDisplay(x));
    g.define("عدد", (x) => {
      const normalized = typeof x === "string" ? normalizeDigits(x) : x;
      const f = parseFloat(normalized);
      if (isNaN(f)) throw new RuntimeErrorLang(`لا يمكن تحويل "${x}" إلى رقم`);
      return f;
    });
    g.define("احفظ_ملف", (path, content) => { this.onSaveFile(path, content); return path; });

    // ---------- مكتبة رياضية ----------
    g.define("جذر", (x) => { if (x < 0) throw new RuntimeErrorLang("لا يوجد جذر حقيقي لعدد سالب"); return Math.sqrt(x); });
    g.define("قوة", (أساس, أس) => Math.pow(أساس, أس));
    g.define("مطلق", (x) => Math.abs(x));
    g.define("جولة", (x) => Math.round(x));
    g.define("أرضية", (x) => Math.floor(x));
    g.define("سقف", (x) => Math.ceil(x));
    g.define("الأكبر", (...args) => {
      const vals = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
      if (vals.length === 0) throw new RuntimeErrorLang("الأكبر() تحتاج قيمة واحدة على الأقل");
      return Math.max(...vals);
    });
    g.define("الأصغر", (...args) => {
      const vals = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
      if (vals.length === 0) throw new RuntimeErrorLang("الأصغر() تحتاج قيمة واحدة على الأقل");
      return Math.min(...vals);
    });
    g.define("عشوائي", (من, إلى) => {
      if (من === undefined) return Math.random();
      if (إلى === undefined) throw new RuntimeErrorLang("عشوائي(من, إلى) تحتاج حدين");
      return Math.floor(Math.random() * (إلى - من + 1)) + من;
    });

    // ---------- مكتبة النصوص ----------
    g.define("اقتطع", (نص_, بداية, نهاية) => {
      if (typeof نص_ !== "string") throw new RuntimeErrorLang("اقتطع() تحتاج نصًا");
      return نهاية === undefined ? نص_.slice(بداية) : نص_.slice(بداية, نهاية);
    });
    g.define("استبدل", (نص_, قديم, جديد) => {
      if (typeof نص_ !== "string") throw new RuntimeErrorLang("استبدل() تحتاج نصًا");
      return نص_.split(قديم).join(جديد);
    });
    g.define("يحوي", (وعاء, قيمة) => {
      if (typeof وعاء === "string") return وعاء.includes(قيمة);
      if (Array.isArray(وعاء)) return وعاء.includes(قيمة);
      throw new RuntimeErrorLang("يحوي() تحتاج نصًا أو قائمة");
    });
    g.define("افصل", (نص_, فاصل) => {
      if (typeof نص_ !== "string") throw new RuntimeErrorLang("افصل() تحتاج نصًا");
      return نص_.split(فاصل === undefined ? " " : فاصل);
    });
    g.define("اربط", (قائمة_, فاصل) => {
      if (!Array.isArray(قائمة_)) throw new RuntimeErrorLang("اربط() تحتاج قائمة");
      return قائمة_.map(toDisplay).join(فاصل === undefined ? "" : فاصل);
    });
    g.define("قصّ", (نص_) => { if (typeof نص_ !== "string") throw new RuntimeErrorLang("قصّ() تحتاج نصًا"); return نص_.trim(); });

    // ---------- مكتبة القوائم ----------
    g.define("رتب", (قائمة_) => {
      if (!Array.isArray(قائمة_)) throw new RuntimeErrorLang("رتب() تحتاج قائمة");
      const copy = [...قائمة_];
      copy.sort((a, b) => (typeof a === "number" && typeof b === "number") ? a - b : String(a).localeCompare(String(b), "ar"));
      return copy;
    });
    g.define("اعكس", (وعاء) => {
      if (Array.isArray(وعاء)) return [...وعاء].reverse();
      if (typeof وعاء === "string") return [...وعاء].reverse().join("");
      throw new RuntimeErrorLang("اعكس() تحتاج نصًا أو قائمة");
    });

    // ---------- بناء واجهات حية (DOM) — تعمل فقط داخل المحرر ----------
    const requireDom = (اسم_الدالة) => {
      if (!this.domRoot) throw new RuntimeErrorLang(`${اسم_الدالة}() تحتاج بيئة واجهة حية (متاحة داخل المحرر فقط)`);
      return this.domRoot;
    };
    const elements = new WeakSet();

    g.define("عنصر_جديد", (وسم) => {
      requireDom("عنصر_جديد");
      if (typeof وسم !== "string") throw new RuntimeErrorLang("عنصر_جديد() تحتاج اسم وسم نصي مثل 'div'");
      const el = document.createElement(وسم);
      elements.add(el);
      return el;
    });
    g.define("عيّن_نص", (عنصر, نص_) => {
      requireDom("عيّن_نص");
      if (!(عنصر instanceof Element)) throw new RuntimeErrorLang("عيّن_نص() تحتاج عنصر واجهة صالحًا");
      عنصر.textContent = toDisplay(نص_);
      return عنصر;
    });
    g.define("عيّن_نمط", (عنصر, خاصية, قيمة) => {
      requireDom("عيّن_نمط");
      if (!(عنصر instanceof Element)) throw new RuntimeErrorLang("عيّن_نمط() تحتاج عنصر واجهة صالحًا");
      عنصر.style.setProperty(String(خاصية), String(قيمة));
      return عنصر;
    });
    g.define("أضف_فئة", (عنصر, فئة) => {
      requireDom("أضف_فئة");
      if (!(عنصر instanceof Element)) throw new RuntimeErrorLang("أضف_فئة() تحتاج عنصر واجهة صالحًا");
      عنصر.classList.add(String(فئة));
      return عنصر;
    });
    g.define("أضف_ابن", (أب, ابن) => {
      requireDom("أضف_ابن");
      if (!(أب instanceof Element) || !(ابن instanceof Element)) throw new RuntimeErrorLang("أضف_ابن() تحتاج عنصرَي واجهة صالحَين");
      أب.appendChild(ابن);
      return أب;
    });
    g.define("امسح_عنصر", (عنصر) => {
      requireDom("امسح_عنصر");
      if (!(عنصر instanceof Element)) throw new RuntimeErrorLang("امسح_عنصر() تحتاج عنصر واجهة صالحًا");
      عنصر.innerHTML = "";
      return عنصر;
    });
    g.define("اقرأ_قيمة", (عنصر) => {
      requireDom("اقرأ_قيمة");
      if (!(عنصر instanceof Element)) throw new RuntimeErrorLang("اقرأ_قيمة() تحتاج عنصر واجهة صالحًا");
      return normalizeDigits(String(عنصر.value !== undefined ? عنصر.value : ""));
    });
    g.define("عيّن_قيمة", (عنصر, قيمة) => {
      requireDom("عيّن_قيمة");
      if (!(عنصر instanceof Element)) throw new RuntimeErrorLang("عيّن_قيمة() تحتاج عنصر واجهة صالحًا");
      عنصر.value = toDisplay(قيمة);
      return عنصر;
    });
    g.define("عند_نقر", (عنصر, دالة) => {
      requireDom("عند_نقر");
      if (!(عنصر instanceof Element)) throw new RuntimeErrorLang("عند_نقر() تحتاج عنصر واجهة صالحًا");
      if (!(دالة instanceof LangFunction)) throw new RuntimeErrorLang("عند_نقر() تحتاج دالة معرّفة بالمستخدم");
      const self = this;
      عنصر.addEventListener("click", () => {
        try { دالة.call(self, []); }
        catch (e) { self.onPrint("خطأ داخل معالج النقر: " + e.message); }
      });
      return عنصر;
    });
    g.define("الجذر", () => { requireDom("الجذر"); return this.domRoot; });

    // ---------- قدرة انعكاسية: تشغيل نص كود ضاد من داخل ضاد نفسها ----------
    // هذا ما يجعل بناء "محرر ضاد" كتجربة عملية بضاد ممكنًا حقيقةً
    g.define("نفّذ", (كود) => {
      if (typeof كود !== "string") throw new RuntimeErrorLang("نفّذ() تحتاج نصًا يمثّل كود ضاد");
      const مخرجات = [];
      try {
        const برنامج_فرعي = parse(كود);
        const مفسّر_فرعي = new Interpreter({
          maxSteps: 200000,
          onPrint: (سطر) => مخرجات.push(سطر),
          onSaveFile: () => { throw new RuntimeErrorLang("الحفظ غير متاح داخل نفّذ()"); },
        });
        مفسّر_فرعي.run(برنامج_فرعي);
      } catch (e) {
        مخرجات.push("خطأ: " + e.message);
      }
      return مخرجات;
    });
  }

  run(program) { for (const s of program.statements) this.execStmt(s, this.globals); }
  execBlock(block, env) { for (const s of block.statements) this.execStmt(s, env); }

  execStmt(node, env) {
    this._tick();
    switch (node.kind) {
      case "ExprStmt": this.eval(node.expr, env); return;
      case "VarDecl": env.define(node.name, this.eval(node.expr, env)); return;
      case "FuncDecl": env.define(node.name, new LangFunction(node, env)); return;
      case "If":
        if (truthy(this.eval(node.cond, env))) this.execBlock(node.thenBlock, new Environment(env));
        else if (node.elseBlock) this.execBlock(node.elseBlock, new Environment(env));
        return;
      case "While":
        while (truthy(this.eval(node.cond, env))) {
          try { this.execBlock(node.body, new Environment(env)); }
          catch (e) { if (e instanceof BreakSignal) break; if (e instanceof ContinueSignal) continue; throw e; }
        }
        return;
      case "For": {
        const start = this.eval(node.start, env);
        const end = this.eval(node.end, env);
        const step = end >= start ? 1 : -1;
        for (let i = start; step > 0 ? i <= end : i >= end; i += step) {
          const loopEnv = new Environment(env);
          loopEnv.define(node.varName, i);
          try { this.execBlock(node.body, loopEnv); }
          catch (e) { if (e instanceof BreakSignal) break; if (e instanceof ContinueSignal) continue; throw e; }
        }
        return;
      }
      case "Return": throw new ReturnSignal(node.expr ? this.eval(node.expr, env) : null);
      case "Block": this.execBlock(node, new Environment(env)); return;
      case "Break": throw new BreakSignal();
      case "Continue": throw new ContinueSignal();
      default: throw new RuntimeErrorLang(`جملة غير مدعومة: ${node.kind}`);
    }
  }

  eval(node, env) {
    this._tick();
    switch (node.kind) {
      case "Number": return node.value;
      case "String": return node.value;
      case "Boolean": return node.value;
      case "Null": return null;
      case "ListLiteral": return node.elements.map((e) => this.eval(e, env));
      case "Identifier": return env.get(node.name);
      case "Assign": {
        const value = this.eval(node.expr, env);
        if (node.target.kind === "Identifier") env.set(node.target.name, value);
        else { const obj = this.eval(node.target.obj, env); const idx = this.eval(node.target.index, env); obj[idx] = value; }
        return value;
      }
      case "Index": {
        const obj = this.eval(node.obj, env);
        const idx = this.eval(node.index, env);
        if (obj == null || obj[idx] === undefined) throw new RuntimeErrorLang(`خطأ في الفهرسة عند ${idx}`);
        return obj[idx];
      }
      case "UnaryOp": {
        const v = this.eval(node.expr, env);
        if (node.op === "ليس") return !truthy(v);
        if (node.op === "-") return -v;
        throw new RuntimeErrorLang(`عملية أحادية غير معروفة: ${node.op}`);
      }
      case "BinOp": return this.evalBinOp(node, env);
      case "Call": {
        const callee = this.eval(node.callee, env);
        const args = node.args.map((a) => this.eval(a, env));
        if (callee instanceof LangFunction) return callee.call(this, args);
        if (typeof callee === "function") return callee(...args);
        throw new RuntimeErrorLang("غير قابل للاستدعاء");
      }
      default: throw new RuntimeErrorLang(`تعبير غير مدعوم: ${node.kind}`);
    }
  }

  evalBinOp(node, env) {
    const op = node.op;
    if (op === "و") { const l = this.eval(node.left, env); return truthy(l) ? this.eval(node.right, env) : l; }
    if (op === "أو") { const l = this.eval(node.left, env); return truthy(l) ? l : this.eval(node.right, env); }
    const left = this.eval(node.left, env);
    const right = this.eval(node.right, env);
    switch (op) {
      case "PLUS": return left + right;
      case "MINUS": return left - right;
      case "STAR": return left * right;
      case "SLASH": if (right === 0) throw new RuntimeErrorLang("قسمة على صفر"); return left / right;
      case "PERCENT": return left % right;
      case "EQ": return left === right;
      case "NEQ": return left !== right;
      case "LT": return left < right;
      case "GT": return left > right;
      case "LTE": return left <= right;
      case "GTE": return left >= right;
      default: throw new RuntimeErrorLang(`عملية غير معروفة: ${op}`);
    }
  }
}

if (typeof module !== 'undefined') { module.exports = { tokenize, parse, Interpreter, LexError, ParseError, RuntimeErrorLang, toArabicIndicDigits, normalizeDigits, KEYWORDS }; }
