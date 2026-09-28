// ========================= مُصرّف Bytecode حقيقي =========================
// يأخذ نفس شجرة AST التي يبنيها parser.js/engine.js (لم تتغيّر قواعد اللغة نفسها)
// ويُخرج تعليمات مسطّحة (Bytecode) بدل تنفيذ الشجرة مباشرة (Tree-Walking).
// هذا هو نفس المبدأ الذي تعمل به آلات بايثون وجافا الافتراضية داخليًا.

class FunctionChunk {
  constructor(name, params) {
    this.name = name;
    this.params = params;
    this.code = [];       // مصفوفة تعليمات: { op, args }
    this.constants = [];  // جدول الثوابت (نصوص، أرقام...)
    this.maxSlots = params.length; // أكبر عدد خانات محلية احتاجتها الدالة
  }
  emit(op, ...args) {
    this.code.push({ op, args });
    return this.code.length - 1; // عنوان التعليمة (للقفزات لاحقًا)
  }
  addConstant(value) {
    this.constants.push(value);
    return this.constants.length - 1;
  }
  patch(addr, newArgs) {
    this.code[addr].args = newArgs;
  }
  here() {
    return this.code.length;
  }
}

class CompileError extends Error {}

class FunctionScope {
  constructor(name, params) {
    this.chunk = new FunctionChunk(name, params);
    this.scopes = [new Map()]; // مكدّس نطاقات: اسم -> رقم الخانة المحلية
    this.nextSlot = 0;
    params.forEach((p) => this.declare(p));
  }
  declare(name) {
    const slot = this.nextSlot++;
    this.chunk.maxSlots = Math.max(this.chunk.maxSlots, this.nextSlot);
    this.scopes[this.scopes.length - 1].set(name, slot);
    return slot;
  }
  resolve(name) {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) return this.scopes[i].get(name);
    }
    return -1;
  }
  pushScope() { this.scopes.push(new Map()); }
  popScope() { this.scopes.pop(); }
}

class Compiler {
  constructor() {
    this.functionChunks = [];   // كل الدوال المصرَّفة (بما فيها البرنامج الرئيسي عند الفهرس 0)
    this.stack = [];            // مكدّس FunctionScope الحالية (للتعامل مع دوال متداخلة)
    this.loopStack = [];        // لدعم توقف/أكمل: { breakAddrs: [], continueTarget }
  }

  get current() { return this.stack[this.stack.length - 1]; }
  get chunk() { return this.current.chunk; }
  get isTopLevel() { return this.stack.length === 1; }

  compileProgram(program) {
    const scope = new FunctionScope("<رئيسي>", []);
    this.stack.push(scope);
    this.functionChunks.push(scope.chunk); // الفهرس 0 دائمًا هو البرنامج الرئيسي
    program.statements.forEach((s) => this.compileStmt(s));
    this.chunk.emit("HALT");
    this.stack.pop();
    return { mainChunkIndex: 0, functionChunks: this.functionChunks };
  }

  // ---------- الجمل ----------
  compileStmt(node) {
    const m = this["stmt_" + node.kind];
    if (!m) throw new CompileError(`لا يمكن تصريف الجملة: ${node.kind}`);
    m.call(this, node);
  }

  stmt_ExprStmt(node) {
    this.compileExpr(node.expr);
    this.chunk.emit("POP");
  }

  stmt_VarDecl(node) {
    this.compileExpr(node.expr);
    if (this.isTopLevel) {
      this.chunk.emit("DEFINE_GLOBAL", node.name);
    } else {
      const slot = this.current.declare(node.name);
      this.chunk.emit("SET_LOCAL", slot);
      this.chunk.emit("POP");
    }
  }

  stmt_FuncDecl(node) {
    const funcScope = new FunctionScope(node.name, node.params);
    this.stack.push(funcScope);
    const chunkIndex = this.functionChunks.length;
    this.functionChunks.push(funcScope.chunk);
    node.body.statements.forEach((s) => this.compileStmt(s));
    // ارجع لاشيء ضمنيًا إذا لم تصل الدالة إلى ارجع صريحة
    funcScope.chunk.emit("CONST", funcScope.chunk.addConstant(null));
    funcScope.chunk.emit("RETURN");
    this.stack.pop();

    this.chunk.emit("BUILD_FUNCTION", chunkIndex);
    if (this.isTopLevel) this.chunk.emit("DEFINE_GLOBAL", node.name);
    else {
      const slot = this.current.declare(node.name);
      this.chunk.emit("SET_LOCAL", slot);
      this.chunk.emit("POP");
    }
  }

