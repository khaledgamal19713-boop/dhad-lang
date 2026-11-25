const assert = require("node:assert/strict");
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
