const assert = require("node:assert/strict");
const { parse } = require("./front.js");
const { compile } = require("./compiler.js");
const { VM } = require("./vm.js");

function run(source) {
  const ast = parse(source);
  const compiled = compile(ast);
  const output = [];
  const vm = new VM({ maxSteps: 250000, onPrint: value => output.push(String(value)) });
  vm.run(compiled.mainChunkIndex, compiled.functionChunks);
  return output.join("\n");
}

const cases = [
  ["function call", 'دالة مربع(س) { ارجع س * س }\nاطبع(مربع(٧))', "49"],
  ["Arabic-Indic digits", "متغير س = ١٢٣\nاطبع(س + ٧)", "130"],
  ["conditional", 'إذا (٣ < ٥) { اطبع("صحيح") } وإلا { اطبع("خطأ") }', "صحيح"],
  ["for loop", "من_أجل (i من ١ إلى ٤) { اطبع(i) }", "1\n2\n3\n4"],
];
for (const [name, source, expected] of cases) {
  assert.equal(run(source), expected, name);
  process.stdout.write("PASS " + name + "\n");
}
assert.throws(() => run("متغير س = ١ / ٠"), /قسمة على صفر/, "division by zero");
process.stdout.write("PASS division by zero\n");
process.stdout.write("All 5 Dhad VM integration tests passed.\n");
