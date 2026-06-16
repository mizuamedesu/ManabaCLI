#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
codex_home="${CODEX_HOME:-$HOME/.codex}"
claude_home="${CLAUDE_HOME:-$HOME/.claude}"

usage() {
  cat <<'EOF'
Usage: scripts/install-skills.sh [--skills-only] [--no-npm-link]

Installs:
  - Codex skill to ${CODEX_HOME:-$HOME/.codex}/skills/manaba-readonly
  - Claude Code skill to ${CLAUDE_HOME:-$HOME/.claude}/skills/manaba-readonly
  - npm dependencies, Playwright Chromium, and manaba-readonly bin unless --skills-only
EOF
}

skills_only=0
npm_link=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skills-only)
      skills_only=1
      shift
      ;;
    --no-npm-link)
      npm_link=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

install_skill() {
  local src="$1"
  local dst="$2"
  mkdir -p "$(dirname "$dst")"
  rm -rf "$dst"
  cp -R "$src" "$dst"
}

install_skill "$repo_root/skills/codex/manaba-readonly" "$codex_home/skills/manaba-readonly"
install_skill "$repo_root/skills/claude-code/manaba-readonly" "$claude_home/skills/manaba-readonly"

if [[ "$skills_only" -eq 0 ]]; then
  cd "$repo_root"
  npm install
  npx playwright install chromium
  if [[ "$npm_link" -eq 1 ]]; then
    npm link
  fi
fi

cat <<EOF
Installed Manaba read-only skills:
  Codex:  $codex_home/skills/manaba-readonly
  Claude: $claude_home/skills/manaba-readonly
EOF
