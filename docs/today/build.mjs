// Generates docs/today/index.html: one self-contained page (inline CSS and SVG) about what was built.
// Run from the repository root: node docs/today/build.mjs
// Numbers come from git and the test runner, so rerunning it refreshes the page. Text states only what exists.

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const run = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---- data ------------------------------------------------------------------

const log = run("git", ["log", "--since=2026-11-23T00:00:00Z", "--reverse", "--format=%h|%ad|%s", "--date=format-local:%H:%M"]).stdout
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((l) => {
    const [hash, time, ...rest] = l.split("|");
    return { hash, time, subject: rest.join("|") };
  });
const taskCommits = log.filter((c) => /^task\(/.test(c.subject));
const enforcementTasks = taskCommits.filter((c) => c.subject.startsWith("task(enforcement-setup/"));
const coreTasks = taskCommits.filter((c) => c.subject.startsWith("task(skeleton-core/"));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".data" || name === "fixtures") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const lines = (files) => files.reduce((n, f) => n + readFileSync(f, "utf8").split("\n").length, 0);
const src = walk("src").filter((f) => /\.(ts|tsx)$/.test(f));
const srcCode = src.filter((f) => !/\.test\.ts$/.test(f));
const testFiles = [...src.filter((f) => /\.test\.ts$/.test(f)), ...walk("tests").filter((f) => /\.test\.ts$/.test(f))];
const scriptCode = walk("scripts").filter((f) => /\.ts$/.test(f) && !/\/test\//.test(f));
const scriptTests = walk("scripts").filter((f) => /\/test\/.*\.test\.ts$/.test(f));
const n = {
  srcLines: lines(srcCode),
  srcFiles: srcCode.length,
  testLines: lines(testFiles),
  testFiles: testFiles.length,
  scriptLines: lines(scriptCode),
  scriptTestLines: lines(scriptTests),
};

const t = run("node", ["--test", "src/**/*.test.ts", "tests/**/*.test.ts"]).stdout;
const num = (re) => Number((t.match(re) ?? [])[1] ?? 0);
const tests = { total: num(/ℹ tests (\d+)/), pass: num(/ℹ pass (\d+)/), skipped: num(/ℹ skipped (\d+)/), fail: num(/ℹ fail (\d+)/) };

const cat = JSON.parse(readFileSync("docs/generated/catalog.json", "utf8"));
const stamp = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";

// ---- timeline --------------------------------------------------------------

function timeline() {
  const lane = (title, color, items, y) => {
    const W = 1000;
    const step = (W - 100) / Math.max(1, items.length - 1);
    let out = `<text x="30" y="${y - 30}" font-size="13" font-weight="700" fill="${color}">${esc(title)}</text>`;
    out += `<line x1="50" y1="${y}" x2="${W - 50}" y2="${y}" stroke="#cbd5e1" stroke-width="3"/>`;
    const seen = new Set();
    items.forEach((c, i) => {
      const cx = 50 + i * step;
      let id = c.subject.match(/\/(\d+)\)/)?.[1] ?? "";
      if (seen.has(id)) id += "b";
      seen.add(id);
      out += `<g><title>${esc(c.time)} UTC: ${esc(c.subject)}</title><circle cx="${cx}" cy="${y}" r="13" fill="${color}"/><text x="${cx}" y="${y + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">${esc(id)}</text></g>`;
    });
    if (items.length > 0) {
      out += `<text x="50" y="${y + 34}" font-size="12" fill="#64748b">${esc(items[0].time)}</text>`;
      out += `<text x="${50 + (items.length - 1) * step}" y="${y + 34}" text-anchor="end" font-size="12" fill="#64748b">${esc(items[items.length - 1].time)} UTC</text>`;
    }
    return out;
  };
  return `<svg viewBox="0 0 1000 250" role="img" aria-label="Task commits in order">${lane(`Guardrails: ${enforcementTasks.length} task commits`, "#0ea5e9", enforcementTasks, 70)}${lane(`Skeleton core: ${coreTasks.length} task commits`, "#7c3aed", coreTasks, 175)}</svg>`;
}

