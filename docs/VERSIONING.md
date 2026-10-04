# Versioning

| Situation | App shows | Logs show |
| --- | --- | --- |
| First build of a week | Update 8.1 (Dev Testing) | 8.1 |
| Next build, same week | Update 8.1 (Dev Testing) | 8.1.1 |
| Another one | Update 8.1 (Dev Testing) | 8.1.2 |
| First build of the next week | Update 8.2 (Dev Testing) | 8.2 |

- Weeks run Sunday to Saturday. Update 8.1 covers Sun 4 Oct – Sat 10 Oct 2026.
- The update number goes up 0.1 only when a build is made; a quiet week doesn't skip a number.
- The channel in brackets says how close a build is to real users: Dev Testing now, then Beta, then Release.
- Each change-log entry also names its **area** (Header, Speed, Sys Architecture …); the area never goes in the version number.
- Builds B3–B14 (2026-10-04) predate this scheme and belong to Update 8.0.
- Where it's set: `APP_VERSION` near the top of the developer-log script in `index.html` (`update`, `build`, `channel`, `date`, `week`). Git tags follow the build: `v8.1.8`.
