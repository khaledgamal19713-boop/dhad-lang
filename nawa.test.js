const assert = require("node:assert/strict");
const NawaCore = require("./nawa-core.js");
const front = require("./front.js");
const compiler = require("./compiler.js");
global.toArabicIndicDigits = front.toArabicIndicDigits;
global.normalizeDigits = front.normalizeDigits;
global.parse = front.parse;
global.compile = compiler.compile;
const { VM } = require("./vm.js");
const { parse } = front;
const { compile } = compiler;

function run(source) {
  const ast = parse(source);
  const compiled = compile(ast);
  const output = [];
  const vm = new VM({ maxSteps: 250000, onPrint: value => output.push(String(value)) });
  vm.run(compiled.mainChunkIndex, compiled.functionChunks);
  return output.join("\n");
}

const cases = [
  ["function call", 'دالة مربع(س) { ارجع س * س }\nاطبع(مربع(٧))', "٤٩"],
  ["Arabic-Indic digits", "متغير س = ١٢٣\nاطبع(س + ٧)", "١٣٠"],
  ["conditional", 'إذا (٣ < ٥) { اطبع("صحيح") } وإلا { اطبع("خطأ") }', "صحيح"],
  ["for loop", "من_أجل (i من ١ إلى ٤) { اطبع(i) }", "١\n٢\n٣\n٤"],
];
for (const [name, source, expected] of cases) {
  assert.equal(run(source), expected, name);
  process.stdout.write("PASS " + name + "\n");
}
assert.throws(() => run("متغير س = ١ / ٠"), /قسمة على صفر/, "division by zero");
process.stdout.write("PASS division by zero\n");
process.stdout.write("All 5 Dhad VM integration tests passed.\n");

const learner = new NawaCore.WeightedRouter();
const trained = learner.train(NawaCore.defaultTraining(), 40);
assert.equal(trained.examples, NawaCore.defaultTraining().length);
assert.equal(learner.predict("اكتب برنامج ضاد").label, "code");
assert.equal(learner.predict("احسب ١٢ في ٧").label, "math");
assert.equal(learner.predict("لخص هذه الفقرة").label, "text");
assert.equal(learner.predict("استرجع المهارة المحفوظة").label, "knowledge");
const exported = learner.export();
const restored = new NawaCore.WeightedRouter(exported);
assert.equal(restored.predict("اكتب برنامج ضاد").label, "code");
const library = new NawaCore.SkillLibrary();
library.add({name:"مهارة الجمع",engine:"calculator",description:"جمع الأعداد",triggers:["اجمع","حساب"]});
assert.equal(library.search("اجمع الأعداد")[0].skill.name, "مهارة الجمع");
const registry = new NawaCore.EngineRegistry();
registry.register("sum",{name:"حاسبة اختبار"},x=>x.a+x.b);
assert.equal(registry.execute("sum",{a:3,b:4}),7);
process.stdout.write("PASS Nawa weighted learner, persistence, skills and engine registry\n");
