import { test } from "node:test";
import assert from "node:assert/strict";
import { findPlaceholders, badDmcaValues } from "./legal-placeholders.mjs";

test("catches every placeholder the EULA and DMCA pages ship with", () => {
  for (const t of ["[DMCA AGENT NAME OR TITLE]", "[DMCA AGENT EMAIL]", "[U.S. FEDERAL DISTRICT where the operator is located]", "[GOVERNING LAW: state or country whose law applies]", "[LIABILITY AMOUNT, e.g. US $100]", "[YOUR CONTACT EMAIL]", "[Mailing address]"])
    assert.equal(findPlaceholders(`text ${t} more`).length, 1, t);
});
test("ignores ordinary text", () => {
  assert.deepEqual(findPlaceholders("See 17 U.S.C. § 512(c)(3) [1] and arrays [] or (brackets)."), []);
  assert.deepEqual(findPlaceholders("wholelifehub@hotmail.com, 13022 Thunderhead Drive"), []);
});
test("deduplicates and finds several", () => {
  assert.equal(findPlaceholders("[A b] [A b] [C d]").length, 2);
});
test("DMCA values: a filled set passes, each blank or bracketed one is named", () => {
  const ok = { agentName: "Designated Agent", agentEmail: "dmca@example.com", district: "District of Maryland", law: "Maryland, USA", cap: "US $100" };
  assert.deepEqual(badDmcaValues(ok), []);
  assert.deepEqual(badDmcaValues({ ...ok, agentEmail: "[DMCA AGENT EMAIL]" }), ["DMCA agent email"]);
  assert.deepEqual(badDmcaValues({ ...ok, agentEmail: "not-an-email" }), ["DMCA agent email"]);
  assert.deepEqual(badDmcaValues({ ...ok, agentName: "" }), ["DMCA agent name"]);
  assert.deepEqual(badDmcaValues({ ...ok, agentName: "[DMCA AGENT NAME OR TITLE]" }), ["DMCA agent name"]);
  assert.deepEqual(badDmcaValues({ ...ok, district: "[U.S. FEDERAL DISTRICT x]", law: "", cap: "[LIABILITY AMOUNT]" }), ["court district", "governing law", "liability cap"]);
});
