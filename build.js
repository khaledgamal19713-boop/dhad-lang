const fs = require("fs");
const path = require("path");

function build(shellFile, replacements, outFile) {
  let content = fs.readFileSync(shellFile, "utf8");
  for (const [key, file] of Object.entries(replacements)) {
    const piece = fs.readFileSync(file, "utf8");
    content = content.split(key).join(piece);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, content);
  console.log("Built", outFile, "-", content.length, "bytes");
}

build(
  "editor_shell.html",
  {
    __CSS__: "editor.css",
    __ENGINE__: "engine.browser.js",
    __HIGHLIGHTER__: "highlighter.js",
    __AUTOCOMPLETE__: "autocomplete.js",
    __TEMPLATES__: "templates.js",
    __UI__: "editor_ui.js",
  },
  "dist/index.html"
);

build(
  "guide_shell.html",
  {
    __CSS__: "guide.css",
    __ENGINE__: "engine.browser.js",
    __HIGHLIGHTER__: "highlighter.js",
  },
  "dist/guide.html"
);
