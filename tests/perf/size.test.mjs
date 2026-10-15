import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sizes, checkSizes } from "./size.mjs";

const sizeCommand = fileURLToPath(new URL("./size.mjs", import.meta.url));
const html = "<!doctype html><title>size test</title>";
const passingBudget = { raw: 10, brotli: 10, gzip: 10 };

function runSizeCommand(t, { budget = passingBudget, perfBaseSha } = {}) {
  const root = mkdtempSync(join(tmpdir(), "size-check-test-"));
  const perfDir = join(root, "tests", "perf");
  mkdirSync(perfDir, { recursive: true });
  writeFileSync(join(perfDir, "size.mjs"), readFileSync(sizeCommand));
  writeFileSync(join(perfDir, "budget.json"), JSON.stringify({ sizeKB: budget }));
  writeFileSync(join(root, "index.html"), html);

  // PERF_BASE_SHA must reach the git-show path in an actual repository.
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["add", "index.html"], { cwd: root });
  execFileSync("git", ["-c", "user.name=Size test", "-c", "user.email=size-test@example.invalid", "commit", "--quiet", "-m", "baseline"], { cwd: root });

  const env = { ...process.env };
  delete env.PERF_BASE_SHA;
  if (perfBaseSha !== undefined) {
    env.PERF_BASE_SHA = perfBaseSha === "HEAD"
      ? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim()
      : perfBaseSha;
  }
  const result = spawnSync(process.execPath, [join(perfDir, "size.mjs")], {
    cwd: root,
    env,
    encoding: "utf8"
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return result;
}

test("size command exits successfully below budget", t => {
  const result = runSizeCommand(t, { perfBaseSha: "HEAD" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS raw:/);
  assert.match(result.stdout, /change \+0\.00 KB/);
});

test("size command exits nonzero when a file exceeds budget", t => {
  const result = runSizeCommand(t, { budget: { raw: 0.001, brotli: 10, gzip: 10 } });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /FAIL raw:/);
});

test("size command exits nonzero for an invalid PERF_BASE_SHA", t => {
  const result = runSizeCommand(t, { perfBaseSha: "not-a-commit-sha" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PERF_BASE_SHA must be a full commit SHA/);
});

test("size command exits nonzero for an unavailable PERF_BASE_SHA", t => {
  const result = runSizeCommand(t, { perfBaseSha: "0".repeat(40) });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Size check failed:/);
});

test("every size limit is inclusive and fails immediately above its boundary", () => {
  const limits = { raw: 2000, brotli: 510, gzip: 600 };
  assert.ok(checkSizes(limits, limits).every(c => c.pass));
  for (const kind of Object.keys(limits)) {
    const result = checkSizes({ ...limits, [kind]: limits[kind] + 1 / 1024 }, limits);
    assert.deepEqual(result.filter(c => !c.pass).map(c => c.kind), [kind]);
  }
});

test("missing and invalid budgets fail closed", () => {
  const current = { raw: 1, brotli: 1, gzip: 1 };
  for (const invalid of [undefined, NaN, Infinity, 0, -1, "510"]) {
    assert.throws(() => checkSizes(current, { ...current, brotli: invalid }));
  }
});

test("reports growth and savings without changing a limit", () => {
  const budget = { raw: 10, brotli: 10, gzip: 10 };
  const result = checkSizes({ raw: 8, brotli: 4, gzip: 5 }, budget, { raw: 9, brotli: 3, gzip: 5 });
  assert.deepEqual(result.map(c => c.delta), [-1, 1, 0]);
  assert.deepEqual(result.map(c => c.headroom), [2, 6, 5]);
  assert.deepEqual(budget, { raw: 10, brotli: 10, gzip: 10 });
});

test("counts bytes, not characters, and compresses the actual input", () => {
  const html = Buffer.from("é".repeat(1024));
  const result = sizes(html);
  assert.equal(result.raw, 2);
  assert.ok(result.brotli > 0 && result.brotli < result.raw);
  assert.ok(result.gzip > 0 && result.gzip < result.raw);
});
