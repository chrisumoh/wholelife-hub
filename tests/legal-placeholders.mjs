// Finds owner-fill-in placeholders that must not reach the live legal pages, such as "[DMCA AGENT EMAIL]".
// Used by tests/browser/legal-release.mjs (rendered pages) and tests/legal-placeholders.test.mjs (the scanner itself).
// A bracketed run that starts with a letter counts; "[1]" or a bare "[]" does not. Case does not matter, so "[Your address]" is caught too.
export const PLACEHOLDER = /\[[A-Za-z][^\]\n]{1,120}\]/g;
export const EMAIL = /^[^\s@<>\[\]]+@[^\s@<>\[\]]+\.[A-Za-z]{2,}$/;

export function findPlaceholders(text) {
  return [...new Set(String(text).match(PLACEHOLDER) || [])];
}

// Values the DMCA page needs from the owner. The agent email must be a real address, not just "not bracketed".
export function badDmcaValues(v) {
  const bad = [];
  if (!String(v.agentName || "").trim() || findPlaceholders(v.agentName).length) bad.push("DMCA agent name");
  if (!EMAIL.test(String(v.agentEmail || "").trim())) bad.push("DMCA agent email");
  for (const [k, label] of [["district", "court district"], ["law", "governing law"], ["cap", "liability cap"]]) {
    const s = String(v[k] || "").trim();
    if (!s || findPlaceholders(s).length) bad.push(label);
  }
  return bad;
}
