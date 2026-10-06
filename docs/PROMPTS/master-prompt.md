# Whole Life Hub: Master Prompt — All Tasks (Bugs, Premium, Coach, Fonts, UI Cleanup, Layout, Legal, App Store)

Copy everything below the line into Claude, along with your site's code. Work through the phases in order; each phase builds on the ones before it.

---

You are editing my existing, deployed website "Whole Life Hub", a health, fitness, and nutrition app (Personal Coach with three personas, meal and snack planning, workouts, calorie tracking, Summary page, culture-based food settings, health integrations, theme system, premium features, 25+ tool pages in the sidebar).

STRICT RULES (apply to every phase)
1. Do NOT rebuild, redesign, or restructure the site beyond what these tasks specify. Targeted edits only. Phase 6 changes layout containers and header structure; everything else changes styles, components, and pages in place.
2. Preserve every feature, route, page, and piece of data logic: coach personas and naming, question sets, signature mechanics, meal plans, snacks, workouts, calorie tracking, culture filtering, Summary, health integrations, themes, premium system, achievements, privacy/terms pages.
3. Before editing each phase, list every file you plan to change. After each phase, give a changelog per file.
4. If something below doesn't exist in my site, say "not found, skipped" instead of adding it.
5. Be original: Telegram Premium, Perplexity, ChatGPT, Google, and Apple inspire layout, motion, and style only. Do not copy, extract, or embed their assets, icons, fonts, or artwork. All graphics are original SVG (Lucide glyphs are fine).
6. Coach behavior stays tied to real user context (calories, logged food, equipment, food culture, health data).
7. Never invent user data, results, health claims, fake prices, or fake discounts.
8. Where a task says "only if" or "if applies", audit first and report "not applicable, skipped" when it does not apply. Do not add banners, pages, or prompts the audit does not justify.
9. Culture constraint stays hard: a single-culture selection never recommends other cultures' foods, enforced at the data layer.
10. This prompt SUPERSEDES two earlier layout rules that caused wasted space: (a) "main content centers in a column max-width 720px" and (b) "Appearance screen max content width 640px". Remove those caps. Long-form text (legal pages, recipe body, coach chat bubbles) may cap line length at 68ch inside its own card, but pages themselves must use the Phase 6 grid.

---

# PHASE 1: Bug fixes

TASK 1.1: Redundant avatar on the Summary header
- Bug (IMG_4413): a small circular avatar is crammed to the right of the "Summary" page title, while the greeting card below already shows the same avatar.
- Fix: remove the avatar from the title row entirely. The large title stands alone, left-aligned. The avatar appears exactly once on the Summary page: in the greeting card. If the title-row avatar was the profile entry point, make the greeting-card avatar the tappable profile link (add the standard chevron affordance).
- Audit every surface for the same duplication.

TASK 1.2: Clipped/truncated text at screen edges
- Bug (IMG_4413): text at the bottom-left of the Summary page is cut off mid-word ("bu...") with no ellipsis or wrapping.
- Find the clipped element and fix the actual cause (fixed height, overflow hidden, negative margin). Text must wrap, truncate with a proper ellipsis, or resize — never shear mid-character.
- Clipping audit across all surfaces at 375px: nothing partially outside the viewport, behind the tab bar, or under a card edge; bottom content clears the tab bar and safe-area insets.

TASK 1.3: Side menu layering glitch over the Settings page
- Bug (IMG_4414): opening the side menu from "Settings & profiles" renders BOTH screens simultaneously — menu labels collide with the page's breadcrumbs ("Home > Settings > Appearance") and title, a dark overlay covers only the right half of the screen (broken scrim), and a circular sun/brightness theme toggle floats detached over the OLED black card.
- Root causes to investigate, then fix the actual ones:
  1. Scrim must cover the FULL viewport (100dvh x 100vw, position: fixed, z-index tier --z-scrim below the menu panel). A half-rendered overlay usually means the scrim is inside scrolling page content, sized to the page not the viewport.
  2. Freeze the underlying page while the menu is open (overflow hidden on body, pointer-events: none on page chrome) so breadcrumbs and content can never interleave with menu content.
  3. Menu opens as one atomic state change and survives underlying page re-renders while open.
  4. The sun/brightness theme toggle returns to its proper home (side menu footer near theme settings, or Settings > Appearance) — never floating over page content.
- Verify: open the menu from EVERY surface (Summary, Log, Coach, Browse, Settings, every subpage). Menu renders alone over a full-viewport dimmed scrim, zero text collisions, closes restoring the page exactly.

TASK 1.4: Settings header congestion and truncated tabs
- Bug (IMG_4415): the Settings title is crowded against the avatar and menu button, and the horizontal tab bar ("Profile", "Coach", "Appearance", "Goals & foc...") clips the last tab's label with no scroll affordance.
- Fix the header: menu button left, title with comfortable margin, avatar right, vertically centered, minimum 8px between elements.
- Fix the tabs: horizontally scrollable with full labels, scroll-snap, 16px fade-to-transparent hints at both edges when more tabs exist off-screen. Never clip mid-word without indication; wrap to two lines at 12px before truncating. Same treatment for every horizontal scrolling row (accent swatches, chips, filters).
- NOTE: Phase 6 replaces this tab strip with a section-list layout on Settings; still fix the general scrolling-row pattern here since other surfaces keep theirs.

---

# PHASE 2: Premium system (purchase-gated, Telegram-style screen)

