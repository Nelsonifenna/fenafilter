# FenaFilter

AI-powered football screenshot filtering. Upload a screenshot of football fixtures, describe in plain English what to remove or keep, review what the AI understood, and download an edited copy of your **original** image with the unwanted fixture rows cut out.

> Statistics are historical and probabilities are model estimates — not guarantees and not betting advice.

---

## How it works

```
Browser ──upload (direct, private)──► Storage (Vercel Blob / ./.data)
   │
   ├─ POST /api/analyze ──► background job (Next.js after())
   │        ├─ Gemini (image) ──► fixtures + bounding boxes     ┐ in parallel
   │        └─ Gemini (text) ───► structured filter plan         ┘
   │        ► AWAITING_CONFIRMATION  ← user corrects fixtures / thresholds
   │
   ├─ POST /api/analyze/[id]/confirm
   │        ├─ API-Football ──► team identity + recent results (cached)
   │        ├─ Filtering engine (deterministic, 3-valued logic) ──► KEEP / REMOVE / NEEDS_REVIEW
   │        ├─ Gemini (text) ──► plain-English summary (cannot change decisions)
   │        └─ Sharp ──► cut rows from original pixels ──► lossless PNG
   │
   └─ /results/[id] — before/after, evidence, overrides, download
```

| Layer | Folder | Responsibility |
|---|---|---|
| UI | `src/app`, `src/components` | Landing page, dashboard, analysis workspace, results, history, settings |
| Upload & storage | `src/lib/storage`, `src/lib/uploads.ts`, `api/upload` | Private storage, validation by decoding the real bytes |
| Image understanding | `src/lib/vision` | Gemini call, tiling of tall screenshots, box conversion & validation |
| AI client & instructions | `src/lib/ai` | Shared Gemini client, connection check, instruction prompt, JSON extraction, repair attempt |
| Football data | `src/lib/football` | API-Football client + cache, team matching, statistics, Poisson model |
| Filtering | `src/lib/filtering` | Metric catalogue, plan validation, decision engine |
| Image editing | `src/lib/imaging` | Separator detection, row snapping, Sharp composition |
| Jobs | `src/lib/jobs` | Job records, resumable pipeline, API view model |
| Security | `src/lib/security` | Signed guest sessions, rate limiting, sanitising untrusted text |

### Key design decisions

- **One AI provider.** Google Gemini handles both screenshot reading and instruction interpretation, so only one AI key is needed.
- **The AI proposes, the engine decides.** Gemini converts the instruction into a validated plan using only metrics the engine can compute (`src/lib/filtering/metrics.ts`). The deterministic engine applies it to sourced statistics. A fixture is never removed because of a model's unsupported opinion.
- **Missing data never deletes anything.** Conditions are evaluated with three-valued logic (true / false / unknown). Unknown leads to `NEEDS_REVIEW`, and review fixtures are kept in the image unless the user removes them.
- **Two human checkpoints.** Fixtures and the interpreted rules (including any assumed thresholds such as "high = 60%") are confirmed before statistics are fetched. Final decisions can be overridden before download.
- **Original pixels only.** No generative model touches the image. Box edges from Gemini are snapped to real separator rows (pixel rows with near-zero variance), whole rows are cut, and the output is lossless PNG with metadata stripped. Side-by-side layouts that cannot be cut are masked with the surrounding background and flagged.
- **Long jobs never rely on one HTTP request.** Work runs in `after()` with a lease. It saves progress after every fixture and stops before the serverless time limit. The next status poll resumes it.
- **Transparent statistics.** Historical frequencies (form, goals, BTTS, clean sheets, failed-to-score) are computed from raw finished matches. Probabilities come from a documented Poisson model with shrinkage (see `src/lib/football/poisson.ts`). The UI labels each number as *Historical* or *Estimate*.

---

## Getting started (Windows / PowerShell)

Requirements: Node.js 20.9+ (tested on Node 24), npm.

```powershell
cd path\to\fenafilter-ai    # the folder you cloned the repository into
npm install
Copy-Item .env.example .env.local
notepad .env.local          # add your keys — never paste them into chat or commit them
npm run dev                 # http://localhost:3000
```

Without any keys the website runs, uploads work (stored in `./.data`), and the app tells you which services are missing. **`GEMINI_API_KEY` is required to start an analysis.**

### Generating `SESSION_SECRET`

