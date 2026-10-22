# CSS implementation notes

Historical explanations moved from inline styles in build 8.2.23 to reduce the app download. These are archived notes, not new instructions; later style rules may supersede them. Search index.html for the numbered CSS_NOTES label to find each location. No declarations or rule order changed.

## 1

```css
/* =================== v9.0: APPLE HEALTH-STYLE FLAT DESIGN SYSTEM ===================
     Site-wide restyle (redesign prompt, Sep 2026). Values below match the reference
     screenshots: pure black canvas / #1C1C1E cards in dark, #F2F2F7 / #FFFFFF in light.
     Liquid Glass is retired everywhere except the compact sticky header and the tab bar
     (see --chrome-glass below) — every other surface reads var(--surface) flat, no blur. */
```

## 2

```css
/* v9.0: a large legacy "Panels/Controls" ruleset further down the cascade still re-applies
     var(--glass*)/var(--blur) backgrounds, borders and shadows to cards/buttons/chips/the
     side menu etc. (a third instance of the same class of bug fixed in the token block and
     in the z-index fix: a later cascade rule silently overriding an earlier flat one).
     --glass/--glass-strong/--blur/--glass-rim/--glass-shadow already resolve to flat/none, so
     those re-applications repaint the same flat value or are dropped as invalid (a
     none-only box-shadow list) — but --glass-brd previously equalled --line, a *visible*
     hairline color, so every one of those rules was still drawing a real 1px border across
     otherwise-flat Apple Health surfaces. Making it transparent here neutralizes every one of
     those ~15 border declarations in a single place; the seasonal accent borders that also
     read --glass-brd (color-mix with a season hue) are untouched, since mixing with
     transparent still yields a visible tinted line. */
```

## 3

```css
/* v9.1 TASK 1: the one "selected" language for every picker card/row/chip in the app --
     a soft accent tint plus a single 1px hairline, replacing the thick 2-3px accent
     box-shadow rings (stacked on top of an already-accent-colored border) that read as a
     messy double outline. color-mix keeps both relative to whatever --accent the person has
     chosen, light or dark. --sel-tick-size is the small filled check badge's diameter. */
```

## 4

```css
/* v9.1 TASK 4: SidebarIcon gradient tiles. One fixed brand palette per main destination,
     as custom properties so a future theme could retune any pair -- but of this app's four
     themes (Forest/Ocean/Sunset/Midnight) none calls for a different sidebar-icon palette
     the way the brief's "Halloween" example would (this app has no Halloween theme), so a
     single global set below is the correct, complete implementation of "retunable per
     theme" today. Premium feature rows reuse the existing --cat-* pairs (PREM_GRAD_PAIRS in
     app24.js) instead of a new token, since those are already theme-aware per item. */
```

## 5

```css
/* Phase 6 TASK 6.7: group-family pairs for premium features once they're merged into their
     topical group instead of one separate "Premium" cluster. INSIGHTS and ACCOUNT reuse the
     Health/Settings pairs above verbatim -- the doc specs them as the same blue-to-indigo and
     neutral-gray already in use, so a second identical token would just be a second name for
     the same two colors. */
```

## 6

```css
/* v9.0 fix: this base block is the LIGHT default (see --ground/--surface above), exactly
     like every other token here -- --cat-* must follow that same convention (light-safe hex
     by default, re-asserted as the vivid dark-native hex inside every dark-ish block below,
     the same way --gold already does just below), or "auto" mode on a light system would
     paint category colors from the dark-native palette straight onto a white background and
     fail the 4.5:1 body/label contrast this whole deepened-light-variant system exists for.
     This mirrors the legacy --c-activity/--c-heart/--c-sleep/--c-nutrition/--c-food/--c-water/
     --c-coach tokens further down (used by mColor()/CATS/aurora/etc. site-wide), which are
     now aliased straight to --cat-* so there is exactly one place these hues are chosen. */
```

## 7

```css
/* v9.1 TASK 1: keyboard-only focus ring. :focus-visible already excludes mouse/touch taps in
   every modern engine, so the per-element rules below (same treatment, kept local to each
   component for specificity) never show a ring after a click -- only after Tab. Softened to
   60% accent per the cleanup spec, was solid 100%. */
```

## 8

```css
/* v9.1 TASK 3: persistent sidebar widened 240px -> 280px, and its breakpoint moved from 900px
   to 1024px (updated in lockstep below and in the matching matchMedia("(max-width:...)")
   calls in app2.js/app17.js) so "drawer below 1024px, persistent rail at 1024px+" matches the
   cleanup brief exactly -- the mobile drawer itself was already 280px (min(280px,86vw)). */
```

## 9

```css
/* The explicit .navgrp-items{display:flex} above would otherwise beat the [hidden] attribute's
   own UA-stylesheet rule (author styles always outrank the browser default), silently
   un-hiding every "collapsed" group. State this rule needs, so collapsed groups actually
   collapse instead of just showing a rotated chevron over a still-expanded list. */
```

## 10

