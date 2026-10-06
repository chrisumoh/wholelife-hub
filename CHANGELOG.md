# Changelog

Whole Life Hub, newest first. Generated from the in-app change log (`WLH.changelog` in `index.html`), which stays the source of truth: add each new entry there first.

**Current:** Update 8.1 (Dev Testing), build 8.1.15, 2026-10-06. Versioning rules: [docs/VERSIONING.md](docs/VERSIONING.md).

Entries B3–B14 shipped on 2026-10-04 before weekly versioning and belong to Update 8.0.

## 8.1.15 · Security: Audit fixes from PR #5: escaped coach text, per-account local storage, erase, quieter logs, honest privacy text

- **Problem:** The audit of docs/SECURITY.md against index.html found: (1, 8) the profile name and meal names were put into the coach advice card as HTML, so a name like <img src=x onerror=alert(1)> ran script; (2) profiles and logs were saved under one key (wlh.v62) whatever account was signed in, so the next person to sign in on the same browser could see the last person's data; (3) Erase left wlh.notif.* and wlh.rem.* behind; (4, 5) console.warn logged whole error objects, which can echo the record that failed; (6) a leftover Claude account-storage code path (window.claude.use db) could save data somewhere the privacy text did not mention; (7) the privacy text said there was no account, no email and no server, and that nothing but fonts left the device, which stopped being true in 8.1.11.
- **Change:** Escaping: coachAdviceItems() now returns plain text and coachAdviceCard() escapes it where it is placed in the page, once, instead of escaping some pieces early; no other place was found that puts user text into innerHTML (see limits). Per-account storage: every user-data key is suffixed with the Supabase user id when signed in (wlh.v62@<id>, wlh.notif.<profile>@<id>, wlh.rem.<profile>.<id>@<id>); guest keys have no suffix. Boot reads the session first (sbSession), then loads that account's store. Sign-out (sbSignOut) pushes anything unsent and each profile's name, then removes that account's keys, the meal cache and everything in memory, ends the session and reloads the page. The same happens when the session expires, another tab signs out, or Erase is used while signed in. Sign-in: when the account changes the page reloads so nothing in memory carries over; if the guest store holds data, a screen asks Import it or Discard it (a passcode-protected guest store can only be discarded or kept for later), and nothing is attached or uploaded before the answer. Because the account keeps only a name per person (plus meals), a browser with no profile for someone now rebuilds a basic profile from the people table so their meals attach (sbRestoreProfiles). Erase (eraseEverything) now removes every wlh.v62, wlh.v61, wlh.notif.* and wlh.rem.* key for every account and the guest. Logs: every console.warn now logs a short message and an error name or code, never the error object, key or row. Removed the window.claude.use db account-storage path (initStorage, readBack, flush, eraseEverything, demoteToBrowser) and the account-mode wording that went with it. Privacy text rewritten to match the code: optional email account through Supabase Auth, which meals and profile fields are stored in Supabase, what stays in the browser, supabase-js from jsDelivr, the real list of storage keys, the sign-in emails, and that the in-app delete does not remove account data. Name: Whole Life Hub in README.md, index.html and the docs.
- **Where:** index.html: coachAdviceItems(), coachAdviceCard(); STORAGE block (STORE_UID, LEAVING, ukey(), lsRemoveUserData(), lsGet/lsSet, initStorage(), flush(), eraseEverything()); ACCOUNT + MEAL SYNC block (sbActive(), sbUserChanged(), sbLeaveStore(), sbReload(), sbSession(), sbBoot(), guestSnapshot(), sbCheckGuest(), sbGuestImport(), sbGuestDiscard(), guestView(), sbRestoreProfiles(), sbPull(), sbSignOut()); boot(); render(); NOTIF_KEY, remKey; privacyPolicyView(), termsView() contact line, Privacy and security settings, clip and photo opt-in lists; LEGAL_UPDATED. tests/browser/security.mjs (new), tests/browser/meal-sync.mjs (updated for the reload and per-account keys). README.md, CHANGELOG.md, docs/SECURITY.md, docs/BUILD_PLAN.md.
- **How to test:** Run node tests/browser/security.mjs and node tests/browser/meal-sync.mjs from the repo root (Node 22+, Python 3, Chrome; they use a fake Supabase and touch no real account): 53 and 51 checks pass. security.mjs covers (a) a profile name of <img src=x onerror=alert(1)> showing as text on the coach card, Home, Settings and Nutrition with no element created and no alert, and (b) account A signing in, importing guest data, setting a name, signing out, then B signing in: A's name, meals and snacks are not shown, not in local storage and not copied for B, plus discarding guest data, A's name and meals returning from the account, and Erase removing notification and reminder keys. Run against the old index.html the same tests fail (the img is injected and alert fires). By hand: sign in on a browser that has guest data and see the Import / Discard screen; sign out and check Application › Local Storage has no wlh.v62@ keys.
- **Known limits:** Signing out removes everything that is not in the account from the device: snacks, drinks, workouts, weigh-ins, vitals, goals and other profile settings are lost on sign-out because only meals and each profile's name sync so far. A restored profile has the name and the first-run flag only. An expired session or a sign-out in another tab also clears the device, so meal changes not yet uploaded at that moment are lost. Signing in or out reloads the page. The injection audit was a read-through with grep for user fields (name, notes, allergies, meal, snack, drink and workout text) placed in templates without esc(); it is not proof that none exists. The developer log (WLH) still records the message of an uncaught error or rejected promise. Not verified, so the privacy text is worded around them: whether Claude features ever run outside Claude (the code only reaches them through window.claude.use); whether Supabase is contacted at all when nobody is signed in; the hosting provider's own request logs and analytics settings; whether account data can be deleted on request (the policy points to the contact address, a process the owner must confirm); the Supabase dashboard settings. Left as they were: WholeLife Daily Hub in the footer and the Terms (a different name from the one asked for), the sharing screens that say the app has no server, and the supabase/ folder and CLAUDE.md, which still say WholeLife Hub. The privacy page's old wlh.consent row was removed because no code uses that key.

