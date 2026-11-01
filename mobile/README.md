# WholeLife Hub Mobile: Android-first Expo prototype

The web app in the repository root is a single-file HTML/CSS/JavaScript application (not React or Next.js). **Do not replace it or embed it in a WebView.**

This directory is a self-contained Expo (SDK 58, Expo Router) project. Every card is a **static placeholder**. There is no sign-in, health logging, sync or Supabase connection, and no credentials of any kind belong here. Never put a `service_role` key in client code.

## Layout

```
mobile/
  app.json, package.json, package-lock.json, tsconfig.json
  assets/                 app icon (copied from img/icon-512.png)
  src/app/                Expo Router routes (_layout.tsx, (tabs)/…)
  src/components/Screen   shared Screen and Card, imported as ../../components/Screen from src/app/(tabs)
```

## Run it

1. Install Node.js 22 (the same version CI uses).
2. `cd mobile && npm ci` (always install from the committed lockfile).
3. `npm run typecheck` checks the TypeScript.
4. `npm run bundle:android` builds the Android JavaScript bundle (`dist/`, git-ignored).
5. `npm start`, then open it with Expo Go or an Android emulator/device. This step needs a device and has not been done for this branch.

## Checks and what they prove

CI (job "Mobile (Android prototype)" in `.github/workflows/tests.yml`) runs `npm ci`, `npm run typecheck` and `npm run bundle:android`. That proves the code type-checks and bundles. It does **not** prove how the screens look or behave on a phone.

Not yet tested on an emulator or device: safe-area insets (status bar, gesture bar), small screens, large system font size, TalkBack and tab navigation. The code uses safe-area insets, scalable text, system-sized tab bar and accessibility labels, but that is unverified on hardware.

## Tabs

Home, Log, Progress and Settings, each with placeholder cards and a visible "Prototype" banner.

## Next steps (separate PRs)

Secure Supabase Auth, then a deliberate sync plan based on docs/DATABASE.md, respecting RLS and the privacy of health and household data.
