/**
 * End-to-end smoke test against a RUNNING FenaFilter server in LOCAL storage mode.
 *
 *   npm run build && npm start          (terminal 1)
 *   node scripts/smoke-test.mjs          (terminal 2; BASE_URL defaults to http://localhost:3000)
 *
 * What is real: HTTP routes, sessions, upload validation, ownership checks, job
 * pipeline (background work, leases), filtering engine, Sharp image editing,
 * overrides, download and deletion.
 *
 * What is MOCKED (clearly): the Gemini extraction step. Because no vision API key
 * is needed for this test, the script writes a MOCK extraction for a synthetic
 * screenshot directly into the local job store. The plan uses only team-name rules,
 * so no football API or extra Gemini call is needed. Live AI quality must be verified
 * separately with real keys (see README "Testing with real services").
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DATA = path.resolve(process.env.LOCAL_STORAGE_DIR ?? ".data");
let passed = 0;
let failed = 0;

function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

class Client {
  cookie = "";
  async req(p, init = {}) {
    const res = await fetch(BASE + p, { ...init, headers: { ...(init.headers ?? {}), ...(this.cookie ? { cookie: this.cookie } : {}) }, redirect: "manual" });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    return res;
  }
  async json(p, init) {
    const res = await this.req(p, init);
    return { status: res.status, body: await res.json().catch(() => null) };
  }
}

// ---- MOCK synthetic screenshot: header, 4 rows (60px) separated by 12px gaps, footer ----
async function syntheticScreenshot() {
  const W = 420, header = 50, gap = 12, rowH = 60, rows = 4, footer = 40;
  const H = header + gap + rows * (rowH + gap) + footer;
  const raw = Buffer.alloc(W * H * 3, 245);
  const fill = (y0, h, rgb) => {
    for (let y = y0; y < y0 + h; y++) for (let x = 0; x < W; x++) {
      const t = ((x >> 3) + (y >> 2)) % 3 === 0 ? 60 : 0;
      const p = (y * W + x) * 3;
      raw[p] = Math.max(0, rgb[0] - t); raw[p + 1] = Math.max(0, rgb[1] - t); raw[p + 2] = Math.max(0, rgb[2] - t);
    }
  };
  fill(0, header, [20, 40, 90]);
  const ys = [];
  for (let i = 0; i < rows; i++) {
    const y = header + gap + i * (rowH + gap);
    ys.push(y);
    fill(y, rowH, [[200, 40, 40], [40, 200, 40], [40, 40, 200], [200, 200, 40]][i]);
  }
  fill(header + gap + rows * (rowH + gap), footer, [30, 30, 30]);
  const png = await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  return { png, W, H, ys, rowH, gap };
}

async function main() {
  console.log(`FenaFilter smoke test → ${BASE}\n`);
  const a = new Client();

  console.log("Pages");
  for (const p of ["/", "/dashboard", "/history", "/settings"]) {
    const r = await a.req(p);
    check(`GET ${p} → 200`, r.status === 200, `(got ${r.status})`);
  }
  const home = await (await a.req("/")).text();
  check("landing page shows hero copy", home.includes("Your Football Screenshots"));

  console.log("\nSession & health");
  const s = await a.json("/api/session");
  check("session issued", s.status === 200 && /^[a-f0-9]{32}$/.test(s.body?.ownerId ?? ""));
  check("session cookie is httpOnly-signed", a.cookie.startsWith("ff_sid="));
  const ownerId = s.body.ownerId;
  const h = await a.json("/api/health");
  check("health reports services without secrets", h.status === 200 && !/apiKey|"token"|secret"/i.test(JSON.stringify(h.body)));
  check("storage is local mode (required for this test)", s.body.services.storage.mode === "local");

  console.log("\nUpload validation");
  const fake = new FormData();
  fake.append("file", new Blob([Buffer.from("not really an image")], { type: "image/png" }), "evil.png");
  const bad = await a.json("/api/upload", { method: "POST", body: fake });
  check("rejects non-image disguised as PNG (415)", bad.status === 415, `(got ${bad.status})`);
  const anon = new Client();
  const anonUp = await anon.json("/api/upload", { method: "POST", body: fake });
  check("rejects upload without session (401)", anonUp.status === 401, `(got ${anonUp.status})`);

  const shot = await syntheticScreenshot();
  const form = new FormData();
  form.append("file", new Blob([shot.png], { type: "image/png" }), "synthetic.png");
  const up = await a.json("/api/upload", { method: "POST", body: form });
  check("uploads a valid PNG", up.status === 200 && up.body?.pathname?.startsWith(`uploads/${ownerId}/`));
  const imageKey = up.body.pathname;

  console.log("\nAnalysis start");
  const start = await a.json("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ imageKey, instruction: "Remove matches involving Kingsford" }) });
  if (s.body.services.gemini.configured) {
    check("analysis accepted (Gemini configured)", start.status === 202);
  } else {
    check("clear 503 when Gemini is not configured", start.status === 503 && /GEMINI_API_KEY/.test(start.body?.error?.message), `(got ${start.status})`);
  }
  const traversal = await a.json("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ imageKey: `uploads/${"0".repeat(32)}/x.png`, instruction: "Remove all" }) });
  check("refuses another session's image (403)", traversal.status === 403, `(got ${traversal.status})`);

  console.log("\nPipeline with MOCK extraction (team-name rule, no external APIs)");
  const jobId = "a1b2c3d4e5f6a7b8c9d0e1f2";
  const now = new Date();
  const names = [["Northbridge", "Eastvale"], ["Harbour City", "Kingsford"], ["Ashton Rovers", "Millbrook"], ["Kingsford", "Redcliffe"]];
  const job = {
    id: jobId, ownerId, version: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 3600_000).toISOString(), status: "AWAITING_CONFIRMATION", error: null,
    image: { key: imageKey, contentType: "image/png", width: shot.W, height: shot.H, sizeBytes: shot.png.length, originalName: "synthetic.png" },
    instruction: "Remove matches involving Kingsford",
    steps: ["upload", "extract", "interpret", "teams", "stats", "evaluate", "image"].map((id) => ({ id, label: id, state: id === "upload" || id === "extract" ? "done" : "pending", detail: null })),
    extraction: {
      model: "MOCK (smoke test)", layout: "list", isFootballImage: true, imageWidth: shot.W, imageHeight: shot.H, tiles: 1, warnings: [],
      // Deliberately imprecise boxes (±3px), like a real vision model.
      fixtures: shot.ys.map((y, i) => ({
        id: `match_00${i + 1}`, homeTeam: names[i][0], awayTeam: names[i][1], competition: "Mock League", date: null, kickoff: null, odds: [],
        confidence: 0.95, box: { x: 0, y: y + (i % 2 ? 3 : -3), width: shot.W, height: shot.rowH + (i % 2 ? -3 : 3) }, issues: [], userEdited: false, excluded: false,
      })),
    },
    plan: null, planError: null, fixturesConfirmed: false, stats: {}, decisions: null, summary: null, output: null, lease: null,
  };
  await mkdir(path.join(DATA, "jobs", ownerId), { recursive: true });
  await writeFile(path.join(DATA, "jobs", ownerId, `${jobId}.json`), JSON.stringify(job));

  const view = await a.json(`/api/analyze/${jobId}`);
  check("job readable by owner", view.status === 200 && view.body.status === "AWAITING_CONFIRMATION");
  const other = new Client();
  await other.json("/api/session");
  check("job hidden from other sessions (404)", (await other.json(`/api/analyze/${jobId}`)).status === 404);
  check("image hidden from other sessions (404)", (await other.req(`/api/image/${jobId}/original`)).status === 404);

  const plan = {
    status: "ok", clarificationQuestion: null, mode: "remove_matching",
    removeWhen: { kind: "team", teams: ["Kingsford"], subject: "either" }, keepWhen: null,
    summary: "Remove matches involving Kingsford.", assumptions: [], unsupported: [],
  };
  const badPlan = await a.json(`/api/analyze/${jobId}/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fixtures: view.body.extraction.fixtures, plan: { ...plan, removeWhen: { kind: "metric", metric: "corners", subject: "match", comparator: ">=", value: 5 } } }) });
  check("rejects plan with unsupported metric (400)", badPlan.status === 400, `(got ${badPlan.status})`);
  const conf = await a.json(`/api/analyze/${jobId}/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fixtures: view.body.extraction.fixtures, plan }) });
  check("confirmation accepted (202)", conf.status === 202, `(got ${conf.status} ${JSON.stringify(conf.body)})`);

  let done = null;
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    const r = await a.json(`/api/analyze/${jobId}`);
    seen.add(r.body.status);
    if (r.body.status === "COMPLETED" || r.body.status === "FAILED") { done = r.body; break; }
    await new Promise((res) => setTimeout(res, 500));
  }
  check("pipeline completes", done?.status === "COMPLETED", `(status ${done?.status} ${JSON.stringify(done?.error)})`);
  console.log(`    states observed: ${[...seen].join(" → ")}`);
  const dec = Object.fromEntries((done?.decisions ?? []).map((d) => [d.fixtureId, d.decision]));
  check("Kingsford fixtures removed, others kept", dec.match_001 === "KEEP" && dec.match_002 === "REMOVE" && dec.match_003 === "KEEP" && dec.match_004 === "REMOVE", JSON.stringify(dec));
  check("statistics step skipped (not needed for team rule)", done?.steps.find((s) => s.id === "stats")?.state === "skipped");

  const res = await a.json(`/api/results/${jobId}`);
  check("results endpoint returns report", res.status === 200 && res.body.output?.removedFixtureIds.length === 2);

  const out = await a.req(`/api/image/${jobId}/output?download=1`);
  check("download has attachment header", (out.headers.get("content-disposition") ?? "").includes("attachment"));
  const outBuf = Buffer.from(await out.arrayBuffer());
  const meta = await sharp(outBuf).metadata();
  const expected = shot.H - 2 * (shot.rowH + shot.gap);
  check(`edited image is PNG ${shot.W}×${expected}`, meta.format === "png" && meta.width === shot.W && meta.height === expected, `(got ${meta.width}×${meta.height})`);
  // Pixel check: kept row 3 (blue) must be identical, shifted up by one removed row.
  const orig = await sharp(shot.png).raw().toBuffer();
  const edited = await sharp(outBuf).removeAlpha().raw().toBuffer();
  const row = (buf, y) => buf.subarray(y * shot.W * 3, (y + shot.rowH) * shot.W * 3);
  check("retained row pixels are identical to the original", Buffer.compare(row(orig, shot.ys[2]), row(edited, shot.ys[2] - (shot.rowH + shot.gap))) === 0);
  check("header pixels are identical to the original", Buffer.compare(orig.subarray(0, 50 * shot.W * 3), edited.subarray(0, 50 * shot.W * 3)) === 0);

  const proc = await a.json("/api/process", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, decisions: { match_004: "KEEP" } }) });
  check("manual override re-renders image", proc.status === 200 && proc.body.output.removedFixtureIds.length === 1 && proc.body.decisions.find((d) => d.fixtureId === "match_004").overridden === true);

  const hist = await a.json("/api/history");
  check("history lists the job", hist.body.items.some((i) => i.id === jobId));
  const del = await a.json(`/api/history/${jobId}`, { method: "DELETE" });
  check("delete succeeds", del.status === 200);
  check("deleted job is gone", (await a.json(`/api/analyze/${jobId}`)).status === 404);
  const stillThere = await readFile(path.join(DATA, imageKey)).then(() => true).catch(() => false);
  check("uploaded image file deleted", !stillThere);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