  stmt_If(node) {
    this.compileExpr(node.cond);
    const jFalse = this.chunk.emit("JUMP_IF_FALSE", -1);
    this.chunk.emit("POP");
    this.compileBlockScoped(node.thenBlock);
    const jEnd = this.chunk.emit("JUMP", -1);
    this.chunk.patch(jFalse, [this.chunk.here()]);
    this.chunk.emit("POP");
    if (node.elseBlock) this.compileBlockScoped(node.elseBlock);
    this.chunk.patch(jEnd, [this.chunk.here()]);
  }

  stmt_While(node) {
    const loopStart = this.chunk.here();
    this.compileExpr(node.cond);
    const jFalse = this.chunk.emit("JUMP_IF_FALSE", -1);
    this.chunk.emit("POP");
    this.loopStack.push({ breakAddrs: [], continueAddrs: [] });
    this.compileBlockScoped(node.body);
    const loop = this.loopStack.pop();
    loop.continueAddrs.forEach((a) => this.chunk.patch(a, [loopStart]));
    this.chunk.emit("JUMP", loopStart);
    this.chunk.patch(jFalse, [this.chunk.here()]);
    this.chunk.emit("POP");
    loop.breakAddrs.forEach((a) => this.chunk.patch(a, [this.chunk.here()]));
  }

  stmt_For(node) {
    // نفس دلالات النسخة القديمة تمامًا: نحسب اتجاه الخطوة مرة واحدة عند الدخول
    const varSlotOrGlobal = this.isTopLevel
      ? { global: node.varName }
      : { local: this.current.declare(node.varName) };
    const endName = "@for_end_" + this.chunk.here();
    const stepName = "@for_step_" + this.chunk.here();
    const endRef = this.isTopLevel ? { global: endName } : { local: this.current.declare(endName) };
    const stepRef = this.isTopLevel ? { global: stepName } : { local: this.current.declare(stepName) };

    this.compileExpr(node.start);
    this.emitStore(varSlotOrGlobal);
    this.chunk.emit("POP");

    this.compileExpr(node.end);
    this.emitStore(endRef);
    this.chunk.emit("POP");

    // خطوة = ١ إذا end >= start وإلا -١
    this.emitLoad(endRef);
    this.emitLoad(varSlotOrGlobal);
    this.chunk.emit("GTE");
    const jNeg = this.chunk.emit("JUMP_IF_FALSE", -1);
    this.chunk.emit("POP");
    this.chunk.emit("CONST", this.chunk.addConstant(1));
    const jDone = this.chunk.emit("JUMP", -1);
    this.chunk.patch(jNeg, [this.chunk.here()]);
    this.chunk.emit("POP");
    this.chunk.emit("CONST", this.chunk.addConstant(-1));
    this.chunk.patch(jDone, [this.chunk.here()]);
    this.emitStore(stepRef);
    this.chunk.emit("POP");

    const loopStart = this.chunk.here();
    this.emitLoad(varSlotOrGlobal);
    this.emitLoad(endRef);
    this.emitLoad(stepRef);
    this.chunk.emit("FOR_TEST");
    const jFalse = this.chunk.emit("JUMP_IF_FALSE", -1);
    this.chunk.emit("POP");

    this.loopStack.push({ breakAddrs: [], continueAddrs: [] });
    this.compileBlockScoped(node.body);
    // زيادة المتغيّر بالخطوة قبل العودة إلى بداية الحلقة (هذا هو هدف "أكمل" الحقيقي)
    const incrAddr = this.chunk.here();
    const loop = this.loopStack.pop();
    loop.continueAddrs.forEach((a) => this.chunk.patch(a, [incrAddr]));
    this.emitLoad(varSlotOrGlobal);
    this.emitLoad(stepRef);
    this.chunk.emit("ADD");
    this.emitStore(varSlotOrGlobal);
    this.chunk.emit("POP");
    this.chunk.emit("JUMP", loopStart);

    this.chunk.patch(jFalse, [this.chunk.here()]);
    this.chunk.emit("POP");
    loop.breakAddrs.forEach((a) => this.chunk.patch(a, [this.chunk.here()]));
  }

  stmt_Return(node) {
    if (node.expr) this.compileExpr(node.expr);
    else this.chunk.emit("CONST", this.chunk.addConstant(null));
    this.chunk.emit("RETURN");
  }

  stmt_Block(node) { this.compileBlockScoped(node); }

  stmt_Break() {
    if (this.loopStack.length === 0) throw new CompileError("توقف مستخدمة خارج حلقة");
    const addr = this.chunk.emit("JUMP", -1);
    this.loopStack[this.loopStack.length - 1].breakAddrs.push(addr);
  }

  stmt_Continue() {
    if (this.loopStack.length === 0) throw new CompileError("أكمل مستخدمة خارج حلقة");
    const addr = this.chunk.emit("JUMP", -1);
    this.loopStack[this.loopStack.length - 1].continueAddrs.push(addr);
  }

