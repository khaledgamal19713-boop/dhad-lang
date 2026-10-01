(function () {
  "use strict";

  const runBtn = document.getElementById("run-btn");
  const clearBtn = document.getElementById("clear-btn");
  const templatesSelect = document.getElementById("templates-select");
  const outputEl = document.getElementById("output");
  const statusText = document.getElementById("status-text");
  const engineText = document.getElementById("engine-text");
  const previewFrame = document.getElementById("preview-frame");
  const previewEmpty = document.getElementById("preview-empty");
  const downloadBtn = document.getElementById("download-btn");
  const liveRoot = document.getElementById("live-app-root");
  const liveEmpty = document.getElementById("live-empty");
  const editorContainer = document.getElementById("monaco-editor");
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabPanels = {
    output: document.getElementById("tab-output"),
    preview: document.getElementById("tab-preview"),
    live: document.getElementById("tab-live"),
    ai: document.getElementById("tab-ai"),
  };
  const aiUnavailable = document.getElementById("ai-unavailable");
  const aiBody = document.getElementById("ai-body");
  const aiThread = document.getElementById("ai-thread");
  const aiForm = document.getElementById("ai-form");
  const aiInput = document.getElementById("ai-input");
  const aiSendBtn = document.getElementById("ai-send");

  let editorApi = null;

  TEMPLATE_GROUPS.forEach((group) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group.category;
    group.items.forEach((item) => {
      const opt = document.createElement("option");
      opt.value = item.name;
      opt.textContent = item.name;
      optgroup.appendChild(opt);
    });
    templatesSelect.appendChild(optgroup);
  });

  function findTemplate(name) {
    for (const g of TEMPLATE_GROUPS) {
      const found = g.items.find((it) => it.name === name);
      if (found) return found;
    }
    return null;
  }
  templatesSelect.addEventListener("change", () => {
    const t = findTemplate(templatesSelect.value);
    if (t && editorApi) editorApi.setValue(t.code);
  });
  const defaultTemplate = TEMPLATE_GROUPS[3].items[0];
  templatesSelect.value = defaultTemplate.name;

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabButtons.forEach((b) => b.classList.remove("active"));
      Object.values(tabPanels).forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      tabPanels[btn.dataset.tab].classList.add("active");
    });
  });

  function appendLine(text, cls) {
    const div = document.createElement("div");
    if (cls) div.className = cls;
    div.textContent = text;
    outputEl.appendChild(div);
    outputEl.scrollTop = outputEl.scrollHeight;
  }
  clearBtn.addEventListener("click", () => { outputEl.textContent = ""; statusText.textContent = "جاهز"; });

  const caps = { downloads: null, sample: null };
  async function initCapabilities() {
    if (typeof window === "undefined" || !window.claude || !window.claude.use) {
      aiUnavailable.hidden = false; aiBody.hidden = true; return;
    }
    try { caps.downloads = await window.claude.use("downloads"); } catch (e) { caps.downloads = null; }
    try { caps.sample = await window.claude.use("sample"); } catch (e) { caps.sample = null; }
    if (!caps.sample) { aiUnavailable.hidden = false; aiBody.hidden = true; }
  }
  initCapabilities();

  let lastSavedFile = null;
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

  function runCode() {
    if (!editorApi) return;
    outputEl.textContent = "";
    previewFrame.hidden = true;
    previewEmpty.hidden = false;
    downloadBtn.hidden = true;
    lastSavedFile = null;
    liveRoot.innerHTML = "";
    liveEmpty.hidden = false;
    statusText.textContent = "جارٍ التنفيذ…";

    const src = editorApi.getValue();
    const startedAt = performance.now();

    let compiled;
    try {
      compiled = compile(parse(src));
    } catch (e) {
      appendLine("خطأ في التحليل: " + e.message, "line-error");
      statusText.textContent = "فشل التحليل";
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
      if (liveRoot.children.length > 0) {
        liveEmpty.hidden = true;
        document.querySelector('.tab-btn[data-tab="live"]').click();
      }
      const ms = toArabicIndicDigits((performance.now() - startedAt).toFixed(1));
      statusText.textContent = `تم التنفيذ بنجاح — ${ms} مللي ثانية — ${toArabicIndicDigits(String(vm.steps))} تعليمة`;
      if (outputEl.textContent === "") appendLine("(لا مخرجات — البرنامج لم يستدعِ اطبع())", "line-meta");
    } catch (e) {
      appendLine("خطأ أثناء التنفيذ: " + e.message, "line-error");
      statusText.textContent = "توقّف التنفيذ بخطأ";
    }
  }
  runBtn.addEventListener("click", runCode);

  async function initEditor() {
    statusText.textContent = "جارٍ تحميل محرر Monaco…";
    try {
      const monaco = await loadMonaco();
      editorApi = createMonacoAdapter(monaco, editorContainer, defaultTemplate.code, runCode);
      engineText.textContent = "المحرر: Monaco (محرك VS Code) · التنفيذ: آلة افتراضية Bytecode";
    } catch (e) {
      editorApi = createFallbackAdapter(editorContainer, defaultTemplate.code, runCode);
      engineText.textContent = "المحرر: بديل بسيط (تعذّر تحميل Monaco) · التنفيذ: آلة افتراضية Bytecode";
      appendLine("تنبيه: تعذّر تحميل محرر Monaco — استُخدم محرر بسيط بديل. السبب: " + (e && e.message ? e.message : "غير معروف"), "line-meta");
    }
    statusText.textContent = "جاهز";
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
  function addAiMessage(role, text) {
    const div = document.createElement("div");
    div.className = "ai-msg ai-msg-" + role;
    div.textContent = text;
    aiThread.appendChild(div);
    aiThread.scrollTop = aiThread.scrollHeight;
    return div;
  }
  async function askAi(question) {
    if (!caps.sample || !question.trim() || !editorApi) return;
    addAiMessage("user", question);
    aiInput.value = "";
    aiSendBtn.disabled = true;
    const pending = addAiMessage("assistant", "جارٍ التفكير…");
    pending.classList.add("ai-msg-pending");
    const instructions =
      "أنت مساعد يشرح ويراجع كودًا مكتوبًا بلغة برمجة عربية اسمها ضاد (كلمات مفتاحية: دالة، إذا، وإلا، طالما، من_أجل، ارجع، متغير، اطبع). " +
      "أجب بالعربية الفصحى المبسطة، بإيجاز شديد (لا تتجاوز ٥ أسطر ما لم يُطلب غير ذلك)، بدون مقدمات.\n\n" +
      "الكود الحالي في المحرر:\n```\n" + editorApi.getValue() + "\n```\n\n" +
      "سؤال المستخدم: " + question;
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
