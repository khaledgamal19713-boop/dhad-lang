// يمنع إيقاف مشروع سوبابيس المجاني تلقائيًا بعد ٧ أيام بلا نشاط.
// تستدعيه مهمة Vercel Cron يوميًا (vercel.json). لا يقرأ أي بيانات خاصة: يطلب صفًا واحدًا من قوالب المجتمع العامة.
module.exports = async (req, res) => {
  const url = process.env.SUPABASE_URL || "https://pacucdvobiwcigcuyvbr.supabase.co";
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_VBFe3Sfh3Q7NS1muHs-Uog_67Tn3eo2";
  try {
    const r = await fetch(url + "/rest/v1/snippets?select=id&limit=1", { headers: { apikey: key } });
    res.status(r.ok ? 200 : 502).json({ ok: r.ok, status: r.status, at: new Date().toISOString() });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e && e.message || e) });
  }
};