```css
/* v9.1 TASK 3: sidebar rows -- 40px tall, 8px radius, 12px horizontal padding, 10px icon/label
   gap, 15px/500 label. Hover/active use a flat neutral tint rather than the accent-soft wash
   this had before, so the accent stays reserved for primary actions/links/the icon tile itself
   (Task 4) instead of tinting the whole row. */
```

## 11

```css
/* Master prompt STRICT RULE 10 supersedes the old v9.1 TASK 3 reading-width choice below: a
   720px column was deliberate then (most pages read as a centered column, Summary/Health kept
   960px for their charts and stat grids), but the new brief calls that wasted space and asks
   for it gone everywhere except long-form text inside its own card (legal pages, recipe body,
   coach chat bubbles -- those still cap at 68ch where they're rendered, unrelated to this
   page-level container). Every route now gets the same 960px a data-dense page already had;
   the full Phase 6.3 12-column grid (per-card column spans) is real further work this pass
   didn't reach -- see the Phase 6 changelog. */
```

## 12

```css
/* Bug fix: one z-index tier, defined once, for the side menu vs. the rest of the page.
   Any fixed/sticky element that is part of the main page (header card, floating action
   buttons) must declare its z-index using var(--z-chrome) or lower, so it can never again
   render above the menu's scrim or panel. (--z-chrome/--z-scrim/--z-menu themselves are
   defined once, down in the "v10: HEADER, MENU TOGGLE" block, alongside the rest of that
   stacking scale -- a second, now-removed :root rule here used to redeclare them with a
   different number range; being later in the file it silently won, so the values below had
   no effect, but two definitions of the same tier is exactly the kind of thing that bites
   later, so only the real one remains.) */
```

## 13

```css
/* v9.0: the header used to be one floating glass card (.top), always in view, holding the
   date, the hamburger and both quick actions. Health's Summary instead starts with a large,
   plain title (.page-head) that scrolls away with the page, and only shows a compact
   translucent bar (.compact-head) once the title has scrolled out of view -- see
   initHeadCollapse() in app2.js, which toggles .compact-head's "show" class from an
   IntersectionObserver on .head-sentinel. .compact-head is page chrome exactly like .top
   was, so it keeps the same sticky position, var(--z-chrome) tier and menu-open safety
   behaviour (see the .app.menu-on rule further down) -- nothing about the z-index bug fix
   changes here, only which element carries it. */
```

## 14

```css
/* v9.1 TASK 3: buttons -- primary solid accent, secondary (the unlabelled default) surface-
   toned with no border, tertiary (.ghost) text-only, all >=40px tall, radius 10px, weight 600.
   Secondary uses --raise rather than a literal border-less --surface, since most buttons sit
   inside a --surface card and a truly borderless --surface button would be invisible against
   it -- --raise gives the "no border" look the spec asks for while staying visible anywhere
   it's dropped. .danger drops its old colored-border look for the same flat, borderless
   language (tinted background instead), so no button in the app still relies on a border to
   read as a distinct state. */
```

## 15

```css
/* Master final check fix: a nested .tiny.muted count (e.g. "25 dishes") was falling back to
   the flat --muted gray instead of the tag's own already-tuned tone color, so it read at
   3.4-3.6:1 on the tinted good/warn/gold backgrounds above (axe: color-contrast, needs 4.5:1).
   Inheriting the parent .tag's color reuses that already-passing combination everywhere. */
```

## 16

```css
/* v9.1 TASK 2: accent swatches shrink to 28px in a single scrollable row (reuses the .tabs
   mask-image edge-fade mechanism -- see initEdgeFades()). Selected state drops the old
   scale-up + neutral border for a 2px surface-color inner ring (an iOS-style "target") plus a
   small white check glyph, no outer outline. */
```

## 17

```css
/* v9.1 TASK 2: Display mode is now a real segmented control -- one continuous 36px-tall bar,
   4 equal segments, the active one getting a plain surface-color highlight (no border, no
   outline, no ring). This replaced an earlier "4 pill buttons in a row" compaction, which was
   itself a fix for the original "4 full-height 2x2 cards" bloat -- each pass got closer to
   what the cleanup brief specifically asks for: a true segmented control, not a row of chips. */
```

## 18

```css
/* v9.1 TASK 4: the sidebar's icon tile -- one rounded-square, 30px, diagonal two-tone
   gradient (color set by whichever --si-a/--si-b pair the row's inline style points at),
   a subtle inner top highlight instead of any outer shadow, and a plain 18px white glyph.
   Every nav-style row (main rail links, premium feature rows, the Premium upsell/what's-new
   rows) wraps its icon in this one span, so the same component appears everywhere a
   destination is listed. Size never changes on hover/active -- only a scale transform on
   press, which doesn't affect layout. */
```

## 19

```css
/* v9.0: these are the pre-existing category colors that mColor()/CATS/aurora/etc. actually
   read site-wide -- Task 1's exact Apple Health hues live on --cat-* above, so the ones this
   spec names are aliased straight there (one definition, not two hue systems drifting apart);
   --resp/--body/--snack aren't in that spec, so they keep their own original hex, dark and
   light, unchanged. */
```

