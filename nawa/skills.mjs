import { SkillRegistry } from "./kernel.mjs";

export function createCoreSkills() {
  const registry = new SkillRegistry();
  registry.register({ id:"evidence_audit", domains:["language","fiqh","hadith","general"], run:({evidence}) => {
    const items=evidence.list();
    return { count:items.length, byKind:items.reduce((a,e)=>(a[e.kind]=(a[e.kind]||0)+1,a),{}),
      lowConfidence:items.filter(e=>e.confidence<0.7).map(e=>e.id),
      missingSource:items.filter(e=>!e.source).map(e=>e.id) };
  }});
  registry.register({ id:"cross_domain_linker", domains:["language","fiqh","hadith","general"], run:({evidence,prior}) => {
    const items=evidence.list(), links=[];
    for(let i=0;i<items.length;i++) for(let j=i+1;j<items.length;j++) {
      const a=items[i],b=items[j];
      if(a.scope===b.scope && a.kind!==b.kind) links.push({a:a.id,b:b.id,relation:"same-scope-different-evidence-kind"});
    }
    return { candidateLinks:links, evidenceAudit:prior.evidence_audit ?? null };
  }});
  registry.register({ id:"counterargument_generator", domains:["language","fiqh","hadith","general"], run:({task,prior}) => ({
    prompts:[
      "ما أقوى اعتراض على النتيجة المقترحة؟",
      "هل توجد حالة استثنائية تنقض تعميم القاعدة؟",
      "هل اختلط النقل التاريخي بالتخريج أو الاستنتاج؟",
      "ما الدليل المستقل الذي يمكن أن ي falsify هذه النتيجة؟"
    ], target:task, basedOn:Object.keys(prior)
  })});
  registry.register({ id:"provenance_verifier", domains:["language","fiqh","hadith","general"], run:({evidence,prior}) => ({
    allClaimsRequireEvidence:true, evidenceCount:evidence.list().length,
    conclusions:prior.rule_engine ?? [], warning:"لا تعتمد نتيجة علمية نهائية دون مراجعة المصادر الأصلية والتحقق من دلالة كل مصدر."
  })});
  return registry;
}