TASK 2.1: Premium features — stay in place, labeled once, purchase-gated, fully linked
- Audit the site's existing premium features. Then apply:
- STAY IN PLACE: each premium feature remains in its original, corresponding menu (advanced meal planning stays with meals, advanced workout plans stays with workouts). No separate premium hub that duplicates or relocates them.
- ACTIVATION IS PURCHASE-GATED: premium features are INERT until purchased. Maintain a single source of truth for subscription state (persisted "premium: active/inactive" flag, stored like the theme/font settings, or the backend account profile). While inactive, a premium feature previews (visible but not executable) and opens the premium screen when tapped. When the flag flips to active (verified payment callback or "Restore Purchases"), every premium feature immediately works across all devices on the account, and the badge switches to a subtle active state (solid gold pill) instead of disappearing. Never default the flag to active, never unlock on a timeout, never fake an unlocked state.
- LABEL: each premium feature gets a "Premium" badge — compact rounded pill, 11px uppercase, gold #FFD60A background with black text (light mode: gold border, gold text), consistent site-wide.
- LOCKED BEHAVIOR: preview + badge, tap opens the premium screen (with a brief "Premium feature — see what's included" toast, 2s, only if it doesn't slow the flow). UNLOCKED: works fully with no interruption.
- NO REPETITION: each premium feature appears exactly once in navigation; one canonical home. Cross-references (e.g., a coach message mentioning a premium feature) link to that single home, never re-list it.
- ENTIRELY LINKED: every premium-labeled item site-wide is tappable and opens the premium screen.
- Report the full audit: every premium feature, its single home menu, every entry point that now links to it.

TASK 2.2: Premium screen — Telegram Premium style, original implementation
- HERO: centered original 3D-feel emblem (glossy gold star badge, layered SVG with soft radial highlights — original artwork), gentle shimmer particles (6-10 sparkles, 4s loop, subtle, reduced-motion aware). Below: "Whole Life Premium" (32px bold), centered subtitle: "Unlock advanced coaching, planning, and insights."
- PLAN SELECTOR: inset rounded card (surface, radius 16px), two rows divided by a 1px hairline:
  1. "Annual" — circular checkmark badge (filled primary when selected, outline when not), bold label, compact discount pill showing the real percentage only if pricing genuinely reflects it ([REAL PERCENTAGE] placeholder), muted "12 months", right-aligned bold "[PRICE]/month".
  2. "Monthly" — same layout, "[PRICE]/month".
  Selection updates the CTA text; persists per visit.
- "WHAT'S INCLUDED": small uppercase muted header, then one row per premium feature from the audit — gradient rounded-square icon (44px, distinct two-tone gradient per row from category colors, Lucide glyph), bold name (16px), one-line muted subtitle, thin chevron. Rows are informational.
- ABOUT CARD: 2-3 plain sentences on what the subscription supports ([draft copy — I will edit]).
- FOOTER, centered muted: links to Terms and Privacy Policy, and "Restore Purchases".
- FIXED BOTTOM CTA: floating full-width pill (radius 999px, 16px margins, safe-area aware), horizontal gradient violet #5E5CE6 to blue #0A84FF, bold white "Subscribe for [PRICE] / year". This gradient is reserved exclusively for premium surfaces.
- PAYMENT AND ACTIVATION: if a payment provider is integrated, wire the CTA and flip the premium flag only on the provider's verified success callback. If none exists, wire the CTA to a clean "Coming soon" state with one clearly-marked TODO block for the Stripe integration and success callback. "Restore Purchases" re-checks with the provider (or is a TODO). Add a hidden dev-only override (query parameter or debug row, commented as temporary) so I can test both locked and unlocked states. Do not fake a purchase. Prices and percentages are placeholders in a TODO list. (If we later ship to the iOS App Store, Phase 8 replaces this CTA behavior inside the wrapper.)

---

# PHASE 3: Personal Coach — full data access and personalized advice

TASK 3.1: Full data access for customization
- The coach (all three personas) reads the user's complete data: logged meals and snacks, calorie intake versus target, macros, workouts completed, weight, sleep, water, connected health data (heart rate, steps), food culture, equipment, goals, streak/adherence history, previous check-in answers.
- MEAL PLANS: adjust portions, macro targets, and food suggestions from actual intake, deficits/surpluses, and the selected food culture (hard culture constraint enforced).
- WORKOUTS: adjust intensity, duration, and exercise selection from recent workout load, equipment, sleep, and check-in answers — including substitutions.

TASK 3.2: Daily Coach advice card — deeply personalized
- One or two concrete things to do or take care of today (hydration behind, protein short, deficit steeper than goal, recovery after heavy training). The card must feel written for this one user, not templated. Every card must satisfy ALL of:
  1. Address the user by name: "Chris, your protein is 34g short today" — never "Hey there".
  2. Cite actual data with specific numbers and names: "you had banku and grilled tilapia for lunch (620 kcal)" not "your meals"; "Monday's upper-body session" not "your last workout"; "870 kcal below target", "2,100 steps behind your usual".
  3. Time-aware: morning cards plan the rest of the day; evening cards review and set up tomorrow, referencing days by name.
  4. History-aware: reference trends and past advice ("water goal four days straight" — Motivator; "adherence down 8% versus last week" — Enforcer; "you said energy was low yesterday, so today is Recover" — Strategist). Never repeat identical advice two days running when the data hasn't changed; vary or escalate.
  5. Culture-aware: suggestions from the user's selected food culture only, using real dishes from that culture.
  6. Actionable and specific: one concrete action with quantities — "add about 150 kcal of protein at dinner, like two eggs or grilled chicken" — not "eat more protein". Each action tappable (adds water, opens logging, swaps the workout).
  7. Persona voice intact: personalization changes content, never personality.
  8. Context explanation: advice resting on connected data says so in one short clause ("after last night's 5h sleep...").
  9. Never generic: ban "stay hydrated", "keep it up", "listen to your body" when the user's numbers can replace them; missing data → ask, don't guess.
- All advice is general wellness guidance, never medical claims or diagnosis; keep the medical disclaimer intact.

---

# PHASE 4: Font system

TASK 4.1: Font picker in Settings > Appearance
- "Font" section with a live preview line ("The quick brown fox — 1,824 kcal") per option.
- DEFAULT "System (Perplexity-style)": -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", system-ui, sans-serif. Perplexity's actual UI font (pplxSans) is custom and licensed — do NOT extract or embed it; this stack is Perplexity's own documented fallback behavior (sources: sokosumi.com/tools/design-md/analysis/perplexity, styles.refero.design, oh-my-design.kr/design-systems/perplexity).
- OPTIONS (all open-licensed via Google Fonts or system fonts): 1. System (Perplexity-style, default) · 2. Inter — clean sans · 3. Familjen Grotesk — warm grotesque · 4. Space Grotesk — technical geometric · 5. IBM Plex Sans — neutral, readable · 6. Atkinson Hyperlegible — accessibility · 7. Lora — reading serif · 8. OpenDyslexic — dyslexia friendly.

TASK 4.2: Implementation
- One CSS custom property --font-app per selection (data-font attribute on the root, same pattern as themes); every text style inherits it. No per-font component forks.
- Metrics and chart axes use font-variant-numeric: tabular-nums in every font.
- Persisted with appearance settings; survives reload; applies instantly with no FOUC (font-display: swap).
- Every font passes contrast rules; never breaks the large-title collapse, tab bar, charts, or card layouts at 375px.

---

# PHASE 5: UI cleanup (themes, outlines, sidebar icons, clean layout)

TASK 5.1: Remove the messy blue outlines
- Heavy blue outline boxes appear around selected cards, focused controls, and tapped elements (selected display-mode card, accent swatch, tabs, menu rows).
- New global rules:
  1. `:focus` shows nothing for mouse/touch; `:focus-visible` (keyboard only): 2px ring, accent at 60% opacity, 2px offset, radius matching the element, disappears on blur.
  2. Selected state never uses a thick outline. Selected cards/rows/chips use a soft tinted background (accent at 10-12% opacity), a 1px hairline in accent at 35% opacity, and a small filled checkmark badge (16px circle, accent fill, white check) top-right. Nothing else.
  3. Every element gets at most one border-type treatment at a time; remove stacked border + outline + shadow combos.
  4. Keep -webkit-tap-highlight-color: transparent; clear press states on pointerup/leave/cancel.
- Verify: tap and click every control type — no blue box remains after interaction; Tab shows the thin ring only.

TASK 5.2: Tidy, smaller appearance controls
- Appearance screen groups with small uppercase muted labels (12px, 0.04em): "Display", "Accent", "Theme", then "Font".
- Display mode: replace the large 2x2 cards with a single compact segmented control (4 segments, 36px tall, radius 10px, selected segment gets the surface highlight, no outline). Sub-labels become one muted caption line below that updates with the selection.
- Accent swatches: 28px circles, 12px gaps, one row, horizontally scrollable with edge fades. Selected: white check glyph inside plus a 2px inner ring in the surface color, no outer outline.
- Themes: compact tiles, 3 per row on phones (4 on tablet+), ~88x64px, radius 12px, mini two-tone preview (top half background color, bottom half accent), theme name 12px below. Selected tile uses the Task 5.1 style. Halloween's tile may carry a tiny bat glyph.
- (Phase 6 widens this screen's layout beyond phones; keep the compact controls.)

TASK 5.3: Clean layout system
- Sidebar rows: 40px tall, 8px radius, 12px horizontal padding, 10px icon-label gap, label 15px weight 500. No row borders. Hover (pointer only): rgba(128,128,128,0.10). Active row: rgba(128,128,128,0.16), label weight 600. Section labels: 12px, weight 600, muted. Profile block pinned at bottom over a single hairline: avatar 32px, name 14px, "View profile" 12px, theme toggle compact 32px icon button.
- Surface tokens: cards use surface color, radius 16px, no border in dark mode (1px hairline rgba(0,0,0,0.06) in light only). No decorative shadows/glows outside the premium screen. One hairline color token for dividers.
- Spacing: 8px grid via tokens (--space-1: 4px, -2: 8px, -3: 12px, -4: 16px, -6: 24px, -8: 32px). Replace ad-hoc paddings/margins.
- Buttons: primary solid accent, secondary surface with no border, tertiary text-only. 40px min height, radius 10px, weight 600. Inputs: 44px, radius 10px, surface fill, 1px hairline on focus-visible only.
- Color restraint: one accent for primary actions, selected indicators, and links. Category colors only inside charts, icons, and category labels — never large fills.

TASK 5.4: Redesign sidebar icons to match the premium icons
- Every sidebar icon becomes the same style as the premium screen's feature icons: rounded-square tile, two-tone gradient, white glyph.
- Shared `SidebarIcon` component: 30px tile, radius 8px, 135deg diagonal gradient (top-left light to bottom-right deep), subtle inner top highlight (inset 0 1px 0 rgba(255,255,255,0.25)), white Lucide glyph 18px stroke-width 2. No outer shadow. Tile size never changes on hover/active; press = scale 0.96 for 100ms.
- Gradients (extend per Phase 6 grouping): Summary rose-to-red #FF5E7E→#FF2D55 "heart-pulse"; Health data blue-to-indigo #4DA3FF→#5E5CE6 "layout-grid"; Meals green #5BDB7F→#22A653 "utensils"; Snacks amber #FFB45E→#E0762C "cookie"; Workouts orange #FF8A4C→#F0532B "dumbbell"; Recipes lime #A6E05B→#4CAF50 "notebook-pen"; Food culture teal #34D1C0→#1AA6C4 "globe"; Personal coach violet #8E7BFF→#4F6BFF "compass"; Achievements gold #FFD60A→#F5A100 "trophy"; Settings neutral #9A9AA2→#6B6B73.
- Premium items keep the gold pill; tiles keep their category gradient.
- Gradients defined once as CSS custom properties (--icon-<name>-from/-to) so themes can retune them (Halloween shifts toward its palette). White glyph readable on every gradient in every theme.
- Use the same component in the side menu, the tab bar's Browse list, and anywhere the same destinations appear — a destination looks identical everywhere. Remove old circular/flat icon variants. Labels stay baseline-aligned across rows.

TASK 5.5: Sweep for leftover mess
- Search the project for: ad-hoc `outline:`, `border: 2px`/`3px` accent borders, stacked box-shadow glows, radii outside {8, 10, 12, 16, 20, 999}px, one-off font sizes outside the type scale. Fix or list each. No new features or dependencies.

---

# PHASE 6: Use all the space + fix the off-center arrow

TASK 6.1 (IMMEDIATE BUG FIX): Off-center arrow icon
- Bug (Recipes screenshot): the "<" glyph sits far left inside its button, inside a tinted square inside a larger white pill — a card inside a card.
- Root causes to confirm: the morph icon spec pivoted bars around x=3, so the finished chevron occupies x 3 to 15.7 of a 24px box (center 9.4, not 12). Also check: inline SVG baseline gap, padding-left, a text character "‹" used as the icon, line-height offsets, transform-origin mismatch. Fix the real causes.
- Rebuild as ONE shared component for the menu button and every back button:
  - Use the exact tested implementation in REFERENCE CODE below (components.css "THE arrow icon" block and the <svg class="icon-arrow"> markup in index.html). Summary: SVG viewBox 0 0 24 24, display: block, three <line x1=0 y1=0 x2=18 y2=0> elements, stroke 2, round caps, vector-effect: non-scaling-stroke, transform-box: view-box, transform-origin: 0 0.
  - Closed (hamburger): translate(3px,6px) / translate(3px,12px) / translate(3px,18px), each rotate(0deg) scaleX(1).
  - Open (back chevron "<", centered on x=12): top translate(9px,12px) rotate(-45deg) scaleX(0.4714); middle translate(9px,12px) rotate(0deg) scaleX(0.001) with opacity 0; bottom translate(9px,12px) rotate(45deg) scaleX(0.4714). Arms end at (15,6) and (15,18). Use scaleX, NOT stroke-dasharray: dasharray leaves the real line 18px long, which breaks bounding-box measurement.
  - Transition 300ms cubic-bezier(0.32, 0.72, 0, 1) on transform, 200ms on opacity. One class drives it; aria-expanded/aria-label stay in sync. Static back buttons render the open state directly.
  - In drawer mode the drawer covers the header button, so put a second close arrow (static open state) inside the drawer header; on desktop the sidebar is a permanent rail and the menu button must NOT show a scrim or freeze the page.
- Button: display: grid; place-items: center; width/height 40px; padding 0; radius 12px; transparent background, subtle surface tint on hover (pointer only). One container only — remove the extra tinted square/pill wrapping. Icon 24px.
- Report numerically: open state |centerX(glyph) - centerX(button)| <= 0.5px and same for Y (getBoundingClientRect + getBBox), tested at 100/125/150% zoom and iPhone width; closed state and mid-transition frame also verified.
- Audit every icon-only button (bell, close, more, theme toggle, icon chips) for the same off-center problem; fix with the same grid centering.

TASK 6.2: One-row page headers
- Current: title row, then a second row holding time, bell, "+ Snack", "+ Log a meal" alone.
- New header, one row from 640px up: [back or menu button] [breadcrumb above title, small] [title] ... flexible spacer ... [time, muted] [bell] [+ Snack] [+ Log a meal]. Phones (<640px): row 1 = back/menu, title, bell; quick actions become a compact two-button row directly under the title only on Summary and Log, hidden elsewhere.
- Desktop header: 64px max including breadcrumb. Avatar appears once per screen (per Phase 1 fix).

TASK 6.3: Responsive grid system (core fix for wasted space)
- Tokens: phone <640px: 1 column, 16px margins, 12px gap. Tablet 640-1023px: 2 columns (6-col grid), 24px margins, 16px gap, sidebar as drawer. Desktop 1024-1439px: persistent sidebar 260px, main 12-column grid, 24px margins, 16px gap, container max 1200px. Wide 1440px+: sidebar 280px, container max 1360px, centered.
- Main container fills the space beside the sidebar: at 1280px viewport the main content is at least 1000px wide, not a narrow column.
- Cards span columns instead of stretching: a card never exceeds 560px wide unless it contains a chart or table. Prefer more columns over wider cards.
- Card padding 16px (14px phones); no min-heights leaving empty areas, no oversized icon blocks, no centered content in tall empty boxes. Cards in a row stretch to equal height, content top-aligned, charts fill remaining height.

TASK 6.4: Summary composition per breakpoint
- Desktop (12-col): Row 1: greeting (span 8) + Coach advice (span 4). Row 2: activity/rings (span 4) + calories chart (span 4) + water (span 4). Row 3: pinned metric tiles, 4 per row. Row 4: Trends (span 6) + Highlights (span 6), each a card stack with its "Show all" row.
- Tablet: same order, 2 columns (greeting and advice full width, then pairs).
- Phone: pinned compact metrics (calories, water, steps, sleep, weight) as a 2-column tile grid; chart cards full width; 16px margins; no oversized headers.
- Every existing Summary card still appears; only position and size change.

TASK 6.5: Settings as a two-pane layout
- 1024px+: left pane 240px listing sections (Profile, Coach, Appearance, Goals & food, Household, Premium, Privacy & security) as full-label rows with gradient icon tiles; right pane fills the rest with the section's content in a multi-column grid (Appearance: Display + Accent on one row; Typeface tiles 4 per row; Theme tiles 5 per row).
- <1024px: section list is the first screen; tapping opens the section (iOS Settings pattern) with a back button. DELETE the horizontally scrolling tab strip (removes the clipped "Privacy & secur" label).

TASK 6.6: Same pattern on other surfaces
- Recipes & meal plans, Meals, Snacks, Workouts, Health data, Achievements: master-detail on desktop and tablet-landscape (list column 360px + detail filling the rest); phone: list then detail. Recipe cards in a responsive grid repeat(auto-fill, minmax(280px, 1fr)).
- Coach: chat fills the center; right rail (320px, desktop only) shows the daily advice card, signature mechanic (streak / adherence / intensity dial), and today's plan; tablet/phone collapse the rail into a collapsible card above the chat.
- Tool pages (Pantry mode, Photo meal logging, Restaurant mode, Micronutrient gaps, Progressive programs, Form check camera, Body progress studio, Recovery score, Weekly review PDF, Voice coach, Habit experiments, Coach sharing, Family challenges, Community recipes, Doctor visit prep, Cycle-aware plans, Fasting & Ramadan mode, Budget mode): same grid; single narrow forms use a 2-column layout (form left, live preview/results right) when width allows.

TASK 6.7: Sidebar fit and grouping
- The sidebar lists 25+ destinations in one long list, with top and bottom items hidden under a fade mask ("Pantry mode" and "Budget mode" cut off). Fix the mask so first and last rows scroll fully clear (16px scroll padding top/bottom); the fade hints only when content overflows.
- Regroup without removing or duplicating anything. Collapsible groups (state remembered), small uppercase labels: LOG (Meals, Snacks, Workouts and imports, Photo meal logging, Restaurant mode, Pantry mode) · EAT AND TRAIN (Recipes and meal plans, Food culture, Personal coach, Voice coach, Progressive programs, Form check camera, Fasting and Ramadan mode, Cycle-aware plans, Budget mode) · INSIGHTS (Summary, Health data, Micronutrient gaps, Recovery score, Body progress studio, Weekly review PDF, Habit experiments, Doctor visit prep, Achievements and goals) · SHARE (Coach sharing, Family challenges, Community recipes) · ACCOUNT (Settings). Summary pinned above the groups. Groups default expanded for the current page's group, collapsed otherwise on first run.
- Icons use the Phase 5.4 gradient tiles, extended per group family: LOG green-to-teal, EAT AND TRAIN orange-to-red, INSIGHTS blue-to-indigo, SHARE violet-to-pink, ACCOUNT neutral gray; distinct Lucide glyph per item. Premium pills stay.

TASK 6.8: Guardrails
- No horizontal page scroll at any width; nothing wider than the viewport; nothing clipped mid-word.
- Charts resize with their card and keep their draw-in animation.
- Touch targets 44px minimum on touch devices; hover styles only on hover-capable devices.
- Keep the 320ms menu slide, z-index tiers, safe-area handling, reduced-motion rules, and all prior menu fixes.

---

# PHASE 7: Legal and compliance (engineering checklist, not legal advice; placeholders for anything a professional must confirm)

Sensitive-data features in this app: Cycle-aware plans, Doctor visit prep, Body progress studio (photos), Form check camera, Voice coach, Photo meal logging, Fasting mode, connected health data. Treat them as sensitive throughout.

TASK 7.1: Update Privacy Policy and Terms (pages exist at /privacy, /terms)
- Privacy: plain-language sections for (a) each sensitive feature — what is collected and why; (b) AI processing — name the AI provider(s) the code actually calls for coach/voice/photo features and what is sent; (c) local storage and cookies — every key by purpose (essential vs other); (d) retention; (e) deletion/export; (f) 13+; (g) contact.
- Terms: medical disclaimer for every sensitive feature, community rules (no harassment, illegal or explicit content, no medical advice to others), subscription terms pointing to /refunds, right to remove content and suspend accounts.
- Short sentences, no legal filler; last-updated date auto-set at build time.

TASK 7.2: Subscription, refund, and business pages
- /refunds: cancellation how-to (link to the in-app cancel path), what happens to access after cancelling, refund rules [REFUND POLICY: fill in], how to request one. Linked from the premium screen footer, Terms, Settings.
- /contact: [LEGAL BUSINESS NAME], [MAILING ADDRESS], [SUPPORT EMAIL], response-time statement. Linked from the footer.
- Premium screen and purchase buttons state, within the button's view: total charged, billing period, auto-renewal until cancelled, where to cancel. Prices match the real payment configuration.

TASK 7.3: Cookies and local storage
- Audit all storage and third-party loads (analytics, fonts, embeds, error tracking, ad pixels). If only essential storage: no banner; the privacy page explains it — report that. Only if non-essential cookies/trackers exist: consent banner with equally prominent "Accept" and "Reject non-essential" plus "Manage", no pre-ticked boxes, nothing non-essential loads before consent, choice stored and changeable in Settings.

TASK 7.4: Consent flows
- Sign-up: unchecked "I agree to the Terms and Privacy Policy" checkbox with links, required to create the account.
- Just-in-time, separate, opt-in prompts (never pre-checked, never bundled) before first use of: connecting health data, camera (Form check, Body progress, Photo meal logging), microphone (Voice coach), photo library, Cycle-aware plans, community sharing. Each says what is used, why, whether it leaves the device, how to turn it off. Each revocable from Settings > Privacy and security, which immediately stops the feature.

TASK 7.5: Data minimization and third-party audit
- Changelog table: every field collected, every third-party service/SDK, its purpose, what data it receives, whether necessary. Remove or make optional anything not needed.
- Self-host all web fonts and icon assets so visitor IPs are not sent to font CDNs.
- No health, photo, voice, or cycle data sent to any third party not named in the privacy policy.

TASK 7.6: Remove dark patterns and hidden fees
- Premium screen: no countdown timers, fake scarcity, "X people bought" claims; discount percentage computed from real prices; cancel as easy as subscribe; neutral decline wording (no guilt copy).
- Coach personas: no shaming, guilt-tripping notifications, or streak-loss threats; the Enforcer stays blunt and factual, never cruel.
- No pre-selected paid add-ons; no fees appearing only at the final step. Notifications opt-in with per-type toggles.

TASK 7.7: Claims and reviews
- Search the whole project (copy, coach prompts, marketing text, images) for unsupported claims: "guaranteed", "clinically proven", "lose X lbs in Y days", disease treatment/prevention, fake or placeholder reviews and counters. Remove or rewrite; list each change.
- Every sensitive feature page (Cycle-aware plans, Doctor visit prep, Fasting and Ramadan mode, Recovery score) carries a one-line general-wellness disclaimer and never diagnoses.

TASK 7.8: Accessibility pass
- Meaningful images: descriptive alt text; decorative: alt=""; every icon-only button has aria-label (menu/back arrow, bell, theme toggle, close).
- Contrast: body text 4.5:1, large text/UI components 3:1 in all five themes, light and dark. Fix failures via tokens.
- Keyboard: all controls reachable and operable (Tab, Enter, Space, Escape); visible :focus-visible ring only; logical tab order; side menu traps focus while open, closes on Escape, returns focus to its button; "Skip to main content" link; charts have text alternatives.
- prefers-reduced-motion respected; text zoom to 200% without loss of content.

TASK 7.9: Age gate
- Sign-up asks date of birth (or a required 13+ confirmation if DOB isn't otherwise needed). Under 13: no account created, nothing stored, neutral message. Terms and privacy state 13+.

TASK 7.10: Data rights inside the app
- Settings > Privacy and security: (1) "Delete my account and data" — confirmation listing what will be deleted, requires password/re-auth, deletes server-side records and local storage, signs out, confirms on-screen (and by email only if the app sends email); states subscriptions must be cancelled separately with a link to the cancel path; reachable in three taps or fewer from anywhere. (2) "Export my data" — JSON or CSV download of logs, plans, settings, coach history. (3) Consent center — toggles for each Task 7.4 permission and analytics if present.

TASK 7.11 (only if the app sends email): Email compliance
- Audit for email sending (receipts, reminders, coach summaries). None → "not applicable". Any marketing/reminder emails: unsubscribe link in each, honored promptly, business mailing address in the footer, honest subject lines, opt-in separate from account emails.

TASK 7.12: Licenses and credits
- /credits: every font (name, license), the icon set (Lucide, ISC), third-party images/illustrations with source and license. Confirm recipe, culture, and hero images are original, licensed, or public-domain; replace or flag scraped/unlicensed ones with a neutral placeholder and TODO. Linked from the footer.

---

# PHASE 8: App Store readiness (RUN ONLY IF I confirm we are submitting to the iOS App Store; skip entirely while the product stays a website. Apple's guidelines change — re-check current rules before implementing payment and sign-in requirements and report what you relied on.)

TASK 8.1: Detect the native wrapper — one flag isNativeApp (user-agent token or injected variable) plus a platform helper; all wrapper behavior reads it; web version unchanged.
TASK 8.2: Payments inside the app — web keeps web checkout; inside the iOS wrapper purchases of the digital premium subscription go through Apple In-App Purchase: hide the web checkout and pricing when isNativeApp, show the native purchase flow. TODO block for StoreKit (product IDs, receipt validation, server-side entitlement setting the same premium flag as web). "Restore Purchases" works and is visible. If payments aren't live: hide the premium screen entry, badges, and locked previews in the wrapper entirely — never ship a dead purchase button. (This replaces Phase 2's "Coming soon" CTA inside the wrapper.)
TASK 8.3: No "coming soon" anywhere — search for "coming soon", "soon", "beta", "TODO", placeholder text, empty routes, dead buttons. Every visible screen works; hide unfinished features behind build-time feature flags instead of stubs.
TASK 8.4: Sign in with Apple — only if any third-party/social login exists; add it with equal prominence. Email+password only → "not applicable".
TASK 8.5: Account deletion — verify the Phase 7.10 flow works in the wrapper; build it if missing.
TASK 8.6: Broken links — crawl every route, link, and button (sidebar's 25+ destinations, footer, Privacy, Terms, Support, Contact). Fix 404s, blank screens, dead taps. Add a Support URL page if none exists.
TASK 8.7: UGC safety (Community recipes, Family challenges, Coach sharing) — if users can see others' content: per-item Report (reason list + optional note), Block user, Hide; profanity filter on public text fields; Terms language; visible support contact; moderation queue or documented email process with 24-hour response target; reported items hidden for the reporter immediately. Private-only sharing: still add Report and Block. Nothing user-generated visible → "not applicable".
TASK 8.8: iPad — verify 768x1024, 820x1180, 1024x1366 in both orientations: no stretched phone layout, no clipped controls, sidebar and grids follow Phase 6 breakpoints, modals/sheets sized for tablets.
TASK 8.9: Reviewer demo account — REVIEW_NOTES.md with placeholders for demo credentials (never commit real ones); how to seed the demo account with sample meals, workouts, sleep, coach history; confirm the demo account has premium unlocked via the same server entitlement so reviewers see paid features.
TASK 8.10: "Website in a box" risk report (report only) — list which native capabilities the wrapper uses (push reminders, HealthKit, haptics, offline shell, share sheet, widgets) and which are missing; recommend the 2-3 most valuable to add with effort estimates.

---

# MASTER FINAL CHECK (report pass/fail after each phase, and this full list at the end)

- Arrow: numeric centering within 0.5px in open and closed states at 100/125/150% zoom on all back and menu buttons; single container, no card-in-card.
- Space: report the ratio (main content width ÷ (viewport width - sidebar)) at 375, 768, 1024, 1280, 1440, 1920px. Targets: at least 0.9 up to 1440px, at least 0.7 at 1920px.
- No blue outline box remains after tapping/clicking any control; keyboard focus shows only the thin ring; selected states use tint + hairline + check badge.
- Summary: avatar appears once; no clipped text at 375px; layouts match the Phase 6 composition at each breakpoint; bottom content clears the tab bar and safe area.
- Side menu: opens cleanly from every surface (full-viewport scrim, zero collisions, no floating toggle); slides 320ms with the centered arrow morph; sidebar groups collapse and remember state; first and last items fully visible; all destinations reachable.
- Settings: two-pane on desktop, section-list on smaller screens; tab strip deleted; all labels fully readable.
- Premium: audit table delivered; badges once per feature; every premium item opens the premium screen; locked features inert until the flag is active (verified via dev override both ways); premium screen matches the Telegram Premium structure with all-original assets; no fake prices or discounts (TODO list).
- Coach: full data access; the daily advice card satisfies all 9 personalization requirements in each persona's voice; culture constraint intact; no medical claims.
- Fonts: switching live-updates the app; all 8 options correct in light/dark and all five themes; tabular numerals; choice persists.
- Appearance: segmented display control, 28px accent swatches, compact theme tiles; icons everywhere are the shared gradient-tile component.
- Legal: /privacy, /terms, /refunds, /contact, /credits resolve from the footer and Settings; consent prompts appear before each sensitive feature and are revocable; delete-account and export work end to end on a test account; age gate blocks under-13 without storing data; accessibility audit (axe or Lighthouse) score reported plus manual keyboard walk-through; third-party table delivered; fonts self-hosted; no unsupported claims remain.
- (If Phase 8 ran) wrapper shows no web checkout; sandbox purchase/restore works; entitlement unlocks premium on web and iOS; no "coming soon"; link audit clean; UGC safety present or not-applicable; iPad layouts pass; demo account documented.
- All existing features work end to end at 375px, 768px, and 1280px+; screenshots of Summary, Settings, Recipes, and Coach at 375, 820, and 1440px widths attached.
- Final TODO list of every [PLACEHOLDER] I must fill in (prices, percentages, business details, refund terms, copy edits) or confirm with a lawyer.

---

# REFERENCE CODE (tested)

The code below is a working, tested reference for the design system in Phases 5 and 6. It was verified in a real browser at 375px, 820px, and 1440px:
- arrow and hamburger centered to 0px in both states
- main content fills 98 to 100% of the space beside the sidebar
- no horizontal scroll at any width

HOW TO USE IT: do not paste these files over my site. Port the tokens, classes, and behavior into my existing components. Match the values exactly, and keep all my existing features, data, and routes. The demo page uses sample numbers for display only. Real screens must use real user data.

Files: tokens.css (design tokens), base.css (focus, selected states, buttons, safe areas, reduced motion), layout.css (grid, header, sidebar, drawer, scrim), components.css (cards, charts, arrow icon, gradient icon tiles, premium badge, appearance controls), app.js (menu state, arrow centering verifier, appearance switchers), index.html (markup patterns).

## tokens.css

```css
/* ============================================================
   Whole Life Hub — Design Tokens
   Single source of truth. Reference implementation for Phase 5/6.
   ============================================================ */

:root {
  /* ---- z-index tiers (nothing renders above an open menu) ---- */
  --z-chrome: 80;   /* floating page chrome: tab bar, header widgets */
  --z-scrim: 90;    /* menu backdrop */
  --z-menu: 100;    /* menu panel itself */

  /* ---- spacing: 8px grid ---- */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;

  /* ---- radii (only these values allowed) ---- */
  --radius-sm: 8px;
  --radius-md: 10px;
  --radius-lg: 12px;
  --radius-card: 16px;
  --radius-card-lg: 20px;
  --radius-pill: 999px;

  /* ---- motion ---- */
  --ease-spring: cubic-bezier(0.32, 0.72, 0, 1);
  --ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
  --dur-tap: 150ms;
  --dur-slide: 320ms;
  --dur-page: 400ms;

  /* ---- typography ---- */
  --font-app: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", system-ui, sans-serif;

  /* ---- category colors (charts, icons, labels ONLY — never large fills) ---- */
  --cat-activity: #FF6937;
  --cat-sleep: #5E5CE6;
  --cat-coach: #64D2FF;
  --cat-heart: #FF2D55;
  --cat-meals: #30D158;
  --cat-water: #30B0C7;
  --cat-gold: #FFD60A;
  --text-muted: #8E8E93;
  --chevron: #545458;

  /* ---- accent (retuned per theme; one accent per view) ---- */
  --accent: #2F7D5B;
  --accent-hover: #276A4D;

  /* ---- sidebar icon gradients (per destination, one tile style) ---- */
  --icon-summary-from: #FF5E7E;  --icon-summary-to: #FF2D55;
  --icon-health-from: #4DA3FF;   --icon-health-to: #5E5CE6;
  --icon-meals-from: #5BDB7F;    --icon-meals-to: #22A653;
  --icon-snacks-from: #FFB45E;   --icon-snacks-to: #E0762C;
  --icon-workouts-from: #FF8A4C; --icon-workouts-to: #F0532B;
  --icon-recipes-from: #A6E05B;  --icon-recipes-to: #4CAF50;
  --icon-culture-from: #34D1C0;  --icon-culture-to: #1AA6C4;
  --icon-coach-from: #8E7BFF;    --icon-coach-to: #4F6BFF;
  --icon-trophy-from: #FFD60A;   --icon-trophy-to: #F5A100;
  --icon-settings-from: #9A9AA2; --icon-settings-to: #6B6B73;
}

/* ---- Dark (default) surfaces ---- */
:root,
[data-theme="dark"] {
  --bg: #000000;
  --surface: #1C1C1E;
  --surface-raised: #2C2C2E;
  --text: #FFFFFF;
  --text-secondary: #EBEBF0;
  --hairline: rgba(255, 255, 255, 0.08);
  --hairline-light: none;
  --row-hover: rgba(128, 128, 128, 0.10);
  --row-active: rgba(128, 128, 128, 0.16);
}

/* ---- Light surfaces ---- */
[data-theme="light"] {
  --bg: #F2F2F7;
  --surface: #FFFFFF;
  --surface-raised: #FFFFFF;
  --text: #1C1C1E;
  --text-secondary: #3A3A3C;
  --text-muted: #6C6C70;
  --hairline: rgba(0, 0, 0, 0.10);
  --hairline-light: rgba(0, 0, 0, 0.06);
  --row-hover: rgba(0, 0, 0, 0.05);
  --row-active: rgba(0, 0, 0, 0.09);
}

/* ---- Font options (set via data-font on <html>) ---- */
[data-font="inter"]          { --font-app: "Inter", system-ui, sans-serif; }
[data-font="space-grotesk"]  { --font-app: "Space Grotesk", system-ui, sans-serif; }
[data-font="lora"]           { --font-app: "Lora", Georgia, serif; }

/* ---- Utility: tabular numerals for metrics ---- */
.metric {
  font-variant-numeric: tabular-nums;
}
```

## base.css

```css
/* ============================================================
   Whole Life Hub — Base: resets, focus, selected states
   Fixes: blue outlines, tap highlights, lingering press states
   ============================================================ */

*, *::before, *::after {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
  tap-highlight-color: transparent;
}

html { scroll-behavior: smooth; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-app);
  font-size: 16px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

/* ---------- Focus: nothing for mouse/touch, thin ring for keyboard ---------- */
:focus { outline: none; }

:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 60%, transparent);
  outline-offset: 2px;
  border-radius: var(--radius-md);
}

/* ---------- Selected state: tint + hairline + check badge (NEVER a thick outline) ---------- */
.is-selected {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  border-radius: var(--radius-md);
  position: relative;
}

.is-selected::after {
  content: "";
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent) center / 10px 8px no-repeat;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 12.5l5 5L20 6.5'/%3E%3C/svg%3E");
}

/* One border-type treatment max: kill stacked border+outline+shadow combos */
.is-selected, .card, .btn { box-shadow: none; }

/* ---------- Buttons ---------- */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 40px;
  padding: 0 var(--space-4);
  border: none;
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color var(--dur-tap) var(--ease-smooth),
              transform var(--dur-tap) var(--ease-smooth);
}

.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover { background: var(--accent-hover); }
.btn-secondary { background: var(--surface-raised); color: var(--text); }
.btn-tertiary { background: transparent; color: var(--accent); }

.btn:active { transform: scale(0.97); }

/* Press state clears immediately on release — no lingering highlight */
.btn.pressed, .icon-btn.pressed { background: var(--row-hover); }

/* ---------- Icon-only buttons: 40px, single container, perfectly centered ---------- */
.icon-btn {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--text);
  cursor: pointer;
}

.icon-btn:hover { background: var(--row-hover); }   /* pointer devices only, via media query below */
.icon-btn:active { transform: scale(0.96); }
.icon-btn svg { display: block; }                    /* kills baseline gap that pushes glyphs off-center */

@media (hover: none) {
  .icon-btn:hover { background: transparent; }
}

/* ---------- Inputs ---------- */
.input {
  min-height: 44px;
  padding: 0 var(--space-3);
  border: none;
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
  font-family: inherit;
  font-size: 16px;
}

/* ---------- Safe areas (Dynamic Island, home indicator) ---------- */
.app-header { padding-top: env(safe-area-inset-top); }
.tab-bar { padding-bottom: env(safe-area-inset-bottom); }

/* ---------- Reduced motion ---------- */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

## layout.css

```css
/* ============================================================
   Whole Life Hub — Layout: grid, header, sidebar, menu
   Fixes: wasted space (12-col grid), one-row headers, sidebar
   ============================================================ */

/* ---------- App shell ---------- */
.app-shell { display: flex; min-height: 100dvh; }

/* ---------- Sidebar: persistent rail on desktop, drawer below ---------- */
.sidebar {
  width: 280px;
  flex-shrink: 0;
  background: var(--bg);
  border-right: 1px solid var(--hairline);
  display: flex;
  flex-direction: column;
  z-index: var(--z-menu);
}

/* Drawer mode (below 1024px): off-canvas, slides with spring easing.
   transform/opacity ONLY — never display:none, or transitions never run. */
@media (max-width: 1023px) {
  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: min(320px, 84vw);
    background: var(--surface);
    transform: translateX(-100%);
    visibility: hidden;
    transition: transform var(--dur-slide) var(--ease-spring),
                visibility 0s linear var(--dur-slide);
  }
  body.menu-open .sidebar {
    transform: translateX(0);
    visibility: visible;
    transition: transform var(--dur-slide) var(--ease-spring);
  }
}

/* Scrim: FULL viewport, fixed, one element, correct tier.
   A half-rendered scrim means it was sized to page content, not the viewport. */
.scrim {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100dvh;
  background: rgba(0, 0, 0, 0.5);
  z-index: var(--z-scrim);
  opacity: 0;
  visibility: hidden;
  transition: opacity var(--dur-slide) var(--ease-smooth),
              visibility 0s linear var(--dur-slide);
}



/* Freeze the page while the menu is open: no scroll, no pointer events,
   so page content can never interleave with menu content. */
/* Drawer mode only: on desktop the sidebar is a permanent rail, so no scrim or freeze. */
@media (max-width: 1023px) {
  body.menu-open .scrim { opacity: 1; visibility: visible; transition: opacity var(--dur-slide) var(--ease-smooth); }
  body.menu-open { overflow: hidden; }
  body.menu-open .app-main { pointer-events: none; }
}

/* ---------- Main: fills the space beside the sidebar ---------- */
.app-main {
  flex: 1;
  min-width: 0;             /* lets grid children shrink instead of overflowing */
  display: flex;
  flex-direction: column;
}

/* ---------- One-row header (64px max on desktop) ---------- */
.app-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 56px;
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--hairline);
  position: sticky;
  top: 0;
  background: color-mix(in srgb, var(--bg) 82%, transparent);
  backdrop-filter: blur(30px) saturate(180%);
  -webkit-backdrop-filter: blur(30px) saturate(180%);
  z-index: var(--z-chrome);
}