## 20

```css
/* v9.1 TASK 4: :not(.si-tile) -- the label span should grow to fill the row, but .si-tile is
   also a bare <span> (it carries no extra class of its own to hang a selector off), so this
   rule was stretching the 30px icon tile out to fill the row's remaining width before this
   exclusion was added. */
```

## 21

```css
/* v11.0 TASK 2: the trailing-chevron badge on the greeting-card avatar was removed (it read as
   a stray disclosure arrow with no dropdown behind it). The avatar itself stays the whole tap
   target -- .ava-link already wraps it and already navigates to Settings, so nothing about the
   navigation changes, only this decorative badge is gone. */
```

## 22

```css
/* Chart draw-in (Task 4): each bar scales up from its own baseline once initSparks()
   (app6.js) adds .drawn, via the same motionOK()-gated IntersectionObserver pattern as the
   activity rings. Reduced motion never applies the hidden state below, so a bar is always
   fully drawn there -- nothing to reverse, nothing to skip. */
```

## 23

```css
/* v9.0 Task 4: the line-chart type (lineChart() in app6.js) draws in differently from the bar
   charts above -- the path strokes on with pathLength="1" so stroke-dasharray/dashoffset are
   unit-independent of the path's real length, then the point dots pop in just after, once the
   line has finished. Same .chart-svg marker, same initSparks() gate -- only how .drawn animates
   this element differs. */
```

## 24

```css
/* v9.1 TASK 3/5: same dead-glass-token pattern as the Controls block above -- this was hiding
   the sidebar's real var(--line) hairline (set in .side's base rule) behind a transparent
   override and adding a decorative 30px drop-shadow bleeding past its edge. Deleted; the base
   rule's hairline already does the job with no shadow. */
```

## 25

```css
/* Controls
   v9.1 TASK 3/5: this whole block used to re-skin buttons/chips/segments for the pre-v9.0
   "Liquid Glass" look. The v9.0 flat redesign aliased --glass-strong/--glass-brd/--glass-rim/
   --blur to flat/transparent/none so most of it became a no-op, but three real bugs survived
   that aliasing and were live on every page: a hardcoded drop-shadow under every button, a
   gradient + inset glow on every primary button and every selected chip (the exact "gradient
   reserved for the Premium screen only" and "no decorative shadows/glows" rules this cleanup
   pass calls for), and --glass-brd resolving to transparent, which silently overrode chips'
   and segmented controls' intentional 1px var(--line2) hairline (set in their base rules
   above) with an invisible one. Removing the block restores those intended hairlines and
   drops the shadow/gradient leaks; the new flat .btn/.btn.primary rules above already cover
   what this was otherwise trying to do. */
```

## 26

```css
/* v9.1 TASK 3/5: another dead-glass leftover, and unlike the .btn/.chip/.seg ones above this
   one wasn't even neutralized by the v9.0 token aliasing -- backdrop-filter:blur(8px) is a
   literal hardcoded value, not var(--blur), so every text input/select/textarea in the app has
   been rendering with a real background blur this whole time despite "Liquid Glass retired
   everywhere except the compact header and tab bar" being the stated v9.0 rule. Deleted; the
   new resting-state rule above already sets the fill and border this was trying to override. */
```

## 27

```css
/* Master final check fix: in light/system scheme, --c-coach and --c-activity (used here via
   --cc) measured 4.25:1 and 4.33:1 on this card's --raise background at this weight/size —
   just under the 4.5:1 axe requires. Dark and OLED already use their own brighter --cat-*
   values against a dark card and were not flagged, so this nudges only the light scheme,
   darkening each color by the same small amount that reaches 4.5:1+ without changing the hue. */
```

## 28

```css
/* Master final check fix: this de-emphasis opacity blends the tag's already-tuned tone color
   toward its own soft background, which reads fine in dark/OLED (their tones have plenty of
   contrast margin) but pushed light scheme's good/warn/gold text below 4.5:1 (axe:
   color-contrast). The "25 dishes" count already reads as secondary at 12px next to the bold
   culture name, so light scheme keeps full opacity rather than compounding a second fade. */
```

## 29

```css
/* v12.0: Dynamic Type-style text scaling. Every font-size rule above and below is wrapped in
     calc(value * var(--text-scale,1)), so one multiplier re-scales the whole app's text while
     preserving each rule's original relative size -- the same idea as Apple's text styles all
     scaling together under one Larger Text setting. 1 = the existing "Large" default; see the
     TEXT_SIZES step table in app2.js for the other 11 steps (xSmall..XXXLarge, then the AX1..AX5
     "Larger Accessibility Sizes" range), which mirror Apple's own named size categories and the
     Body text style's real point ratios at each one. */
```

## 30

```css
/* v12.0: Dynamic Type text-size control. Same live-slider shape as .oprow above, but flanked
   by small/large "Aa" glyphs the way Apple's own Settings > Text Size slider is, plus a
   preview line below that re-renders at the live scale on every drag so the effect is seen,
   not just described. */
```

