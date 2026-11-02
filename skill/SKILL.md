---
name: verify-in-env
description: Run the current moxie-link worktree as a live app (its own backend, database, and Vite server) and verify a change in the browser. Use when a moxie-link change touches UI or API behavior and you need to check it works in the running app, when the user says "verify it", "check it in the browser", "spin up the env", or asks for a link to review the work.
---

# Verify in a per-worktree env

`wtenv` gives this worktree its own running app: a Django container on its own database (a copy of the dev DB), its own Redis, and a Vite dev server. Nothing touches the main dev stack or other worktrees, so migrations and test data are safe to change.

## Steps

1. From the worktree root, run `wtenv up --json`. Add `--celery` only if the flow needs background tasks (notes AI, PCC sync, billing jobs, emails). The first run in a worktree takes about 40 seconds. Running it again while the env is up returns in under a second, so call it whenever you need the URL.
   - It runs `uv sync` and `migrate` for this branch. If it fails, the output shows the error. Fix the branch and run it again.
   - The backend reloads on Python edits and Vite hot-reloads frontend edits, so you don't need to restart after editing. After changing dependencies or settings, run `wtenv up --restart`.
2. Open `app_url` from the JSON (`http://localhost:41xx`) with the preview browser tools. Log in with `login_email` / `login_password` from the same JSON.
3. Go through the exact flow your change affects. Check the happy path and at least one edge case (empty state, validation error, permission).
   - Read the console and network entries in the snapshot. A 4xx/5xx on `/api/...` means it failed, even if the UI looks fine.
   - Backend errors: `wtenv logs backend -n 200`. Vite errors: `wtenv logs frontend`.
   - Check data directly: `wtenv exec -- python manage.py shell -c "..."`. You can also hit the API with `curl` against `api_url`.
4. Save screenshots of the key states (`preview_snapshot` with `save=true`) and embed them in your reply. For a PR, record a clip of each flow instead (see "Recording clips").
5. Report the result: what you checked, what passed, what failed, and the `tailnet_url` (`https://wt-<slug>.<tailnet>.ts.net`) so the user can open the same env from any device on the tailnet. Leave the env running so the user can review it. Close the browser tabs you opened.

## Recording clips

Every page in a wtenv env carries a dormant overlay. Once started, it draws a cursor that glides to each pointer event, an orange ripple on every click, and a label for keys, typing (`typing…`, never the text) and scrolling. It also logs each action with its time. `wtenv clip cut` uses that log to keep only the moments around each action and drop the time you spent thinking, reading results, or waiting between tool calls.

1. Plan the flow first, so the recording only covers the demo. Do the exploratory checks before you start recording.
2. Start `preview_recording_start` and note its `startedAt`. Then run `preview_evaluate` with `window.__wtenvClip.start()`. If `__wtenvClip` is undefined, the env's Vite predates the overlay: run `wtenv up --restart` and reload.
3. Do every step you want on screen with `preview_act` (click at a locator or `x`/`y`, `type`, `press`, `scroll`). A `preview_evaluate` that calls `element.click()` never moves the cursor and isn't logged, so it gets cut. Use `preview_evaluate` only to read state or find coordinates.
   - The overlay and the log survive full page loads (`preview_navigate`) because they live in `localStorage`.
   - In a Radix popover or listbox, press `Escape` before clicking outside it. Otherwise the click only closes the popover.
4. Run `preview_evaluate` with `window.__wtenvClip.stop()`. It returns the event log and turns the overlay off. Write the JSON to a file, then run `preview_recording_stop`.
5. Cut it: `wtenv clip cut <recording.mp4> --events events.json --started-at <startedAt> -o <name>.mp4`. Each action keeps 250 ms before it and 1 s after it, or 1 s after the last page change that follows within 4 s, so loaded results stay in the clip. The final state is held 1.5 s longer. If cutting fails, the output is the untouched recording and the JSON says `"cut": false`.
6. Inspect the cut at its key actions and final state. Check its actual duration with ffprobe against the reported windows; confirm the cursor and result remain visible. The cutter produces silent MP4 video and keeps available footage for the final hold, so leave the result on screen before stopping. Re-record if an important result was cut.
7. Attach clips to the PR with gh ≥ 2.99. In the body file, put each `![](/abs/path/<name>.mp4)` alone in its own paragraph under a one-line caption, then run `gh pr edit <n> --body-file body.md --attach /abs/path/<name>.mp4 ...`. Each reference becomes a video player. Fetch the current body first and keep anything a bot appended.

## Other commands

- `wtenv info [--json]`: URLs, login, and status of this worktree's env.
- `wtenv up --reset-db`: start over from a fresh copy of the dev DB.
- `wtenv down`: stop the processes and keep the database. `wtenv destroy`: also drop the database and free the ports.
- `wtenv ls`: every env on this machine.
- `wtenv clip cut --help`: tune `--pre`, `--post`, `--settle` and `--hold`.

## Limits

- WebSocket features (telehealth presence, CSV import status) connect to `ws://localhost:<api port>`. They work in your local browser but not over the tailnet URL.
- Integrations (PCC, Inovalon, Daily) use the sandbox credentials from the main checkout's `backend/.env`. Don't trigger real outbound actions unless the task needs it.
- If the login user is missing from the database, say so instead of creating users.