.app-header .title { font-size: 20px; font-weight: 700; margin: 0; }
.app-header .spacer { flex: 1; }
.app-header .time { color: var(--text-muted); font-size: 13px; }

/* Quick actions: same row from 640px up, compact row under the title on phones */
.header-actions { display: none; }
@media (min-width: 640px) { .header-actions { display: flex; gap: var(--space-2); } }

/* ---------- Page grid: THE space fix ---------- */
.page {
  padding: var(--space-4);
  max-width: 1360px;
  width: 100%;
  margin: 0 auto;
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(4, minmax(0, 1fr));  /* phone default */
}

/* Tablet: 6 columns, 2 content columns */
@media (min-width: 640px) {
  .page { padding: var(--space-6); grid-template-columns: repeat(6, minmax(0, 1fr)); }
}

/* Desktop: 12 columns */
@media (min-width: 1024px) {
  .page { grid-template-columns: repeat(12, minmax(0, 1fr)); }
}

/* Column spans (use these instead of wide empty cards) */
.span-4  { grid-column: span 4; }
.span-6  { grid-column: span 6; }
.span-8  { grid-column: span 8; }
.span-12 { grid-column: span 12; }

/* Spans never exceed the explicit grid (oversized spans create implicit columns and squeeze everything). */
@media (max-width: 639px) {
  .span-4, .span-6, .span-8, .span-12 { grid-column: 1 / -1; }
}
@media (min-width: 640px) and (max-width: 1023px) {
  .span-4 { grid-column: span 3; }            /* two per row on tablet */
  .span-6, .span-8, .span-12 { grid-column: 1 / -1; }
}