## 31

```css
/* =================== v7.6: SCROLL, THE ARROW, DRINKS, AND MORE SPRING ===================
   1. With the drawer open the page underneath must hold still and the drawer must scroll
      on its own. 2. A Google-style arrow collapses and expands the menu. 3. Drinks fold
      into Meals. 4. Interactions get a consistent spring. */
```

## 32

```css
/* Bug (8.1.4, reverted in 8.1.5): a fix attempt here added transform:translateZ(0) to this rule
   to try to stop iOS Safari from blanking the screen when the drawer opened after a scroll. That
   broke something worse: per spec, ANY transform (even translateZ(0)) on an element becomes a new
   containing block for its position:fixed descendants -- and .side and .scrim are both fixed-
   position descendants of body. So the moment body got a transform, the drawer stopped being
   positioned against the real viewport and started being positioned against body's own (shifted,
   top:-Ypx) box instead, i.e. it visibly scrolled along with the page exactly as far as the page
   had scrolled -- reported back as "the side menu also scrolls with it ... gets lost at the top".
   Removed. Do not add transform/filter/backdrop-filter/will-change:transform/contain to body (or
   any other ancestor of .side/.scrim) while menu-open -- it will silently break their fixed
   positioning the same way, independent of whatever else it was meant to fix. */
```

## 33

```css
/* =================== v7.8: LEGAL PAGES, FOOTER, BUTTONS, CALMER MOTION ===================
   Action buttons move from a full pill to a 12px rounded rectangle; chips, tags and
   segmented controls keep the capsule shape, which is where it reads as deliberate rather
   than as a template. Entrance motion is cut back to the shell only, because this app is
   opened several times a day to log a meal and content should be there on arrival. */
```

## 34

```css
/* --- Task 6: the real cause of the cut-off profile ---------------------------------
   The drawer was one scrolling column, so on a short screen (a 640px Android, or any
   phone in landscape) the nav pushed the profile block past the bottom edge and it was
   left half-drawn with nothing to show it could be scrolled to. It was not the slide
   distance: the panel always travelled its full width. The fix is to stop the drawer
   scrolling as a whole and let the nav be the scrolling part, so the profile is pinned
   in view at every height. */
```

## 35

```css
/* 100vh is the wrong unit for a sticky panel: on a phone it includes the browser chrome,
   and inside an embed it can exceed what is actually on screen, which drops the bottom of
   the sidebar (the profile block) below the fold. dvh tracks the real visible height, with
   vh left as the fallback for anything that doesn't support it. */
```

## 36

```css
/* --- Settings tabs: text only, one row, nothing outside the container ---------------
   The selected tab used to carry its own white pill with a shadow, which read as spilling
   past the container's rounded edge, and the row wrapped onto a second line once there
   were seven tabs. The pill is gone; weight and size carry the selection instead. */
```

## 37

```css
/* Bug fix: this used to be a fixed-color gradient painted over the container edge, sized to
   a hardcoded --raise background, and it only ever turned on via a ".more" class that no JS
   in the app ever added -- the fade-hint was fully-styled dead CSS, so a long tab row (eight
   tabs in Settings) hard-clipped its last label at the container edge with no cue it could be
   scrolled to. Fixed with a mask-image on the scrollable row itself: it fades the REAL content
   to transparent (so it looks right on any background, not just --raise) and is driven by two
   classes, .fade-l/.fade-r, that initEdgeFades() (app7.js, run after every render from initFx())
   toggles from the row's actual scroll position -- both edges, only when there's really more
   to scroll to. */
```

## 38

```css
/* Every nav row is a real tap target at every width -- 40px per the v9.1 Task 3 row spec,
   which already clears the ~44px fingertip guideline once the row's own vertical padding is
   counted from the outside (border-box), so no extra override is needed here beyond the rail
   (icon-only, collapsed) variant, which stays its own larger square tap target. */
```

## 39

```css
/* Open, the button still morphs to a close arrow, but the drawer itself (var(--z-menu)) now
   always renders above the header (var(--z-chrome)), same as every other piece of page chrome,
   so it can never again cover or clip the open menu. Tapping the scrim closes the menu.
   Belt-and-suspenders on top of the z-index fix: the header also fades out and, once the
   fade finishes, is fully hidden (visibility, not display, so nothing reflows) while the menu
   is open, so zero pixels of it can show through the scrim or be tapped by mistake. Opening
   reverses this immediately so the header is visible again the instant it starts fading in. */
```

## 40

```css
/* v9.0: .top is retired (see .compact-head above), but it's still the only piece of page
     chrome that floats over the content on mobile, so the same belt-and-suspenders fix
     applies to it verbatim: fade out AND go fully invisible (not just dimmed) while the
     drawer is open, so zero pixels of it can show through the scrim or be tapped by mistake.
     .app.menu-on .compact-head (3 classes) always outranks .compact-head.show (2 classes),
     so this wins over the scroll-collapse "show" state with no !important needed. */
```

