import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// Run from the repo root:  node tests/check-repo.mjs   (Node 22+, no browser, no network)
// Fast checks on the files themselves. Part of the GitHub "Tests" workflow, and cheap enough to run before every commit.
//   1. every inline script in index.html parses, so a stray bracket can't ship;
//   2. the version agrees everywhere (APP_VERSION, both change logs, README), the drift CLAUDE.md section 1 warns about;
//   3. vercel.json is valid;
//   4. no key or token is committed (SECURITY.md section 2);
//   5. food data has no emoji or pictographs (CLAUDE.md section 4).
const REPO = fileURLToPath(new URL("..", import.meta.url));
const read = f => readFileSync(join(REPO, f), "utf8");
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  " + extra}`); };

console.log("--- 1. index.html scripts parse");
const html = read("index.html");
const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].filter(m => !/\bsrc=/.test(m[1]) && !/application\/ld\+json/.test(m[1]));
ok("found the inline scripts", scripts.length >= 4, String(scripts.length));
scripts.forEach((m, i) => { try { new Function(m[2]); ok(`inline script ${i + 1} parses`, true); } catch (e) { ok(`inline script ${i + 1} parses`, false, e.message); } });
for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) { try { JSON.parse(m[1]); ok("JSON-LD block is valid JSON", true); } catch (e) { ok("JSON-LD block is valid JSON", false, e.message); } }

console.log("--- 2. the version agrees everywhere");
const av = html.match(/const APP_VERSION = \{ update: "([^"]+)", build: "([^"]+)", channel: "([^"]+)", date: "([^"]+)"/);
ok("APP_VERSION found", !!av);
if (av) {
  const [, update, build, channel, date] = av;
  const cur = read("CHANGELOG.md").match(/\*\*Current:\*\* Update (\S+) \(([^)]+)\), build (\S+), (\d{4}-\d{2}-\d{2})/);
  ok("CHANGELOG.md 'Current' line found", !!cur);
  if (cur) ok("CHANGELOG.md 'Current' matches APP_VERSION", cur[1] === update && cur[2] === channel && cur[3] === build && cur[4] === date, `${cur[1]}/${cur[2]}/${cur[3]}/${cur[4]} vs ${update}/${channel}/${build}/${date}`);
  const top = read("CHANGELOG.md").match(/^## (\S+) · /m);
  ok("newest CHANGELOG.md entry is the current build", !!top && top[1] === build, `${top && top[1]} vs ${build}`);
  const inapp = html.slice(html.indexOf("const CHANGELOG = [")).match(/\{ id:"([^"]+)"/);
  ok("newest in-app change log entry is the current build", !!inapp && inapp[1] === build, `${inapp && inapp[1]} vs ${build}`);
  const rd = read("README.md").match(/Current build: \*\*Update (\S+) \(([^)]+)\), build (\S+)\*\*/);
  ok("README.md names the current build", !!rd && rd[1] === update && rd[2] === channel && rd[3] === build, rd ? `${rd[1]}/${rd[3]}` : "no 'Current build' line");
  ok("build number starts with the update number", build === update || build.startsWith(update + "."), `${build} vs ${update}`);
}

console.log("--- 3. vercel.json");
try { const v = JSON.parse(read("vercel.json")); ok("vercel.json is valid and sets headers", Array.isArray(v.headers) && v.headers.length > 0); } catch (e) { ok("vercel.json is valid and sets headers", false, e.message); }

console.log("--- 4. no secrets are committed");
let files = [];
try { files = execFileSync("git", ["ls-files"], { cwd: REPO, encoding: "utf8" }).split("\n").filter(Boolean); } catch { ok("git file list", false, "run from a git checkout"); }
const text = files.filter(f => /\.(html|md|json|js|mjs|sql|ya?ml|txt|toml|env)$/i.test(f) && existsSync(join(REPO, f)));
ok("no .env file is tracked", !files.some(f => /(^|\/)\.env(\.|$)/.test(f)), files.filter(f => /(^|\/)\.env(\.|$)/.test(f)).join(","));
const SECRET = [[/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, "a JWT (could be a service_role or user token)"], [/sb_secret_[A-Za-z0-9_-]{10,}/, "a Supabase secret key"], [/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, "a private key"]];
const hits = [];
for (const f of text) { const t = read(f); for (const [re, what] of SECRET) if (re.test(t)) hits.push(`${f}: ${what}`); }
ok(`no keys or tokens in ${text.length} text files`, hits.length === 0, hits.join(" | "));

console.log("--- 5. food data is text only");
const a = html.indexOf("const DISHES = ["), b = html.indexOf("const FOODC = [");
ok("found the food tables", a > 0 && b > a);
const food = html.slice(a, b), pict = [...food.matchAll(/\p{Extended_Pictographic}/gu)].map(m => m[0]);
ok("no emoji or pictographs in DISHES, SNACKS or the tables between them", pict.length === 0, [...new Set(pict)].join(" "));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
