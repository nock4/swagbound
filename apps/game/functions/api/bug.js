// Receives an in-game bug report and stores it in KV. No auth on submit (any
// playtester can file); the viewer is key-gated. Basic size + rate guards.
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.BUGS) return json({ ok: false, error: "storage-unconfigured" }, 500);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad-json" }, 400);
  }
  const note = String(body.note ?? "").slice(0, 4000);
  if (!note.trim()) return json({ ok: false, error: "empty-note" }, 400);
  const report = {
    note,
    reporter: String(body.reporter ?? "").slice(0, 80),
    build: String(body.build ?? "").slice(0, 120),
    context: body.context ?? null,
    save: typeof body.save === "string" ? body.save.slice(0, 400000) : null,
    screenshot: typeof body.screenshot === "string" ? body.screenshot.slice(0, 4000000) : null,
    userAgent: String(request.headers.get("user-agent") ?? "").slice(0, 300),
    at: new Date().toISOString()
  };
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await env.BUGS.put(`bug:${id}`, JSON.stringify(report), {
    // 90-day TTL so the namespace self-cleans during a playtest.
    expirationTtl: 60 * 60 * 24 * 90,
    metadata: { note: note.slice(0, 100), at: report.at, reporter: report.reporter }
  });
  return json({ ok: true, id });
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" }
  });
}