## 41

```css
/* Bug fix (Settings menu layering): the site-wide "UI opacity" setting (section 11 above,
   .app .card/.mcard/.side/... ) intentionally tints ordinary surface cards so the pastel
   scene shows through -- correct for cards sitting in the page flow. But on a phone .side
   is not a card, it's a full-height modal drawer stacked over a dimmed copy of the page
   (the scrim). Inheriting that same translucency let the dimmed page title/breadcrumbs
   behind it show through and visually collide with the drawer's own nav labels. The drawer
   must always be fully legible regardless of the opacity slider, so pin it back to a solid
   surface at the width where it becomes an overlay; the persistent desktop sidebar (which
   never covers dimmed content) keeps the glass tint untouched. */
```

## 42

```css
/* =================== v8.1: THEME SYSTEM (Task 7) ===================
   One token set per theme on a data-theme attribute. No component style is forked: every
   card, button and chip keeps reading the same variables it always did, so adding a theme
   later is one block here and one row in the list. Forest is the existing palette and is
   deliberately left untouched. Every value below was checked to 4.5:1 against both the card
   surface and the raised panel, in each theme's light and dark variant. */
```

## 43

```css
/* =================== v8.4: PREMIUM STORE SCREEN (bug doc: Premium screen, Telegram-styled,
   original assets only) ===================
   Every graphic here is built from this file's own gradients, the existing icon registry (I)
   and plain shapes -- nothing is copied, traced or extracted from any third-party app. The one
   deliberate exception to the site's no-gradient rule lives entirely in this section: the CTA
   pill and the small "Premium" active badge, both reserved for Premium surfaces only. */
```

## 44

```css
/* v9.1: the full text pill above squeezed sidebar labels ("Grocer...", "Pantry...") in the
   240px column, and a follow-up small gold dot per row was tried as a fix -- removed again at
   the user's request. The "PREMIUM" section heading plus the crown icon already say what this
   group is, so an unlocked row now matches every other nav row exactly, no per-row badge. */
```

## 45

```css
/* Bug-hardening: with a checkmark, a label+sub, a discount pill AND a price all on one row,
   four fixed-width things easily add up to more than a phone's width -- exactly the kind of
   hard-to-notice overflow the clipped-text bug report was about. flex-wrap plus grouping the
   pill+price as one unit (.ps-meta) means that unit drops to its own line, right-aligned,
   instead of squeezing or clipping when the row is narrow. */
```

## 46

```css
/* Master final check fix: this pill's text was hardcoded near-black, which only reads (3.44:1)
   against light scheme's dark-brown --gold background; dark/OLED's --gold is bright yellow,
   where near-black text was already correct. --gold-ink flips with --gold per scheme (added
   above, next to each --gold definition) the same way --accent-ink already does for --accent. */
```

## 47

```css
/* v11.0 TASK 1: these rows are <a> elements with no text-decoration override, so they picked up
   the browser's default anchor underline on their title text -- not a global body-link rule,
   just a missing override on this one component. Fixed at the actual cause (this rule), with
   focus-visible given its own accent outline instead so keyboard users don't lose the cue. */
```

## 48

```css
/* PHASE 1 TASK 1.2 fix: .action-row is a bare <a class="card action-row">text + icon</a> --
   it never overrode .card's own display:flex;flex-direction:column, so its text and chevron
   were stacking vertically inside the card's fixed content height, and .card's overflow:hidden
   silently clipped the second "line" instead of showing it -- this is the "Show All Trends"
   clip on Summary. Row layout (like every other single-line card link) fixes it at the cause. */
```

## 49

```css
/* v9.1 TASK 4: premium rows now sit on a gradient .si-tile like every other nav row, so the
   glyph itself is always flat white -- never the muted/gold/accent state tint above. The
   extra "html" type selector (rather than another class) is what wins the specificity tie
   against the three state rules just above: same class count, one more type selector. */
```

## 50

```css
/* =================== v10.0 FRESH DIRECTION (Oct 2026) ===================
   A visual-identity pass on top of the existing Apple Health-style flat system, scoped to
   four areas (Home/Dashboard, Nutrition+Snacks+Culture, Workouts+Coach, Onboarding) per the
   Apple HIG + mobile-concept art-direction review. Additive only: no existing class is
   renamed, no markup/JS/behavior changes, nothing here touches layout, routes or data --
   every rule below is a new background/accent/texture treatment layered onto hooks that
   already exist (.rings-card, .dish, .coachcard, .coach-says, .ob). --accent stays exactly
   what the user picked in Settings; the brand gradient below is a second, fixed identity
   layer (the same teal/green/lime stops as the WholeLife logo mark) used only for texture
   and decorative wash, never for text color, so it can't fight the user's accent choice or
   regress contrast. HIG materials guidance: Liquid Glass stays retired everywhere except the
   compact sticky header (see the v9.0 token comment above) -- nothing below is blur/glass,
   it's flat color plus a very low-opacity grain, which HIG's materials guidance treats as
   ordinary surface texture, not a material. */
```