## 8.1.14 · Docs: Security rules, database doc consolidated, code style (no app change)

- **Problem:** There was no written security policy for a browser app that talks straight to the database, and the database details were split between docs/CONTEXT.md and docs/DATABASE.md.
- **Change:** Added docs/SECURITY.md (RLS as the only authorization layer, publishable key only, per-user browser storage cleared on sign-out, user text rendered as text, no health data in logs or to third parties without consent, SRI-pinned scripts, auth redirect URL rules). Updated docs/DATABASE.md with the owner_id / person_id model, app_id as the sync key, updated_at for incremental sync, the cascade chain and the migrations-only rule, and moved the database text out of docs/CONTEXT.md, which now points to it. CLAUDE.md gains a "Code style" section and lists SECURITY.md and DATABASE.md under "Read first". index.html was audited against SECURITY.md and not changed: the violations are in the pull request description, to be fixed in a later build. This is a docs-only change, so there is no new build number and no entry in the in-app log (`WLH.changelog`), which would have meant editing index.html.
- **Where:** docs/SECURITY.md (new), docs/DATABASE.md, docs/CONTEXT.md, CLAUDE.md, CHANGELOG.md
- **How to test:** Read the docs. Check that docs/CONTEXT.md no longer lists tables, RLS or migration rules, and that its links to DATABASE.md and SECURITY.md work. `git diff main -- index.html supabase` is empty.
- **Known limits:** The audit is a read-through with grep, not a test run. SECURITY.md describes rules the app doesn't fully follow yet (see the audit list). Dashboard settings (redirect URLs, site URL) were not checked, because that needs the Supabase dashboard. Section 2 of CLAUDE.md asks for the in-app log first; it was left out on purpose so index.html stays untouched in this branch.

## 8.1.14 · Food catalog: 25 dishes from the United Kingdom, Spain and the United States, plus 6 meal-text foods

- **Problem:** Outside Africa the catalog was thin for three popular cuisines: 3 British dishes, 3 Spanish and 6 American. Typing foods like fish and chips, tikka masala, pancakes, tortilla or mac and cheese into Guess the calories found nothing.
- **Change:** DISHES gains 25 full recipes (ingredients for 4, steps, ways to cook, lighter and higher-protein versions with calories, pairing, meal-prep note). United Kingdom 8: baked fish and chips with mushy peas, grilled full English breakfast, chicken tikka masala (London), Sunday roast chicken, cullen skink and Scottish porridge (Scotland), bangers and mash, Lancashire hotpot. Spain 8: tortilla española, gazpacho, pollo al ajillo, gambas al ajillo, fabada asturiana, cocido madrileño, pisto manchego, merluza en salsa verde. United States 9: grilled chicken Caesar, turkey burger with sweet potato fries, buttermilk pancakes, New England clam chowder, chicken and sausage gumbo (Louisiana), BBQ pulled pork sandwich, mac and cheese with cauliflower, Cobb salad, avocado toast with eggs. FOODC gains fish and chips, chicken tikka masala, pancakes, Spanish omelette, gazpacho and mac and cheese. Everything is text only. Calories and protein are per serving, estimated from the ingredient amounts. These are supporting entries: West African dishes stay 91 of 291 (31%), and the default Food focus, West African first, still draws 60% of suggestions from West Africa.
- **Where:** DISHES (25 entries appended at the end, ids uk-*, es-*, us-*); FOODC (fishchips, tikkamasala, pancakes, tortillaes, gazpacho, macncheese, at the end of the array)
- **How to test:** Settings › Food culture: choose United Kingdom, Spain or United States and the new dishes appear. Log a meal and type 'Fabada' or 'Cullen skink'. Nutrition › Guess the calories: type 'fish and chips' or 'spanish omelette and gazpacho'. Automated: 25 new ids and names unique; every country resolves to the right region; light < normal < higher-protein calories; high-protein tags match 30 g or more; no new units; no emoji; allergens checked against ingredients; 0 page errors.
- **Known limits:** Calories and protein are careful estimates, not lab values, and vary with portion and oil. The allergen lists are checked against the ingredient text but not by a dietitian; check any dish for a serious allergy. Other countries (for example France, Italy, India, China, Mexico, Brazil) still have only a few dishes each; say which to add next.

## 8.1.13 · Food catalog: 26 more West African dishes, 3 snacks and 10 meal-text foods; Togo, Benin, Burkina Faso, Niger, Mauritania, Cabo Verde and Guinea-Bissau now have dishes

