#!/usr/bin/env node

const baseUrl = process.env.SMOKE_BASE_URL?.trim();
const apiKey = process.env.SMOKE_API_KEY?.trim();

if (!baseUrl) {
  console.error("❌ SMOKE_BASE_URL is required");
  process.exit(1);
}
if (!apiKey) {
  console.error("❌ SMOKE_API_KEY is required");
  process.exit(1);
}

const checks = [];

async function postJson(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function get(path) {
  const res = await fetch(`${baseUrl}${path}`);
  const text = await res.text();
  return { status: res.status, text };
}

(async () => {
  // 1) Recall endpoint should succeed
  const recall = await postJson("/api/v1/simple/recall", {
    query: "smoke check",
    limit: 1,
  });
  checks.push({ name: "POST /api/v1/simple/recall", ok: recall.status === 200, status: recall.status, text: recall.text.slice(0, 200) });

  // 2) Sessions start should succeed
  const start = await postJson("/api/v1/sessions/start", {
    firstMessage: "smoke test",
    metadata: { source: "post-deploy-smoke" },
  });
  checks.push({ name: "POST /api/v1/sessions/start", ok: start.status === 201, status: start.status, text: start.text.slice(0, 200) });

  // 3) Dashboard should not 500
  const dashboard = await get("/dashboard");
  checks.push({ name: "GET /dashboard (non-500)", ok: dashboard.status < 500, status: dashboard.status, text: dashboard.text.slice(0, 120) });

  // 4) Legacy API memories should not 500
  const memories = await get("/api/memories");
  checks.push({ name: "GET /api/memories (non-500)", ok: memories.status < 500, status: memories.status, text: memories.text.slice(0, 120) });

  let failed = 0;
  console.log("\n🔎 Post-deploy smoke results");
  for (const c of checks) {
    const icon = c.ok ? "✅" : "❌";
    console.log(`${icon} ${c.name} -> ${c.status}`);
    if (!c.ok) {
      failed++;
      console.log(`   response: ${c.text}`);
    }
  }

  if (failed > 0) {
    console.error(`\n❌ Smoke failed (${failed}/${checks.length})`);
    process.exit(1);
  }

  console.log("\n✅ Smoke passed");
})();