/* Cards in a row: equal height; children stretch full width so heads and charts lay out */
.page > .card { align-self: stretch; }

/* ---------- Pinned metric tiles: 2 per row on phone, 4 on desktop ---------- */
.tile-row {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
@media (min-width: 1024px) { .tile-row { grid-template-columns: repeat(4, minmax(0, 1fr)); } }

/* ---------- Sidebar rows and sections ---------- */
.sidebar-scroll {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-3) var(--space-2);
  /* 16px scroll padding so first and last rows clear the fade mask */
  scroll-padding-top: var(--space-4);
  padding-top: var(--space-4);
  padding-bottom: var(--space-4);
  mask-image: linear-gradient(to bottom, transparent, black var(--space-4), black calc(100% - var(--space-4)), transparent);
  -webkit-mask-image: linear-gradient(to bottom, transparent, black var(--space-4), black calc(100% - var(--space-4)), transparent);
}

.nav-group { margin-bottom: var(--space-3); }
.nav-group-label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  padding: var(--space-2) var(--space-3) var(--space-1);
  text-transform: uppercase;
}

.nav-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: 40px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--text);
  font-family: inherit;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  width: 100%;
  text-align: left;
}
.nav-row:hover { background: var(--row-hover); }
.nav-row.is-active { background: var(--row-active); font-weight: 600; }
.nav-row .chev { margin-left: auto; color: var(--chevron); }

