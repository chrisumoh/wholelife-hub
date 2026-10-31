# Settings + Premium revamp — integration guide

Original drop-in blocks for WholeLife Hub, prepared for CJ. Nothing in this
folder is loaded by the app until it is wired into `index.html`; merging this
PR changes no live behaviour.

## Files

- `settings-menu.html` — the revamped Settings page: search filter, grouped
  rows (You / Training & food / Appearance & alerts / Premium & data /
  Legal & about), working switches and segmented controls, danger action
  separated at the bottom. Copy blocks are marked in the file.
- `premium-trial-paywall.html` — the tidied Premium page, the 14-day trial
  labelling, and the tidied paywall. Copy blocks are marked in the file.

## Settings — wiring notes

- `WLSettings` is the only surface: seed it with the stored settings object,
  persist through `WLSettings.onChange(fn)`.
- Navigation rows dispatch a `wlset:nav` CustomEvent with `detail.key`
  (`profile`, `premium`, `refunds`, …) for the app's router.
- The "Backup" row deliberately reads "On this device" until account sync
  lands — do not label it cloud backup yet.

## Premium — what changed

- Status condensed to one slim card.
- The 19 features are grouped into four collapsible families (Eat smarter,
  Train harder, Health & habits, Coach & community) with full, untruncated
  descriptions.
- About Premium copy is final — the `[draft]` markers are gone.
- **Debugging section:** render it only behind the app's debug flag. Normal
  users should never see the BETA_OPEN instructions.

## The 14-day free trial

One config object drives every trial mention:

```js
const TRIAL = {
  open: false,   // stays false until the trial is live in Lemon Squeezy
  days: 14,
  note: 'Two weeks free, a gift from Aba Koomson “Bon Bon” to every new WholeLife Hub user.'
};
```

Order of operations:

1. **Lemon Squeezy (CJ, dashboard):** on the subscription product, turn on
   "Subscription has free trial?" for **both** variants (Monthly and Yearly)
   and set 14 days. Do it in test mode first. No discount code is involved.
2. **Test-mode purchase:** run one checkout and confirm (a) the order total
   is $0, (b) the licence key validates in the app during the trial — the
   docs do not say whether a trial key reports active, and the licence flow
   has not been tested against one — and (c) the receipt prints
   "Trial — $0.00 due today" from the order data.
3. **Refunds page:** depends on PR #76. After #76 merges, replace
   "There is no free trial" with wording that the 14-day refund window runs
   from the first charge after the trial ends.
4. **Then** set `TRIAL.open = true` in the app. Plan cards gain the
   "2 WEEKS FREE" badge and "No charge today" line, CTAs read "Start free
   trial", the paywall slider offers the trial, and the gift note appears
   under the plans.

Checkout URLs do not change at any step — the trial lives in Lemon
Squeezy's variant settings; the app only labels what the checkout will do.

## Still open

- Whether Lemon Squeezy lets the same person take the trial again with a
  new email — worth one test-mode check before launch.
- The gift note wording is CJ's draft from the planning thread; change
  `TRIAL.note` before flipping the switch if he wants different words.