## 51

```css
/* Home: the daily-glance hero gets a quiet brand wash (grain + two soft radial tints in the
   logo's own teal/lime) instead of a flat surface panel -- the single highest-traffic screen,
   so it's the one place the new identity layer is easiest to feel. Still just background
   layers on the card's own box, clipped to its existing border-radius automatically. */
```

## 52

```css
/* Nutrition, Snacks, Food Culture and Recipes all render their picks as .dish cards -- a
   warm terracotta/gold top edge (the existing --gold token plus the new --terracotta,
   decorative only) ties that whole food-forward identity together without touching the
   system --accent used for buttons/links everywhere else. */
```

## 53

```css
/* Onboarding / welcome: the tagline's emphasised word now carries the actual brand gradient
   (the same three stops as the logo mark) via a text clip, with --gold kept as the literal
   color fallback for browsers without background-clip:text support -- never a contrast risk
   since it only ever sits on the large, bold tagline, not body copy. The loading-screen logo
   gets a soft brand-colored glow instead of sitting flat on the panel. */
```

## 54

```css
/* Shared centered popover: the Premium feature list (TASK 1), the accent color picker (TASK 4)
   and the typeface picker (TASK 5) all open the same dialog shell instead of three near-copies
   of the same focus-trap/Escape/backdrop plumbing. It reads --glass/--glass-strong/--blur, the
   same tokens every other card on the site now reads -- the v9.0 flat redesign aliased those to
   plain --surface/none, so this "glass surface... same as current cards" automatically matches
   today's flat look, and would pick blur back up on its own if that alias is ever restored. */
```

## 55

```css
/* Theme / seasonal chips (TASK 6): 148x40 compact chips. Themes already shrank from full-width
   banners to vertical tiles once (v9.1 TASK 2, see themePicker()) -- this reshapes that same
   tile into the horizontal two-dot chip asked for here, same per-theme colors, no new ones.
   Seasonal cards (still the pre-compaction vertical form) get the identical chip treatment,
   with their description text moved to aria-label/title since there's no room for a caption. */
```

## 56

```css
/* ===================== v10 WELCOME REDESIGN (Oct 2026) =====================
   The welcome screen is now the first thing a new user sees (it used to come after the coach
   picker) and it is full-bleed instead of a card over the pastel figures. Palette is taken from
   kente cloth: palm green ground, sun gold, coral and mint. The one memorable element is the
   three-part "whole" ring (Eat / Move / Recover) that draws itself in on load. Every animation
   below animates FROM a hidden state, so with reduced motion (which strips all animation) the
   page simply shows its finished state. */
```

## 57

```css
/* Over a background scene (Summary only) the header can't rely on the page's text colour: the
   Night sky scene is dark even in Light mode, which left a dark title, date, time and ☰ on a dark
   sky. The header's right cluster and the toggle now sit on frosted chips in the theme's surface
   colour, so their text keeps theme contrast over any scene, in Light, Dark and OLED. */
```

## 58

```css
/* =================== 8.1.20: LIQUID GLASS, CAUSTICS, BEAM BORDER, GLASS SLIDER ===================
   Approved exception to the flat rules in docs/CONTEXT.md (owner's request, Oct 2026): cards are
   frosted glass again. The Interface opacity slider (--ui-op) still sets how much surface colour
   sits in the glass, so lowering it makes every card more see-through. */
```

## 59

```css
/* =================== 8.2.6: DASHBOARD CARD, one flat Apple Health-style pattern (original code, Lucide and the app's own icons) ===================
   Supersedes the glass, caustic, sheen, beam, season-tint and aurora rules above for content cards and for the page behind them.
   Glass stays only on the floating top bar (.top), the tab bar (.tabs) and menus (.side, popovers). Rule is recorded in docs/CONTEXT.md.
   The two :not() filler selectors lift specificity above the per-theme token blocks, so every theme gets the same card and page colours. */
```

## 60

```css
/* =================== 8.2.7: WIDGET SIZES AND EDIT MODE ===================
   Small is half width (2 per row on phones, 4 from 700px up) and roughly square: icon, name, one value. Medium and Large are full width.
   Edit controls sit in the card's top row. The red minus, the S/M/L switch and the drag handle or arrows are all 44px targets. */
```

## 61

```css
/* =================== 8.2.8: DISH TILES AND FOOD CULTURE PAGE ===================
   Dish tiles (Food culture, Recipes, Today's menu) follow the flat card pattern: no border, glow, top bar or hover lift, 20px radius,
   16px padding, the slot as a sentence-case label in the Nutrition colour, the dish name 17px semibold, calories in gray. Text only.
   On the page a tile is a card; inside a card it is a slightly different gray tile (an inner card cannot share its parent's colour). */
```

## 62

