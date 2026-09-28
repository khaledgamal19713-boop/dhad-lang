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
    if (tok.type === "LBRACE") {
      this.advance();
      const entries = [];
      if (!this.check("RBRACE")) {
        do {
          let key;
          if (this.check("IDENT") && this.tokens[this.pos + 1].type === "COLON") {
            key = { kind: "String", value: this.advance().value };
          } else {
            key = this.expression();
          }
          this.expect("COLON");
          entries.push({ key, value: this.expression() });
        } while (this.match("COMMA"));
      }
      this.expect("RBRACE");
      return { kind: "MapLiteral", entries };
    }
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

if (typeof module !== 'undefined') { module.exports = { tokenize, parse, LexError, ParseError, toArabicIndicDigits, normalizeDigits, KEYWORDS, isDigitChar, isIdentStart, isIdentPart }; }