/* Profile block pinned at the bottom over one hairline */
.sidebar-profile {
  border-top: 1px solid var(--hairline);
  padding: var(--space-3);
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.sidebar-profile .avatar {
  width: 32px; height: 32px; border-radius: 50%;
  background: linear-gradient(135deg, var(--icon-coach-from), var(--icon-coach-to));
}
.sidebar-profile .name { font-size: 14px; font-weight: 600; }
.sidebar-profile .sub { font-size: 12px; color: var(--text-muted); }

/* Drawer header: close arrow lives INSIDE the drawer, so it is never covered */
.drawer-head { display: none; }
@media (max-width: 1023px) {
  .drawer-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: calc(env(safe-area-inset-top) + var(--space-2)) var(--space-3) 0;
    min-height: 56px;
  }
  .drawer-title { font-size: 17px; font-weight: 600; }
}
```

## components.css

```css
/* ============================================================
   Whole Life Hub — Components
   Cards, arrow icon, gradient sidebar icons, appearance controls
   ============================================================ */

/* ---------- Cards ---------- */
.card {
  background: var(--surface);
  border-radius: var(--radius-card);
  padding: var(--space-4);
  border: var(--hairline-light);
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.card .card-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-2);
  width: 100%;
}

.card .cat-label { font-size: 15px; font-weight: 600; }
.card .timestamp { font-size: 13px; color: var(--text-muted); }

