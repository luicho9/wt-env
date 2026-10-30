---
name: verify-in-env
description: Run the current moxie-link worktree as a live app (its own backend, database, and Vite server) and verify a change in the browser. Use when a moxie-link change touches UI or API behavior and you need to check it works in the running app, when the user says "verify it", "check it in the browser", "spin up the env", or asks for a link to review the work.
---

# Verify in a per-worktree env

`wtenv` gives this worktree its own running app: a Django container on its own database (a copy of the dev DB), its own Redis, and a Vite dev server. Nothing touches the main dev stack or other worktrees, so migrations and test data are safe to change.

## Steps

1. From the worktree root, run `wtenv up --json`. Add `--celery` only if the flow needs background tasks (notes AI, PCC sync, billing jobs, emails). The first run takes about 2 minutes. Later runs are quick and reuse what is already running.
   - It runs `uv sync` and `migrate` for this branch. If it fails, the output shows the error. Fix the branch and run it again.
   - The backend reloads on Python edits and Vite hot-reloads frontend edits, so you don't need to restart after editing. After changing dependencies or settings, run `wtenv up --restart`.
2. Open `app_url` from the JSON (`http://localhost:41xx`) with the preview browser tools. Log in with `login_email` / `login_password` from the same JSON.
3. Go through the exact flow your change affects. Check the happy path and at least one edge case (empty state, validation error, permission).
   - Read the console and network entries in the snapshot. A 4xx/5xx on `/api/...` means it failed, even if the UI looks fine.
   - Backend errors: `wtenv logs backend -n 200`. Vite errors: `wtenv logs frontend`.
   - Check data directly: `wtenv exec -- python manage.py shell -c "..."`. You can also hit the API with `curl` against `api_url`.
4. Save screenshots of the key states (`preview_snapshot` with `save=true`) and embed them in your reply.
5. Report the result: what you checked, what passed, what failed, and the `tailnet_url` (`https://wt-<slug>.<tailnet>.ts.net`) so the user can open the same env from any device on the tailnet. Leave the env running so the user can review it. Close the browser tabs you opened.

## Other commands

- `wtenv info [--json]`: URLs, login, and status of this worktree's env.
- `wtenv up --reset-db`: start over from a fresh copy of the dev DB.
- `wtenv down`: stop the processes and keep the database. `wtenv destroy`: also drop the database and free the ports.
- `wtenv ls`: every env on this machine.

## Limits

- WebSocket features (telehealth presence, CSV import status) connect to `ws://localhost:<api port>`. They work in your local browser but not over the tailnet URL.
- Integrations (PCC, Inovalon, Daily) use the sandbox credentials from the main checkout's `backend/.env`. Don't trigger real outbound actions unless the task needs it.
- If the login user is missing from the database, say so instead of creating users.
