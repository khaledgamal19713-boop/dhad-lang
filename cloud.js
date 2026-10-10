/* ضاد السحابية: مصادقة مجهولة + مزامنة الملفات + روابط المشاركة عبر Supabase (REST مباشر بلا مكتبات).
   مبدأ التصميم: المحرر يعمل دائمًا محليًا؛ السحابة طبقة إضافية. أي فشل ← وضع «محلي فقط» دون تعطيل. */
(function () {
  "use strict";
  var CFG = window.DHAD_CLOUD_CONFIG || {
    url: "https://pacucdvobiwcigcuyvbr.supabase.co",
    key: "sb_publishable_VBFe3Sfh3Q7NS1muHs-Uog_67Tn3eo2",
  };
  var SESS_KEY = "dhad.session.v1";
  var MAX_BYTES = 524288;
  var PROJECT_NAME = "ملفاتي";

  var session = null;
  var projectId = null;
  var status = "starting"; // starting | synced | saving | offline | local
  var statusDetail = "";
  var listeners = [];
  var lastPushed = {}; // path -> content آخر ما اعتُمد في السحابة
  var pending = null;  // آخر لقطة ملفات تنتظر الدفع
  var timer = null;
  var pushing = false;
  var retryDelay = 4000;

  function setStatus(s, detail) {
    status = s; statusDetail = detail || "";
    listeners.forEach(function (f) { try { f(s, statusDetail); } catch (e) {} });
  }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function rawFetch(path, opts, token) {
    opts = opts || {};
    var headers = Object.assign({ apikey: CFG.key, "Content-Type": "application/json" }, opts.headers || {});
    if (token) headers.Authorization = "Bearer " + token;
    return fetch(CFG.url + path, Object.assign({}, opts, { headers: headers }));
  }

  function saveSession(s) {
    session = s ? {
      access_token: s.access_token, refresh_token: s.refresh_token,
      expires_at: s.expires_at || (Math.floor(Date.now() / 1000) + (s.expires_in || 3600)),
      user: s.user,
    } : null;
    lsSet(SESS_KEY, session);
  }

  function signInAnonymously() {
    return rawFetch("/auth/v1/signup", { method: "POST", body: "{}" }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || !j.access_token) {
          var msg = (j && (j.msg || j.error_description || j.message)) || ("HTTP " + r.status);
          var e = new Error(msg); e.code = j && (j.error_code || j.code); e.status = r.status; throw e;
        }
        saveSession(j);
      });
    });
  }

  function refreshSession() {
    if (!session || !session.refresh_token) return Promise.reject(new Error("لا جلسة"));
    return rawFetch("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: session.refresh_token }) })
      .then(function (r) { return r.json().then(function (j) {
        if (!r.ok || !j.access_token) { session = null; lsSet(SESS_KEY, null); throw new Error("فشل تجديد الجلسة"); }
        saveSession(j);
      }); });
  }

  function ensureSession() {
    if (!session) session = lsGet(SESS_KEY);
    var now = Math.floor(Date.now() / 1000);
    if (session && session.expires_at - 60 > now) return Promise.resolve();
    if (session) return refreshSession().catch(function () { return signInAnonymously(); });
    return signInAnonymously();
  }

  // طلب موثّق مع إعادة محاولة واحدة عند 401
  function api(path, opts, retried) {
    return ensureSession().then(function () {
      return rawFetch(path, opts, session.access_token);
    }).then(function (r) {
      if (r.status === 401 && !retried) {
        return refreshSession().catch(function () { session = null; return signInAnonymously(); }).then(function () { return api(path, opts, true); });
      }
      return r;
    });
  }
  function json(r) {
    if (!r.ok) {
      return r.text().then(function (t) { var e = new Error(t.slice(0, 300) || ("HTTP " + r.status)); e.status = r.status; throw e; });
    }
    return r.status === 204 ? null : r.text().then(function (t) { return t ? JSON.parse(t) : null; });
  }

  function ensureProject() {
    if (projectId) return Promise.resolve(projectId);
    return api("/rest/v1/projects?select=id&order=created_at.asc&limit=1").then(json).then(function (rows) {
      if (rows && rows.length) { projectId = rows[0].id; return projectId; }
      return api("/rest/v1/projects", {
        method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ owner_id: session.user.id, name: PROJECT_NAME }),
      }).then(json).then(function (r) { projectId = r[0].id; return projectId; });
    });
  }

  function explain(e) {
    var m = String((e && e.message) || e || "");
    if (/anonymous/i.test(m) || /signups? not allowed/i.test(m) || (e && e.status === 422)) {
      return "تسجيل الدخول المجهول غير مفعّل في سوبابيس (Authentication ◂ Sign In / Providers ◂ Allow anonymous sign-ins).";
    }
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "لا اتصال بالشبكة أو الخدمة محجوبة.";
    if (/paused|timeout|522|521|503/i.test(m)) return "مشروع سوبابيس متوقف مؤقتًا — أعد تشغيله من لوحة سوبابيس.";
    return m.slice(0, 160);
  }

  // ===== المزامنة =====
  function pull() {
    return ensureProject().then(function (pid) {
      return api("/rest/v1/files?select=path,content,updated_at&project_id=eq." + pid + "&order=path.asc").then(json);
    }).then(function (rows) {
      rows = rows || [];
      rows.forEach(function (r) { lastPushed[r.path] = r.content; });
      return rows;
    });
  }

  function doPush() {
    if (pushing || !pending) return;
    var snap = pending; pending = null; pushing = true;
    var todo = snap.filter(function (f) { return lastPushed[f.name] !== f.content; });
    var tooBig = todo.filter(function (f) { return new Blob([f.content]).size > MAX_BYTES; });
    todo = todo.filter(function (f) { return tooBig.indexOf(f) === -1; });
    if (tooBig.length) setStatus("local", "الملف «" + tooBig[0].name + "» أكبر من ٥١٢ ك.ب — لم يُرفع.");
    if (!todo.length) { pushing = false; if (!tooBig.length) setStatus("synced"); return; }
    setStatus("saving");
    ensureProject().then(function (pid) {
      var body = todo.map(function (f) { return { project_id: pid, owner_id: session.user.id, path: f.name, content: f.content }; });
      return api("/rest/v1/files?on_conflict=project_id,path", {
        method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(body),
      }).then(json);
    }).then(function () {
      todo.forEach(function (f) { lastPushed[f.name] = f.content; });
      retryDelay = 4000; pushing = false;
      setStatus(pending ? "saving" : "synced");
      if (pending) schedule(300);
    }).catch(function (e) {
      pushing = false;
      pending = pending || snap; // لا نفقد التغييرات: نعيدها للطابور
      setStatus("offline", explain(e));
      if (e && e.status !== 403 && e.status !== 400) { schedule(retryDelay); retryDelay = Math.min(retryDelay * 2, 60000); }
    });
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(doPush, ms); }

  window.addEventListener("online", function () { if (pending) schedule(200); });

  var API = {
    onStatus: function (f) { listeners.push(f); f(status, statusDetail); },
    getStatus: function () { return { status: status, detail: statusDetail }; },
    /** يُستدعى عند كل تغيير: لقطة [{name, content}] للملفات الشخصية */
    schedulePush: function (snapshot) {
      if (status === "local" && !session) return;
      pending = snapshot; schedule(1500);
    },
    start: function () {
      setStatus("starting");
      return ensureSession().then(pull).then(function (rows) { setStatus("synced"); return rows; })
        .catch(function (e) { setStatus("offline", explain(e)); return []; });
    },
    retry: function () { return API.start(); },
    share: function () {
      return ensureProject().then(function (pid) {
        return api("/rest/v1/shares?select=slug&project_id=eq." + pid + "&is_active=eq.true&order=created_at.desc&limit=1").then(json).then(function (rows) {
          if (rows && rows.length) return rows[0].slug;
          return api("/rest/v1/shares", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ project_id: pid, owner_id: session.user.id }) })
            .then(json).then(function (r) { return r[0].slug; });
        });
      }).then(function (slug) { return location.origin + location.pathname + "?s=" + slug; });
    },
    revokeShares: function () {
      return ensureProject().then(function (pid) {
        return api("/rest/v1/shares?project_id=eq." + pid, { method: "PATCH", body: JSON.stringify({ is_active: false }) }).then(json);
      });
    },
    loadShared: function (slug) {
      return rawFetch("/rest/v1/rpc/get_shared_project", { method: "POST", body: JSON.stringify({ p_slug: slug }) })
        .then(function (r) { return json(r); });
    },
    explain: explain,
  };
  window.DhadCloud = API;
})();
