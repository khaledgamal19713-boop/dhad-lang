// ========================= الآلة الافتراضية (Bytecode VM) =========================
// حلقة تنفيذ حقيقية: عدّاد تعليمات (IP) يتقدّم عبر مصفوفة Bytecode مع كومة قيم (Stack)
// وكومة إطارات استدعاء (Call Frames) للدوال — بدل التنفيذ التكراري على الشجرة مباشرة.

class VMRuntimeError extends Error {}
class VMBreakSentinel extends Error {}

class VMFunction {
  constructor(chunkIndex, chunk) {
    this.chunkIndex = chunkIndex;
    this.chunk = chunk;
    this.__isVMFunction = true;
  }
}

class CallFrame {
  constructor(chunk, locals, returnStackDepth) {
    this.chunk = chunk;
    this.ip = 0;
    this.locals = locals;
    this.returnStackDepth = returnStackDepth;
  }
}

function truthy(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof Map) return v.size > 0;
  return true;
}

function toDisplay(v) {
  if (v === null || v === undefined) return "لاشيء";
  if (typeof v === "boolean") return v ? "صحيح" : "خطأ";
  if (Array.isArray(v)) return "[" + v.map(toDisplay).join("، ") + "]";
  if (v instanceof Map) return "{" + [...v].map(([k, x]) => toDisplay(k) + ": " + toDisplay(x)).join("، ") + "}";
  if (typeof v === "number") return toArabicIndicDigits(String(v));
  if (typeof Element !== "undefined" && v instanceof Element) return `[عنصر واجهة: ${v.tagName.toLowerCase()}]`;
  return String(v);
}

class VM {
  constructor(opts = {}) {
    this.globals = new Map();
    this.stack = [];
    this.frames = [];
    this.onPrint = opts.onPrint || (() => {});
    this.onSaveFile = opts.onSaveFile || (() => { throw new VMRuntimeError("الحفظ غير مفعّل"); });
    this.maxSteps = opts.maxSteps || 2000000;
    this.steps = 0;
    this.domRoot = opts.domRoot || null;
    this._setupBuiltins();
  }

  _tick() {
    this.steps++;
    if (this.steps > this.maxSteps) {
      throw new VMRuntimeError("تجاوزت العملية الحد الأقصى لعدد الخطوات");
    }
  }

  push(v) { this.stack.push(v); }
  pop() {
    if (this.stack.length === 0) throw new VMRuntimeError("نفاد المكدّس الداخلي");
    return this.stack.pop();
  }
  peek() { return this.stack[this.stack.length - 1]; }

  run(mainChunkIndex, functionChunks) {
    this.functionChunks = functionChunks;
    const mainChunk = functionChunks[mainChunkIndex];
    const frame = new CallFrame(mainChunk, [], 0);
    this.frames.push(frame);
    this._loop();
  }

  _loop() {
    while (this.frames.length > 0) {
      const frame = this.frames[this.frames.length - 1];
      if (frame.ip >= frame.chunk.code.length) {
        this.frames.pop();
        this.push(null);
        continue;
      }
      const instr = frame.chunk.code[frame.ip];
      frame.ip++;
      this._tick();
      this._exec(frame, instr);
    }
  }