`SESSION_SECRET` signs the anonymous session cookie that ties analyses to a browser. Anyone who knows it could forge sessions, so it must be long, random and private. Run this in PowerShell. It uses a cryptographic random generator and prints 64 hex characters:

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | % { $_.ToString("x2") })
```

Paste the output after `SESSION_SECRET=` in `.env.local`. Use a different value for `CRON_SECRET`, and different values again in production.

There is no built-in fallback secret. In production (`NODE_ENV=production` or on Vercel), the server **refuses to start** if `SESSION_SECRET` is missing or shorter than 32 characters. In local development without it, a temporary random secret is used, and sessions reset whenever the server restarts.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | yes (for analysis) | Google Gemini — reads fixtures from screenshots and interprets instructions |
| `GEMINI_MODEL` | no | Default `gemini-3.1-flash-lite` (text + image input, free tier). Check it with the diagnostics endpoint (see below) |
| `API_FOOTBALL_KEY` | yes (for statistics rules) | API-Football (api-sports.io) |
| `API_FOOTBALL_ENABLE_PREDICTIONS` | no | `true` to also show API-Football predictions (uses extra requests) |
| `BLOB_READ_WRITE_TOKEN` | on Vercel | Private Vercel Blob store. Locally, `./.data` is used when unset |
| `SESSION_SECRET` | in production | ≥32 random characters. Signs guest session cookies |
| `CRON_SECRET` | on Vercel | Protects the daily cleanup job |
| `DIAGNOSTICS_SECRET` | no | Enables developer diagnostics at `/api/health?details=1` in production. Unset means diagnostics are disabled there |
| `LOCAL_STORAGE_DIR` | no | Local storage folder (default `.data`) |
| `API_FOOTBALL_BASE_URL` | no | Override the API-Football endpoint |

Instructions that use only team or competition rules ("remove matches involving Arsenal") need no football API key.

---

## Testing

```powershell
npm test                 # unit tests (Vitest): engine, statistics, Poisson, team matching,
                         # instruction parsing/validation, extraction geometry, image editing, security
npm run typecheck
npm run lint
npm run build

# End-to-end smoke test against a running production server (local storage mode):
npm run build; npm start            # terminal 1
npm run test:smoke                  # terminal 2
```

The smoke test does **not** start a real AI analysis when AI is configured (that would spend quota) unless you set `SMOKE_LIVE=1`. Its pipeline step still writes one short AI summary when an AI key is set.

`npm test` goes through `scripts/vitest.mjs`, which fixes a Windows issue: VS Code terminals report the drive as lowercase `c:\`, which makes Vitest load itself twice.

**Mock data policy:** unit tests use synthetic images and synthetic match histories, and stub the language model. All of these are labelled as mocks in the test files. The smoke test injects one clearly labelled **mock extraction** in place of the Gemini call. Everything after that is real: routes, sessions, pipeline, engine, Sharp editing, download and deletion. AI output quality must be checked with real keys.

### Testing with real services

1. Add the keys to `.env.local` and restart `npm run dev`.
2. Visit `http://localhost:3000/api/health?details=1&verify=gemini`. It should report `"aiCheck": { "ok": true }`. In local development this works without a secret.
3. Upload a real screenshot on `/dashboard` and try the example instructions.

### Health checks and diagnostics

| Request | Who | Returns |
|---|---|---|
| `GET /api/health` | anyone (uptime monitors) | `{"status":"ok"}` and nothing else |
| `GET /api/health?details=1` | developers | configured services, model name, warnings |
| `GET /api/health?details=1&verify=gemini` | developers | the above plus one real AI request |

In production the detailed forms need `Authorization: Bearer <DIAGNOSTICS_SECRET>`, and they answer 404 to everyone else, or to everyone if the secret is unset. From PowerShell:

```powershell
$h = @{ Authorization = "Bearer $env:DIAGNOSTICS_SECRET" }
Invoke-RestMethod "https://<your-app>.vercel.app/api/health?details=1" -Headers $h | ConvertTo-Json -Depth 5
```

The user interface never names the AI, data or storage providers. Technical error details go to the server logs, and users see plain-language messages.

---

## Deploying to Vercel

1. Push the repository to GitHub (`.env.local` and `.data` are git-ignored).
2. On vercel.com: **Add New → Project**, then import the repository.
3. **Storage → Create → Blob**, choose **Private** access, and connect it to the project. Tick *"Add a read-write token env var"* so `BLOB_READ_WRITE_TOKEN` is added. A store's access mode cannot be changed later.
4. **Settings → Environment Variables**: add `GEMINI_API_KEY`, `API_FOOTBALL_KEY`, `SESSION_SECRET` and `CRON_SECRET` (and optionally the model variables).
5. Deploy. `vercel.json` schedules `/api/cron/cleanup` daily, and uploads also carry a 1-day TTL.

Analysis routes declare `maxDuration = 300`. On plans with a lower limit, the pipeline still completes because it resumes on the next status poll.

---

## Known limitations

- **API-Football quota:** each fixture needs about 4 requests on first lookup (cached afterwards). Free plans have small daily limits and may only allow older seasons. When that happens, the data is flagged as stale.
- **API-Football docs** block automated readers, so the response handling follows the stable v3 format defensively. Verify it with a real key.
- **Gemini free tier** has per-minute and per-day request limits. One analysis uses 1 image request per screenshot section, plus 1–2 text requests (interpretation, with one repair retry if needed) and 1 for the summary. A 429 error is shown to the user as a quota message.
- **Instruction output** is requested as JSON, then extracted, schema-validated and repaired once. Unusable output asks the user to rephrase.
- **Rate limiting is per server instance** (in memory). For strict global limits, swap `src/lib/security/rate-limit.ts` for Redis/Upstash.
- **Jobs are JSON files in object storage,** which is fine for the MVP. For accounts and long-term history, move `src/lib/jobs/repository.ts` to Postgres/Supabase. Sessions are already abstracted as an opaque `ownerId`.
- Grid layouts (fixtures side by side) are masked rather than cut.

## Roadmap

- Supabase Auth + Postgres for persistent history across devices
- Drag-to-adjust row boundaries on the image
- League-specific priors for the Poisson model
