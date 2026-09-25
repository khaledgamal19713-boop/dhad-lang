(function () {
  "use strict";

  // ================= عناصر DOM =================
  const codeArea = document.getElementById("code-area");
  const highlightCode = document.getElementById("code-highlight-code");
  const highlightPre = document.getElementById("code-highlight");
  const acList = document.getElementById("ac-list");
  const runBtn = document.getElementById("run-btn");
  const clearBtn = document.getElementById("clear-btn");
  const templatesSelect = document.getElementById("templates-select");
  const outputEl = document.getElementById("output");
  const statusText = document.getElementById("status-text");
  const previewFrame = document.getElementById("preview-frame");
  const previewEmpty = document.getElementById("preview-empty");
  const downloadBtn = document.getElementById("download-btn");
  const liveRoot = document.getElementById("live-app-root");
  const liveEmpty = document.getElementById("live-empty");
  const gutter = document.getElementById("gutter");
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

  // ================= تعبئة قائمة القوالب =================
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

  function loadTemplate(name) {
    const t = findTemplate(name);
    if (t) { codeArea.value = t.code; syncHighlight(); }
  }
  templatesSelect.addEventListener("change", () => loadTemplate(templatesSelect.value));

  const defaultTemplateName = TEMPLATE_GROUPS[3].items[0].name; // عدّاد تفاعلي (DOM حي) — لإثبات أن الواجهة تُبنى بكود ضاد فعليًا
  templatesSelect.value = defaultTemplateName;
  loadTemplate(defaultTemplateName);

  // ================= التلوين النحوي (مزامنة مع الكتابة) =================
  function syncHighlight() {
    highlightCode.innerHTML = highlightToHTML(codeArea.value);
    updateGutter();
  }
  function syncScroll() {
    highlightPre.scrollTop = codeArea.scrollTop;
    highlightPre.scrollLeft = codeArea.scrollLeft;
    gutter.style.transform = `translateY(${-codeArea.scrollTop}px)`;
  }
  function updateGutter() {
    const lineCount = codeArea.value.split("\n").length;
    const nums = [];
    for (let i = 1; i <= lineCount; i++) nums.push(toArabicIndicDigits(String(i)));
    gutter.textContent = nums.join("\n");
  }
  codeArea.addEventListener("input", syncHighlight);
  codeArea.addEventListener("scroll", syncScroll);
  syncHighlight();

  // ================= الإكمال التلقائي =================
  setupAutocomplete(codeArea, acList, document.getElementById("editor-wrap"));

  // ================= التبويبات =================
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabButtons.forEach((b) => b.classList.remove("active"));
      Object.values(tabPanels).forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      tabPanels[btn.dataset.tab].classList.add("active");
    });
  });

  // ================= Tab / تشغيل داخل محرر الكود =================
  codeArea.addEventListener("keydown", (e) => {
    if (e.key === "Tab" && acList.hidden) {
      e.preventDefault();
      const start = codeArea.selectionStart;
      const end = codeArea.selectionEnd;
      codeArea.value = codeArea.value.slice(0, start) + "    " + codeArea.value.slice(end);
      codeArea.selectionStart = codeArea.selectionEnd = start + 4;
      syncHighlight();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runCode();
    }
  });

  // ================= طباعة النتائج =================
  function appendLine(text, cls) {
    const span = document.createElement("div");
    if (cls) span.className = cls;
    span.textContent = text;
    outputEl.appendChild(span);
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  clearBtn.addEventListener("click", () => {
    outputEl.textContent = "";
    statusText.textContent = "جاهز";
  });

  // ================= قدرات المنصة (تنزيل + مساعد ذكي) =================
  const caps = { downloads: null, sample: null };

  async function initCapabilities() {
    if (typeof window === "undefined" || !window.claude || !window.claude.use) {
      aiUnavailable.hidden = false;
      aiBody.hidden = true;
      return;
    }
    try { caps.downloads = await window.claude.use("downloads"); } catch (e) { caps.downloads = null; }
    try { caps.sample = await window.claude.use("sample"); } catch (e) { caps.sample = null; }

    if (!caps.sample) {
      aiUnavailable.hidden = false;
      aiBody.hidden = true;
    }
  }
  initCapabilities();

  // ================= الحفظ/المعاينة =================
  let lastSavedFile = null; // { name, content }

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
    if (!caps.downloads) {
      appendLine("التنزيل غير متاح في هذه البيئة الحالية.", "line-meta");
      return;
    }
    downloadBtn.disabled = true;
    try {
      await caps.downloads.save({ filename: lastSavedFile.name, data: lastSavedFile.content });
    } catch (e) {
      appendLine("تعذّر حفظ الملف: " + (e && e.code ? e.code : "خطأ غير معروف"), "line-error");
    } finally {
      downloadBtn.disabled = false;
    }
  });

  // ================= التشغيل =================
  function runCode() {
    outputEl.textContent = "";
    previewFrame.hidden = true;
    previewEmpty.hidden = false;
    downloadBtn.hidden = true;
    lastSavedFile = null;
    liveRoot.innerHTML = "";
    liveEmpty.hidden = false;
    statusText.textContent = "جارٍ التنفيذ…";

    const src = codeArea.value;
    const startedAt = performance.now();

    let program;
    try {
      program = parse(src);
    } catch (e) {
      appendLine("خطأ في التحليل: " + e.message, "line-error");
      statusText.textContent = "فشل التحليل";
      return;
    }

    const interp = new Interpreter({
      maxSteps: 2000000,
      domRoot: liveRoot,
      onPrint: (line) => appendLine(line, "line-ok"),
      onSaveFile: handleSaveFile,
    });

    try {
      interp.run(program);
      if (liveRoot.children.length > 0) {
        liveEmpty.hidden = true;
        document.querySelector('.tab-btn[data-tab="live"]').click();
      }
      const ms = toArabicIndicDigits((performance.now() - startedAt).toFixed(1));
      statusText.textContent = `تم التنفيذ بنجاح — ${ms} مللي ثانية — ${toArabicIndicDigits(String(interp.steps))} خطوة`;
      if (outputEl.textContent === "") appendLine("(لا مخرجات — البرنامج لم يستدعِ اطبع())", "line-meta");
    } catch (e) {
      appendLine("خطأ أثناء التنفيذ: " + e.message, "line-error");
      statusText.textContent = "توقّف التنفيذ بخطأ";
    }
  }

  runBtn.addEventListener("click", runCode);
  runCode(); // تشغيل تلقائي عند التحميل لإظهار النتيجة فورًا

  // ================= المساعد الذكي =================
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
    if (!caps.sample || !question.trim()) return;
    addAiMessage("user", question);
    aiInput.value = "";
    aiSendBtn.disabled = true;

    const pending = addAiMessage("assistant", "جارٍ التفكير…");
    pending.classList.add("ai-msg-pending");

    const instructions =
      "أنت مساعد يشرح ويراجع كودًا مكتوبًا بلغة برمجة عربية مبسّطة (كلمات مفتاحية عربية مثل: دالة، إذا، وإلا، طالما، من_أجل، ارجع، متغير، اطبع). " +
      "أجب بالعربية الفصحى المبسطة، بإيجاز شديد (لا تتجاوز ٥ أسطر ما لم يُطلب غير ذلك)، بدون مقدمات.\n\n" +
      "الكود الحالي في المحرر:\n```\n" + codeArea.value + "\n```\n\n" +
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
      const msg = AI_ERROR_MESSAGES[e && e.code] || "تعذّر الحصول على إجابة.";
      addAiMessage("error", msg);
    } finally {
      aiSendBtn.disabled = false;
    }
  }

  aiForm.addEventListener("submit", (e) => {
    e.preventDefault();
    askAi(aiInput.value);
  });

  aiInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      askAi(aiInput.value);
    }
  });

  document.querySelectorAll(".chip-btn").forEach((btn) => {
    btn.addEventListener("click", () => askAi(btn.dataset.prompt));
  });
})();
