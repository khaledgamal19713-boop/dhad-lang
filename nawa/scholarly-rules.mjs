const OPS=new Set(["eq","neq","in","contains","gte","lte","exists"]);
const get=(obj,path)=>String(path).split(".").reduce((v,k)=>v==null?undefined:v[k],obj);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function testCondition(actual,op,expected){
 if(op==="exists")return expected===false?actual===undefined:actual!==undefined;
 if(op==="eq")return same(actual,expected);
 if(op==="neq")return !same(actual,expected);
 if(op==="in")return Array.isArray(expected)&&expected.some(x=>same(x,actual));
 if(op==="contains")return Array.isArray(actual)?actual.some(x=>same(x,expected)):typeof actual==="string"&&actual.includes(String(expected));
 if(op==="gte")return typeof actual==="number"&&actual>=expected;
 if(op==="lte")return typeof actual==="number"&&actual<=expected;
 return false;
}
export function validateScholarlyRule(rule){
 const errors=[];
 for(const k of ["id","discipline","ruleType","sourceWorkId"])if(typeof rule?.[k]!=="string"||!rule[k].trim())errors.push("missing_"+k);
 if(!rule?.conclusion||typeof rule.conclusion.predicate!=="string"||!("value"in rule.conclusion))errors.push("invalid_conclusion");
 if(!Array.isArray(rule?.premises))errors.push("premises_must_be_array");
 else for(const [i,p]of rule.premises.entries())if(typeof p.field!=="string"||!OPS.has(p.op)||!("value"in p))errors.push("invalid_premise_"+i);
 if(!Array.isArray(rule?.evidenceRefs)||!rule.evidenceRefs.length)errors.push("missing_evidence_refs");
 if(!["qat'i","zanni","majority","custom"].includes(rule?.epistemicStatus))errors.push("invalid_epistemic_status");
 if(rule?.discipline==="fiqh"&&!rule?.scope?.madhhab)errors.push("fiqh_rule_requires_madhhab_scope");
 if(rule?.discipline==="hadith"&&!rule?.scope?.method)errors.push("hadith_rule_requires_method_scope");
 return {valid:errors.length===0,errors};
}
export class ScholarlyRuleBase{
 constructor(){this.rules=new Map();}
 register(rule,{knownEvidence=new Set()}={}){
  const checked=validateScholarlyRule(rule);if(!checked.valid)throw new TypeError("Invalid scholarly rule: "+checked.errors.join(", "));
  const missing=rule.evidenceRefs.filter(id=>!knownEvidence.has(id));if(missing.length)throw new Error("Unknown evidence references: "+missing.join(", "));
  if(this.rules.has(rule.id))throw new Error("Duplicate rule id: "+rule.id);
  const frozen=Object.freeze({...rule,premises:Object.freeze(rule.premises.map(x=>Object.freeze({...x}))),evidenceRefs:Object.freeze([...rule.evidenceRefs]),scope:Object.freeze({...rule.scope}),exceptions:Object.freeze([...(rule.exceptions||[])]),priority:Number.isFinite(rule.priority)?rule.priority:0});
  this.rules.set(rule.id,frozen);return this;
 }
 evaluate(caseData,{evidenceIds=new Set(),discipline=null}={}){
  const results=[];
  for(const rule of this.rules.values()){
   if(discipline&&rule.discipline!=="cross-domain"&&rule.discipline!==discipline)continue;
   const missing=rule.evidenceRefs.filter(id=>!evidenceIds.has(id));
   if(missing.length){results.push({ruleId:rule.id,status:"evidence-unavailable",missingEvidence:missing});continue;}
   const scope=rule.scope||{};
   const scopeMismatch=Object.entries(scope).some(([k,v])=>v!==undefined&&get(caseData,"scope."+k)!==v);
   if(scopeMismatch){results.push({ruleId:rule.id,status:"out-of-scope"});continue;}
   const premises=rule.premises.map(p=>({field:p.field,passed:testCondition(get(caseData,p.field),p.op,p.value)}));
   if(premises.some(x=>!x.passed)){results.push({ruleId:rule.id,status:"not-applicable",premises});continue;}
   const failedException=(rule.exceptions||[]).find(ex=>ex.every(p=>testCondition(get(caseData,p.field),p.op,p.value)));
   results.push({ruleId:rule.id,status:failedException?"defeated":"applicable",discipline:rule.discipline,ruleType:rule.ruleType,scope,conclusion:failedException?null:rule.conclusion,epistemicStatus:rule.epistemicStatus,priority:rule.priority,evidenceRefs:rule.evidenceRefs,premises,exception:failedException||null});
  }
  const applicable=results.filter(x=>x.status==="applicable");
  const predicateGroups=new Map();
  for(const item of applicable){
   const predicate=item.conclusion.predicate,valueKey=JSON.stringify(item.conclusion.value);
   if(!predicateGroups.has(predicate))predicateGroups.set(predicate,new Map());
   const alternatives=predicateGroups.get(predicate);
   if(!alternatives.has(valueKey))alternatives.set(valueKey,{value:item.conclusion.value,ruleIds:[],disciplines:[]});
   const alt=alternatives.get(valueKey);alt.ruleIds.push(item.ruleId);if(!alt.disciplines.includes(item.discipline))alt.disciplines.push(item.discipline);
  }
  const conflicts=[...predicateGroups.entries()].filter(([,alts])=>alts.size>1).map(([predicate,alts])=>({predicate,alternatives:[...alts.values()]}));
  return {results,conflicts,summary:{registered:this.rules.size,applicable:applicable.length,defeated:results.filter(x=>x.status==="defeated").length,evidenceUnavailable:results.filter(x=>x.status==="evidence-unavailable").length,conflictingConclusions:conflicts.length,finalVerdict:null,reason:"Rule matches and conflicts are exposed for review; the engine does not silently turn them into a fatwa, hadith grading, or historical attribution."}};
 }
}