  _exec(frame, instr) {
    const { op, args } = instr;
    switch (op) {
      case "HALT": this.frames.pop(); return;
      case "CONST": this.push(frame.chunk.constants[args[0]]); return;
      case "POP": this.pop(); return;
      case "GET_LOCAL": this.push(frame.locals[args[0]]); return;
      case "SET_LOCAL": frame.locals[args[0]] = this.peek(); return;
      case "GET_GLOBAL": {
        const name = args[0];
        if (!this.globals.has(name)) throw new VMRuntimeError(`متغير غير معرّف: ${name}`);
        this.push(this.globals.get(name));
        return;
      }
      case "SET_GLOBAL": this.globals.set(args[0], this.peek()); return;
      case "DEFINE_GLOBAL": this.globals.set(args[0], this.pop()); return;
      case "JUMP": frame.ip = args[0]; return;
      case "JUMP_IF_FALSE": if (!truthy(this.peek())) frame.ip = args[0]; return;
      case "MAKE_LIST": {
        const n = args[0];
        const items = this.stack.splice(this.stack.length - n, n);
        this.push(items);
        return;
      }
      case "MAKE_MAP": {
        const n = args[0];
        const flat = this.stack.splice(this.stack.length - 2 * n, 2 * n);
        const m = new Map();
        for (let k = 0; k < flat.length; k += 2) m.set(flat[k], flat[k + 1]);
        this.push(m);
        return;
      }
      case "INDEX_GET": {
        const idx = this.pop();
        const obj = this.pop();
        if (obj instanceof Map) { this.push(obj.has(idx) ? obj.get(idx) : null); return; }
        if (obj == null || obj[idx] === undefined) throw new VMRuntimeError(`خطأ في الفهرسة عند ${idx}`);
        this.push(obj[idx]);
        return;
      }
      case "INDEX_SET": {
        const idx = this.pop();
        const obj = this.pop();
        const value = this.pop();
        if (obj == null) throw new VMRuntimeError("خطأ في الفهرسة");
        if (obj instanceof Map) obj.set(idx, value); else obj[idx] = value;
        this.push(value);
        return;
      }
      case "ADD": { const b = this.pop(), a = this.pop(); this.push(a + b); return; }
      case "SUB": { const b = this.pop(), a = this.pop(); this.push(a - b); return; }
      case "MUL": { const b = this.pop(), a = this.pop(); this.push(a * b); return; }
      case "DIV": {
        const b = this.pop(), a = this.pop();
        if (b === 0) throw new VMRuntimeError("قسمة على صفر");
        this.push(a / b);
        return;
      }
      case "MOD": { const b = this.pop(), a = this.pop(); this.push(a % b); return; }
      case "NEG": this.push(-this.pop()); return;
      case "NOT": this.push(!truthy(this.pop())); return;
      case "EQ": { const b = this.pop(), a = this.pop(); this.push(a === b); return; }
      case "NEQ": { const b = this.pop(), a = this.pop(); this.push(a !== b); return; }
      case "LT": { const b = this.pop(), a = this.pop(); this.push(a < b); return; }
      case "GT": { const b = this.pop(), a = this.pop(); this.push(a > b); return; }
      case "LTE": { const b = this.pop(), a = this.pop(); this.push(a <= b); return; }
      case "GTE": { const b = this.pop(), a = this.pop(); this.push(a >= b); return; }
      case "FOR_TEST": {
        const step = this.pop(), end = this.pop(), i = this.pop();
        this.push(step > 0 ? i <= end : i >= end);
        return;
      }
      case "BUILD_FUNCTION": {
        const chunkIndex = args[0];
        this.push(new VMFunction(chunkIndex, this.functionChunks[chunkIndex]));
        return;
      }
      case "CALL": {
        const argCount = args[0];
        const argVals = this.stack.splice(this.stack.length - argCount, argCount);
        const callee = this.pop();
        if (callee instanceof VMFunction) {
          const locals = new Array(callee.chunk.maxSlots).fill(null);
          callee.chunk.params.forEach((_, i) => { locals[i] = i < argVals.length ? argVals[i] : null; });
          this.frames.push(new CallFrame(callee.chunk, locals, this.stack.length));
          return;
        }
        if (typeof callee === "function") {
          this.push(callee(...argVals));
          return;
        }
        throw new VMRuntimeError("غير قابل للاستدعاء");
      }
      case "RETURN": {
        const value = this.pop();
        this.frames.pop();
        this.push(value);
        return;
      }
      default:
        throw new VMRuntimeError(`تعليمة غير معروفة: ${op}`);
    }
  }