```css
/* ---- 8.1.19 form controls, restyled to match BoardUI's look (approved exception, see docs/CONTEXT.md) ----
   One block, last in the sheet. Colors come from the existing tokens, so every scheme, accent and
   theme follows. Radii stay in the allowed set; the only shadows are the soft control shadows below. */
```

## 63

```css
/* v9.1 UI CLEANUP (Sep 2026): an 8px spacing grid, used going forward in place of ad-hoc
     paddings/margins (existing hand-tuned spacing is left as-is per "targeted edits only" —
     new and touched rules use these). */
```

## 64

```css
/* Shared selected-state check badge (Task 1 rule 2): 16px filled circle, white check, sits in
   a card/row/chip's top-right corner. Markup adds one <span class="sel-tick"> child; visibility
   is driven by whichever state class/attribute that component already uses to mark "selected". */
```

## 65

```css
/* v9.1 TASK 3: light mode gets a 1px near-black hairline at low opacity (cards otherwise read
   as one flat plane against the barely-different --ground); dark and OLED stay borderless,
   since --surface already separates clearly from --ground:#000 there. */
```

## 66

```css
/* v9.0: card header pattern (category label left, timestamp right) and the universal
   trailing chevron for every tappable row — used across Summary, meals, workouts, coach,
   recipes, achievements, settings. */
```

## 67

```css
/* v9.1 TASK 3: inputs -- 44px tall, radius 10px, no resting border (a --raise fill separates
   them from a same-color --surface card instead, same reasoning as the .btn secondary change
   above), a hairline appears only on focus-visible. */
```

## 68

```css
/* Master prompt STRICT RULE 10 also names this cap directly ("Appearance screen max content
   width 640px") as one of the two to remove; the section now uses the page's own (960px) wrap
   width instead of narrowing itself further. */
```

## 69

```css
/* Seasonal themes: a reskin of the same glass, plus one drifting motif. The picker itself moved
   to the 148x40 .season-chip rule further down this file (v11.0 TASK 6) -- .season-layer below
   is the drifting-motif background effect, unrelated to the picker UI, and stays as-is. */
```

## 70

```css
/* ===================== v7.5 TYPOGRAPHY =====================
   Anthropic Sans is Anthropic's own brand face with no public licence, so per the brief this
   uses the closest free equivalent: Plus Jakarta Sans, a warm humanist sans with the same
   slightly geometric feel. One family, one scale, everywhere.
   v8.6 update: "Plus Jakarta Sans" was never actually loaded anywhere (no @font-face, no
   network fetch), so it silently no-op'd to the browser default the whole time. Introducing
   --font-app as the single source of truth for the active typeface, defaulting to the
   Perplexity-style system stack per the font-picker spec, with --font/--display deriving
   from it so every existing rule that already reads var(--font)/var(--display) picks up
   font-switching for free. Six additional families are self-hosted below (no network
   requests, ever - see /fonts/LICENSES.txt) and swapped in via [data-font="x"] on <html>,
   mirroring the existing data-theme/data-scheme attribute pattern. */
```

## 71

```css
/* ---- v8.6 self-hosted font faces (all SIL OFL 1.1, see fonts/LICENSES.txt) ----
   font-display:swap avoids invisible-text FOUC: system stack shows instantly, swaps in
   once the woff2 loads. Only the 6 downloadable options get @font-face; "System" and
   "OpenDyslexic" (assumed already installed by users who need it, with a system fallback
   chain) never trigger a network-equivalent load path beyond the local file. */
```

## 72

```css
/* 8.2.22: collapsed rows share one 44px box on one centre line and one 6px gap, inside a group
   as well as between groups (items were 2px apart, group joins 6px, and the Premium button
   was 40px tall and 2px off centre). */
```

## 73

```css
/* ===================== v7.5 PASTEL LOCK SCENE (section 1) =====================
   Warm solid background, flat characters, spring entrances with a squash landing, and a
   gentle idle bounce on its own rhythm per character. Transform and opacity only. */
```

## 74

```css
/* Task 2: the "lingering shadow" was the browser's own tap highlight, a dark rounded box
   the platform paints over the element for a few hundred milliseconds after a touch. It was
   never in our CSS, which is why it had no obvious source. */
```

## 75

```css
/* Master final check fix: .faint.tiny inside this card measured 4.40:1 in light scheme against
   --raise, just under 4.5:1 (dark/OLED --faint is much lighter against a dark card and passes).
   Scoped to light scheme only, same reasoning as the .ci-col .eyebrow fix above. */
```

## 76

```css
/* v11.0 TASK 6: themes moved from the v9.1 vertical tile (.themecard/.th-sw, now retired) to
   the 148x40 horizontal chip in the shared .theme-chip rule further down this file -- same
   per-theme preview colors, just two side-by-side dots instead of a stacked two-tone bar. */
```

## 77

```css
/* v11.0 TASK 5: the font picker's 2-column card grid (.fonts/.fontcard, retired -- it's what
   clipped the sample pangram mid-card) moved to a single .font-trigger button opening the
   .pop-row list defined earlier in this file, with the sample line truncating cleanly there. */
```

## 78

