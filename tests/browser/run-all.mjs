import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Run from the repo root:  node tests/browser/run-all.mjs   (needs Node 22+, Python 3 and Chrome; set CHROME to its path)
// Runs every browser test one after another, because they share no ports but each starts its own Chrome.
// Also what the GitHub "Tests" workflow runs. Exits non-zero if any test fails or can't start.
const DIR = fileURLToPath(new URL(".", import.meta.url));
const TESTS = ["headers", "security", "profile-sync", "meal-sync", "meal-upload", "controls", "glass", "cards", "rings", "widgets", "legal", "lamp", "authcard", "a11y", "workouts", "challenges", "blocking", "acctdel", "privacy", "workout-sync", "account-sync", "motion", "advice", "rail", "receipt", "slidepay", "compact", "toasts", "statcards", "upload"];
const results = [];
for (const name of TESTS) {
  console.log(`\n===== ${name} =====`);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [`${DIR}${name}.mjs`], { stdio: "inherit", timeout: 10 * 60 * 1000 });
  results.push({ name, ok: r.status === 0, secs: Math.round((Date.now() - t0) / 1000), why: r.error ? r.error.message : r.signal || "" });
}
console.log("\n===== summary =====");
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}  (${r.secs}s)${r.why ? "  " + r.why : ""}`);
process.exit(results.every(r => r.ok) ? 0 : 1);
