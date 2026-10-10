(function () {
  "use strict";

  const runBtn = document.getElementById("run-btn");
  const statusEngine = document.getElementById("status-engine");
  const statusPos = document.getElementById("status-pos");
  const statusProblems = document.getElementById("status-problems");
  const outputEl = document.getElementById("output");
  const previewFrame = document.getElementById("preview-frame");
  const previewEmpty = document.getElementById("preview-empty");
  const downloadBtn = document.getElementById("download-btn");
  const liveRoot = document.getElementById("live-app-root");
  const liveEmpty = document.getElementById("live-empty");
  const editorContainer = document.getElementById("monaco-editor");
  const tabbarEl = document.getElementById("tabbar");
  const fileTreeEl = document.getElementById("file-tree");
  const problemsEmpty = document.getElementById("problems-empty");
  const problemsList = document.getElementById("problems-list");

  const panelTabs = document.querySelectorAll(".panel-tab");
  const panelViews = {
    problems: document.getElementById("view-problems"),
    output: document.getElementById("view-output"),
    preview: document.getElementById("view-preview"),
    live: document.getElementById("view-live"),
    ai: document.getElementById("view-ai"),
  };
  function showPanel(name) {
    panelTabs.forEach((b) => b.classList.toggle("active", b.dataset.panel === name));
    Object.entries(panelViews).forEach(([k, el]) => el.classList.toggle("active", k === name));
  }
  panelTabs.forEach((b) => b.addEventListener("click", () => showPanel(b.dataset.panel)));

  const sidebarEl = document.getElementById("sidebar");
  const sidebarOverlay = document.getElementById("sidebar-overlay");
  const sidebarToggleBtn = document.getElementById("sidebar-toggle");
  const NARROW_QUERY = "(max-width: 760px)";
  function isNarrow() {
    return typeof window.matchMedia === "function" ? window.matchMedia(NARROW_QUERY).matches : window.innerWidth <= 760;
  }
  function setSidebarOpen(open) {
    sidebarEl.classList.toggle("collapsed", !open);
    sidebarOverlay.classList.toggle("open", open && isNarrow());
  }
  function isSidebarOpen() { return !sidebarEl.classList.contains("collapsed"); }
  sidebarToggleBtn.addEventListener("click", () => setSidebarOpen(!isSidebarOpen()));
  sidebarOverlay.addEventListener("click", () => setSidebarOpen(false));
  setSidebarOpen(!isNarrow());
  if (typeof window.matchMedia === "function") {
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = (e) => setSidebarOpen(!e.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  // ---------- عروض الشريط الجانبي (كل زر له عرضه) ----------
  const VIEW_TITLES = { explorer: "المستكشف", search: "بحث", scm: "التحكم بالمصدر", run: "التشغيل والتصحيح", extensions: "الإضافات" };
  function showSideView(name) {
    Object.keys(VIEW_TITLES).forEach((k) => document.getElementById("sv-" + k).classList.toggle("active", k === name));
    document.getElementById("sidebar-title").textContent = VIEW_TITLES[name];
    document.querySelectorAll(".activity-btn[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
    if (name === "search") setTimeout(() => document.getElementById("search-input").focus(), 0);
  }
  document.querySelectorAll(".activity-btn[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const wasActive = btn.classList.contains("active");
      if (wasActive && isSidebarOpen()) { setSidebarOpen(false); return; }
      showSideView(btn.dataset.view);
      setSidebarOpen(true);
    });
  });
  document.getElementById("settings-btn").addEventListener("click", () => {
    showPanel("output");
    appendLine("الإعدادات: السمة الداكنة، الخط Cairo، حجم الخط ١٤. (مزيد من الإعدادات قريبًا)", "line-meta");
  });
  document.getElementById("side-run-btn").addEventListener("click", () => runCode());

  // ---------- الملفات ----------
  const USER_CAT = "ملفاتي";
  const STORE_KEY = "dhad.files.v1";
  const fileEntries = [];
  const contents = new Map();
  const stamps = new Map(); // آخر تعديل محلي لكل ملف (للفصل في تعارض السحابة)
  const SHARED_CAT = "مشروع مشترك";
  TEMPLATE_GROUPS.forEach((group) => {
    group.items.forEach((item) => {
      const id = group.category + "/" + item.name;
      fileEntries.push({ id, name: item.name + ".ضاد", code: item.code, category: group.category, user: false });
      contents.set(id, item.code);
    });
  });
  function loadStore() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (!raw) return;
      (raw.userFiles || []).forEach((f) => {
        if (!fileEntries.find((e) => e.id === f.id)) {
          fileEntries.push({ id: f.id, name: f.name, code: "", category: USER_CAT, user: true });
        }
      });
      Object.entries(raw.edits || {}).forEach(([id, code]) => { if (fileEntries.find((e) => e.id === id)) contents.set(id, code); });
      Object.entries(raw.stamps || {}).forEach(([id, t]) => stamps.set(id, t));
    } catch (e) { /* التخزين غير متاح */ }
  }
  let saveTimer = null;
  function saveStore() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const edits = {};
        fileEntries.forEach((e) => { if (e.category === SHARED_CAT) return; if (contents.get(e.id) !== e.code || e.user) edits[e.id] = contents.get(e.id) || ""; });
        const userFiles = fileEntries.filter((e) => e.user).map((e) => ({ id: e.id, name: e.name }));
        const st = {}; stamps.forEach((t, id) => { st[id] = t; });
        localStorage.setItem(STORE_KEY, JSON.stringify({ userFiles, edits, stamps: st }));
      } catch (e) { /* تجاهل */ }
      pushToCloud();
    }, 300);
  }
  loadStore();

  function pushToCloud() {
    if (!window.DhadCloud) return;
    DhadCloud.schedulePush(fileEntries.filter((e) => e.user).map((e) => ({ name: e.name, content: contents.get(e.id) || "" })));
  }
  function touch(id) { stamps.set(id, Date.now()); }

  const folderOpen = {};
  function buildTree(pendingNew) {
    fileTreeEl.innerHTML = "";
    const cats = [USER_CAT, SHARED_CAT].concat(TEMPLATE_GROUPS.map((g) => g.category));
    cats.forEach((cat) => {
      const entries = fileEntries.filter((f) => f.category === cat);
      if ((cat === USER_CAT && entries.length === 0 && !pendingNew) || (cat === SHARED_CAT && entries.length === 0)) return;
      if (folderOpen[cat] === undefined) folderOpen[cat] = true;
      const folder = document.createElement("div");
      folder.className = "tree-folder";
      folder.innerHTML = `<span class="twisty">${folderOpen[cat] ? "▾" : "◂"}</span><span>${cat}</span>`;
      const body = document.createElement("div");
      body.className = "tree-group" + (folderOpen[cat] ? " open" : "");
      if (cat === USER_CAT && pendingNew) {
        const row = document.createElement("div");
        row.className = "tree-file";
        const input = document.createElement("input");
        input.className = "tree-input";
        input.value = pendingNew;
        input.setAttribute("aria-label", "اسم الملف الجديد");
        row.innerHTML = '<span class="file-icon">◆</span>';
        row.appendChild(input);
        body.appendChild(row);
        setTimeout(() => { input.focus(); input.select(); }, 0);
        let done = false;
        const finish = (ok) => {
          if (done) return; done = true;
          if (ok) createFileNamed(input.value); else buildTree();
        };
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); finish(true); }
          else if (e.key === "Escape") { e.preventDefault(); finish(false); }
        });
        input.addEventListener("blur", () => finish(true));
      }
      entries.forEach((entry) => {
        const fileEl = document.createElement("div");
        fileEl.className = "tree-file" + (entry.id === activeId ? " active" : "");
        fileEl.dataset.id = entry.id;
        fileEl.innerHTML = `<span class="file-icon">◆</span><span class="file-name"></span>`;
        fileEl.querySelector(".file-name").textContent = entry.name;
        fileEl.addEventListener("click", () => openFile(entry.id, { preview: true }));
        fileEl.addEventListener("dblclick", () => openFile(entry.id, { preview: false }));
        body.appendChild(fileEl);
      });
      folder.addEventListener("click", () => { folderOpen[cat] = !folderOpen[cat]; buildTree(); });
      fileTreeEl.appendChild(folder);
      fileTreeEl.appendChild(body);
    });
  }

  function startNewFile() {
    showSideView("explorer");
    setSidebarOpen(true);
    folderOpen[USER_CAT] = true;
    let n = 1;
    while (fileEntries.find((f) => f.id === USER_CAT + "/بدون عنوان-" + toArabicIndicDigits(String(n)))) n++;
    buildTree("بدون عنوان-" + toArabicIndicDigits(String(n)));
  }
  function createFileNamed(raw) {
    let name = String(raw || "").replace(/[\\/\n]/g, "").trim();
    if (!name) { buildTree(); return; }
    if (!/\.ضاد$/.test(name)) name += ".ضاد";
    let id = USER_CAT + "/" + name.replace(/\.ضاد$/, "");
    let base = name.replace(/\.ضاد$/, ""), k = 2;
    while (fileEntries.find((f) => f.id === id)) { id = USER_CAT + "/" + base + "-" + toArabicIndicDigits(String(k)); name = base + "-" + toArabicIndicDigits(String(k)) + ".ضاد"; k++; }
    fileEntries.push({ id, name, code: "", category: USER_CAT, user: true });
    contents.set(id, "");
    touch(id);
    saveStore();
    buildTree();
    openFile(id, { preview: false });
    if (ed) ed.focus();
  }
  document.getElementById("new-file-btn").addEventListener("click", (e) => { e.stopPropagation(); startNewFile(); });

  // ---------- المحرر (Monaco أو الاحتياطي خلف واجهة واحدة) ----------
  let monaco = null;
  let ed = null;
  const modelsById = new Map();
  let openTabs = [];
  let activeId = null;
  const emptyEl = document.getElementById("editor-empty");

  function getEntry(id) { return fileEntries.find((f) => f.id === id); }

  function getOrCreateModel(id) {
    if (modelsById.has(id)) return modelsById.get(id);
    const model = monaco.editor.createModel(contents.get(id) || "", "dhad");
    model.onDidChangeContent(() => { contents.set(id, model.getValue()); touch(id); saveStore(); if (id === activeId) pinTab(id); });
    modelsById.set(id, model);
    return model;
  }

  function pinTab(id) {
    const tab = openTabs.find((t) => t.id === id);
    if (tab && tab.preview) { tab.preview = false; renderTabs(); }
  }

  function showInEditor(id) {
    emptyEl.hidden = id !== null;
    if (!ed) return;
    ed.show(id !== null);
    if (id === null) return;
    ed.open(id);
  }

  function openFile(id, opts) {
    opts = opts || {};
    const preview = opts.preview !== false;
    let tab = openTabs.find((t) => t.id === id);
    if (!tab) {
      tab = { id, preview };
      if (preview) {
        const previewIdx = openTabs.findIndex((t) => t.preview);
        if (previewIdx !== -1) openTabs.splice(previewIdx, 1, tab);
        else openTabs.push(tab);
      } else {
        openTabs.push(tab);
      }
    } else if (!preview) {
      tab.preview = false;
    }
    activeId = id;
    renderTabs();
    renderTreeActive();
    showInEditor(id);
    clearMarkersFor(id);
    if (isNarrow()) setSidebarOpen(false);
  }

  function closeTab(id, ev) {
    if (ev) ev.stopPropagation();
    const idx = openTabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    openTabs.splice(idx, 1);
    if (activeId === id) {
      const next = openTabs[idx] || openTabs[idx - 1];
      if (next) openFile(next.id, { preview: next.preview });
      else { activeId = null; renderTabs(); renderTreeActive(); showInEditor(null); }
    } else {
      renderTabs();
    }
  }

  function renderTabs() {
    tabbarEl.innerHTML = "";
    openTabs.forEach((t) => {
      const entry = getEntry(t.id);
      const el = document.createElement("div");
      el.className = "tab" + (t.id === activeId ? " active" : "") + (t.preview ? " preview" : "");
      el.innerHTML = `<span class="tab-icon">◆</span><span class="tab-title"></span>`;
      el.querySelector(".tab-title").textContent = entry.name;
      const closeBtn = document.createElement("button");
      closeBtn.className = "tab-close";
      closeBtn.textContent = "×";
      closeBtn.setAttribute("aria-label", "إغلاق");
      closeBtn.addEventListener("click", (e) => closeTab(t.id, e));
      el.appendChild(closeBtn);
      el.addEventListener("click", () => openFile(t.id, { preview: t.preview }));
      tabbarEl.appendChild(el);
    });
  }

  function renderTreeActive() {
    document.querySelectorAll(".tree-file[data-id]").forEach((el) => el.classList.toggle("active", el.dataset.id === activeId));
  }

  function extractLineNumber(msg) {
    const m = msg.match(/السطر\s+([٠-٩0-9]+)/);
    if (!m) return 1;
    const norm = m[1].replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
    return parseInt(norm, 10) || 1;
  }

  function clearMarkersFor(id) {
    if (ed) ed.setError(0, "");
    problemsEmpty.hidden = false;
    problemsList.hidden = true;
    problemsList.innerHTML = "";
    statusProblems.textContent = "✓ 0  ⚠ 0";
  }

  function reportError(id, message) {
    const line = extractLineNumber(message);
    if (ed) ed.setError(line, message);
    problemsEmpty.hidden = true;
    problemsList.hidden = false;
    const entry = getEntry(id);
    const li = document.createElement("li");
    li.innerHTML = `<span class="pi-icon">●</span><span></span><span style="color:#8a8a8a"></span>`;
    li.children[1].textContent = message;
    li.children[2].textContent = (entry ? entry.name : "") + ":" + toArabicIndicDigits(String(line));
    li.addEventListener("click", () => { if (ed) ed.reveal(line); });
    problemsList.appendChild(li);
    statusProblems.textContent = "✓ 0  ⚠ 1";
  }

  let lastSavedFile = null;
  function appendLine(text, cls) {
    const div = document.createElement("div");
    if (cls) div.className = cls;
    div.textContent = text;
    outputEl.appendChild(div);
    outputEl.scrollTop = outputEl.scrollHeight;
  }
  function handleSaveFile(path, content) {
    lastSavedFile = { name: path, content };
    appendLine(`↳ تم استدعاء احفظ_ملف: "${path}" (${toArabicIndicDigits(String(content.length))} حرفًا)`, "line-meta");
    downloadBtn.hidden = false;
    downloadBtn.disabled = false;
    downloadBtn.textContent = `⭳ تنزيل «${path}»`;
    if (/\.html?$/i.test(path)) {
      previewFrame.srcdoc = content;
      previewFrame.hidden = false;
      previewEmpty.hidden = true;
    }
  }
  downloadBtn.addEventListener("click", async () => {
    if (!lastSavedFile) return;
    if (!caps.downloads) { appendLine("التنزيل غير متاح في هذه البيئة الحالية.", "line-meta"); return; }
    downloadBtn.disabled = true;
    try { await caps.downloads.save({ filename: lastSavedFile.name, data: lastSavedFile.content }); }
    catch (e) { appendLine("تعذّر حفظ الملف: " + (e && e.code ? e.code : "خطأ غير معروف"), "line-error"); }
    finally { downloadBtn.disabled = false; }
  });

  const caps = { downloads: null, sample: null };
  async function initCapabilities() {
    if (typeof window === "undefined" || !window.claude || !window.claude.use) {
      document.getElementById("ai-unavailable").hidden = false;
      document.getElementById("ai-body").hidden = true;
      return;
    }
    try { caps.downloads = await window.claude.use("downloads"); } catch (e) { caps.downloads = null; }
    try { caps.sample = await window.claude.use("sample"); } catch (e) { caps.sample = null; }
    if (!caps.sample) {
      document.getElementById("ai-unavailable").hidden = false;
      document.getElementById("ai-body").hidden = true;
    }
  }
  initCapabilities();

  function runCode() {
    if (!ed || !activeId) {
      showPanel("output");
      outputEl.textContent = "";
      appendLine("لا يوجد ملف مفتوح للتشغيل — افتح ملفًا أو أنشئ ملفًا جديدًا.", "line-meta");
      return;
    }
    outputEl.textContent = "";
    previewFrame.hidden = true;
    previewEmpty.hidden = false;
    downloadBtn.hidden = true;
    lastSavedFile = null;
    liveRoot.innerHTML = "";
    liveEmpty.hidden = false;
    clearMarkersFor(activeId);

    const src = ed.getValue();
    const startedAt = performance.now();

    let compiled;
    try {
      compiled = compile(parse(src));
    } catch (e) {
      appendLine("خطأ في التحليل: " + e.message, "line-error");
      reportError(activeId, e.message);
      showPanel("problems");
      return;
    }

    const vm = new VM({
      maxSteps: 2000000,
      domRoot: liveRoot,
      onPrint: (line) => appendLine(line, "line-ok"),
      onSaveFile: handleSaveFile,
    });

    try {
      vm.run(compiled.mainChunkIndex, compiled.functionChunks);
      if (liveRoot.children.length > 0) { liveEmpty.hidden = true; showPanel("live"); }
      else showPanel("output");
      const ms = toArabicIndicDigits((performance.now() - startedAt).toFixed(1));
      statusEngine.textContent = `${ed.kind === "monaco" ? "Monaco" : "المحرر المدمج"} · ${ms}ms · ${toArabicIndicDigits(String(vm.steps))} تعليمة`;
      if (outputEl.textContent === "") appendLine("(لا مخرجات — البرنامج لم يستدعِ اطبع())", "line-meta");
    } catch (e) {
      appendLine("خطأ أثناء التنفيذ: " + e.message, "line-error");
      reportError(activeId, e.message);
      showPanel("problems");
    }
  }
  runBtn.addEventListener("click", runCode);

  function makeMonacoEd() {
    const editor = monaco.editor.create(editorContainer, {
      model: null, theme: "dhad-dark",
      fontFamily: "Cairo, 'Courier New', monospace", fontSize: 14, lineHeight: 22,
      minimap: { enabled: true }, automaticLayout: true, tabSize: 4, insertSpaces: true,
      scrollBeyondLastLine: false, renderLineHighlight: "all",
      bracketPairColorization: { enabled: true },
      lineNumbers: (n) => toArabicIndicDigits(String(n)), padding: { top: 10 },
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runCode);
    editor.onDidChangeCursorPosition((e) => {
      statusPos.textContent = `السطر ${toArabicIndicDigits(String(e.position.lineNumber))}، العمود ${toArabicIndicDigits(String(e.position.column))}`;
    });
    return {
      kind: "monaco",
      open: (id) => { editor.setModel(getOrCreateModel(id)); editor.focus(); },
      getValue: () => editor.getValue(),
      setError: (line, msg) => {
        const model = editor.getModel();
        if (!model) return;
        monaco.editor.setModelMarkers(model, "dhad", line ? [{
          severity: monaco.MarkerSeverity.Error, startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1000, message: msg,
        }] : []);
      },
      reveal: (line) => { editor.revealLineInCenter(line); editor.setPosition({ lineNumber: line, column: 1 }); editor.focus(); },
      focus: () => editor.focus(),
      show: (v) => { editorContainer.style.visibility = v ? "visible" : "hidden"; },
      undo: () => { editor.focus(); editor.trigger("menu", "undo", null); },
      redo: () => { editor.focus(); editor.trigger("menu", "redo", null); },
      selectAll: () => { editor.focus(); editor.trigger("menu", "selectAll", null); },
    };
  }

  function makeFallbackEd() {
    const fb = createFallbackEditor(editorContainer);
    let current = null;
    fb.onInput(() => { if (current) { contents.set(current, fb.getValue()); touch(current); saveStore(); pinTab(current); } });
    fb.onCursor((c) => { statusPos.textContent = `السطر ${toArabicIndicDigits(String(c.line))}، العمود ${toArabicIndicDigits(String(c.column))}`; });
    editorContainer.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runCode(); }
    });
    return {
      kind: "fallback",
      open: (id) => { current = id; fb.setValue(contents.get(id) || ""); fb.focus(); },
      getValue: () => fb.getValue(),
      setError: (line) => fb.setErrorLine(line),
      reveal: (line) => fb.revealLine(line),
      focus: () => fb.focus(),
      show: (v) => fb.show(v),
      undo: () => fb.undo(), redo: () => fb.redo(), selectAll: () => fb.selectAll(),
    };
  }

  async function initEditor() {
    statusEngine.textContent = "جارٍ تحميل المحرر…";
    buildTree();
    const defaultId = fileEntries.find((f) => !f.user && f.name.indexOf("عدّاد") !== -1) ? fileEntries.find((f) => f.name.indexOf("عدّاد") !== -1).id : fileEntries[0].id;
    try {
      monaco = await loadMonaco();
      registerDhadLanguage(monaco);
      ed = makeMonacoEd();
      statusEngine.textContent = "Monaco · آلة افتراضية Bytecode";
    } catch (e) {
      monaco = null;
      ed = makeFallbackEd();
      statusEngine.textContent = "المحرر المدمج · آلة افتراضية Bytecode";
      appendLine("تعذّر تحميل Monaco (" + (e && e.message ? e.message : "الشبكة") + ") — تم التحويل تلقائيًا إلى المحرر المدمج.", "line-meta");
    }
    window.__dhad = { get editorKind() { return ed.kind; } };
    openFile(defaultId, { preview: false });
    runCode();
    initCloud();
  }

  // ---------- السحابة (اختيارية: أي فشل ← يبقى المحرر محليًا) ----------
  const cloudEl = document.getElementById("status-cloud");
  const CLOUD_TEXT = { starting: "☁ جارٍ الاتصال…", synced: "☁ متزامن", saving: "☁ جارٍ الحفظ…", offline: "☁ محلي فقط", local: "☁ محلي فقط" };
  function mergeRemote(rows) {
    let changedActive = false, added = false;
    rows.forEach((r) => {
      let entry = fileEntries.find((e) => e.user && e.name === r.path);
      if (!entry) {
        let id = USER_CAT + "/" + r.path.replace(/\.ضاد$/, "");
        while (fileEntries.find((f) => f.id === id)) id += "-٢";
        entry = { id, name: r.path, code: "", category: USER_CAT, user: true };
        fileEntries.push(entry);
        contents.set(id, r.content); stamps.set(id, Date.parse(r.updated_at) || Date.now());
        added = true; return;
      }
      const local = contents.get(entry.id) || "";
      if (local === r.content) return;
      const remoteTime = Date.parse(r.updated_at) || 0;
      if (local === "" || remoteTime > (stamps.get(entry.id) || 0)) {
        contents.set(entry.id, r.content); stamps.set(entry.id, remoteTime);
        const m = modelsById.get(entry.id); if (m && m.getValue() !== r.content) m.setValue(r.content);
        if (entry.id === activeId) changedActive = true;
      }
    });
    if (added) buildTree();
    if (changedActive && ed && ed.kind === "fallback") ed.open(activeId);
    saveStore();
  }
  function initCloud() {
    if (!window.DhadCloud) return;
    DhadCloud.onStatus((st, detail) => {
      if (cloudEl) { cloudEl.textContent = CLOUD_TEXT[st] || "☁"; cloudEl.title = detail || ""; }
    });
    const slug = new URLSearchParams(location.search).get("s");
    if (slug) loadSharedView(slug);
    DhadCloud.start().then(mergeRemote);
  }
  function loadSharedView(slug) {
    DhadCloud.loadShared(slug).then((proj) => {
      if (!proj || !proj.files) { showPanel("output"); appendLine("رابط المشاركة غير صالح أو منتهي.", "line-error"); return; }
      proj.files.forEach((f) => {
        const id = SHARED_CAT + "/" + f.path;
        if (fileEntries.find((e) => e.id === id)) return;
        fileEntries.push({ id, name: f.path, code: f.content, category: SHARED_CAT, user: false });
        contents.set(id, f.content);
      });
      buildTree();
      if (proj.files.length) openFile(SHARED_CAT + "/" + proj.files[0].path, { preview: false });
      showPanel("output");
      appendLine("مشروع مشترك: «" + proj.name + "» — للقراءة والتجربة، تعديلاتك لا تُحفظ في مشروع صاحبه.", "line-meta");
    }).catch((e) => { showPanel("output"); appendLine("تعذّر فتح المشروع المشترك: " + DhadCloud.explain(e), "line-error"); });
  }
  function copyText(t) { try { return navigator.clipboard.writeText(t); } catch (e) { return Promise.reject(e); } }
  function shareProject() {
    if (!window.DhadCloud) return;
    showPanel("output");
    DhadCloud.share().then((link) => {
      appendLine("رابط مشاركة «ملفاتي» (قراءة فقط): " + link, "line-ok");
      copyText(link).then(() => appendLine("(نُسخ الرابط إلى الحافظة)", "line-meta"), () => {});
    }).catch((e) => appendLine("تعذّرت المشاركة: " + DhadCloud.explain(e), "line-error"));
  }
  function revokeShares() {
    showPanel("output");
    DhadCloud.revokeShares().then(() => appendLine("أُلغيت كل روابط المشاركة لمشروعك.", "line-ok"))
      .catch((e) => appendLine("تعذّر الإلغاء: " + DhadCloud.explain(e), "line-error"));
  }
  function retryCloud() { if (window.DhadCloud) DhadCloud.retry().then(mergeRemote); }

  // ---------- القوائم العلوية ----------
  const downloadCurrent = async () => {
    if (!activeId) return;
    const entry = getEntry(activeId);
    if (caps.downloads) {
      try { await caps.downloads.save({ filename: entry.name.replace(/\.ضاد$/, ".txt"), data: ed.getValue() }); return; }
      catch (e) { if (e && e.code === "declined") return; }
    }
    const blob = new Blob([ed.getValue()], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = entry.name; document.body.appendChild(a); a.click(); a.remove();
  };
  function nextFile(delta) {
    if (!openTabs.length) return;
    const i = openTabs.findIndex((t) => t.id === activeId);
    const t = openTabs[(i + delta + openTabs.length) % openTabs.length];
    openFile(t.id, { preview: t.preview });
  }
  function gotoLine() {
    if (!ed) return;
    const n = parseInt(String(window.prompt ? window.prompt("رقم السطر:", "1") : "1").replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)), 10);
    if (n > 0) ed.reveal(n);
  }
  const MENUS = {
    "ملف": [["ملف جديد", startNewFile], ["تنزيل الملف الحالي", downloadCurrent], ["مشاركة مشروعي (رابط للقراءة)", shareProject], ["إلغاء روابط المشاركة", revokeShares], ["إعادة محاولة المزامنة", retryCloud], ["إغلاق التبويب", () => activeId && closeTab(activeId)]],
    "تحرير": [["تراجع", () => ed && ed.undo()], ["إعادة", () => ed && ed.redo()]],
    "تحديد": [["تحديد الكل", () => ed && ed.selectAll()]],
    "عرض": [["المستكشف", () => { showSideView("explorer"); setSidebarOpen(true); }], ["بحث", () => { showSideView("search"); setSidebarOpen(true); }],
      ["تبديل الشريط الجانبي", () => setSidebarOpen(!isSidebarOpen())], ["لوحة المشكلات", () => showPanel("problems")], ["لوحة المخرجات", () => showPanel("output")], ["المساعد الذكي", () => showPanel("ai")]],
    "انتقال": [["الذهاب إلى سطر…", gotoLine], ["التبويب التالي", () => nextFile(1)], ["التبويب السابق", () => nextFile(-1)]],
    "تشغيل": [["تشغيل الملف الحالي (Ctrl+Enter)", runCode]],
    "طرفية": [["المخرجات", () => showPanel("output")], ["تطبيق حي (DOM)", () => showPanel("live")], ["مسح المخرجات", () => { outputEl.textContent = ""; showPanel("output"); }]],
    "مساعدة": [["دليل ضاد", () => window.open("/guide.html", "_blank")], ["عن ضاد", () => { showPanel("output"); appendLine("ضاد — لغة برمجة عربية بمترجم وآلة افتراضية خاصة، تكريمًا للخوارزمي.", "line-meta"); }]],
  };
  const menuDropdown = document.getElementById("menu-dropdown");
  function closeMenu() { menuDropdown.hidden = true; document.querySelectorAll(".menu-item").forEach((m) => m.classList.remove("open")); }
  document.querySelectorAll(".menu-item[data-menu]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const wasOpen = btn.classList.contains("open");
      closeMenu();
      if (wasOpen) return;
      btn.classList.add("open");
      menuDropdown.innerHTML = "";
      MENUS[btn.dataset.menu].forEach(([label, fn]) => {
        const it = document.createElement("button");
        it.className = "menu-entry";
        it.textContent = label;
        it.addEventListener("click", (ev) => { ev.stopPropagation(); closeMenu(); fn(); });
        menuDropdown.appendChild(it);
      });
      menuDropdown.hidden = false;
      const r = btn.getBoundingClientRect();
      menuDropdown.style.left = Math.max(0, Math.min(r.left, window.innerWidth - 230)) + "px";
    });
  });
  document.addEventListener("click", closeMenu);

  // ---------- البحث في الملفات ----------
  const searchInput = document.getElementById("search-input");
  const searchResults = document.getElementById("search-results");
  function doSearch() {
    const q = searchInput.value.trim();
    searchResults.innerHTML = "";
    if (!q) return;
    let total = 0;
    fileEntries.forEach((entry) => {
      const lines = (contents.get(entry.id) || "").split("\n");
      const hits = [];
      lines.forEach((ln, i) => { if (ln.indexOf(q) !== -1) hits.push([i + 1, ln.trim()]); });
      if (!hits.length) return;
      total += hits.length;
      const head = document.createElement("div");
      head.className = "sr-file";
      head.textContent = entry.name + "  (" + toArabicIndicDigits(String(hits.length)) + ")";
      searchResults.appendChild(head);
      hits.slice(0, 20).forEach(([line, text]) => {
        const row = document.createElement("div");
        row.className = "sr-hit";
        row.textContent = toArabicIndicDigits(String(line)) + ": " + text.slice(0, 80);
        row.addEventListener("click", () => { openFile(entry.id, { preview: true }); setTimeout(() => ed && ed.reveal(line), 30); });
        searchResults.appendChild(row);
      });
    });
    if (!total) {
      const none = document.createElement("div");
      none.className = "side-note";
      none.textContent = "لا توجد نتائج.";
      searchResults.appendChild(none);
    }
  }
  searchInput.addEventListener("input", doSearch);

  initEditor();

  const AI_ERROR_MESSAGES = {
    not_granted: "لم يُسمح لهذه الصفحة باستخدام المساعد الذكي.",
    sampling_disabled: "المساعد الذكي غير متاح لهذا الحساب.",
    rate_limited: "طلبات كثيرة جدًا — انتظر قليلًا ثم حاول مجددًا.",
    session_expired: "الجلسة منتهية — يلزم تسجيل الدخول من جديد.",
    refused: "لم يستطع المساعد الإجابة عن هذا الطلب.",
    empty_completion: "لم يصل رد — حاول صياغة سؤال أوضح.",
    upstream_error: "حدث خطأ مؤقت في الخدمة — حاول مرة أخرى.",
    invalid_request: "طلب غير صالح.",
    prompt_too_large: "السؤال أو الكود طويل جدًا.",
  };
  const aiThread = document.getElementById("ai-thread");
  const aiForm = document.getElementById("ai-form");
  const aiInput = document.getElementById("ai-input");
  const aiSendBtn = document.getElementById("ai-send");
  function addAiMessage(role, text) {
    const div = document.createElement("div");
    div.className = "ai-msg ai-msg-" + role;
    div.textContent = text;
    aiThread.appendChild(div);
    aiThread.scrollTop = aiThread.scrollHeight;
    return div;
  }
  async function askAi(question) {
    if (!caps.sample || !question.trim() || !ed) return;
    addAiMessage("user", question);
    aiInput.value = "";
    aiSendBtn.disabled = true;
    const pending = addAiMessage("assistant", "جارٍ التفكير…");
    pending.classList.add("ai-msg-pending");
    const instructions =
      "أنت مساعد يشرح ويراجع كودًا مكتوبًا بلغة برمجة عربية اسمها ضاد. أجب بالعربية الفصحى المبسطة، بإيجاز شديد (٥ أسطر كحد أقصى)، بدون مقدمات.\n\n" +
      "الكود الحالي:\n```\n" + ed.getValue() + "\n```\n\nسؤال المستخدم: " + question;
    try {
      const result = await caps.sample(instructions, {
        modelTier: "quick",
        onText: ({ text }) => { pending.textContent = text; pending.classList.remove("ai-msg-pending"); },
      });
      pending.textContent = result.text;
      pending.classList.remove("ai-msg-pending");
    } catch (e) {
      pending.remove();
      addAiMessage("error", AI_ERROR_MESSAGES[e && e.code] || "تعذّر الحصول على إجابة.");
    } finally {
      aiSendBtn.disabled = false;
    }
  }
  aiForm.addEventListener("submit", (e) => { e.preventDefault(); askAi(aiInput.value); });
  aiInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askAi(aiInput.value); }
  });
  document.querySelectorAll(".chip-btn").forEach((btn) => btn.addEventListener("click", () => askAi(btn.dataset.prompt)));
})();
