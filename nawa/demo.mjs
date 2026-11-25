import { NawaKernel, Evidence, RuleEngine } from "./kernel.mjs";
import { createCoreSkills } from "./skills.mjs";

const rules = new RuleEngine();
rules.register({ id:"explicit-source-required", priority:100,
  when:c=>c.evidence.length>0, then:c=>({ evidence_count:c.evidence.length, outcome:"evidence-present" }),
  rationale:"لا يثبت الادعاء إلا بوجود مادة مسندة إلى مصدر.", source:"NAWA demo rule", confidence:1 });
const kernel = new NawaKernel({ skills:createCoreSkills(), rules });
const report = await kernel.run("اختبر بنية الأدلة وتماسكها قبل إصدار نتيجة", {
  domain:"fiqh",
  evidence:[new Evidence({ text:"مثال تدريبي لا يمثل دليلًا شرعيًا", source:"demo://fixture", kind:"synthetic", scope:"test", confidence:1 })]
});
console.log(JSON.stringify(report,null,2));