// ---- parts -----------------------------------------------------------------

const portCards = [
  ["Logger", "console", "memory", "hosted log service"],
  ["Clock", "system", "fixed", null],
  ["IdGenerator", "uuid", "sequence", null],
  ["Database", "sqlite", "memory", "PocketBase, Supabase"],
  ["Cache", "memory", "null", "Workers KV"],
  ["ObjectStorage", "fs", "memory", "R2"],
]
  .map(
    ([name, a, b, planned]) => `<div class="card port"><h4>${name}</h4><span class="chip real">${a}</span><span class="chip real">${b}</span>${
      planned ? `<span class="chip planned">planned: ${planned}</span>` : ""
    }</div>`,
  )
  .join("");

const shots = [
  ["app-offline.png", "The real Next.js page, served with no network at all", "wide"],
  ["profileform--success.png", "Story: success"],
  ["profileform--loading.png", "Story: loading"],
  ["profileform--empty.png", "Story: empty"],
  ["profileform--saved.png", "Story: saved"],
  ["profileform--save-user-error.png", "Story: a user error, shown as a toast"],
  ["profileform--save-internal-error.png", "Story: an internal error, generic message plus reference code"],
  ["toast--long-message.png", "Story: a long toast message"],
];
const gallery = shots
  .map(([f, cap, cls]) => `<figure class="${cls ?? ""}"><img src="media/${f}" alt="${esc(cap)}" loading="lazy"><figcaption>${esc(cap)}</figcaption></figure>`)
  .join("");

const bar = (label, value, max, color) =>
  `<div class="bar"><span class="bl">${esc(label)}</span><span class="bt"><i style="width:${Math.max(2, (value / max) * 100)}%;background:${color}"></i></span><span class="bv">${value.toLocaleString("en")}</span></div>`;
const maxLines = Math.max(n.srcLines, n.testLines, n.scriptLines, n.scriptTestLines);

const findings = [
  ["Tests caught a wrong design choice", "Lowercasing the display name in the database port stored it as \u201cada\u201d. The schema now keeps what the user typed and a separate lowercase key for uniqueness."],
  ["The checker flagged our own test fixtures", "It scans every file under src for steps and strips, so the deliberately broken strips in the library tests were reported. The tests moved to tests/lib. A rule change to skip test files is suggested, and left to the builder."],
  ["Two confirmed decisions were too narrow", "Writing the strip library showed that skipping a failed step (D5) and where fallback steps live (D12) needed refining. The agent proposed D5b and D12 and waited for a yes instead of changing them."],
  ["The test script silently stopped running some tests", "After a folder move the script pointed at the old folder, so 36 tests did not run for one commit. Found by a count mismatch, fixed, and written down."],
  ["Parallel tasks tripped the progress rule", "Tasks started in parallel look like \u201cstarted, never done\u201d to rule R40, and merge refuses while an earlier worktree is open. Both rough edges are recorded."],
  ["One boolean could undo data separation", "The idea of a dev flag that switches to production services was turned into a read-only value derived from APP_ENV. The profile stays the only thing that chooses adapters."],
]
  .map(([h, p]) => `<li><b>${esc(h)}</b><span>${esc(p)}</span></li>`)
  .join("");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Skeleton Crew: what we built today</title>