  _setupBuiltins() {
    const g = this.globals;
    g.set("اطبع", (...a) => { this.onPrint(a.map(toDisplay).join(" ")); return null; });
    g.set("طول", (x) => { if (typeof x === "string" || Array.isArray(x)) return x.length; throw new VMRuntimeError("طول() تحتاج نص أو قائمة"); });
    g.set("أضف", (lst, val) => { if (!Array.isArray(lst)) throw new VMRuntimeError("أضف() تحتاج قائمة"); lst.push(val); return lst; });
    g.set("نص", (x) => toDisplay(x));
    g.set("عدد", (x) => {
      const normalized = typeof x === "string" ? normalizeDigits(x) : x;
      const f = parseFloat(normalized);
      if (isNaN(f)) throw new VMRuntimeError(`لا يمكن تحويل "${x}" إلى رقم`);
      return f;
    });
    g.set("احفظ_ملف", (path, content) => { this.onSaveFile(path, content); return path; });
    g.set("جذر", (x) => { if (x < 0) throw new VMRuntimeError("لا يوجد جذر حقيقي لعدد سالب"); return Math.sqrt(x); });
    g.set("قوة", (a, b) => Math.pow(a, b));
    g.set("مطلق", (x) => Math.abs(x));
    g.set("جولة", (x) => Math.round(x));
    g.set("أرضية", (x) => Math.floor(x));
    g.set("سقف", (x) => Math.ceil(x));
    g.set("الأكبر", (...a) => { const v = a.length === 1 && Array.isArray(a[0]) ? a[0] : a; if (!v.length) throw new VMRuntimeError("الأكبر() تحتاج قيمة واحدة على الأقل"); return Math.max(...v); });
    g.set("الأصغر", (...a) => { const v = a.length === 1 && Array.isArray(a[0]) ? a[0] : a; if (!v.length) throw new VMRuntimeError("الأصغر() تحتاج قيمة واحدة على الأقل"); return Math.min(...v); });
    g.set("عشوائي", (من, إلى) => {
      if (من === undefined) return Math.random();
      if (إلى === undefined) throw new VMRuntimeError("عشوائي(من, إلى) تحتاج حدين");
      return Math.floor(Math.random() * (إلى - من + 1)) + من;
    });
    g.set("اقتطع", (s, a, b) => { if (typeof s !== "string") throw new VMRuntimeError("اقتطع() تحتاج نصًا"); return b === undefined ? s.slice(a) : s.slice(a, b); });
    g.set("استبدل", (s, a, b) => { if (typeof s !== "string") throw new VMRuntimeError("استبدل() تحتاج نصًا"); return s.split(a).join(b); });
    g.set("يحوي", (c, v) => { if (typeof c === "string" || Array.isArray(c)) return c.includes(v); throw new VMRuntimeError("يحوي() تحتاج نصًا أو قائمة"); });
    g.set("افصل", (s, sep) => { if (typeof s !== "string") throw new VMRuntimeError("افصل() تحتاج نصًا"); return s.split(sep === undefined ? " " : sep); });
    g.set("اربط", (lst, sep) => { if (!Array.isArray(lst)) throw new VMRuntimeError("اربط() تحتاج قائمة"); return lst.map(toDisplay).join(sep === undefined ? "" : sep); });
    g.set("قصّ", (s) => { if (typeof s !== "string") throw new VMRuntimeError("قصّ() تحتاج نصًا"); return s.trim(); });
    g.set("رتب", (lst) => {
      if (!Array.isArray(lst)) throw new VMRuntimeError("رتب() تحتاج قائمة");
      const c = [...lst];
      c.sort((a, b) => (typeof a === "number" && typeof b === "number") ? a - b : String(a).localeCompare(String(b), "ar"));
      return c;
    });
    g.set("اعكس", (v) => {
      if (Array.isArray(v)) return [...v].reverse();
      if (typeof v === "string") return [...v].reverse().join("");
      throw new VMRuntimeError("اعكس() تحتاج نصًا أو قائمة");
    });
    const requireDom = (fnName) => {
      if (!this.domRoot) throw new VMRuntimeError(`${fnName}() تحتاج بيئة واجهة حية`);
      return this.domRoot;
    };
    g.set("عنصر_جديد", (tag) => { requireDom("عنصر_جديد"); if (typeof tag !== "string") throw new VMRuntimeError("عنصر_جديد() تحتاج اسم وسم نصي"); return document.createElement(tag); });
    g.set("عيّن_نص", (el, v) => { requireDom("عيّن_نص"); if (!(el instanceof Element)) throw new VMRuntimeError("عيّن_نص() تحتاج عنصر واجهة صالحًا"); el.textContent = toDisplay(v); return el; });
    g.set("عيّن_نمط", (el, k, v) => { requireDom("عيّن_نمط"); if (!(el instanceof Element)) throw new VMRuntimeError("عيّن_نمط() تحتاج عنصر واجهة صالحًا"); el.style.setProperty(String(k), String(v)); return el; });
    g.set("أضف_فئة", (el, c) => { requireDom("أضف_فئة"); if (!(el instanceof Element)) throw new VMRuntimeError("أضف_فئة() تحتاج عنصر واجهة صالحًا"); el.classList.add(String(c)); return el; });
    g.set("أضف_ابن", (p, c) => { requireDom("أضف_ابن"); if (!(p instanceof Element) || !(c instanceof Element)) throw new VMRuntimeError("أضف_ابن() تحتاج عنصرَي واجهة صالحَين"); p.appendChild(c); return p; });
    g.set("امسح_عنصر", (el) => { requireDom("امسح_عنصر"); if (!(el instanceof Element)) throw new VMRuntimeError("امسح_عنصر() تحتاج عنصر واجهة صالحًا"); el.innerHTML = ""; return el; });
    g.set("اقرأ_قيمة", (el) => { requireDom("اقرأ_قيمة"); if (!(el instanceof Element)) throw new VMRuntimeError("اقرأ_قيمة() تحتاج عنصر واجهة صالحًا"); return normalizeDigits(String(el.value !== undefined ? el.value : "")); });
    g.set("عيّن_قيمة", (el, v) => { requireDom("عيّن_قيمة"); if (!(el instanceof Element)) throw new VMRuntimeError("عيّن_قيمة() تحتاج عنصر واجهة صالحًا"); el.value = toDisplay(v); return el; });
    g.set("عند_نقر", (el, fn) => {
      requireDom("عند_نقر");
      if (!(el instanceof Element)) throw new VMRuntimeError("عند_نقر() تحتاج عنصر واجهة صالحًا");
      if (!(fn instanceof VMFunction)) throw new VMRuntimeError("عند_نقر() تحتاج دالة معرّفة");
      const self = this;
      el.addEventListener("click", () => {
        try { self.callFunctionExternally(fn, []); }
        catch (e) { self.onPrint("خطأ داخل معالج النقر: " + e.message); }
      });
      return el;
    });
    g.set("الجذر", () => { requireDom("الجذر"); return this.domRoot; });
    g.set("نفّذ", (code) => {
      if (typeof code !== "string") throw new VMRuntimeError("نفّذ() تحتاج نصًا يمثّل كود ضاد");
      const output = [];
      try {
        const program = parse(code);
        const { mainChunkIndex, functionChunks } = compile(program);
        const subVm = new VM({ maxSteps: 200000, onPrint: (l) => output.push(l), onSaveFile: () => { throw new VMRuntimeError("الحفظ غير متاح داخل نفّذ()"); } });
        subVm.run(mainChunkIndex, functionChunks);
      } catch (e) {
        output.push("خطأ: " + e.message);
      }
      return output;
    });
  }

  callFunctionExternally(vmFunction, args) {
    const savedFrames = this.frames;
    const savedStack = this.stack;
    this.frames = [];
    this.stack = [];
    const locals = new Array(vmFunction.chunk.maxSlots).fill(null);
    vmFunction.chunk.params.forEach((_, i) => { locals[i] = i < args.length ? args[i] : null; });
    this.frames.push(new CallFrame(vmFunction.chunk, locals, 0));
    this._loop();
    const result = this.stack.length ? this.stack[this.stack.length - 1] : null;
    this.frames = savedFrames;
    this.stack = savedStack;
    return result;
  }
}

if (typeof module !== "undefined") {
  module.exports = { VM, VMFunction, VMRuntimeError, toDisplay, truthy };
}
