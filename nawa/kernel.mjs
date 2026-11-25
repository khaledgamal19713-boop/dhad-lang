/**
 * NAWA kernel: engine-centric orchestration with evidence provenance.
 * Node.js 18+, zero dependencies. No neural weights are bundled.
 */
import { createHash, randomUUID } from "node:crypto";

export class Evidence {
  constructor({ id = randomUUID(), text, source, kind = "primary", scope = "unspecified", confidence = 1, metadata = {} }) {
    if (!text || !source) throw new TypeError("Evidence requires text and source");
    this.id = id; this.text = text; this.source = source; this.kind = kind;
    this.scope = scope; this.confidence = Math.max(0, Math.min(1, confidence));
    this.metadata = metadata; Object.freeze(this);
  }
}
export class EvidenceGraph {
  constructor() { this.nodes = new Map(); this.edges = []; }
  add(item) { const e = item instanceof Evidence ? item : new Evidence(item); this.nodes.set(e.id, e); return e; }
  relate(from, relation, to, note = "") {
    if (!this.nodes.has(from) || !this.nodes.has(to)) throw new Error("Unknown evidence node");
    this.edges.push({ from, relation, to, note }); return this;
  }
  list() { return [...this.nodes.values()]; }
  toJSON() { return { nodes: this.list(), edges: this.edges }; }
}
export class RuleEngine {
  constructor() { this.rules = []; }
  register(rule) {
    if (!rule.id || typeof rule.when !== "function" || typeof rule.then !== "function") throw new TypeError("Invalid rule");
    this.rules.push(Object.freeze({ priority: 0, exceptions: () => false, ...rule }));
    this.rules.sort((a,b) => b.priority-a.priority);
    return this;
  }
  apply(caseData) {
    const results = [];
    for (const rule of this.rules) {
      let matched = false, excepted = false;
      try { matched = !!rule.when(caseData); if (matched) excepted = !!rule.exceptions(caseData); }
      catch (error) { results.push({ rule: rule.id, status: "error", error: error.message }); continue; }
      if (matched) results.push({ rule: rule.id, status: excepted ? "defeated" : "applied",
        conclusion: excepted ? null : rule.then(caseData), rationale: rule.rationale ?? "",
        source: rule.source ?? null, confidence: rule.confidence ?? 1 });
    }
    return results;
  }
}
export class SkillRegistry {
  constructor() { this.skills = new Map(); }
  register({ id, domains = [], run, requires = [] }) {
    if (!id || typeof run !== "function") throw new TypeError("Skill requires id and run()");
    this.skills.set(id, Object.freeze({ id, domains, run, requires })); return this;
  }
  get(id) { return this.skills.get(id); }
  select(domain) { return [...this.skills.values()].filter(s => !s.domains.length || s.domains.includes(domain)); }
}
export class TaskWorkspace {
  constructor(task) {
    this.id = randomUUID(); this.task = task; this.createdAt = new Date().toISOString();
    this.state = new Map(); this.trace = []; this.evidence = new EvidenceGraph();
    this.results = {}; this.closed = false;
  }
  set(key, value) { if (this.closed) throw new Error("Workspace closed"); this.state.set(key, value); }
  log(stage, status, detail = {}) { this.trace.push({ at: new Date().toISOString(), stage, status, ...detail }); }
  close() { this.state.clear(); this.closed = true; }
}
export class PatternMemory {
  constructor() { this.patterns = new Map(); }
  remember({ id, pattern, validation, sourceTask }) {
    if (!validation?.passed) throw new Error("Only validated patterns may persist");
    const key = id || createHash("sha256").update(JSON.stringify(pattern)).digest("hex").slice(0,16);
    this.patterns.set(key, { id:key, pattern, validation, sourceTask, storedAt:new Date().toISOString() });
    return key;
  }
  retrieve(predicate = () => true) { return [...this.patterns.values()].filter(predicate); }
}
export class CompatibleModel {
  constructor(env = process.env) {
    this.url = env.NAWA_MODEL_URL; this.key = env.NAWA_API_KEY; this.model = env.NAWA_MODEL_NAME;
  }
  get enabled() { return !!(this.url && this.model); }
  async complete(messages, { temperature = 0.1 } = {}) {
    if (!this.enabled) return { skipped: true, reason: "No model provider configured" };
    const response = await fetch(this.url, { method:"POST", headers:{
      "content-type":"application/json", ...(this.key ? { authorization:`Bearer ${this.key}` } : {})
    }, body:JSON.stringify({ model:this.model, messages, temperature }) });
    if (!response.ok) throw new Error(`Model provider HTTP ${response.status}: ${(await response.text()).slice(0,500)}`);
    const data = await response.json();
    return { text:data.choices?.[0]?.message?.content ?? "", usage:data.usage ?? null, model:this.model };
  }
}
export class NawaKernel {
  constructor({ skills = new SkillRegistry(), rules = new RuleEngine(), memory = new PatternMemory(), model = new CompatibleModel(), evaluator = null } = {}) {
    this.skills = skills; this.rules = rules; this.memory = memory; this.model = model; this.evaluator = evaluator;
  }
  async run(task, { domain = "general", evidence = [], caseData = {}, synthesize = true } = {}) {
    const w = new TaskWorkspace(task);
    try {
      w.log("intake","ok",{domain});
      for (const item of evidence) w.evidence.add(item);
      const selected = this.skills.select(domain);
      w.log("planning","ok",{skills:selected.map(s=>s.id)});
      for (const skill of selected) {
        const missing = skill.requires.filter(k => !w.state.has(k) && !(k in w.results));
        if (missing.length) { w.log(skill.id,"skipped",{missing}); continue; }
        const result = await skill.run({ task, domain, workspace:w, evidence:w.evidence, rules:this.rules, prior:w.results });
        w.results[skill.id] = result;
        w.log(skill.id,"ok");
      }
      const ruleResults = this.rules.apply({ task, domain, evidence:w.evidence.list(), results:w.results });
      w.results.rule_engine = ruleResults;
      const unresolved = ruleResults.filter(x => x.status === "error" || x.status === "defeated");
      w.log("rule_engine","ok",{applied:ruleResults.filter(x=>x.status==="applied").length, unresolved:unresolved.length});
      let synthesis = { skipped:true, reason:"Synthesis disabled" };
      if (synthesize && this.model.enabled) {
        synthesis = await this.model.complete([
          { role:"system", content:"Synthesize only from supplied evidence and rule outputs. Distinguish established facts, inference, disagreement, and unknowns. Never invent citations. If evidence is insufficient, say so." },
          { role:"user", content:JSON.stringify({ task, domain, evidence:w.evidence.toJSON(), results:w.results }) }
        ]);
        w.log("model_synthesis", "ok", { model:this.model.model });
      } else w.log("model_synthesis","skipped",{reason:synthesis.reason || "No model provider configured"});
      const report = { taskId:w.id, task, domain, evidence:w.evidence.toJSON(), results:w.results, synthesis, trace:w.trace,
        status: unresolved.length ? "needs_review" : "completed_with_scope_limits" };
      if (this.evaluator) report.evaluation = await this.evaluator(report);
      return report;
    } finally { w.close(); }
  }
}
