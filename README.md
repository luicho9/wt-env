# wt-env

Per-worktree moxie-link dev environments, so an agent working in a git worktree can boot the app, verify its change in a browser, and leave a link (local and Tailscale) for review.

## How it works

Shared, from the main `emr-engine` stack: Postgres, MinIO, Mailhog, the `moxie_link_network` Docker network, and the `moxie-link-backend:local` image.

Per worktree (`wtenv up`):

| Piece | Details |
|---|---|
| Database | `wt_<slug>`, created with `CREATE DATABASE ... TEMPLATE wt_template`. `wt_template` is a `pg_dump` of the main dev DB (`test`), built on first use or with `wtenv template`. Before cloning, the template is migrated to the main checkout's migrations whenever they change, so a new worktree only applies its own branch's migrations. |
| Redis | `wt-<slug>-redis`. Each env has its own broker, so main's Celery workers never pick up a branch's tasks. |
| Backend | `wt-<slug>-app`: one container that runs `uv sync`, `migrate` (only when the worktree's migration files changed since the last successful run) and then runserver with autoreload, with the worktree's `backend/` mounted. If it's already running and new migrations appear, `up` runs `migrate` inside it. The venv lives in a Docker volume keyed by the `uv.lock` hash, so worktrees on the same lock share it. |
| Celery | optional (`--celery`): one worker for every queue. |
| Frontend | Vite on the host, using a wrapper config (`frontend/.wtenv/vite.config.mts`, git-excluded) that extends the repo config and inlines the clip overlay. `VITE_BASE_API_URL` is empty so the app calls `/api` on its own origin and Vite proxies it to the backend. The same URL works on localhost and over Tailscale. |
| Ports | frontend `4100+n`, backend `4200+n`, allocated per worktree and stored in `~/.local/state/wtenv/envs.json`. |
| Tailscale | `wt-<slug>-ts`: a userspace `tailscaled` sidecar that joins the tailnet as `wt-<slug>` and serves `https://wt-<slug>.<tailnet>.ts.net` → Vite. Its state lives in the `wt-<slug>-ts-state` volume, so restarts keep the same node and hostname. Only runs when `WTENV_TS_AUTHKEY` is set (reusable + ephemeral key); otherwise the tailnet URL is `http://<host>:<port>`. |

Recording clips: the Vite wrapper inlines `clip-overlay.js` into every page. It stays dormant until `window.__wtenvClip.start()`; then it shows key/typing/scroll labels and logs pointer movement and input timestamps in `localStorage`. T3's recorder provides the cursor and click feedback. The overlay adds no second pointer. Before each click, wait for the target to render, hover it, pause, then click. Confirm the resulting UI state before continuing.

`wtenv clip cut` keeps moments around those logged actions and nearby DOM changes, merges overlapping windows, and encodes silent H.264 MP4 at 0.75× speed by default (`--speed 1` for real time). It follows the action-window idea in Warp's [smart cut spec](https://github.com/warpdotdev/warp/blob/master/agents/specs/QUALITY-1112-smart-variable-speedcut-for-computer-use-recordings.md).

`up` also:
- defaults `PCC_TENANT_KEY=moxie`;
- reverts the `frontend/project.inlang/.gitignore` rewrite Paraglide does on startup, so agents don't commit it.

## Startup time

| Case | Time |
|---|---|
| new worktree (node_modules already installed) | ~35s |
| new worktree with a fresh `pnpm install` | ~45s |
| after `down` | ~25s |
| already running | <1s |

The frontend (pnpm + Vite) starts in parallel with the backend. Most of the remaining time is Django booting: runserver's autoreloader imports the project twice.

## Install

```sh
./install.sh            # wtenv -> ~/.local/bin, skill -> ~/.agents/skills (+ Claude/Codex links)
$EDITOR ~/.config/wtenv/config.env
```

`~/.config/wtenv/backend.env` (optional) holds extra backend env vars that override the main checkout's `backend/.env`.

## Usage

```sh
wtenv up [--celery] [--restart] [--reset-db] [--skip-migrate] [--json]
wtenv info [--json]
wtenv logs [backend|frontend|celery|redis] [-f] [-n N]
wtenv exec -- python manage.py shell
wtenv down        # stop, keep DB
wtenv destroy     # stop, drop DB, free ports
wtenv ls
wtenv template    # rebuild wt_template from the main dev DB
wtenv prune       # destroy envs whose worktree is gone, stop stale ones, remove orphan containers
wtenv clip cut <recording.mp4> --events events.json --started-at <ISO> [-o out.mp4]
```

Use `-C <path>` to target a worktree other than the current directory.

## Limits

- WebSockets connect straight to the backend port, so they only work from the mini PC's own browser.
- A worktree's Tailscale state volume survives `down`/`destroy`, so re-creating its env reuses the same device and hostname. Only `prune` (worktree deleted) drops it; the ephemeral device then expires on its own. If a name ever comes back as `wt-<slug>-1`, delete the stale device in the admin console and remove the `wt-<slug>-ts-state` volume.
- Requires the main `emr-engine` stack (database at least) to be running.
- `wtenv clip cut` needs `ffmpeg` and `ffprobe` on the host. Output is silent H.264 MP4 at 30 fps. Keep the final result on screen before stopping; `--hold` keeps available footage rather than generating a freeze frame.
- Run clip command checks with `python3 -m unittest discover -s tests -v`. The media integration case requires ffmpeg and ffprobe.