```css
/* The row is a container, not a layout. It used to be a 3-column grid, which turned the
   drill-down panel into a fourth cell 84px wide jammed against the row's right edge. The
   columns live on .mi-head now, and the panel is a full-width sibling beneath it. */
```

## 79

```css
/* The whole sidebar used to be one scroller, so the brand scrolled away and a row could be
   sliced in half at the top edge — the "stray fragment". Now only the nav scrolls, between a
   fixed brand and a fixed footer. */
```

## 80

```css
/* Rail mode: icons only, never a truncated word. .si-tile is a <span> too (it carries no
   other class of its own), so it needs the same :not() exclusion as the label-span rules
   above it, or the collapsed rail loses its icons entirely along with the labels. */
```

## 81

```css
/* Arrival motion is keyed on .arrive, which app2.js puts on the one link whose route just
   became active. Keying it on [aria-current="page"] meant every render restarted the animation,
   because render() rebuilds the whole nav from innerHTML. */
```

## 82

```css
/* On a dark scheme the plain token pair is comfortably AA. On a light one it sits at 3.75:1, so
   the text is darkened there. This keys off data-scheme rather than --text, because the midnight
   theme keeps a light --text even in its light scheme and mixing toward it made things worse. */
```

## 83

```css
/* Fine, static film-grain: a 120x120 feTurbulence tile at very low final opacity (the
     opacity lives on the <rect>, not the layer, so it composites once -- no blend-mode
     surprises in dark mode). Decorative only, so no prefers-reduced-motion gate is needed:
     nothing here moves. */
```

## 84

```css
/* Workouts & Coach: the coach picker cards and chat bubble pick up the brand green instead
   of the generic accent hover, and the picker tiles get the same quiet grain as the home
   hero so the two "calm, premium" screens the HIG health/fitness bias asks for feel like one
   family. */
```

## 85

```css
/* Premium tab -> popup trigger in the sidebar (TASK 1): a plain "Premium" row, no "What's new"
   framing and no Beta pill, styled identically to every other nav row but a <button> instead of
   an <a> since it opens the popup rather than navigating. */
```

## 86

```css
/* A mesh-gradient border and glow that follows the pointer's direction and grows as it nears
   the card's edge. Same layers and maths as the React version; the card's own ::before/::after
   are already used by the app (the sheen), so the three layers are real child elements here. */
```

## 87

```css
/* 8.1.10 bug fix: the coach-advice footnote (.faint) measured 4.27:1 on the dark card, under WCAG AA 4.5:1;
   it only shows for some advice items, which is why earlier daytime sweeps missed it. */
```

## 88

```css
/* The wipe clips the top image rather than narrowing it: a narrowed box would squeeze the photo
   into the strip instead of revealing the left of a full-size one, and the two would not line up. */
```

## 89

```css
/* One timing system. Every signature motion uses only transform, opacity or stroke-dashoffset,
   moves at most two elements, and plays once — on hover, and once when its page is arrived at. */
```

## 90

```css
/* the toggle stays put and clickable above the open drawer: if the large header has scrolled
     away, the compact bar keeps just its toggle on screen while the rest of the bar stays hidden */
```

## 91

```css
/* The right cluster may never spill over the toggle: it shrinks inside its grid column, the
   time and bell keep their size, and a long title steps its font down to fit (fitHeadTitle). */
```

## 92

```css
/* v9.1 TASK 5 sweep: dropped a redundant per-button focus-visible override (currentColor,
   no radius-match) -- the global :focus-visible rule already covers every element site-wide. */
```

## 93

```css
/* StatusMark (React Bits), state read from [data-sm-status] on the mark's root -- a .status-mark
   span or a checklist row's label. Done/error colors come from the component config. */
```

## 94

```css
/* On a narrow phone "Good afternoon, Christopher" is longer than the strip, and an ellipsis
   in the middle of someone's own name reads as a bug. Let it size down and wrap instead. */
```

## 95

```css
/* The two ends sit on their own row under the dots. Squeezing them onto the dot row meant they
   wrapped to full-width lines of their own on a phone, which read as two stray words. */
```

## 96

```css
/* Phase 6 TASK 6.7: the group label is now a real disclosure button (collapsible, state
   remembered) instead of a static heading -- same look, so the regroup itself is invisible. */
```

## 97

```css
/* 8.1.6: Log / Plan / Progress are plain labels again (nothing collapses). Premium + Settings sit
   below a hairline so the account-ish rows read as separate from the daily ones. */
```

## 98

```css
/* Tap targets: nothing smaller than a fingertip. .nav a already carries its own 40px
     min-height/12px padding (v9.1 Task 3) so no mobile-only override is needed here anymore. */
```

## 99

```css
/* The print sheet is off-screen until the browser asks for pages. Nothing is captured as an
   image, so the text stays selectable and the reader's own font settings still apply. */
```

## 100

```css
/* The label takes the slack so every switch lines up in one column, whatever the description
   length. Without this each row sat at its own x and the set read as a ragged edge. */
```