- **Problem:** The catalog had 65 West African dishes but none from Togo, Benin, Burkina Faso, Niger, Mauritania, Cabo Verde or Guinea-Bissau, and it was missing well-known Nigerian and Ghanaian dishes such as edikang ikong, oha, bitterleaf soup, ikokore, fante fante and akple. Typing foods like okpa, masa, kilishi or cachupa into Guess the calories found nothing.
- **Change:** DISHES gains 26 full recipes (ingredients for 4, steps, ways to cook, lighter and higher-protein versions with calories, pairing, meal-prep note): Nigeria 10 (edikang ikong, oha, bitterleaf soup, ikokore, fisherman soup, gizdodo, ekuru, masa, okpa, isi ewu), Ghana 3 (fante fante, akple with fetri detsi, etor), Côte d'Ivoire 2 (garba, alloco with poulet braisé), Burkina Faso 2 (riz gras, tô with okra sauce), Benin 2 (fried yam with wagashi, amiwo), Togo / Benin 1 (grilled fish with aloko), and one each for Niger (fura da nono), Mauritania (couscous with lamb), Cabo Verde (cachupa rica), Guinea-Bissau (caldo de mancarra), Senegal (soupou kandja) and Liberia / Sierra Leone (palava sauce). West African dishes go from 65 to 91 of 266. SNACKS gains kilishi, kunu and garri soakings. Guess the calories (FOODC) now understands cachupa, gbegiri, masa, okpa, kilishi, kunu, fura da nono, ekuru, bitterleaf soup and cassava leaf stew. Everything is text only. Calories and protein are per serving, estimated from the ingredient amounts for a typical home-cooked serving; swallows and rice are included in the dish where it is normally eaten with them.
- **Where:** DISHES (26 entries appended after chapati-beans, ids edikang … palava); SNACKS (kilishi, kunu, garrisoak, at the end of the first array); FOODC (cachupa … cassavaleaf, at the end of the array)
- **How to test:** Settings › Food culture: pick Togo, Benin, Burkina Faso, Niger, Mauritania, Cabo Verde or Guinea-Bissau and each now has at least one dish. Log a meal and type 'Edikang' or 'Cachupa' to see the catalog entry and calories. Nutrition › Guess the calories: type 'okpa and ekuru' or 'kilishi and kunu'. Snacks: search 'garri'. Automated: 26 new ids and names are unique; every country resolves; light < normal < higher-protein calories; high-protein tags match protein of 30 g or more; no new units; no emoji; 0 page errors.
- **Known limits:** Togo, Niger, Mauritania, Cabo Verde and Guinea-Bissau each have one dish, so a strict single-country plan there still repeats quickly; they need more recipes. Calories and protein are careful estimates, not lab values, and vary a lot with oil and portion size (palm oil especially). 'Garri' on its own still isn't a catalog dish: use Garri soakings (snacks) or Gari foto.

## 8.1.12 · Meal logging: Faster logging: recent and often-eaten meals, repeat yesterday, and spelling variants

- **Problem:** Logging a meal meant typing the name every time, even for food eaten most days, and the catalog only matched one spelling, so 'Moin moin' did not find 'Moi moi'.
- **Change:** Log a meal now shows text-only chips for your recent meals (last 30 days, one per food) and ones you often eat (twice or more); tapping one fills the name, calories and meal slot, and you still press Log meal. A Repeat yesterday's meals button copies the previous day's meals (with their extras) onto the day you're viewing and skips any already logged, so a double tap adds nothing. Spelling variants (gari/garri, moi moi/moin moin/moimoi, koose/kose) now match the same dish when you log, and the other spellings are offered as you type. Portion tags like (1.5× portion) are stripped from the chip and the calories are scaled back to one portion.
- **Where:** FOOD_SPELLINGS, foodKey(), findDish(), dishAltOptions(), quickFoods(), quickLogBlock() (just above nutritionView()); nutritionView() Log a meal card; click cases 'quick-food' and 'repeat-day' (beside 'extras'); 'log-meal' now uses findDish()
- **How to test:** Serve the app (python3 -m http.server 8080). Log a couple of meals on a day, open Log a meal the next day: Recent chips appear, a chip fills the form, Repeat yesterday's meals copies them once. Type 'Moin moin' and leave calories empty: it logs as Moi moi with the catalog calories. Automated at 390×844: chips are text only (0 images or icons), repeat adds each meal once, 0 page errors.
- **Known limits:** Chips only look at meals on this device's profile; they do not yet reach across devices. Only spelling variants listed in FOOD_SPELLINGS are folded, so add new pairs there. No plain 'Gari' entry exists in the catalog, so typing 'Garri' alone still needs calories (Gari foto matches normally).

## 8.1.11 · Login / Meals sync: Email login (Supabase) and meals saved to your account instead of this browser

