# Versioning

| Situation | App shows | Logs show |
| --- | --- | --- |
| First build of an update | Update 8.1 (Dev Testing) | 8.1 |
| Next build, same update | Update 8.1 (Dev Testing) | 8.1.1 |
| Another one | Update 8.1 (Dev Testing) | 8.1.2 |
| First build of the next update | Update 8.2 (Dev Testing) | 8.2 |

- Numbers follow builds, not calendar weeks. The update number goes up 0.1 per week that has a build, and only when a build is made.
- A week with no build doesn't use a number. After a quiet week the next build is the next number in the sequence (8.2, not 8.3).
- The dates are a record of when each update shipped, not a rule. Update 8.1 shipped Sun 4 Oct – Sat 10 Oct 2026 Update 8.2 started Sun 11 Oct 2026 and Update 8.3 started Sun 18 Oct 2026 and Update 8.4 started Sun 25 Oct 2026 (weeks run Sunday to Saturday).
- The channel in brackets says how close a build is to real users: Dev Testing now, then Beta, then Release.
- Each change-log entry also names its **area** (Header, Speed, Sys Architecture …); the area never goes in the version number.
- Builds B3–B14 (2026-10-04) predate this scheme and belong to Update 8.0.
- Where it's set: `APP_VERSION` near the top of the developer-log script in `index.html` (`update`, `build`, `channel`, `date`, `week`). Git tags follow the build: `v8.1.8`.