.card .value { font-size: 26px; font-weight: 600; }
.card .unit { font-size: 15px; color: var(--text-muted); }

/* Chart fills remaining card height, bars animate in */
.chart { display: flex; align-items: flex-end; gap: 6px; height: 96px; width: 100%; margin-top: auto; }
.chart .bar {
  flex: 1;
  background: #3A3A3C;
  border-radius: 3px;
  transform-origin: bottom;
  transform: scaleY(0);
  animation: bar-grow 400ms var(--ease-spring) forwards;
  animation-delay: calc(var(--i) * 40ms);
}
.chart .bar.latest { background: var(--bar-color, var(--cat-activity)); }
@keyframes bar-grow { to { transform: scaleY(1); } }

/* ---------- THE arrow icon: hamburger <-> centered back chevron ----------
   Geometry: three <line x1=0 y1=0 x2=18 y2=0> in a 24x24 viewBox.
   Closed: bars at x=3, lengths 18. Open: arms meet at (9,12), end at
   (15,6)/(15,18) -> chevron spans x 9..15, geometrically centered at x=12.
   The old broken version pivoted at x=3, leaving the glyph off-center. */

.icon-arrow { width: 24px; height: 24px; display: block; }

.icon-arrow .nav-line {
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  fill: none;
  vector-effect: non-scaling-stroke;   /* stroke stays 2px while the line scales */
  transform-box: view-box;
  transform-origin: 0 0;
  transition: transform var(--dur-slide) var(--ease-spring),
              opacity 200ms linear;
}

/* Closed (hamburger): full 18px bars */
.icon-arrow .nav-line-top    { transform: translate(3px, 6px)  rotate(0deg) scaleX(1); }
.icon-arrow .nav-line-middle { transform: translate(3px, 12px) rotate(0deg) scaleX(1); opacity: 1; }
.icon-arrow .nav-line-bottom { transform: translate(3px, 18px) rotate(0deg) scaleX(1); }

/* Open (back chevron "<", centered on x=12, y=12).
   scaleX(0.4714) shortens 18px bars to 8.49px arms, so arms end at (15,6) and (15,18).
   Scaling (not stroke-dasharray) keeps the real geometry, so bounding boxes measure true. */
.icon-arrow.is-open .nav-line-top    { transform: translate(9px, 12px) rotate(-45deg) scaleX(0.4714); }
.icon-arrow.is-open .nav-line-middle { transform: translate(9px, 12px) rotate(0deg)   scaleX(0.001); opacity: 0; }
.icon-arrow.is-open .nav-line-bottom { transform: translate(9px, 12px) rotate(45deg)  scaleX(0.4714); }

/* ---------- Sidebar gradient icon tiles (premium icon look) ----------
   30px tile, 135deg two-tone gradient, white glyph, inner top highlight.
   One component everywhere a destination appears. */

.nav-icon {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, var(--from), var(--to));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
  color: #fff;
  transition: transform var(--dur-tap) var(--ease-smooth);
}
.nav-row:active .nav-icon { transform: scale(0.96); }
.nav-icon svg { width: 18px; height: 18px; display: block; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

/* Per-destination gradients (extend these variables for every sidebar item) */
.nav-icon.i-summary  { --from: var(--icon-summary-from);  --to: var(--icon-summary-to); }
.nav-icon.i-health   { --from: var(--icon-health-from);   --to: var(--icon-health-to); }
.nav-icon.i-meals    { --from: var(--icon-meals-from);    --to: var(--icon-meals-to); }
.nav-icon.i-snacks   { --from: var(--icon-snacks-from);   --to: var(--icon-snacks-to); }
.nav-icon.i-workouts { --from: var(--icon-workouts-from); --to: var(--icon-workouts-to); }
.nav-icon.i-recipes  { --from: var(--icon-recipes-from);  --to: var(--icon-recipes-to); }
.nav-icon.i-culture  { --from: var(--icon-culture-from);  --to: var(--icon-culture-to); }
.nav-icon.i-coach    { --from: var(--icon-coach-from);    --to: var(--icon-coach-to); }
.nav-icon.i-trophy   { --from: var(--icon-trophy-from);   --to: var(--icon-trophy-to); }
.nav-icon.i-settings { --from: var(--icon-settings-from); --to: var(--icon-settings-to); }

/* ---------- Premium badge (gold pill; solid variant when active) ---------- */
.premium-badge {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: var(--cat-gold);
  color: #000;
}
[data-theme="light"] .premium-badge { background: transparent; color: #B8860B; border: 1px solid var(--cat-gold); }
.premium-badge.is-active { background: var(--cat-gold); color: #000; border: none; }

/* ---------- Compact appearance controls ---------- */
.section-label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin: var(--space-4) 0 var(--space-2);
}

/* Segmented control (replaces large display-mode cards) */
.seg {
  display: flex;
  background: var(--surface);
  border-radius: var(--radius-md);
  padding: 2px;
  height: 36px;
}
.seg button {
  flex: 1;
  border: none;
  background: transparent;
  border-radius: 8px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
}
.seg button.is-selected { background: var(--row-active); color: var(--text); font-weight: 600; }

/* Accent swatches: 28px circles, check inside when selected */
.swatch-row { display: flex; gap: var(--space-3); overflow-x: auto; padding: var(--space-1) 0; }
.swatch {
  width: 28px; height: 28px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 12px;
}
.swatch.is-selected { box-shadow: inset 0 0 0 2px var(--surface), inset 0 0 0 4px currentColor; }

/* Theme tiles: compact two-tone previews */
.theme-tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-3); }
@media (min-width: 1024px) { .theme-tiles { grid-template-columns: repeat(5, 1fr); } }
.theme-tile {
  border: 1px solid var(--hairline);
  border-radius: var(--radius-lg);
  background: var(--surface);
  padding: var(--space-1);
  cursor: pointer;
  font-family: inherit;
  color: var(--text);
}
.theme-tile .preview { height: 40px; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; }
.theme-tile .preview .top { flex: 1; background: var(--p-top); }
.theme-tile .preview .bottom { flex: 1; background: var(--p-bottom); }
.theme-tile .name { font-size: 12px; margin-top: var(--space-1); text-align: center; }

