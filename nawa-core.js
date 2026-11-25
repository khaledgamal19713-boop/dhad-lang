(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;root.NawaCore=api;})(typeof globalThis!=="undefined"?globalThis:this,function(){"use strict";
const VERSION="0.2.0";
const LABELS=["code","math","text","knowledge","unknown"];
const SEED=[
["code","اكتب برنامج ضاد"],["code","نفذ كود ضاد"],["code","دالة تجمع عددين"],["code","اطبع الناتج في ضاد"],["code","متغير س يساوي خمسة"],["code","حلقة طالما في البرنامج"],
["math","احسب ١٢ في ٧"],["math","كم حاصل ٣٠ زائد ٥"],["math","اقسم ١٠٠ على ٤"],["math","احسب ٩ ناقص ٢"],["math","ما ناتج ٨ ضرب ٦"],
["text","لخص هذه الفقرة"],["text","أعد صياغة هذا النص"],["text","صحح الجملة لغويا"],["text","ترجم هذه العبارة"],["text","اشرح معنى هذه الكلمة"],
["knowledge","ابحث في الذاكرة عن مهارة الحساب"],["knowledge","استرجع المهارة المحفوظة"],["knowledge","ما المهارات التي تعلمتها"],["knowledge","اعرض سجل التدريب"],
["unknown","افعل شيئا مفيدا"],["unknown","ساعدني في أمر جديد"],["unknown","ما رأيك في هذا الموضوع"]
];
function tokenize(s){return String(s||"").toLowerCase().normalize("NFKC").replace(/[ًٌٍَُِّْـٰ]/g,"").match(/[\p{L}\p{N}_]+/gu)||[];}
function features(s){const w=tokenize(s),f={"$bias":1};for(const t of w){f["w:"+t]=(f["w:"+t]||0)+1;if(t.length>=3)for(let i=0;i<=t.length-3;i++){const k="c:"+t.slice(i,i+3);f[k]=(f[k]||0)+0.25;}}for(let i=0;i<w.length-1;i++){const k="b:"+w[i]+"_"+w[i+1];f[k]=(f[k]||0)+0.5;}return f;}
function softmax(scores){const m=Math.max.apply(null,scores),e=scores.map(x=>Math.exp(Math.max(-30,Math.min(30,x-m)))),z=e.reduce((a,b)=>a+b,0)||1;return e.map(x=>x/z);}
class WeightedRouter{
constructor(state){this.labels=LABELS.slice();this.weights=state&&state.weights?state.weights:{};this.examples=state&&state.examples?state.examples.slice():[];this.epochs=state&&state.epochs||0;this.trainedAt=state&&state.trainedAt||null;}
predict(text){const f=features(text),scores=this.labels.map(l=>Object.entries(f).reduce((s,[k,v])=>s+v*((this.weights[l]||{})[k]||0),0)),p=softmax(scores),rank=this.labels.map((label,i)=>({label,score:p[i]})).sort((a,b)=>b.score-a.score);return {label:rank[0].label,confidence:rank[0].score,ranking:rank,scores:Object.fromEntries(rank.map(x=>[x.label,Number(x.score.toFixed(5))]))};}
train(data,epochs=18,rate=0.18){const rows=(data||[]).filter(x=>this.labels.includes(x.label)&&String(x.text||"").trim());if(!rows.length)throw Error("لا توجد أمثلة تدريب صالحة");for(let e=0;e<epochs;e++){let errors=0;for(const row of rows){const f=features(row.text),p=this.predict(row.text);if(p.label!==row.label){errors++;for(const [k,v] of Object.entries(f)){this.weights[row.label]=this.weights[row.label]||{};this.weights[p.label]=this.weights[p.label]||{};this.weights[row.label][k]=(this.weights[row.label][k]||0)+rate*v;this.weights[p.label][k]=(this.weights[p.label][k]||0)-rate*v;}}}}this.examples.push(...rows.map(x=>({text:x.text,label:x.label})));this.epochs+=epochs;this.trainedAt=new Date().toISOString();return {examples:rows.length,epochs,trainedTotal:this.examples.length,accuracy:this.evaluate(rows)};}
evaluate(rows){if(!rows.length)return 0;return rows.filter(x=>this.predict(x.text).label===x.label).length/rows.length;}
export(){return {version:VERSION,labels:this.labels,weights:this.weights,examples:this.examples,epochs:this.epochs,trainedAt:this.trainedAt};}
}
class EngineRegistry{
constructor(){this.engines=new Map();}
register(id,meta,run){if(!id||typeof run!=="function")throw Error("تعريف محرك غير صالح");this.engines.set(id,{id,...meta,run});return this;}
list(){return [...this.engines.values()].map(({run,...meta})=>meta);}
execute(id,input,context){const e=this.engines.get(id);if(!e)throw Error("محرك غير مسجل: "+id);return e.run(input,context||{});}
}
class SkillLibrary{
constructor(items){this.items=Array.isArray(items)?items.slice():[];}
add(skill){if(!skill||!skill.name||!skill.engine)throw Error("المهارة تحتاج اسمًا ومحركًا");const item={version:1,createdAt:new Date().toISOString(),...skill};this.items=this.items.filter(x=>x.name!==item.name);this.items.unshift(item);return item;}
search(query,limit=5){const terms=tokenize(query);return this.items.map(s=>{const hay=tokenize(s.name+" "+(s.description||"")+" "+(s.triggers||[]).join(" "));const score=terms.reduce((n,t)=>n+(hay.includes(t)?1:0),0);return {skill:s,score};}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,limit);}
export(){return this.items.slice();}
}
function defaultTraining(){return SEED.map(([label,text])=>({label,text}));}
return {VERSION,LABELS,WeightedRouter,EngineRegistry,SkillLibrary,defaultTraining,features};
});
