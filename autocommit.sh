#!/usr/bin/env bash
#
# autocommit.sh — one file, one commit.
#
# Stages and commits every pending change (modified, new/untracked, deleted,
# renamed) as its OWN separate commit. Commit message style:
# "auto: <add|update|delete> <path>".
#
# Usage:
#   ./autocommit.sh            # commit every pending file, one commit each
#   ./autocommit.sh --push     # ...then push to the current upstream
#   ./autocommit.sh -n         # dry run: list what WOULD be committed, no changes
#
# It operates on the git repo that CONTAINS this script, so it's safe to run
# from anywhere (and to copy into another project).

set -euo pipefail

DRY_RUN=0
DO_PUSH=0
for arg in "$@"; do
  case "$arg" in
    -n|--dry-run) DRY_RUN=1 ;;
    --push)       DO_PUSH=1 ;;
    -h|--help)    sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# Anchor to the repo containing this script.
cd "$(dirname "$0")"
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "error: not inside a git repository" >&2
  exit 1
fi
cd "$(git rev-parse --show-toplevel)"

# --- Clear a stale git lock, in case a previous run died mid-commit -----------
# A leftover .git/index.lock makes every git write fail with
# "Unable to create '.../index.lock': File exists". Only remove it when no git
# process is actually running, so we never yank the lock out from under a live
# operation.
clear_stale_lock() {
  local git_dir lock
  git_dir="$(git rev-parse --git-dir)"
  lock="$git_dir/index.lock"
  [ -f "$lock" ] || return 0
  if command -v pgrep >/dev/null 2>&1 && pgrep -x git >/dev/null 2>&1; then
    echo "warning: $lock exists but a git process is running — leaving it alone." >&2
    return 0
  fi
  echo "removing stale lock: $lock" >&2
  rm -f "$lock"
}
clear_stale_lock

# --- Dry run: just list pending files and exit --------------------------------
if [ "$DRY_RUN" -eq 1 ]; then
  pending="$(git -c core.quotepath=false status --porcelain)"
  if [ -z "$pending" ]; then echo "nothing to commit."; exit 0; fi
  while IFS= read -r l; do
    [ -n "$l" ] || continue
    xy="${l:0:2}"; p="${l:3}"
    case "$xy" in R*|C*) p="${p##* -> }" ;; esac
    if [[ "$xy" == *D* ]]; then v="delete"
    elif [[ "$xy" == "??" || "$xy" == A* ]]; then v="add"
    else v="update"; fi
    echo "[would $v] $p"
  done <<< "$pending"
  echo "(dry run — no commits made)"
  exit 0
fi

# --- Commit loop: one file per commit -----------------------------------------
count=0
while true; do
  clear_stale_lock   # defensive: re-check before each commit

  # Take the first pending entry. Capture the whole status first (no pipe to
  # head) so 'set -o pipefail' can't trip on SIGPIPE.
  status_all="$(git -c core.quotepath=false status --porcelain)"
  [ -n "$status_all" ] || break
  line="${status_all%%$'\n'*}"       # first line only

  xy="${line:0:2}"                    # two-char status code
  path="${line:3}"                    # path starts at column 4

  # Renames/copies show as "old -> new"; commit the new path.
  case "$xy" in
    R*|C*) path="${path##* -> }" ;;
  esac

  # Choose a verb from the status code.
  if [[ "$xy" == *D* ]]; then         verb="delete"
  elif [[ "$xy" == "??" || "$xy" == A* ]]; then verb="add"
  else                                verb="update"
  fi

  git add -A -- "$path"
  if git diff --cached --quiet; then
    # Nothing actually staged (e.g. ignored) — bail out rather than loop forever.
    echo "skip (nothing to stage): $path" >&2
    break
  fi

  git commit -q -m "auto: $verb $path"
  echo "[$verb] $path"
  count=$((count + 1))
done

echo "done — $count commit(s)."

if [ "$DO_PUSH" -eq 1 ] && [ "$count" -gt 0 ]; then
  echo "pushing..."
  git push
fi
