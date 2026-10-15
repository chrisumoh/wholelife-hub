# Whole Life for iOS (SwiftUI preview)

A native SwiftUI recreation of the Whole Life web app, so the look can be judged on an iPhone. The web app (`index.html`) and `supabase/` are untouched.

## Run it
1. Install Xcode 16 or newer from the Mac App Store.
2. Open `ios/WholeLife.xcodeproj` (double-click it).
3. Pick an iPhone simulator at the top (for example "iPhone 16") and press Play (Cmd+R).

Needs iOS 17 or newer.

## What is in it
- **Menu tab**: the web sidebar, with the same gradient icon tiles and groups (Summary, Log, Plan, Progress, Go Premium, Settings, Legal). Legal pages open on the website so there is one copy of the text.
- **Summary**: profile strip with streak, the three rings (Move, Exercise, Hydration), pinned cards, 7-day trends, highlights.
- **Meals**: log a meal from the real food catalog (246 dishes, West African first) with portions, day navigation, 7-day chart with target line, weight log.
- **Snacks**: 34 real snacks, region filter, one-tap log.
- **Workouts**: weekly goal ring, 22 activities in groups, minutes and calories (estimated with the web app's MET values), history.
- **Recipes, Food culture**: full recipe pages (ingredients, steps, other ways, lighter and higher-protein versions, serve with, meal prep), filters, a daily menu from your region.
- **Coach**: three coach styles, advice written from your logged numbers, a weekly plan with the web app's exercise tables.
- **Health data**: every metric with a chart, history, add-a-reading form and the web app's "About" text.
- **Achievements**, **Premium** feature list, **Settings** (units, targets, light/dark, accent color, coach).

## Not in this preview
Sign-in and Supabase sync, photos, passcode, onboarding, Apple Health import, the household challenge and monthly challenge, and the premium tools themselves. Everything you log is kept on the phone only. The first launch loads a week of sample data (Settings can reload it or clear it).

The catalog in `WholeLife/Resources/catalog.json` was generated from `DISHES`, `SNACKS`, `PREMIUM_FEATURES`, the exercise tables and the metric notes in `index.html`. Food lists are text only, as in the web app.
