import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { brotliCompressSync, gzipSync, constants } from "node:zlib";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const REPO = fileURLToPath(new URL("../..", import.meta.url));

// Match measure.mjs exactly: binary KB, Brotli quality 9, gzip level 9.
export function sizes(html) {
  return {
    raw: html.length / 1024,
    brotli: brotliCompressSync(html, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }).length / 1024,
    gzip: gzipSync(html, { level: 9 }).length / 1024
  };
}

export function checkSizes(current, limits, baseline = null) {
  return ["raw", "brotli", "gzip"].map(kind => {
    const value = current[kind], limit = limits?.[kind];
    if (!Number.isFinite(value) || value < 0 || !Number.isFinite(limit) || limit <= 0) {
      throw new Error(`Invalid ${kind} size or budget`);
    }
    const delta = baseline ? value - baseline[kind] : null;
    return { kind, value, limit, delta, pass: value <= limit, headroom: limit - value };
  });
}

function main() {
  const budget = JSON.parse(readFileSync(new URL("./budget.json", import.meta.url), "utf8"));
  const current = sizes(readFileSync(resolve(REPO, "index.html")));
  const base = process.env.PERF_BASE_SHA;
  let baseline = null;
  if (base) {
    if (!/^[a-f0-9]{40}$/i.test(base)) throw new Error("PERF_BASE_SHA must be a full commit SHA");
    baseline = sizes(execFileSync("git", ["show", `${base}:index.html`], {
      cwd: REPO, maxBuffer: 32 * 1024 * 1024
    }));
  }
  const checks = checkSizes(current, budget.sizeKB, baseline);
  console.log("index.html size budget (KB = 1024 bytes; same compression as the phone gate)");
  for (const c of checks) {
    const delta = c.delta === null ? "" : `; change ${c.delta >= 0 ? "+" : ""}${c.delta.toFixed(2)} KB`;
    console.log(`${c.pass ? "PASS" : "FAIL"} ${c.kind}: ${c.value.toFixed(2)} / ${c.limit} KB; headroom ${c.headroom.toFixed(2)} KB${delta}`);
    if (c.pass && c.headroom / c.limit < 0.05) console.warn(`NEAR LIMIT: ${c.kind} has less than 5% remaining. Trim before adding weight.`);
  }
  console.log("Size checks do not replace node tests/perf/measure.mjs --gate.");
  if (checks.some(c => !c.pass)) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(`Size check failed: ${error.message}`); process.exitCode = 1; }
}
