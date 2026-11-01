# Legal pages: release blockers

The EULA (`#/eula`) and Copyright / DMCA (`#/dmca`) pages are drafts. They must not go live while any value below is a bracketed placeholder. Nothing here is legal advice, and none of these values may be guessed.

## Release gate

`node tests/browser/legal-release.mjs` renders the EULA, DMCA, Terms, Privacy Policy, Refunds and Contact pages (including text folded behind "Read more") and fails if any bracketed placeholder is still visible, or if the values below are blank, bracketed, or (for the email) not a real address. It is also the CI job "Legal release check". It is not part of `run-all.mjs`, because it stays red until the owner fills the values in. `node --test tests/legal-placeholders.test.mjs` tests the scanner itself and runs with the repo checks.

## Values only the owner can provide (constants in `index.html`)

| Constant | What to provide |
| --- | --- |
| `DMCA_AGENT_NAME` | Name or title of the designated DMCA agent |
| `DMCA_AGENT_EMAIL` | A monitored email address for copyright notices |
| `DMCA_AGENT_PHONE` | Optional; the row is hidden while empty |
| `DMCA_DISTRICT` | U.S. federal judicial district where the operator is located (used in the counter-notice wording) |
| `LEGAL_GOVERNING_LAW` | State or country whose law governs the EULA |
| `LEGAL_LIABILITY_CAP` | The fixed amount in the limit-of-liability clause (the clause also says "greater of what you paid in the last 12 months") |
| `LEGAL_PAGES_UPDATED` | The date the pages are published |

Already filled on `main`: `CONTACT_EMAIL`, `LEGAL_BUSINESS_NAME`, `MAILING_ADDRESS`. The `SITE_URL` placeholder is not shown on any page.

The DMCA agent must also be registered with the U.S. Copyright Office (copyright.gov/dmca-directory); the safe harbour under 17 U.S.C. 512 depends on it. Only the owner can do that.

## Needs a qualified lawyer's review before release

- The whole EULA and DMCA text, in particular: the licence grant and restrictions, disclaimers, limit of liability, indemnity, governing law and disputes, and the 512(c)(3) notice and counter-notice wording.
- The Privacy Policy and Terms, including the new friend-message and challenge paragraphs (see below).
- Whether the age wording (13 or the local minimum) fits the markets you sell to.

## Privacy Policy and agreement version

- Friend messages and workout challenges were not described in the Privacy Policy. Build 8.4.1 adds two factual paragraphs, written from the migrations (`friend_messages`, `challenges`, `challenge_members`, `challenge_board`): who can read a message, 500 characters, text, no delete button, removed when either account is deleted, and that challenge members see each other's app name and a running total. It also replaces "No health data is part of it" for Friends, which the challenge totals made untrue. A lawyer should confirm the wording.
- `TERMS_VERSION` and `LEGAL_UPDATED` are now `2026-11-01`. The version is stored only when someone signs up, so existing users are not re-prompted and nobody is forced through a new agreement. New sign-ups record the new version.
- Open owner decision: whether existing users must be told about, or re-accept, the updated Privacy Policy and the new EULA. The app has no re-consent screen, and none was added. The sign-up checkbox still links only the Terms and the Privacy Policy, not the EULA.
