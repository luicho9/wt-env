#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$HOME/.local/bin"
ln -sfn "$repo/wtenv" "$HOME/.local/bin/wtenv"

mkdir -p "$HOME/.agents/skills"
ln -sfn "$repo/skill" "$HOME/.agents/skills/verify-in-env"
for dir in "$HOME/.claude/skills" "$HOME/.codex/skills"; do
  if [ -d "$dir" ]; then
    ln -sfn ../../.agents/skills/verify-in-env "$dir/verify-in-env"
  fi
done

mkdir -p "$HOME/.config/wtenv"
if [ ! -f "$HOME/.config/wtenv/config.env" ]; then
  cp "$repo/config.example.env" "$HOME/.config/wtenv/config.env"
  chmod 600 "$HOME/.config/wtenv/config.env"
  echo "created ~/.config/wtenv/config.env; fill in the login"
fi

echo "installed: wtenv -> ~/.local/bin, skill verify-in-env"
