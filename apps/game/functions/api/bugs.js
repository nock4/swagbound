export async function onRequestGet(context) {
  const { request, env } = context;
  const gate = check(request, env);
  if (gate) return gate;
  const list = await env.BUGS.list({ prefix: "bug:" });
  const reports = [];
  for (const k of list.keys) {
    const raw = await env.BUGS.get(k.name);
    if (raw) reports.push({ id: k.name.replace(/^bug:/, ""), ...JSON.parse(raw) });
  }
  reports.sort((a, b) => (a.at < b.at ? 1 : -1)); // newest first
  return json({ ok: true, count: reports.length, reports });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const gate = check(request, env);
  if (gate) return gate;
  let body = {};
  try { body = await request.json(); } catch { /* empty */ }
  if (body.action === "clear") {
    const list = await env.BUGS.list({ prefix: "bug:" });
    await Promise.all(list.keys.map((k) => env.BUGS.delete(k.name)));
    return json({ ok: true, cleared: list.keys.length });
  }
  if (Array.isArray(body.ids)) {
    await Promise.all(body.ids.map((id) => env.BUGS.delete(`bug:${id}`)));
    return json({ ok: true, deleted: body.ids.length });
  }
  return json({ ok: false, error: "no-action" }, 400);
}

function check(request, env) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") ?? request.headers.get("x-bugs-key");
  if (!env.BUGS_KEY) return json({ ok: false, error: "key-unconfigured" }, 500);
  if (key !== env.BUGS_KEY) return json({ ok: false, error: "unauthorized" }, 401);
  return null;
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { "content-type": "application/json" }
  });
}