<style>
:root{--bg:#f8fafc;--ink:#0f172a;--mute:#64748b;--card:#fff;--line:#e2e8f0;--a:#7c3aed;--b:#0ea5e9;--ok:#16a34a;--warn:#d97706}
*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;background:var(--bg);color:var(--ink)}
header{background:linear-gradient(135deg,#1e1b4b,#4c1d95 55%,#0e7490);color:#fff;padding:56px 24px 64px}
.wrap{max-width:1040px;margin:0 auto;padding:0 20px}header .wrap{padding:0}
h1{font-size:clamp(32px,6vw,56px);margin:0 0 8px;letter-spacing:-.02em}header p{margin:0;max-width:700px;color:#e0e7ff;font-size:18px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-top:30px}
.stat{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);border-radius:12px;padding:14px 16px}
.stat b{display:block;font-size:30px;line-height:1.1}.stat span{font-size:13px;color:#c7d2fe}
section{padding:44px 0 4px}h2{font-size:28px;margin:0 0 6px;letter-spacing:-.01em}.lead{color:var(--mute);margin:0 0 20px;max-width:760px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}
svg{width:100%;height:auto;display:block}.diagram{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}
.port h4{margin:0 0 8px}.chip{display:inline-block;font-size:13px;border-radius:999px;padding:2px 10px;margin:0 6px 6px 0;border:1px solid}
.chip.real{background:#ecfdf5;border-color:#86efac;color:#166534}.chip.planned{background:#fff;border:1px dashed #94a3b8;color:#64748b}
figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px}figure img{width:100%;border-radius:6px;border:1px solid var(--line);display:block}
figcaption{font-size:13px;color:var(--mute);margin-top:6px}.gallery{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}.gallery .wide{grid-column:1/-1;max-width:760px}
.bar{display:grid;grid-template-columns:190px 1fr 70px;align-items:center;gap:10px;margin:8px 0}.bt{background:#e2e8f0;border-radius:6px;height:16px;overflow:hidden}.bt i{display:block;height:100%}.bv{text-align:right;font-variant-numeric:tabular-nums;color:var(--mute)}
ul.find{list-style:none;padding:0;margin:0;display:grid;gap:10px}ul.find li{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--warn);border-radius:10px;padding:12px 16px}
ul.find b{display:block}ul.find span{color:var(--mute);font-size:15px}
table{border-collapse:collapse;width:100%;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}th,td{padding:9px 12px;text-align:left;border-bottom:1px solid var(--line);font-size:15px}th{background:#f1f5f9}
.tag{font-size:12px;border-radius:6px;padding:1px 8px;font-weight:600}.done{background:#dcfce7;color:#166534}.todo{background:#fef3c7;color:#92400e}.plan{background:#e0e7ff;color:#3730a3}
code{background:#eef2ff;border-radius:4px;padding:1px 5px;font-size:.92em}footer{padding:40px 0 60px;color:var(--mute);font-size:14px}
@media (max-width:600px){.bar{grid-template-columns:110px 1fr 56px}}
</style></head><body>
<header><div class="wrap">
<h1>Skeleton Crew</h1>
<p>An app template that keeps AI agents honest: the rules are checked by the project, and the agent cannot finish until they pass. This page shows what was built on 23 November 2026.</p>
<div class="stats">
<div class="stat"><b>${log.length}</b><span>commits today</span></div>
<div class="stat"><b>${taskCommits.length}</b><span>task commits (${enforcementTasks.length} guardrails, ${coreTasks.length} skeleton)</span></div>
<div class="stat"><b>${tests.pass}</b><span>tests passing (${tests.skipped} skipped on purpose, ${tests.fail} failing)</span></div>
<div class="stat"><b>${(n.srcLines + n.scriptLines).toLocaleString("en")}</b><span>lines of code (${n.srcLines.toLocaleString("en")} skeleton, ${n.scriptLines.toLocaleString("en")} guardrails)</span></div>
<div class="stat"><b>${cat.steps.length} + ${cat.strips.length}</b><span>example steps and strips in the catalog</span></div>
</div></div></header>

<main class="wrap">

<section><h2>The problem, and the idea</h2>
<p class="lead">When an AI agent builds an app, it follows your instructions for a while and then forgets. Errors come back as text that looks like data, code gets shaped around one database, and parallel agents overwrite each other. Better instructions did not fix it. So the rules live in the project and block the agent.</p>
<div class="diagram"><svg viewBox="0 0 1000 250" role="img" aria-label="The agent is checked by rules and hooks before it can finish">
<defs><marker id="ar" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 z" fill="#475569"/></marker></defs>
<rect x="20" y="85" width="170" height="80" rx="12" fill="#ede9fe" stroke="#7c3aed"/><text x="105" y="120" text-anchor="middle" font-weight="700">AI agent</text><text x="105" y="142" text-anchor="middle" font-size="13" fill="#475569">writes code</text>
<line x1="190" y1="125" x2="270" y2="125" stroke="#475569" stroke-width="2" marker-end="url(#ar)"/>
<rect x="272" y="60" width="210" height="130" rx="12" fill="#e0f2fe" stroke="#0ea5e9"/><text x="377" y="95" text-anchor="middle" font-weight="700">pnpm check</text><text x="377" y="118" text-anchor="middle" font-size="13" fill="#475569">41 rules, typecheck, tests</text><text x="377" y="140" text-anchor="middle" font-size="13" fill="#475569">lists every violation</text><text x="377" y="162" text-anchor="middle" font-size="13" fill="#475569">not only the first</text>
<line x1="482" y1="125" x2="560" y2="125" stroke="#475569" stroke-width="2" marker-end="url(#ar)"/>
<rect x="562" y="60" width="200" height="130" rx="12" fill="#fef3c7" stroke="#d97706"/><text x="662" y="95" text-anchor="middle" font-weight="700">Stop hook</text><text x="662" y="118" text-anchor="middle" font-size="13" fill="#475569">fails: back to work</text><text x="662" y="140" text-anchor="middle" font-size="13" fill="#475569">with the list</text><text x="662" y="162" text-anchor="middle" font-size="13" fill="#475569">3 tries, then ask</text>
<line x1="762" y1="125" x2="840" y2="125" stroke="#475569" stroke-width="2" marker-end="url(#ar)"/>
<rect x="842" y="85" width="140" height="80" rx="12" fill="#dcfce7" stroke="#16a34a"/><text x="912" y="120" text-anchor="middle" font-weight="700">Done</text><text x="912" y="142" text-anchor="middle" font-size="13" fill="#475569">all rules pass</text>
<path d="M662 60 C 662 10, 105 10, 105 85" fill="none" stroke="#d97706" stroke-width="2" stroke-dasharray="6 5" marker-end="url(#ar)"/><text x="385" y="24" text-anchor="middle" font-size="13" fill="#92400e">sent back while anything fails</text>
<rect x="272" y="205" width="490" height="34" rx="8" fill="#fee2e2" stroke="#dc2626"/><text x="517" y="227" text-anchor="middle" font-size="13" fill="#7f1d1d">Protection hook: blocks edits to the rules and to code outside the plan</text>
</svg></div></section>

<section><h2>How the skeleton is built</h2>
<p class="lead">A feature is a strip: a chain of small steps. Every step returns a Result, so a failure is never mistaken for a value. Steps never touch a database or cache directly. They use ports, and a profile decides which adapter sits behind each port.</p>
<div class="diagram"><svg viewBox="0 0 1000 400" role="img" aria-label="Layers of the skeleton">
<defs><marker id="a2" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 z" fill="#475569"/></marker></defs>
<rect x="20" y="15" width="620" height="62" rx="10" fill="#ede9fe" stroke="#7c3aed"/><text x="330" y="42" text-anchor="middle" font-weight="700">Page and form</text><text x="330" y="63" text-anchor="middle" font-size="13" fill="#475569">Next.js page and Storybook stories. Components get Result-shaped props, never a strip.</text>
<line x1="330" y1="77" x2="330" y2="100" stroke="#475569" stroke-width="2" marker-end="url(#a2)"/>
<rect x="20" y="102" width="620" height="62" rx="10" fill="#e0f2fe" stroke="#0ea5e9"/><text x="330" y="129" text-anchor="middle" font-weight="700">Server Action</text><text x="330" y="150" text-anchor="middle" font-size="13" fill="#475569">Runs the strip. Returns only the message and a reference code, never the error object.</text>
<line x1="330" y1="164" x2="330" y2="187" stroke="#475569" stroke-width="2" marker-end="url(#a2)"/>
<rect x="20" y="189" width="620" height="78" rx="10" fill="#fef3c7" stroke="#d97706"/><text x="330" y="214" text-anchor="middle" font-weight="700">Strip: profile.save</text>
<rect x="40" y="226" width="140" height="30" rx="6" fill="#fff" stroke="#d97706"/><text x="110" y="246" text-anchor="middle" font-size="12">pure.profile.parseForm</text>
<line x1="180" y1="241" x2="222" y2="241" stroke="#475569" marker-end="url(#a2)"/>
<rect x="224" y="226" width="170" height="30" rx="6" fill="#fff" stroke="#d97706"/><text x="309" y="246" text-anchor="middle" font-size="12">db.user.setDisplayName</text>
<text x="520" y="236" text-anchor="middle" font-size="12" fill="#92400e">budget: reads and writes users</text><text x="520" y="252" text-anchor="middle" font-size="12" fill="#92400e">routing: toast, retry, abort</text>
<line x1="330" y1="267" x2="330" y2="290" stroke="#475569" stroke-width="2" marker-end="url(#a2)"/>
<rect x="20" y="292" width="620" height="62" rx="10" fill="#dcfce7" stroke="#16a34a"/><text x="330" y="319" text-anchor="middle" font-weight="700">Ports</text><text x="330" y="340" text-anchor="middle" font-size="13" fill="#475569">Database, Cache, Storage, Logger, Clock, IDs. A step sees only what it may use.</text>
<line x1="330" y1="354" x2="330" y2="372" stroke="#475569" stroke-width="2" marker-end="url(#a2)"/>
<text x="330" y="392" text-anchor="middle" font-size="13" fill="#166534">Adapters: sqlite or memory, memory or null, fs or memory ...</text>
<rect x="690" y="102" width="290" height="252" rx="12" fill="#f1f5f9" stroke="#94a3b8"/><text x="835" y="130" text-anchor="middle" font-weight="700">Profile (APP_ENV)</text>
<text x="710" y="162" font-size="14"><tspan font-weight="700" fill="#16a34a">local</tspan> <tspan fill="#475569">offline, sqlite file, demo data</tspan></text>
<text x="710" y="190" font-size="14"><tspan font-weight="700" fill="#0ea5e9">dev</tspan> <tspan fill="#475569">own paths from env, no prod hosts</tspan></text>
<text x="710" y="218" font-size="14"><tspan font-weight="700" fill="#dc2626">prod</tspan> <tspan fill="#475569">never in memory, own paths</tspan></text>
<text x="710" y="256" font-size="13" fill="#475569">Chooses the adapter for every port.</text><text x="710" y="276" font-size="13" fill="#475569">Refuses to start on any bad host,</text><text x="710" y="296" font-size="13" fill="#475569">path, or shared data. Lists all</text><text x="710" y="316" font-size="13" fill="#475569">problems at once.</text>
<path d="M690 228 C 665 228, 665 323, 642 323" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="5 4" marker-end="url(#a2)"/>
</svg></div></section>

<section><h2>Six ports, two adapters each</h2>
<p class="lead">Every port has two working adapters and one shared test suite that runs against both, so swapping a provider changes an adapter and a setting, not the features. Dashed chips are real adapters that are planned, not built.</p>
<div class="grid">${portCards}</div></section>

<section><h2>One feature, every ending</h2>
<p class="lead">profile.save is tested against both databases and with the cache on and off. Each ending gives the user the right thing, and nothing internal leaks.</p>
<div class="diagram"><svg viewBox="0 0 1000 330" role="img" aria-label="Outcomes of profile.save">
<defs><marker id="a3" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 z" fill="#475569"/></marker></defs>
<rect x="20" y="130" width="140" height="60" rx="10" fill="#ede9fe" stroke="#7c3aed"/><text x="90" y="157" text-anchor="middle" font-weight="700">Save clicked</text><text x="90" y="176" text-anchor="middle" font-size="12" fill="#475569">name typed</text>
<line x1="160" y1="160" x2="215" y2="160" stroke="#475569" stroke-width="2" marker-end="url(#a3)"/>
<rect x="217" y="125" width="170" height="70" rx="10" fill="#fef3c7" stroke="#d97706"/><text x="302" y="155" text-anchor="middle" font-weight="700" font-size="14">parseForm</text><text x="302" y="175" text-anchor="middle" font-size="12" fill="#475569">trim, 1 to 60 characters</text>
<line x1="387" y1="160" x2="440" y2="160" stroke="#475569" stroke-width="2" marker-end="url(#a3)"/>
<rect x="442" y="125" width="190" height="70" rx="10" fill="#fef3c7" stroke="#d97706"/><text x="537" y="155" text-anchor="middle" font-weight="700" font-size="14">setDisplayName</text><text x="537" y="175" text-anchor="middle" font-size="12" fill="#475569">writes the user</text>
<line x1="632" y1="160" x2="690" y2="160" stroke="#16a34a" stroke-width="2" marker-end="url(#a3)"/>
<rect x="692" y="125" width="288" height="70" rx="10" fill="#dcfce7" stroke="#16a34a"/><text x="836" y="153" text-anchor="middle" font-weight="700" font-size="14">Saved</text><text x="836" y="173" text-anchor="middle" font-size="12" fill="#166534">cached profile removed, next view is fresh</text>
<line x1="302" y1="195" x2="302" y2="235" stroke="#dc2626" stroke-width="2" marker-end="url(#a3)"/>
<rect x="210" y="237" width="184" height="62" rx="10" fill="#fee2e2" stroke="#dc2626"/><text x="302" y="262" text-anchor="middle" font-weight="700" font-size="13">Toast: empty name</text><text x="302" y="282" text-anchor="middle" font-size="12" fill="#7f1d1d">user error, shown as written</text>
<line x1="500" y1="195" x2="500" y2="235" stroke="#dc2626" stroke-width="2" marker-end="url(#a3)"/>
<rect x="402" y="237" width="200" height="62" rx="10" fill="#fee2e2" stroke="#dc2626"/><text x="502" y="262" text-anchor="middle" font-weight="700" font-size="13">Toast: name taken</text><text x="502" y="282" text-anchor="middle" font-size="12" fill="#7f1d1d">any letter case</text>
<line x1="590" y1="195" x2="690" y2="237" stroke="#d97706" stroke-width="2" marker-end="url(#a3)"/>
<rect x="662" y="237" width="318" height="62" rx="10" fill="#fff7ed" stroke="#d97706"/><text x="821" y="262" text-anchor="middle" font-weight="700" font-size="13">Generic message and reference code</text><text x="821" y="282" text-anchor="middle" font-size="12" fill="#92400e">unknown user, database down: no internal text shown</text>
<text x="537" y="85" text-anchor="middle" font-size="12" fill="#475569">network failure: retried twice</text>
<path d="M590 118 C 600 95, 480 95, 490 118" fill="none" stroke="#475569" stroke-width="1.5" stroke-dasharray="4 3" marker-end="url(#a3)"/>
</svg></div></section>

<section><h2>What it looks like</h2>
<p class="lead">The first image is the real app, served from a network namespace with no network, from a local SQLite file. The rest are Storybook stories rendered in headless Chrome: every state can be previewed without running the app or a database.</p>
<div class="gallery">${gallery}</div></section>

<section><h2>The day, task by task</h2>
<p class="lead">Every task is one commit with a start row and a done row in a progress log, so any agent can resume exactly where work stopped.</p>
<div class="diagram">${timeline()}</div></section>

<section><h2>Two agents at once, in separate worktrees</h2>
<p class="lead">The database port and the cache and storage ports were built at the same time by two sub-agents, each in its own git worktree. Each branch was checked against its task's file list, then merged in order.</p>
<div class="diagram"><svg viewBox="0 0 1000 210" role="img" aria-label="Two branches merging into main">
<line x1="30" y1="105" x2="970" y2="105" stroke="#334155" stroke-width="4"/>
<circle cx="90" cy="105" r="8" fill="#334155"/><text x="90" y="135" text-anchor="middle" font-size="12">tasks 1 to 3</text>
<path d="M200 105 C 230 105, 240 45, 280 45 L 520 45 C 560 45, 570 105, 600 105" fill="none" stroke="#7c3aed" stroke-width="4"/>
<path d="M200 105 C 230 105, 240 165, 280 165 L 520 165 C 560 165, 570 105, 640 105" fill="none" stroke="#0ea5e9" stroke-width="4"/>
<circle cx="200" cy="105" r="8" fill="#334155"/><circle cx="600" cy="105" r="8" fill="#7c3aed"/><circle cx="660" cy="105" r="8" fill="#0ea5e9"/>
<text x="400" y="34" text-anchor="middle" font-size="13" fill="#5b21b6" font-weight="700">task/4: Database port, memory and sqlite (101 tests)</text>
<text x="400" y="190" text-anchor="middle" font-size="13" fill="#0369a1" font-weight="700">task/5: Cache and storage ports (92 tests)</text>
<text x="640" y="72" text-anchor="middle" font-size="12">verify, then merge in order</text>
<text x="820" y="135" text-anchor="middle" font-size="12">tasks 6 to 11, one at a time</text>
</svg></div></section>

<section><h2>The numbers</h2>
<div class="card">
${bar("Skeleton code", n.srcLines, maxLines, "#7c3aed")}
${bar("Skeleton tests", n.testLines, maxLines, "#a78bfa")}
${bar("Guardrail scripts", n.scriptLines, maxLines, "#0ea5e9")}
${bar("Guardrail tests", n.scriptTestLines, maxLines, "#7dd3fc")}
<p style="color:var(--mute);margin:14px 0 0;font-size:14px">Lines, counted ${esc(stamp)}. The skeleton has ${n.srcFiles} code files and ${n.testFiles} test files. All ${tests.pass + tests.skipped} skeleton tests run offline (${tests.skipped} are skipped on purpose, for example the null cache cannot store anything).</p>
</div></section>

<section><h2>What went wrong, and what caught it</h2>
<p class="lead">These stay in the record. They are the process working.</p>
<ul class="find">${findings}</ul></section>

<section><h2>Where things stand</h2>
<table><thead><tr><th>Part</th><th>State</th></tr></thead><tbody>
<tr><td>Guardrails: 41 rules, check command, worktree command, hooks, steering</td><td><span class="tag done">built, hooks on</span></td></tr>
<tr><td>Skeleton core: Result, steps, strips, six ports with two adapters each, profiles</td><td><span class="tag done">built</span></td></tr>
<tr><td>Example feature, Storybook stories, Next.js page running offline</td><td><span class="tag done">built</span></td></tr>
<tr><td>Error reporter, metrics, and a read-only <code>dev</code> flag derived from APP_ENV</td><td><span class="tag plan">specified, not built</span> waiting for the plan commit</td></tr>
<tr><td>Test command inside <code>pnpm check</code>, Stop-hook message fix</td><td><span class="tag todo">needs an unlock</span></td></tr>
<tr><td>Real adapters: PocketBase, Supabase, Workers KV, R2, hosted error and metrics services</td><td><span class="tag plan">planned</span></td></tr>
<tr><td>Zidolia and MiniCargo apps</td><td><span class="tag plan">not started</span></td></tr>
<tr><td>Clicking Save in a real browser</td><td><span class="tag todo">not verified</span> (the action is tested in Node)</td></tr>
</tbody></table></section>

</main>
<footer><div class="wrap">Generated ${esc(stamp)} by <code>node docs/today/build.mjs</code> from git and the test runner. Nothing on this page needs a network.</div></footer>
</body></html>
`;

writeFileSync("docs/today/index.html", html);
console.log(`wrote docs/today/index.html (${html.length} bytes): ${log.length} commits, ${tests.pass} tests passing`);
