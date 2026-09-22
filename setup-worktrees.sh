#!/usr/bin/env bash
# Creates the three feature worktrees from main, next to this repo, each with .env.local and deps.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "error: run this from the main branch" >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: working tree is not clean; commit or stash first" >&2
  exit 1
fi

WORKTREES=(
  "../feature-telegram:feature/telegram-bot"
  "../feature-agents:feature/agent-core"
  "../feature-heartbeat:feature/heartbeat"
)

for entry in "${WORKTREES[@]}"; do
  dir="${entry%%:*}"
  branch="${entry#*:}"

  if [[ -d "$dir" ]]; then
    echo "skip: $dir already exists"
  elif git show-ref --verify --quiet "refs/heads/$branch"; then
    echo "add:  $dir (existing branch $branch)"
    git worktree add "$dir" "$branch"
  else
    echo "add:  $dir (new branch $branch from main)"
    git worktree add -b "$branch" "$dir" main
  fi

  if [[ -f .env.local ]]; then
    cp .env.local "$dir/.env.local"
  else
    echo "warn: .env.local not found; $dir will have no env" >&2
  fi

  (cd "$dir" && pnpm install --frozen-lockfile)
done

echo
git worktree list
