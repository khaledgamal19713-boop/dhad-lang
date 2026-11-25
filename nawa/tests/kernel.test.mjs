import test from "node:test";
import assert from "node:assert/strict";
import { NawaKernel, Evidence, EvidenceGraph, RuleEngine, PatternMemory, TaskWorkspace } from "../kernel.mjs";
import { createCoreSkills } from "../skills.mjs";

test("evidence graph preserves source and relationships",()=>{
 const g=new EvidenceGraph(); const a=g.add({text:"a",source:"book:A"}); const b=g.add({text:"b",source:"book:B"});
 g.relate(a.id,"corroborates",b.id); assert.equal(g.toJSON().edges.length,1); assert.equal(g.list()[0].source,"book:A");
});
test("rule engine distinguishes applied and defeated rules",()=>{
 const r=new RuleEngine().register({id:"r1",when:()=>true,then:()=>"yes"}).register({id:"r2",when:()=>true,exceptions:()=>true,then:()=>"no"});
 assert.deepEqual(r.apply({}).map(x=>x.status),["applied","defeated"]);
});
test("unvalidated patterns cannot become persistent memory",()=>{
 const m=new PatternMemory(); assert.throws(()=>m.remember({pattern:{x:1},validation:{passed:false}}));
 assert.equal(m.remember({pattern:{x:1},validation:{passed:true}}).length,16);
});
test("task-local fast state is cleared on close",()=>{
 const w=new TaskWorkspace("t"); w.set("temporary",42); w.close(); assert.equal(w.state.size,0); assert.throws(()=>w.set("x",1));
});
test("kernel coordinates skills and returns auditable trace",async()=>{
 const k=new NawaKernel({skills:createCoreSkills(),rules:new RuleEngine()});
 const out=await k.run("test",{domain:"hadith",evidence:[new Evidence({text:"sample",source:"fixture"})],synthesize:true});
 assert.equal(out.status,"completed_with_scope_limits");
 assert.ok(out.results.evidence_audit); assert.ok(out.results.counterargument_generator); assert.ok(out.trace.length>=5);
 assert.equal(out.synthesis.skipped,true);
});