/* Segmented controls: selected = surface highlight only, no badge, no border */
.seg .is-selected { border: none; }
.seg .is-selected::after { display: none; }

/* Swatches: keep own color, center the check inside the circle */
.swatch.is-selected { border: none; }
.swatch.is-selected::after { top: 50%; left: 50%; right: auto; transform: translate(-50%, -50%); width: 16px; height: 16px; background-color: transparent; }
```

## app.js

```javascript
/* ============================================================
   Whole Life Hub — app.js
   Menu (slide + arrow morph + scrim + freeze), appearance
   switchers (theme, font, accent), arrow centering verifier
   ============================================================ */

(function () {
  "use strict";

  /* ---------- Menu: one atomic state change ---------- */
  const menuBtn = document.getElementById("menuBtn");
  const menuIcon = menuBtn.querySelector(".icon-arrow");

  function setMenu(open) {
    document.body.classList.toggle("menu-open", open);
    menuIcon.classList.toggle("is-open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }

  menuBtn.addEventListener("click", () => setMenu(!document.body.classList.contains("menu-open")));

  // Press state clears immediately on release — no lingering highlight
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) =>
    menuBtn.addEventListener(ev, () => menuBtn.classList.remove("pressed"))
  );

  // Escape closes; focus returns to the menu button
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains("menu-open")) {
      setMenu(false);
      menuBtn.focus();
    }
  });

  // Close arrow inside the drawer
  document.getElementById("closeBtn").addEventListener("click", () => { setMenu(false); menuBtn.focus({ focusVisible: false }); });

  // Clicking the scrim closes
  document.querySelector(".scrim").addEventListener("click", () => setMenu(false));

  /* ---------- Arrow centering verifier ----------
     Master-prompt check: |glyph center - button center| <= 0.5px,
     in both states, at any zoom. Run from the console or the demo button. */
  function verifyArrowCentering(btn) {
    const icon = btn.querySelector(".icon-arrow");
    const lines = icon.querySelectorAll(".nav-line");
    const bb = btn.getBoundingClientRect();

    // Union of the three lines' boxes = the visible glyph box
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    lines.forEach((line) => {
      const q = line.getBoundingClientRect();
      l = Math.min(l, q.left); t = Math.min(t, q.top);
      r = Math.max(r, q.right); b = Math.max(b, q.bottom);
    });

    const dx = Math.abs((l + r) / 2 - (bb.left + bb.right) / 2);
    const dy = Math.abs((t + b) / 2 - (bb.top + bb.bottom) / 2);
    return {
      dx: +dx.toFixed(2),
      dy: +dy.toFixed(2),
      pass: dx <= 0.5 && dy <= 0.5,
      state: icon.classList.contains("is-open") ? "open" : "closed",
    };
  }
  window.verifyArrowCentering = verifyArrowCentering;

  const checkBtn = document.getElementById("centeringCheck");
  const checkOut = document.getElementById("centeringOut");
  checkBtn.addEventListener("click", () => {
    const result = verifyArrowCentering(menuBtn);
    checkOut.textContent =
      `${result.state}: dx=${result.dx}px dy=${result.dy}px — ${result.pass ? "PASS (within 0.5px)" : "FAIL"}`;
    checkOut.style.color = result.pass ? "var(--cat-meals)" : "var(--cat-heart)";
  });

  /* ---------- Appearance switchers ---------- */
  function bindChoice(selector, apply) {
    document.querySelectorAll(selector).forEach((el) => {
      el.addEventListener("click", () => {
        document.querySelectorAll(selector).forEach((o) => o.classList.remove("is-selected"));
        el.classList.add("is-selected");
        apply(el);
      });
    });
  }

  // Theme (data-theme on <html>)
  bindChoice("[data-theme-opt]", (el) => document.documentElement.setAttribute("data-theme", el.dataset.themeOpt));

  // Font (data-font on <html>)
  bindChoice("[data-font-opt]", (el) => document.documentElement.setAttribute("data-font", el.dataset.fontOpt));

  // Accent (--accent token)
  bindChoice("[data-accent]", (el) => {
    document.documentElement.style.setProperty("--accent", el.dataset.accent);
    document.documentElement.style.setProperty("--accent-hover", el.dataset.accentHover);
  });

  // Display mode (segmented control)
  bindChoice("[data-mode]", (el) => {
    const mode = el.dataset.mode;
    if (mode === "auto") {
      const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
      document.documentElement.setAttribute("data-theme", prefersLight ? "light" : "dark");
    } else {
      document.documentElement.setAttribute("data-theme", mode);
    }
    document.getElementById("modeCaption").textContent = el.dataset.caption;
  });
})();
```

## index.html

```html
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Whole Life Hub — Reference Code</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=Lora:wght@400;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="tokens.css?v=7" />
  <link rel="stylesheet" href="base.css?v=7" />
  <link rel="stylesheet" href="layout.css?v=7" />
  <link rel="stylesheet" href="components.css?v=7" />
