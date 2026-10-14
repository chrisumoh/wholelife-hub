import { test } from "node:test";
import assert from "node:assert/strict";
import { sizes, checkSizes } from "./size.mjs";

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
