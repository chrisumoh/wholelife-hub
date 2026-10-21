# Whole Life Hub

A health and fitness web app: meal and snack logging, workouts, health metrics, a personal coach, food-culture meal plans and household profiles. Current build: **Update 8.3 (Dev Testing), build 8.3**.

## What's in this repository

| Path | What it is |
| --- | --- |
| `index.html` | The whole app in one file (markup, styles, scripts). Open it in a browser to run it. |
| `CHANGELOG.md` | Every build: the problem, the change, where in the code, how to test. |
| `docs/VERSIONING.md` | How version numbers work (8.1, 8.1.1 …). |
| `docs/DATABASE.md` | The Supabase tables, security rules and photo storage. |
| `supabase/migrations/` | The SQL that built the database, in the order it was applied. |
| `img/` | Images the app loads on demand: the three coach portraits and the home-screen icon. |
| `.github/` | Bug-report and pull-request templates for testers, and the `Tests` workflow. |
| `tests/` | Browser tests (`tests/browser/`, run with `node tests/browser/run-all.mjs`), fast repo checks (`node tests/check-repo.mjs`), sync recovery checks (`node --test tests/sync-recovery.cjs`) and the SQL isolation test. The phone performance measurement is `node tests/perf/measure.mjs` (see `docs/PERFORMANCE.md`). |

## Run it locally

Open `index.html` in a browser. For camera and microphone features, serve it over `http://localhost` instead of opening the file directly:

```bash
npx serve .        # or: python3 -m http.server 8080
```

## Deploy

The app is a static page, so any static host works.

- **Vercel:** New Project, import this repository, framework "Other", no build command, output directory `.`.
- **Netlify:** Add new site, import this repository, leave build command empty, publish directory `.`.
- **Cloudflare Pages:** Create project, connect this repository, no build command, output directory `/`.

Every push to `main` then redeploys automatically, and every pull request gets its own preview link for testers.

## Backend (Supabase)

Project **Whole Life Hub** (`https://zemxqbinpehkrkyvzlue.supabase.co`, region us-west-2). Tables, security rules and storage are described in [docs/DATABASE.md](docs/DATABASE.md).

**Status:** since build 8.1.11 the app signs in with Supabase Auth and saves meals to your account; since 8.2.4 it also saves the basics of each profile, so a second device shows your profiles and meals. Snacks, drinks, workouts, weigh-ins, vitals, plans and photos still save only in the browser. What goes where is in [docs/DATABASE.md](docs/DATABASE.md).

**Keys:** the frontend may only ever use the project URL and the *publishable / anon* key (Supabase dashboard › Project Settings › API). Never commit the *service_role* key or any `.env` file; `.gitignore` already blocks `.env`. Row Level Security is what keeps each account's data private, so every new table needs RLS and a policy before the app uses it.

## Working on it

1. Branch from `main` (`feature/meals-sync`, `fix/header-overlap`).
2. Make the change in `index.html`; add an entry to the in-app change log (`CHANGELOG` array near the top of the developer-log script) with the next version number, then regenerate or edit `CHANGELOG.md`.
3. Open a pull request using the template. The `Tests` workflow runs on it; a tester checks the preview link.
4. Merge to `main`, then tag the release: `git tag v8.1.9 && git push --tags`.

**Rule:** `main` is the live app. Nobody publishes a copy that didn't come from the current `main`. In the app, Settings › Data & about › Diagnostics shows which build you're looking at.

## For testers

In the browser console run `WLH.help()`. On a phone use Settings › Data & about › Diagnostics, and attach **Copy log for a bug report** to every issue.