  compileBlockScoped(block) {
    if (!this.isTopLevel) this.current.pushScope();
    block.statements.forEach((s) => this.compileStmt(s));
    if (!this.isTopLevel) this.current.popScope();
  }

  // ---------- مساعدات تحميل/تخزين متغيّر عام أو محلي ----------
  emitLoad(ref) {
    if (ref.global !== undefined) this.chunk.emit("GET_GLOBAL", ref.global);
    else this.chunk.emit("GET_LOCAL", ref.local);
  }
  emitStore(ref) {
    if (ref.global !== undefined) this.chunk.emit("SET_GLOBAL", ref.global);
    else this.chunk.emit("SET_LOCAL", ref.local);
  }

  // ---------- التعابير ----------
  compileExpr(node) {
    const m = this["expr_" + node.kind];
    if (!m) throw new CompileError(`لا يمكن تصريف التعبير: ${node.kind}`);
    m.call(this, node);
  }

  expr_Number(node) { this.chunk.emit("CONST", this.chunk.addConstant(node.value)); }
  expr_String(node) { this.chunk.emit("CONST", this.chunk.addConstant(node.value)); }
  expr_Boolean(node) { this.chunk.emit("CONST", this.chunk.addConstant(node.value)); }
  expr_Null() { this.chunk.emit("CONST", this.chunk.addConstant(null)); }

  expr_ListLiteral(node) {
    node.elements.forEach((e) => this.compileExpr(e));
    this.chunk.emit("MAKE_LIST", node.elements.length);
  }

  expr_MapLiteral(node) {
    node.entries.forEach((e) => { this.compileExpr(e.key); this.compileExpr(e.value); });
    this.chunk.emit("MAKE_MAP", node.entries.length);
  }

  expr_Identifier(node) {
    if (!this.isTopLevel) {
      const slot = this.current.resolve(node.name);
      if (slot !== -1) { this.chunk.emit("GET_LOCAL", slot); return; }
    }
    this.chunk.emit("GET_GLOBAL", node.name);
  }

  expr_Assign(node) {
    if (node.target.kind === "Identifier") {
      this.compileExpr(node.expr);
      if (!this.isTopLevel) {
        const slot = this.current.resolve(node.target.name);
        if (slot !== -1) { this.chunk.emit("SET_LOCAL", slot); return; }
      }
      this.chunk.emit("SET_GLOBAL", node.target.name);
    } else if (node.target.kind === "Index") {
      this.compileExpr(node.expr);
      this.compileExpr(node.target.obj);
      this.compileExpr(node.target.index);
      this.chunk.emit("INDEX_SET");
    }
  }

  expr_Index(node) {
    this.compileExpr(node.obj);
    this.compileExpr(node.index);
    this.chunk.emit("INDEX_GET");
  }

  expr_UnaryOp(node) {
    this.compileExpr(node.expr);
    if (node.op === "ليس") this.chunk.emit("NOT");
    else if (node.op === "-") this.chunk.emit("NEG");
  }

  expr_BinOp(node) {
    if (node.op === "و") {
      this.compileExpr(node.left);
      const jFalse = this.chunk.emit("JUMP_IF_FALSE", -1); // لا يُزال القيمة (لتقصير الدائرة)
      this.chunk.emit("POP");
      this.compileExpr(node.right);
      this.chunk.patch(jFalse, [this.chunk.here()]);
      return;
    }
    if (node.op === "أو") {
      this.compileExpr(node.left);
      const jFalse = this.chunk.emit("JUMP_IF_FALSE", -1);
      const jEnd = this.chunk.emit("JUMP", -1);
      this.chunk.patch(jFalse, [this.chunk.here()]);
      this.chunk.emit("POP");
      this.compileExpr(node.right);
      this.chunk.patch(jEnd, [this.chunk.here()]);
      return;
    }
    this.compileExpr(node.left);
    this.compileExpr(node.right);
    const map = {
      PLUS: "ADD", MINUS: "SUB", STAR: "MUL", SLASH: "DIV", PERCENT: "MOD",
      EQ: "EQ", NEQ: "NEQ", LT: "LT", GT: "GT", LTE: "LTE", GTE: "GTE",
    };
    const op = map[node.op];
    if (!op) throw new CompileError(`عملية غير مدعومة في المُصرّف: ${node.op}`);
    this.chunk.emit(op);
  }

  expr_Call(node) {
    this.compileExpr(node.callee);
    node.args.forEach((a) => this.compileExpr(a));
    this.chunk.emit("CALL", node.args.length);
  }
}

function compile(program) {
  return new Compiler().compileProgram(program);
}

if (typeof module !== "undefined") {
  module.exports = { compile, Compiler, FunctionChunk, CompileError };
}
