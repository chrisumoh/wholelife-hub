# Performance

How fast the app loads on a phone, what makes it slow, and what to do about it. Measured with `node tests/perf/measure.mjs` (headless Chrome, 390×844 at 3×, touch, throttled CPU and network, brotli like Vercel). Numbers are medians of 5 cold loads on build 8.2.2 (the table below); the effect of build 8.2.5 follows it.

## What was measured

| Metric | Desktop, no throttle | Mid-range phone: 4× CPU, Fast 4G | Low-end phone: 6× CPU, Slow 4G |
| --- | --- | --- | --- |
| First contentful paint | 508 ms | 3,708 ms | 12,304 ms |
| Largest contentful paint | 508 ms | 3,924 ms | 13,424 ms |
| Layout shift (CLS) | 0.000 | 0.000 | 0.001 |
| App ready (signed out, empty) | 493 ms | 3,698 ms | 12,300 ms |
| Total blocking time | 109 ms | 694 ms | 1,070 ms |
| Long tasks (over 50 ms) | 1 | 3 | 4 |
| Script time | 70 ms | 310 ms | 462 ms |
| Document transfer | 541 KB | 541 KB | 541 KB |
| Fonts transferred | 59 KB | 59 KB | 59 KB |

`index.html` is 1,890 KB raw, 541 KB with brotli, 622 KB with gzip. Fast 4G is the usual "mid-range phone" test (1.6 Mbps, 150 ms); Slow 4G (400 Kbps, 400 ms) is a weak signal.

With a year of logs (1,095 meals, 365 snacks, 183 workouts) on the mid-range profile the app is ready in 4.2 s. Opening a screen (hash change to the next two frames): Premium 109 ms, Snacks 191, Home 197, Settings 207, Culture 207, Coach 327, Meals 421, Recipes 476, Workouts 776. At normal speed the render itself is 25–60 ms; Workouts builds 1,249 DOM nodes (94 KB of markup), Recipes 1,783.

## What it means

- **The delay is download time, not script time.** At Fast 4G the 541 KB document takes about 2.7 s to arrive, and nothing paints until the page's scripts have arrived, so first paint is about 3.7 s. Script work adds only about 0.3 s. On a weak signal the same file takes about 11 s.
- **Layout is stable** (CLS 0) and the JS heap is small (2 MB at load). Those are not the problem.
- **Long lists cost the most once the app has data.** Workouts is slowest because it draws every workout.

## What is in the file

| Part | Raw | Gzip |
| --- | --- | --- |
| Main script | 1,385 KB | 469 KB |
| Of which the food catalog (DISHES, SNACKS, FOODC) | 359 KB | 102 KB |
| One style block (the main CSS) | 310 KB | 73 KB |
| Other scripts (developer log, tour, and so on) | 142 KB | about 52 KB |
| Four embedded images (3 coach photos, the home-screen icon) as base64 | 125 KB | about 92 KB (already compressed, so brotli can't shrink them) |

## After build 8.2.5 (recommendations 1 and 2 done)

Same test, same machine, medians of 5 cold loads.

| Metric | Mid-range phone before | Mid-range phone after | Low-end phone before | Low-end phone after |
| --- | --- | --- | --- | --- |
| First contentful paint | 3,708 ms | **264 ms** | 12,304 ms | **636 ms** |
| App ready (usable) | 3,698 ms | 2,920 ms | 12,300 ms | 10,088 ms |
| Largest contentful paint | 3,924 ms | 3,260 ms | 13,424 ms | 11,204 ms |
| Total blocking time | 694 ms | 417 ms | 1,070 ms | 708 ms |
| Document transfer (brotli) | 541 KB | 450 KB | 541 KB | 450 KB |

`index.html` is now 1,779 KB raw (was 1,890), 450 KB with brotli (was 541). A boot screen now paints from the first bytes, so something is on screen after a fraction of a second even on a weak signal; the app itself is usable about 0.8 s sooner on Fast 4G and 2.2 s sooner on Slow 4G because the download is 17% smaller. The download is still the main cost (450 KB takes about 2.3 s at 1.6 Mbps), which is why recommendations 3 and 4 and, later, a catalog split still matter.

## Recommendation

**Don't split the app into modules or add a build step.** That breaks the one-file design in CLAUDE.md and the payoff is smaller than four cheap changes. In order of payoff for effort:

1. **Show something on the first bytes (done in 8.2.5).** Put a small inline loading screen and its critical CSS at the top of `<body>`. First paint would move from about 3.7 s to a few hundred milliseconds on Fast 4G, though the app still needs the full download to become usable. Biggest perceived-speed gain, small change.
2. **Move the four embedded images to files (done in 8.2.5).** The three coach photos (93 KB as base64) are only shown on the coach screens, and the home-screen icon (30 KB) only matters when someone installs the app. As files in an `img/` folder (the app already serves `fonts/`) they leave the critical path and cut roughly 90 KB, about 17%, from the first download. The CSP already allows images from this site.
3. **Cap long lists.** Show the latest 30 workouts (and similar lists) with a "Show more" button. This is what makes Workouts take 776 ms with a year of data.
4. **Cache what rarely changes.** Vercel serves static files with revalidation on every visit by default (I could not read the live headers to confirm), and a changed `index.html` is downloaded in full. Font files never change, so `vercel.json` can mark `/fonts/*` as cached for a year. Moving the food catalog (102 KB gzip, changes seldom) into its own cached file would make repeat visits after a deploy about 19% lighter, at the cost of a second request on first load; worth doing only after 1 to 3.

Expected result of 1 and 2: first paint in about half a second on Fast 4G, and the full download about 17% smaller. 3 helps the screens that feel slow once someone has months of data.

## What this does not tell you

- **Real phones.** Nothing here measures GPU cost: backdrop blur, glass cards and animation can cost frames on an older iPhone that headless Chrome can't show. Run Safari's Web Inspector on a real phone, or Lighthouse from Chrome on Android, before judging smoothness.
- **Safari and Firefox.** Chrome only.
- **The supabase-js download.** The test replaces it with a fake, so about 130 KB from jsDelivr is not counted, and neither is a real sign-in.
- **Repeat visits and caching.** Every run is a cold load with the cache off.

Re-run `node tests/perf/measure.mjs` after any of the changes above and update the table.

## Release gate (8.2.11 onward)

For release-candidate builds, run `node tests/perf/measure.mjs` and record the medians in `docs/BUILD_PLAN.md`.

- Low-end phone (6× CPU, Slow 4G): **App ready must stay <= 11,000 ms**
- Low-end phone (6× CPU, Slow 4G): **First contentful paint must stay <= 1,000 ms** (boot-screen paint remains expected well before app-ready)

If either threshold is missed, treat it as a release blocker until fixed or explicitly waived by the owner in the build checklist.