</head>
<body>
  <a class="skip-link" href="#main" style="position:absolute;left:-9999px;">Skip to main content</a>

  <div class="app-shell">
    <!-- ================= SIDEBAR ================= -->
    <aside class="sidebar" aria-label="Main menu">
      <div class="drawer-head">
        <button id="closeBtn" class="icon-btn" aria-label="Close menu">
          <svg class="icon-arrow is-open" viewBox="0 0 24 24" aria-hidden="true">
            <line class="nav-line nav-line-top" x1="0" y1="0" x2="18" y2="0" />
            <line class="nav-line nav-line-middle" x1="0" y1="0" x2="18" y2="0" />
            <line class="nav-line nav-line-bottom" x1="0" y1="0" x2="18" y2="0" />
          </svg>
        </button>
        <span class="drawer-title">Whole Life Hub</span>
      </div>
      <div class="sidebar-scroll">
        <div class="nav-group">
          <button class="nav-row is-active">
            <span class="nav-icon i-summary" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M20.8 8.6a5.5 5.5 0 0 0-8.8-4.3A5.5 5.5 0 0 0 3.2 8.6c0 7 8.8 11.9 8.8 11.9s8.8-4.9 8.8-11.9z"/><path d="M3.5 13h4l1.5-2.5 3 5 1.5-2.5h7"/></svg>
            </span>
            Summary
          </button>
        </div>

        <div class="nav-group">
          <div class="nav-group-label">Log</div>
          <button class="nav-row">
            <span class="nav-icon i-meals" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M4 8h14v9a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8z"/><path d="M8 2v4M14 2v4"/></svg>
            </span>
            Meals <span class="chev" aria-hidden="true">&#8250;</span>
          </button>
          <button class="nav-row">
            <span class="nav-icon i-snacks" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5z"/><path d="M8.5 8.5h.01M13 14h.01M16 11h.01"/></svg>
            </span>
            Snacks <span class="premium-badge">Premium</span>
          </button>
          <button class="nav-row">
            <span class="nav-icon i-workouts" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/></svg>
            </span>
            Workouts & imports <span class="chev" aria-hidden="true">&#8250;</span>
          </button>
        </div>

        <div class="nav-group">
          <div class="nav-group-label">Eat & Train</div>
          <button class="nav-row">
            <span class="nav-icon i-recipes" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>
            </span>
            Recipes & meal plans <span class="chev" aria-hidden="true">&#8250;</span>
          </button>
          <button class="nav-row">
            <span class="nav-icon i-culture" aria-hidden="true">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20 15.3 15.3 0 0 1 0-20z"/></svg>
            </span>
            Food culture
          </button>
          <button class="nav-row">
            <span class="nav-icon i-coach" aria-hidden="true">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M16.2 7.8l-2 6.4-6.4 2 2-6.4 6.4-2z"/></svg>
            </span>
            Personal coach
          </button>
        </div>

        <div class="nav-group">
          <div class="nav-group-label">Insights</div>
          <button class="nav-row">
            <span class="nav-icon i-health" aria-hidden="true">
              <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            </span>
            Health data <span class="chev" aria-hidden="true">&#8250;</span>
          </button>
          <button class="nav-row">
            <span class="nav-icon i-trophy" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/></svg>
            </span>
            Achievements & goals
          </button>
          <button class="nav-row">
            <span class="nav-icon i-settings" aria-hidden="true">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>
            </span>
            Settings
          </button>
        </div>
      </div>

      <div class="sidebar-profile">
        <span class="avatar" aria-hidden="true"></span>
        <div>
          <div class="name">Chris Sulley</div>
          <div class="sub">View profile &#8250;</div>
        </div>
      </div>
    </aside>

    <div class="scrim" aria-hidden="true"></div>

    <!-- ================= MAIN ================= -->
    <div class="app-main">
      <header class="app-header">
        <button id="menuBtn" class="icon-btn" aria-expanded="false" aria-label="Open menu">
          <svg class="icon-arrow" viewBox="0 0 24 24" aria-hidden="true">
            <line class="nav-line nav-line-top" x1="0" y1="0" x2="18" y2="0" />
            <line class="nav-line nav-line-middle" x1="0" y1="0" x2="18" y2="0" />
            <line class="nav-line nav-line-bottom" x1="0" y1="0" x2="18" y2="0" />
          </svg>
        </button>

        <h1 class="title">Summary</h1>
        <div class="spacer"></div>
        <span class="time">4:47 PM</span>

        <button class="icon-btn" aria-label="Notifications">
          <svg viewBox="0 0 24 24" width="24" height="24" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;display:block" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>
          </svg>
        </button>

        <div class="header-actions">
          <button class="btn btn-secondary">+ Snack</button>
          <button class="btn btn-primary">+ Log a meal</button>
        </div>
      </header>

      <main class="page" id="main">
        <section class="card span-8">
          <div class="card-head">
            <span class="cat-label" style="color: var(--cat-meals)">Good afternoon, Chris</span>
            <span class="timestamp">Today</span>
          </div>
          <p>You're at 1,840 of 2,400 kcal. Protein is 34g short — the coach suggests two eggs or grilled chicken at dinner.</p>
        </section>

        <section class="card span-4">
          <div class="card-head">
            <span class="cat-label" style="color: var(--cat-coach)">Coach advice</span>
            <span class="timestamp">6:37 pm</span>
          </div>
          <p>Water is 900ml behind your usual pace. After last night's 5h sleep, today is a <strong>Recover</strong> day.</p>
        </section>

        <section class="card span-4">
          <div class="card-head">
            <span class="cat-label" style="color: var(--cat-activity)">Move calories</span>
            <span class="timestamp">Today</span>
          </div>
          <div class="value metric">412 <span class="unit">kcal</span></div>
          <div class="chart" role="img" aria-label="Move calories, last 7 days, trending up">
            <span class="bar" style="--i:0; height:40%"></span><span class="bar" style="--i:1; height:55%"></span>
            <span class="bar" style="--i:2; height:48%"></span><span class="bar" style="--i:3; height:65%"></span>
            <span class="bar" style="--i:4; height:60%"></span><span class="bar" style="--i:5; height:75%"></span>
            <span class="bar latest" style="--i:6; height:82%; --bar-color: var(--cat-activity)"></span>
          </div>
        </section>

        <section class="card span-4">
          <div class="card-head">
            <span class="cat-label" style="color: var(--cat-water)">Water</span>
            <span class="timestamp">Today</span>
          </div>
          <div class="value metric">1.1 <span class="unit">L</span></div>
          <div class="chart" role="img" aria-label="Water intake, last 7 days, steady">
            <span class="bar" style="--i:0; height:70%"></span><span class="bar" style="--i:1; height:78%"></span>
            <span class="bar" style="--i:2; height:66%"></span><span class="bar" style="--i:3; height:80%"></span>
            <span class="bar" style="--i:4; height:72%"></span><span class="bar" style="--i:5; height:85%"></span>
            <span class="bar latest" style="--i:6; height:55%; --bar-color: var(--cat-water)"></span>
          </div>
        </section>

        <section class="card span-4">
          <div class="card-head">
            <span class="cat-label" style="color: var(--cat-sleep)">Sleep</span>
            <span class="timestamp">Last night</span>
          </div>
          <div class="value metric">5 <span class="unit">hrs</span></div>
          <div class="chart" role="img" aria-label="Sleep hours, last 7 days, down last night">
            <span class="bar" style="--i:0; height:80%"></span><span class="bar" style="--i:1; height:85%"></span>
            <span class="bar" style="--i:2; height:75%"></span><span class="bar" style="--i:3; height:82%"></span>
            <span class="bar" style="--i:4; height:70%"></span><span class="bar" style="--i:5; height:76%"></span>
            <span class="bar latest" style="--i:6; height:52%; --bar-color: var(--cat-sleep)"></span>
          </div>
        </section>

        <div class="tile-row span-12">
          <div class="card"><span class="cat-label" style="color: var(--cat-meals)">Calories</span><span class="value metric">1,840 <span class="unit">kcal</span></span></div>
          <div class="card"><span class="cat-label" style="color: var(--cat-activity)">Steps</span><span class="value metric">6,214</span></div>
          <div class="card"><span class="cat-label" style="color: var(--cat-heart)">Weight</span><span class="value metric">82.4 <span class="unit">kg</span></span></div>
          <div class="card"><span class="cat-label" style="color: var(--cat-gold)">Streak</span><span class="value metric">4 <span class="unit">days</span></span></div>
        </div>

        <section class="card span-6">
          <div class="section-label" style="margin-top:0">Display</div>
          <div class="seg" role="group" aria-label="Display mode">
            <button data-mode="auto" data-caption="Follows your device">Auto</button>
            <button data-mode="light" data-caption="Always light">Light</button>
            <button data-mode="dark" data-caption="Always dark" class="is-selected">Dark</button>
            <button data-mode="dark" data-caption="True black, saves battery">OLED</button>
          </div>
          <p class="timestamp" id="modeCaption">Always dark</p>

          <div class="section-label">Accent</div>
          <div class="swatch-row">
            <button class="swatch" data-accent="#2F7D5B" data-accent-hover="#276A4D" style="background:#2F7D5B;color:#2F7D5B" aria-label="Forest green accent"></button>
            <button class="swatch is-selected" data-accent="#B8860B" data-accent-hover="#9A7209" style="background:#B8860B;color:#B8860B" aria-label="Plantain gold accent"></button>
            <button class="swatch" data-accent="#0A84FF" data-accent-hover="#007AFF" style="background:#0A84FF;color:#0A84FF" aria-label="Blue accent"></button>
            <button class="swatch" data-accent="#FF2D55" data-accent-hover="#E02549" style="background:#FF2D55;color:#FF2D55" aria-label="Rose accent"></button>
            <button class="swatch" data-accent="#30B0C7" data-accent-hover="#1AA6C4" style="background:#30B0C7;color:#30B0C7" aria-label="Cyan accent"></button>
          </div>
        </section>

        <section class="card span-6">
          <div class="section-label" style="margin-top:0">Theme</div>
          <div class="theme-tiles">
            <button class="theme-tile is-selected" data-theme-opt="dark"><span class="preview"><span class="top" style="--p-top:#1C1C1E"></span><span class="bottom" style="--p-bottom:#2F7D5B"></span></span><span class="name">Forest</span></button>
            <button class="theme-tile" data-theme-opt="dark"><span class="preview"><span class="top" style="--p-top:#1C1C1E"></span><span class="bottom" style="--p-bottom:#1B5E8C"></span></span><span class="name">Ocean</span></button>
            <button class="theme-tile" data-theme-opt="dark"><span class="preview"><span class="top" style="--p-top:#1C1C1E"></span><span class="bottom" style="--p-bottom:#E0674F"></span></span><span class="name">Sunset</span></button>
            <button class="theme-tile" data-theme-opt="dark"><span class="preview"><span class="top" style="--p-top:#000"></span><span class="bottom" style="--p-bottom:#5E5CE6"></span></span><span class="name">Halloween</span></button>
            <button class="theme-tile" data-theme-opt="light"><span class="preview"><span class="top" style="--p-top:#F2F2F7"></span><span class="bottom" style="--p-bottom:#2F7D5B"></span></span><span class="name">Light</span></button>
          </div>

          <div class="section-label">Font</div>
          <div class="seg" role="group" aria-label="Font">
            <button data-font-opt="" class="is-selected">System</button>
            <button data-font-opt="inter">Inter</button>
            <button data-font-opt="space-grotesk">Grotesk</button>
            <button data-font-opt="lora">Lora</button>
          </div>
          <p class="timestamp">The quick brown fox — 1,824 kcal</p>
        </section>

        <section class="card span-12">
          <div class="section-label" style="margin-top:0">Arrow centering check</div>
          <button class="btn btn-primary" id="centeringCheck">Verify arrow centering</button>
          <p class="timestamp" id="centeringOut">Checks |glyph center - button center| <= 0.5px in the current state. Toggle the menu to test both states.</p>
        </section>
      </main>
    </div>
  </div>

  <script src="app.js?v=7"></script>
</body>
</html>
```
