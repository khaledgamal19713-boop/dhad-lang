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

  document.querySelectorAll(".activity-btn[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const wasActive = btn.classList.contains("active");
      document.querySelectorAll(".activity-btn[data-view]").forEach((b) => b.classList.remove("active"));
      if (wasActive && isSidebarOpen()) {
        setSidebarOpen(false);
      } else {
        btn.classList.add("active");
        setSidebarOpen(true);
      }
    });
  });

  const fileEntries = [];
  TEMPLATE_GROUPS.forEach((group) => {
    group.items.forEach((item) => {
      fileEntries.push({ id: group.category + "/" + item.name, name: item.name + ".ضاد", code: item.code, category: group.category });
    });
  });

  function buildTree() {
    fileTreeEl.innerHTML = "";
    TEMPLATE_GROUPS.forEach((group) => {
      const folder = document.createElement("div");
      folder.className = "tree-folder";
      folder.innerHTML = `<span class="twisty">▾</span><span>${group.category}</span>`;
      const body = document.createElement("div");
      body.className = "tree-group open";
      group.items.forEach((item) => {
        const id = group.category + "/" + item.name;
        const fileEl = document.createElement("div");
        fileEl.className = "tree-file";
        fileEl.dataset.id = id;
        fileEl.innerHTML = `<span class="file-icon">◆</span><span class="file-name">${item.name}.ضاد</span>`;
        fileEl.addEventListener("click", () => openFile(id, { preview: true }));
        fileEl.addEventListener("dblclick", () => openFile(id, { preview: false }));
        body.appendChild(fileEl);
      });
      folder.addEventListener("click", () => body.classList.toggle("open"));
      fileTreeEl.appendChild(folder);
      fileTreeEl.appendChild(body);
    });
  }
  buildTree();

  let monaco = null;
  let editor = null;
  const modelsById = new Map();
  let openTabs = [];
  let activeId = null;

  function getEntry(id) { return fileEntries.find((f) => f.id === id); }

  function getOrCreateModel(id) {
    if (modelsById.has(id)) return modelsById.get(id);
    const entry = getEntry(id);
    const model = monaco.editor.createModel(entry.code, "dhad");
    model.onDidChangeContent(() => { if (id === activeId) pinTab(id); });
    modelsById.set(id, model);
    return model;
  }

  function pinTab(id) {
    const tab = openTabs.find((t) => t.id === id);
    if (tab && tab.preview) { tab.preview = false; renderTabs(); }
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
    if (editor) editor.setModel(getOrCreateModel(id));
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
      else { activeId = null; renderTabs(); if (editor) editor.setModel(null); }
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
      el.innerHTML = `<span class="tab-icon">◆</span><span class="tab-title">${entry.name}</span>`;
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
    document.querySelectorAll(".tree-file").forEach((el) => el.classList.toggle("active", el.dataset.id === activeId));
  }

  function extractLineNumber(msg) {
    const m = msg.match(/السطر\s+([٠-٩0-9]+)/);
    if (!m) return 1;
    const norm = m[1].replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
    return parseInt(norm, 10) || 1;
  }

  function clearMarkersFor(id) {
    const model = modelsById.get(id);
    if (model && monaco) monaco.editor.setModelMarkers(model, "dhad", []);
    problemsEmpty.hidden = false;
    problemsList.hidden = true;
    problemsList.innerHTML = "";
    statusProblems.textContent = "✓ 0  ⚠ 0";
  }

  function reportError(id, message) {
    const model = modelsById.get(id);
    const line = extractLineNumber(message);
    if (model && monaco) {
      monaco.editor.setModelMarkers(model, "dhad", [{
        severity: monaco.MarkerSeverity.Error,
        startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1000,
        message: message,
      }]);
    }
    problemsEmpty.hidden = true;
    problemsList.hidden = false;
    const entry = getEntry(id);
    const li = document.createElement("li");
    li.innerHTML = `<span class="pi-icon">●</span><span>${message}</span><span style="color:#8a8a8a">${entry ? entry.name : ""}:${toArabicIndicDigits(String(line))}</span>`;
    li.addEventListener("click", () => { if (editor) editor.revealLineInCenter(line); });
    problemsList.appendChild(li);
    statusProblems.textContent = "✓ 0  ⚠ 0".replace("0 ", "1 ");
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
    if (!editor || !activeId) return;
    outputEl.textContent = "";
    previewFrame.hidden = true;
    previewEmpty.hidden = false;
    downloadBtn.hidden = true;
    lastSavedFile = null;
    liveRoot.innerHTML = "";
    liveEmpty.hidden = false;
    clearMarkersFor(activeId);

    const src = editor.getValue();
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
      statusEngine.textContent = `${ms}ms · ${toArabicIndicDigits(String(vm.steps))} تعليمة`;
      if (outputEl.textContent === "") appendLine("(لا مخرجات — البرنامج لم يستدعِ اطبع())", "line-meta");
    } catch (e) {
      appendLine("خطأ أثناء التنفيذ: " + e.message, "line-error");
      reportError(activeId, e.message);
      showPanel("problems");
    }
  }
  runBtn.addEventListener("click", runCode);

  async function initEditor() {
    statusEngine.textContent = "جارٍ تحميل Monaco…";
    const defaultId = fileEntries[Math.min(5, fileEntries.length - 1)].id;
    try {
      monaco = await loadMonaco();
      registerDhadLanguage(monaco);
      editor = monaco.editor.create(editorContainer, {
        model: null,
        theme: "dhad-dark",
        fontFamily: "Cairo, 'Courier New', monospace",
        fontSize: 14,
        lineHeight: 22,
        minimap: { enabled: true },
        automaticLayout: true,
        tabSize: 4,
        insertSpaces: true,
        scrollBeyondLastLine: false,
        renderLineHighlight: "all",
        bracketPairColorization: { enabled: true },
        lineNumbers: (n) => toArabicIndicDigits(String(n)),
        padding: { top: 10 },
      });
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runCode);
      editor.onDidChangeCursorPosition((e) => {
        statusPos.textContent = `السطر ${toArabicIndicDigits(String(e.position.lineNumber))}، العمود ${toArabicIndicDigits(String(e.position.column))}`;
      });
      statusEngine.textContent = "Monaco · آلة افتراضية Bytecode";
      openFile(defaultId, { preview: false });
    } catch (e) {
      statusEngine.textContent = "تعذّر تحميل Monaco";
      appendLine("تعذّر تحميل محرر Monaco: " + (e && e.message ? e.message : "غير معروف"), "line-error");
    }
    runCode();
  }
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
    if (!caps.sample || !question.trim() || !editor) return;
    addAiMessage("user", question);
    aiInput.value = "";
    aiSendBtn.disabled = true;
    const pending = addAiMessage("assistant", "جارٍ التفكير…");
    pending.classList.add("ai-msg-pending");
    const instructions =
      "أنت مساعد يشرح ويراجع كودًا مكتوبًا بلغة برمجة عربية اسمها ضاد. أجب بالعربية الفصحى المبسطة، بإيجاز شديد (٥ أسطر كحد أقصى)، بدون مقدمات.\n\n" +
      "الكود الحالي:\n```\n" + editor.getValue() + "\n```\n\nسؤال المستخدم: " + question;
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
