# WholeLife Hub Mobile — Android-first Expo prototype

The web app in the repository root is a single-file HTML/CSS/JavaScript application (not React or Next.js). **Do not replace it or embed it in a WebView.**

This directory contains the first native React Native screen prototype. It has no live health data, authentication, database connection, or production readiness yet.

## Set up on Windows

1. Install Node.js LTS and Android Studio (or use an Android device).
2. From the repository root, create the native project in a separate temporary directory:
   `npx create-expo-app@latest wholelife-native`
3. Copy this directory's `app/` and `components/` into the new project's route root (usually `src/app/` for routes and `components/` at project root). Replace the generated example routes, but **keep the Expo-generated package.json, configuration, assets, and dependencies**.
4. In the new project run `npx expo start`, then press `a` with Android Studio emulator running. If Expo Go does not support the project SDK, use an Android development build.
5. After validating on Android, move the generated Expo project into `mobile/` in a follow-up PR, keeping its generated lockfile and config.

## Prototype routes

- Home: daily overview and quick actions.
- Log: meal, workout, and metric entry entry points.
- Progress: trends overview placeholder.
- Settings: mobile-first preference navigation.

All cards are illustrative, not real tracked data. Follow-up: connect Supabase Auth securely and migrate browser-only data via a deliberate synchronization plan (see docs/DATABASE.md). Never put service_role keys in client code. Respect RLS and consider privacy/security of health and household profiles.

No changes to the website or database are part of this branch.