- **Problem:** The app saved only in this browser: clearing site data lost everything, nothing followed you to another device, and there was no way to sign in. The Supabase schema from 8.1.8 had no login or save code in front of it.
- **Change:** Email and password sign-in through Supabase Auth: sign in, create account and forgot password (email confirmation is on; a reset link opens a 'Choose a new password' screen). Signed in with no passcode, meals are saved to the meal_logs table and a local cache (wlh.meals.v1) instead of the month blobs in browser storage; snacks, drinks, workouts, weigh-ins, vitals and profiles still save exactly as before. The first sign-in uploads this device's existing meals, keyed by app_id so a repeat never duplicates. Changes made offline are queued and sent when the connection returns. Deleting a meal is a soft delete (deleted_at). Signing out takes the account's meals off the device; if changes haven't uploaded yet you're asked before they are discarded. With a passcode on, meals stay on this device, encrypted with everything else, and nothing is uploaded or downloaded. Migration wlh_8_1_11_meal_est adds meal_logs.est (the app's estimated-meal flag). The repo also gets the missing copy of migration wlh_8_1_9_full_unique_sync_keys, already applied to the remote project (plain unique indexes on owner_id, app_id so upserts work); adding the file changed nothing remotely.
- **Where:** index.html: supabase-js 2.117.2 script tag (pinned, SRI) in <head>; the ACCOUNT + MEAL SYNC block after flush() (SB, sbClient(), sbBoot(), sbTrack(), sbSyncBody(), sbPush(), sbPull(), sbApplyRemote(), sbSignOut(), accountCard(), recoveryView()); markLog()/markAll() call sbTrack(); flush() leaves meals out of the blobs while sync runs; setPasscode()/removePasscode()/eraseEverything(); boot() calls sbBoot(); render() shows recoveryView(); settingsView() puts accountCard() above the profile card. Supabase: supabase/migrations/20261005035516_wlh_8_1_11_meal_est.sql and 20261004142625_wlh_8_1_9_full_unique_sync_keys.sql. Tests: tests/browser/ and tests/meal_rls_isolation.sql. Docs: docs/DATABASE.md.
- **How to test:** Serve the app (python3 -m http.server 8080; sign-in does not work from file://) and add http://localhost:8080/ and your Vercel URLs under Supabase › Authentication › URL Configuration › Redirect URLs. Settings › Profile › Account: create an account, confirm the email, sign in; log a meal and find it in Supabase › Table Editor › meal_logs. Turn the network off, log a meal (it stays visible), turn it back on: it uploads. Sign out: the meals leave the device; sign back in: they return. Set a passcode: new meals are not uploaded. Automated: node tests/browser/meal-sync.mjs (45 checks against a fake client). tests/meal_rls_isolation.sql checks on the real database that account B cannot read or write account A's meals (rolled back); it was written but not yet run when this build was made.
- **Known limits:** (1) Profiles are not synced yet. Meals attach to a profile by its id, so another device shows them only if it has the same profile ids; a fresh profile on a new device sees none. (2) With a passcode on, meals are not synced. Meals already in the account stay there when a passcode is set, and a meal deleted while a passcode is on comes back from the account if the passcode is later removed. (3) Erase on this device signs the browser out and clears its local copy but does not delete meals from your account. (4) Meals in the account are plain database rows protected by row-level security, not end-to-end encrypted. (5) Meal photos stay on this device; they are not uploaded yet. (6) Real sign-up and email delivery were not tested end to end here (email confirmation is on). The browser tests use a fake client, which shows the app never displays or uploads another account's meals but does not test the database's own rules; tests/meal_rls_isolation.sql does, and has not been run yet. (7) Deleting a profile soft-deletes its meals in the account but leaves its people row. (8) Sign-in lives in Settings › Profile only; there is no standalone login page, and using the app signed out is unchanged. (9) CHANGELOG.md has no entries for 8.1.9 and 8.1.10 (they exist in this in-app log); this build does not add them.

## 8.1.8 · Sys Architecture: Supabase backend schema, photo storage and Git repository

- **Problem:** The app only saved to the browser (or Claude's artifact storage), so data lived on one device and test devs couldn't share it; there was no version control, which let another session overwrite the live build.
- **Change:** Supabase project 'Whole Life Hub': extended people, meal_logs, snack_logs, workouts, weight_entries to the app's data model (log_date, app_id for offline ids, soft delete, updated_at triggers, meal slot/dish/portion/photo, jsonb extras); added drink_logs and daily_vitals; private 'photos' bucket with per-account folders; owner-only RLS on every table (tested: a second account sees 0 rows and can't write into another account's profile); cascading deletes; locked the rls_auto_enable() function off the API. Git repository prepared with README, CHANGELOG, migrations, versioning rules and a bug-report template.
- **Where:** Supabase migrations (named before this build was numbered 8.1.8) wlh_8_1_1_core_schema, wlh_8_1_1_lock_rls_auto_enable, wlh_8_1_1_drop_duplicate_indexes (copies in supabase/migrations/ in the repo). The app itself does not talk to Supabase yet.
- **How to test:** Supabase › Table Editor: 7 tables, RLS on, 1 policy each. Storage: 'photos' bucket is private. Security Advisor: no warnings.
- **Known limits:** Next: login screens and swapping the app's save layer (schedule()/flush(), lsGet/lsSet) to Supabase, one data type at a time, starting with meals.

## 8.1.7 · Onboarding / help: App tour: first-run offer on Summary, plus Settings › Data & about › App tour & guide

- **Problem:** There was no way to learn how the pieces connect (logging feeds the rings and the coach, Food culture can become the meal plan, workouts fill the Exercise ring) short of finding it all by hand.
- **Change:** A spotlight tour: the page dims, the real element is cut out and outlined, and a small card explains it with Back / Next / Skip. First time a profile reaches Summary, a card offers a one-minute tour (Show me / Not now); the answer is saved per profile (tourSeen, whitelisted in cleanProfile so it survives a reload), so each person in a household is asked once and never nagged. Settings › Data & about now opens with App tour & guide: replay the 6-step quick tour, or take a short tour of one area (Logging 5, Meal planning 4, Coaching 4, Progress 4, Household & appearance 2, Premium 3, Privacy & data 4). Tours navigate to the right page and open the menu themselves. Keyboard: focus moves into the card and stays there, arrows step, Escape ends. Follows text size, Light/Dark/OLED and Reduced Motion.
- **Where:** TOUR_DEFS / tourStart() / tourGo() / tourPlace() / tourEnd() / tourAfterRender() / tourGuideCard() (last <script> block before </body>); hook in afterRender(); CSS .tour / .tour-hole / .tour-card / .tour-offer / .tour-topics (after the nav group rules); newProfile()/cleanProfile() tourSeen
- **How to test:** New or existing profile: open Summary, wait a second, the offer card appears at the bottom. Show me → 6 steps, the menu opens for steps 3–6 and closes at the end. Reload: no second offer. Settings › Data & about › any topic card. Automated: every step of every tour found its real target at 390×844 and 1440×900, the card stayed on screen and never covered the target's centre, 0 axe violations on the offer, card, guide and sidebar in Light/Dark/OLED.
- **Known limits:** If a page changes and a tour's target disappears, that step shows a centred card with the same words instead of breaking; TOUR_DEFS is the one place to update the copy or targets.

## 8.1.6 · Menu: Sidebar cut from ~30 rows to 11: Summary, Log, Plan, Progress, Premium, Settings

- **Problem:** A tester called the menu hard to navigate. It listed the 11 core destinations plus every one of the 19 Premium features as its own row (7 of them unfinished, 'In Progress'), across five collapsible groups; Eat & train alone had 10 rows mixing cooking, training, cycle tracking and voice logging.
- **Change:** Three plain labels that say what you do there: Log (Meals, Snacks, Workouts & imports), Plan (Recipes & meal plans, Food culture, Personal coach), Progress (Health data, Achievements & Goals). Premium and Settings sit below a divider. Nothing collapses any more. Premium features are reached through the one Premium row (popup for subscribers, store page otherwise); the popup now hides the 7 unfinished features unless Settings › Data & about › Diagnostics › Show features in testing is on (device-only, wlh.showtesting, listed in the Privacy Policy's storage table).
- **Where:** sideNav() (groupsHTML/tail); CSS .grp-static / .navgrp-tail; premiumPopupRowsHTML(); showTestingFeatures() + switch in diagCard(); Privacy Policy section 5 table
- **How to test:** Open the menu on a phone and a laptop: 11 rows in the order above. As a subscriber, tap Premium: 12 features plus a line saying 7 more are being built. Turn on Show features in testing: all 19 return.
- **Known limits:** On most phones the list still needs a short scroll to reach Premium and Settings when the menu is opened from the top of a page (the large header pushes the drawer's content down); opened from the compact bar after scrolling, it fits on a 390×844 screen. Second pass still to do: put each Premium feature on the page it extends (Pantry/Photo/Restaurant on Meals, etc.) — PREM_GROUP_OF already maps them.

## 8.1.5 · Menu / scroll lock: Reverted 8.1.4's fix — it broke the drawer's position instead

- **Problem:** 8.1.4's attempted fix (below) added transform:translateZ(0) to body while the menu is open, meaning to stop iOS Safari from blanking the screen. Reported back instead: "when you scroll on the home summary page the side menu also scrolls with it ... gets lost at the top." Root cause: per the CSS spec, putting a transform (any transform, including translateZ(0)) on an element makes it the containing block for every position:fixed descendant inside it. .side and .scrim are both position:fixed and both live inside body, so the moment body got a transform, the drawer stopped being pinned to the real viewport and started being positioned against body's own box instead — which itself sits at top:-Ypx (Y = how far you'd scrolled) for the scroll-lock to work. The deeper the scroll, the further the drawer was dragged up and off-screen, matching the report exactly.
- **Change:** Removed the transform from body. Confirmed in automated testing (Chromium, several scroll depths) that .side now measures top:0/left:0 — pinned to the true viewport — regardless of how far the page had scrolled before the menu opened, which is what broke. The forced reflow 8.1.4 also added (void document.body.offsetHeight after locking) doesn't touch containing blocks and stays, since it's harmless either way. The original blank-screen bug 8.1.4 was trying to fix is NOT yet confirmed fixed — this entry only removes the regression that attempt introduced.
- **Where:** CSS :root.menu-open body (same rule 8.1.4 touched)
- **How to test:** On an iPhone: scroll Summary down a long way, open the side menu. The drawer should appear pinned at the left edge of the screen, not shifted down/away. Separately: confirm whether the original blank-screen symptom (nothing at all, not even the dimmed page) still happens — that's the open question this entry doesn't resolve.
- **Known limits:** Lesson for later changes to this scroll-lock: never add transform, filter, backdrop-filter, will-change:transform, or contain to body or any other ancestor of .side/.scrim while menu-open — each one creates a new containing block for their position:fixed and breaks this the same way, regardless of what else it was meant to fix.

## 8.1.4 · Menu / scroll lock: Side menu no longer blanks the screen when opened after scrolling down Summary

- **Problem:** Reported by a tester: scroll down Summary past the first rings, then open the side menu (☰) — the whole screen goes blank (just the background, no header, cards, or menu) on iPhone. lockPageScroll() holds the page still behind the open drawer by flipping body to position:fixed with a negative top offset equal to the scroll position. On iOS Safari, that sudden position:fixed change can drop the GPU compositing layers of everything under body that uses backdrop-filter (cards, the compact header, the drawer itself) without repainting them — worse the further down the page you'd scrolled, matching the report exactly. Chromium (used for this app's automated tests) doesn't have this WebKit-specific repaint bug, so it passed every existing test and shipped unnoticed; it could not be reproduced in this environment either (no WebKit/Safari available here to confirm against), so this fix is a well-established, low-risk fix for the known bug class rather than a confirmed-fixed repro.
- **Change:** body is promoted to its own GPU layer (translateZ(0)) together with the position:fixed change, instead of after, which is the standard fix for WebKit dropping a layer's repaint across a sudden containing-block change; lockPageScroll() also forces a synchronous reflow right after so the change lands before the drawer's own slide-in transition starts. Also cleaned up a leftover: a second, dead :root rule (pre-v10) still declared --z-chrome/--z-scrim/--z-menu with different numbers than the real v10 stacking scale (B10) further down the file — it had no effect (CSS cascade meant v10's numbers always won) but was a confusing duplicate, so it's gone and --z-chrome/--z-scrim/--z-menu are declared in the one place now.
- **Where:** CSS :root.menu-open body (just above the v7.6 scroll-containment comment); lockPageScroll() (above revealActive()); removed duplicate z-index block that used to sit just above .page-head
- **How to test:** On an iPhone: open Summary, scroll past the rings, tap ☰. Drawer should open with the dimmed page visible behind it, not a blank screen. Could not be confirmed against real iOS/Safari in this environment — please re-test on your phone and report back if it still happens.
- **Known limits:** This addresses the most common cause of this exact WebKit bug class; if it still reproduces on your phone after this build, the next step would be to drop the position:fixed scroll-lock technique entirely in favor of a touch-event-based lock, which is a bigger change worth doing deliberately rather than as a guess.

## 8.1.3 · Workout import: Oversized import files are rejected with a clear message instead of freezing the tab

- **Problem:** importFiles() read every picked file whole with f.text() before any parsing could happen. A CSV/JSON/TCX workout export is realistically a few MB, so a much larger file (wrong file picked by mistake, a video, a disk image) could read megabytes of text into memory and stall the tab with no feedback.
- **Change:** A 25 MB cap (IMPORT_FILE_MAX_BYTES) is checked against file.size before f.text() is ever called. An oversized file is skipped, not imported, and the finish message names how many files were too large so it's obvious what happened; any other valid files in the same batch still import normally.
- **Where:** IMPORT_FILE_MAX_BYTES (just above importFiles()); importFiles() loop
- **How to test:** Workouts › Import: pick one normal CSV/TCX export plus one file over 25 MB together. The valid one imports; the message calls out the oversized one by count and says to double-check it's the right file.
- **Known limits:** The cap is a sanity guard, not a format limit — a genuinely huge export (very long history) would need raising it, not a smaller cap.

## 8.1.2 · Privacy & security: Body progress studio opt-in nudges toward setting a passcode

- **Problem:** Body photos are the most sensitive thing this app stores, but like the rest of the profile they only encrypt at rest once a passcode is set (Settings › Privacy & security). Turning the feature on gave no hint that photos sit unencrypted until a passcode exists.
- **Change:** bodyPhotoLockNudge() shows a one-line toast pointing at Settings › Privacy & security the moment the feature is switched on, but only when no passcode is set yet (CRY.lock is empty) — nothing blocks the feature itself, and the toast doesn't repeat on every visit, only on the opt-in tap.
- **Where:** bodyPhotoLockNudge() (above bodyState(), section 2.3 Body progress studio); "bd-optin" and "consent-body-toggle" click cases
- **How to test:** With no passcode set, turn on Body progress studio from its card or from Settings › Privacy & security › Permissions: the tip toast appears. Set a passcode first, then turn it on: no toast.
- **Known limits:** The nudge only fires on the moment of turning the feature on, not as a standing banner while it stays on.

## 8.1.1 · Accessibility: Dynamic Type-style text size control (Apple Dynamic Type, adapted for the web)

- **Problem:** The app had no way to make its text larger or smaller as a whole; the opacity-style settings controls covered color and motion but not text size, which matters most for anyone who needs larger text to read comfortably.
- **Change:** One multiplier, --text-scale, is read by every font-size rule in the app (calc(value * var(--text-scale,1))), so a single slider rescales all text together while every rule keeps its own relative size — the same idea as Apple's Dynamic Type, where every text style scales under one Larger Text setting. 12 steps mirror Apple's own named categories (xSmall…XXXLarge, Large default, matching this app's existing sizes) plus AX1–AX5 behind an explicit "Larger accessibility sizes" toggle, with ratios taken from Apple's real Body text-style point sizes. A live preview line in Settings › Appearance shows the effect while dragging.
- **Where:** TEXT_SIZES, textSizeStep(), applyTextScale() (above applyLook()); textSizeRow() (Settings › Appearance, above themePicker); "ts-reset"/"ts-ax-toggle" click cases; #ui-ts input handler; --text-scale in :root (head.html); cleanProfile() look.textSize/look.largerAX
- **How to test:** Settings › Appearance › Text size: drag the slider, watch the preview line and the rest of the page scale together; reload the page and confirm the chosen size persisted.
- **Known limits:** A handful of inline sizes written directly in a few dynamically-generated pieces (e.g. a decorative seasonal motif, one meal-builder total) aren't wired to --text-scale yet — everything else in the app is.

## 8.1 · Versioning: Weekly version numbers start: this build is Update 8.1 (Dev Testing)

- **Problem:** The app showed 'Update 8.0' for every change, so testers couldn't tell builds apart.
- **Change:** APP_VERSION drives the label. Update number goes up 0.1 each week (Sunday–Saturday); later builds in the same week are 8.1.1, 8.1.2 … in the logs while the app keeps showing 8.1. The channel (Dev Testing) shows next to the number on the profile and in Diagnostics. Earlier entries B3–B14 belong to Update 8.0.
- **Where:** APP_VERSION (top of the developer-log script); ownerMark(); diagCard(); WLH.build
- **How to test:** Settings › Profile: the line under the profile card reads 'Whole Life Hub · Update 8.1 (Dev Testing)'. Settings › Data & about › Diagnostics: build 8.1 (Dev Testing) · 2026-10-04.
- **Known limits:** The number is set when a build is made, not computed from the date: a week with no builds skips nothing, the next week's first build is simply the next 0.1.

## 8.0 · B14 · Cards: BorderGlow colours follow the app theme and Light/Dark/OLED; applied to key cards only

- **Problem:** B13 used the demo's fixed purple/pink/blue and warm glow, which didn't match the app's accent or category colours and looked the same in every mode.
- **Change:** Glow colours now come from theme tokens in CSS (--bg-c1..3 for the border mesh, --bg-glow for the edge light). Defaults: accent + coach + water. Today at a glance uses the ring colours (nutrition, activity, water); Personal coach advice uses the coach colour; each metric page header uses that metric's colour; Premium headers use the accent. Dark: glow tinted lighter with additive blend; Light: deeper untinted glow, lighter fill, normal blend; OLED: slightly softer.
- **Where:** CSS .border-glow-card (theme palette block), .rings-card.border-glow-card, #coach-advice.border-glow-card, :root[data-scheme=light|oled] .border-glow-card; JS BG_STYLE (geometry only); coachAdviceCard markup (#coach-advice); metricView() header inline --bg-* vars
- **How to test:** Change Settings › Appearance › Accent and Display (Light/Dark/OLED), then hover near the edges of: Today at a glance, Personal coach advice, any metric header (e.g. Weight), any Premium feature header.
- **Known limits:** Hover-driven; on phones it shows while dragging a finger across the card.

## 8.0 · B13 · Cards: BorderGlow on the Today at a glance card and every Premium feature hero

- **Change:** Ported React Bits BorderGlow (no dependencies) with the given config: a mesh-gradient border (#c084fc, #f472b6, #38bdf8) and a warm glow (hsl 40 80% 80%) that follow the pointer's direction and grow near the edge. The card background stays the theme surface. The card's own hover sheen is turned off on these cards so the two effects don't fight. Additive blending is switched to normal in Light mode so the glow doesn't wash out.
- **Where:** BG_CFG, BG_STYLE, BG_LAYERS and the pointermove handler (above ringsCard()); ringsCard(); every <section class="card hero prem-hero">; CSS .border-glow-card / .bg-border / .bg-fill / .edge-light
- **How to test:** Desktop: move the pointer toward each edge of Today at a glance (Summary) and any Premium feature header; the glow should track the side nearest the pointer and fade when you leave.
- **Known limits:** Hover-driven: on phones it shows only while dragging a finger across the card. animated=false as configured, so there's no intro sweep.

## 8.0 · B12 · Header: Header readable over background scenes (Night sky in Light mode)

- **Problem:** On Summary with the Night sky scene in Light mode, the title, date, time and ☰ were dark text on the dark sky. The scene is drawn dark in every mode, while the header used the Light theme's dark text colour with nothing behind it.
- **Change:** When a scene is showing, the header's right cluster (title, date, time, bell) and the menu toggle sit on frosted chips in the theme's surface colour, so text keeps theme contrast over any scene and mode. On phones the ☰ toggle is also re-centred on the title + date block (alignHeadToggle()).
- **Where:** CSS .has-scene .page-head .ph-right / .has-scene .page-head .menu-toggle (v10 block, just above the breadcrumb rules)
- **How to test:** Settings › Appearance › Background: Night sky, Display: Light. Open Summary at 375px and 1440px; repeat with each scene in Light, Dark and OLED.
- **Known limits:** Applies only where a scene renders (Summary). Other pages have no scene behind the header.

## 8.0 · B11 · Header: Long titles no longer collide with the menu toggle; time no longer cut off

- **Problem:** On phones a long page title (e.g. 'Settings & profiles') spilled left over the ☰ toggle and the time was clipped to '0:53'. The right header cluster sat in an 'auto' grid column, which grows to its content and overflows instead of shrinking.
- **Change:** Header grid is now 44px | minmax(0,1fr) | minmax(0,max-content); the time and bell never shrink. fitHeadTitle() steps a long title's font down (min 22px); a very long name (some recipes) wraps to 2 lines instead of being cut. On ≤600px the time sits under the title block, still right-aligned beside the bell. Breadcrumbs keep 'Home › Section' and trim only the current-page crumb.
- **Where:** CSS .ph-row / .ph-right / .ph-text (v10 block); JS fitHeadTitle() (called from afterRender() and on resize)
- **How to test:** 375px and 320px: open Settings › Coach and the longest recipe. Title must not touch the toggle; time shows in full.
- **Known limits:** Titles over ~40 characters wrap to two lines on phones.

## 8.0 · B10 · Header / menu / motion: Header moved right, ☰↔← toggle, smooth menu, one motion system, glitch audit

- **Problem:** Header stacked on the left; static '<' arrow; desktop sidebar animated grid column width (whole-page relayout per frame); phone drawer stayed focusable while hidden; mixed durations/easings; sticky hover on touch; will-change on every button; z-index values 60–120 overlapping; 'Last updated' popped out; Profile button on greeting.
- **Change:** Header grid (toggle left, title/date/time/bell right, quick actions below). One toggle (spec SVG, transform + stroke-dasharray). Desktop rail uses FLIP (transform + clip-path, layout committed at start). Drawer uses translateX + visibility delay; first 3 items stagger 40ms. Motion tokens on :root; 321 durations and 189 easings normalised; 125 hover rules wrapped in (hover:hover) and (pointer:fine); z scale header 30 / scrim 35 / menu 40 / toggle 50 / backdrop 60 / popup 70 / toast 80. DOM order main→sidebar so Tab hits the toggle first.
- **Where:** moreBtnHTML(), menuIsOpen(), syncMenuToggles(), toggleRail(), setRail(), setMenu(), Escape handler; CSS '/* v10: HEADER, MENU TOGGLE…' block; paintClock()/clockTick(); homeView() greeting + .lu-wrap
- **How to test:** Toggle 10× fast at 375 and 1440: ends cleanly. Escape closes and refocuses the toggle. Settings › Appearance › Motion: Reduced → everything instant.
- **Known limits:** JS-driven animations (React Bits ports, count-ups) keep their own timing. No size-adjust font fallbacks (needs exact font metrics).

## 8.0 · B9 · Camera & microphone: In-app camera capture, permission card, VoicePill mic

- **Problem:** Photo buttons went straight to a file picker on desktop; no single place to grant or check camera/mic access.
- **Change:** mediaAsk()/mediaRefresh() ask the device and report state; Settings › Privacy & security card. Any photo input marked capture (or data-cam) opens a live camera modal (.camshot) and hands the shot to the same <input> via DataTransfer. Voice logging uses the VoicePill: asks for the mic first, live waveform, slide-left to cancel; retries without the meter if a phone won't share the mic with speech-to-text.
- **Where:** mediaAsk(), mediaCard(), shotOpen()/shotStart()/shotClose(), voicePillHTML(), VoicePill IIFE (begin/end/startSR)
- **How to test:** Allow/deny camera and mic in Settings; take a profile photo; on Voice coach tap, hold, slide left.
- **Known limits:** Inside the claude.ai viewer the host page may block camera/mic; the card then says 'Blocked by this page's host' and uploads/typing keep working.

## 8.0 · B8 · Settings: WakeSlider for interface opacity

- **Change:** Plain range input replaced with a 32-bar WakeSlider (spring head + smoothed speed drive the wave). Same 35–100% in 5% steps, saves 400ms after release, Reset animates back.
- **Where:** wakeSliderHTML(), WS_HANDLERS['ui-op-ws'], WakeSlider IIFE; CSS .wake-slider
- **How to test:** Drag fast: wave; arrows/Home/End jump; Reset → 100%.

## 8.0 · B7 · Speed: Page updates in place instead of rebuilding; indexed log lookups

- **Problem:** Every click re-created the whole page (700–1,700 elements): pauses, replayed animations, lost scroll/focus. entries()/onDate() merged and filtered every month of logs on every call.
- **Change:** morphInto() diffs the new HTML into the live DOM (3-way attribute merge keeps runtime classes; enhancer nodes kept). Sidebar skipped when unchanged (data-morph-skip). SVG gradient ids reset per render. Log index per task (logIdx(), dropped on any log change). Badge/celebration checks run after paint (afterPaint()).
- **Where:** morphInto(), morphChildren(), morphNode(), morphAttrs(), MORPH_SYNC_ATTRS, data-morph-live; entrySlot()/entries()/onDate(); checkAwards()/checkCelebrations()
- **How to test:** Click around with a year of data: no full-page flashes; scroll position and focused inputs stay put.
- **Known limits:** State attributes (data-value, aria-valuenow/text, data-state, aria-pressed) always follow the template; other runtime-set attributes survive renders unless the template value changes.

## 8.0 · B6 · Notifications: SwipeToast for all toasts and notifications, theme-matched

- **Problem:** Bell notifications only bumped a badge; nobody saw them arrive.
- **Change:** toast()/undoToast() now create SwipeToasts (swipe down to dismiss, fuse timer, pause on hover/focus/hidden tab, max 4). notify() also pops a toast with 'View'. Colours from theme tokens.
- **Where:** swipeToast(), toast(), undoToast(), notify(); CSS .swipe-toast, #st-stack
- **How to test:** Log a meal, delete a photo (Undo), trigger a reminder.

## 8.0 · B5 · Checklists: StatusMark on grocery list, training ticks, progress and loading

- **Change:** Dashed ring → arc → drawn check; grocery strike-through animates; grocery progress ring replaces the duplicate bar; busy rows and Thinking… buttons use the spinner.
- **Where:** smGlyph(), smHTML(), StatusMark controller; groceryRow(), programSession, busyRow()
- **How to test:** Tick grocery items; watch the sorted ring fill.

## 8.0 · B4 · Charts: Day / Week / Month / 3M / Year ranges; OLED toggle contrast

- **Change:** Day = today/yesterday/7-day tiles (entries have no time of day). Year = 12 monthly averages of logged days only.
- **Where:** RANGES, dayPanel(), yearChart(), metricView()
- **How to test:** Any metric page, cycle all five ranges.
- **Known limits:** No hourly Day chart (data is per date).

## 8.0 · B3 · Controls: RubberSegment on single-choice segmented controls

- **Change:** Stretch/squash thumb, drag and flick; enhances existing .seg buttons in place (RS_ACTS list). Respects Motion: Reduced.
- **Where:** RubberSegment IIFE, RS_ACTS; CSS .rs-on/.rs-thumb
- **How to test:** Metric range, Appearance › Display.
- **Known limits:** Controls that wrap onto two lines fall back to the plain style.

# Earlier project history

Moved here from the former `docs/CHANGELOG.md`, newest first, dated rather than versioned. Status labels: DONE (merged to main), VERIFIED IN REFERENCE CODE (measured in Perplexity's test build, not yet in this repo), APPLIED (seen in screenshots), PROMPTED (spec ready, not executed).

Note: entries dated before 2026-10-02 describe the earlier claude.ai artifact version of the app. "APPLIED" there means it was visible in that version; it has not been re-checked in this repo.

## 2026-10-05 · Build 8.1.11 follow-ups: Auth redirect, repo sync, Supabase check

- Auth redirect fix: preview URL for build-8.1.11 added to Supabase Redirect URLs. Sign-up confirmation email, confirmation link and login verified on the preview
- Supabase check (2026-10-05): project healthy, 0 errors in 24h, RLS + owner policy on all 7 tables. Open item: leaked password protection off

## 2026-10-02 — Moved to GitHub + Vercel + Supabase

- App moved off the claude.ai artifact into github.com/chrisumoh/wholelife-hub, deployed on Vercel, with Supabase as the backend
- 20261002081325_whole_life_hub_core_schema. Status: DONE (applied in live DB)

## 2026-09-29/30 — Reference design system verified

- Centered hamburger/back-arrow morph: rebuilt spec (scaleX method, not stroke-dasharray), verified 0px off-center in both states at 375/820/1440px. Status: VERIFIED IN REFERENCE CODE (docs/PROMPTS/master-prompt.md Task 6.1 + bundled code)
- 12-column grid, one-row header, drawer scrim, sidebar grouping, gradient icon tiles, compact appearance controls, charts with draw-in: same. Status: VERIFIED IN REFERENCE CODE
- Bugs caught during verification: phone cards squeezed by grid overspan; card head text overlap; desktop menu scrim shown despite permanent rail; no visible close button when drawer covers header arrow. All fixed in reference code; port the fixes.

## 2026-09-28/29 — Master prompt v1 (8 phases consolidated)

- One master prompt covering: bug fixes, purchase-gated premium system, coach personalization (9 advice rules), font system (8 options), UI cleanup (blue outlines, compact themes, gradient sidebar icons), space + layout rework, legal/compliance checklist, App Store readiness. Status: PROMPTED, awaiting Claude Code execution

## 2026-09-28 — Apple Health-style restyle + charts + large-title collapse

- Restyle prompt: flat #000/#1C1C1E system, category accent colors, Pinned/Trends/Highlights Summary, three chart types with animated draw-ins, distinct visualization per loggable metric, floating capsule tab bar, large-title collapse on every surface. Status: APPLIED (per user screenshots of the live app, 2026-09-29); verify per master prompt final check

## 2026-09-24/27 — Coach personas, menu fixes, earlier cleanups

- Three coach personas (Motivator/Enforcer/Strategist), coach selection before personalization, coach naming, persona question sets, signature mechanics (streaks / adherence score / intensity dial). Status: APPLIED (visible in app screenshots)
- Menu slide (320ms spring), hamburger->arrow morph v1, trophy + confetti, achievement animations. Status: APPLIED; arrow recentered by the 2026-09-29 reference-code fix
- Privacy Policy + Terms pages, favicon, footer links, copy cleanup (em dashes, fake social proof removal). Status: APPLIED
- Known issues logged later from screenshots: menu-over-Settings layering glitch, duplicate avatar, clipped text, off-center arrow — all specced in master prompt Phase 1 / 6.1. Status: PROMPTED
