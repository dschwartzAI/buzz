#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo 'Run this installer as root.' >&2
  exit 1
fi

readonly mcp_version='0.0.78'
readonly runtime_root='/opt/buzz-playwright'
readonly browser_root='/opt/buzz-playwright-browsers'
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

install -d -o root -g root -m 0755 "$runtime_root" "$browser_root"
# Keep the MCP package as the single owner of its matching Playwright version.
npm uninstall --prefix "$runtime_root" playwright >/dev/null 2>&1 || true
env PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install \
  --prefix "$runtime_root" \
  --save-exact \
  "@playwright/mcp@${mcp_version}"

playwright_cli="$(node - <<'NODE'
const { createRequire } = require('node:module')
const { dirname, join } = require('node:path')
const runtimeRequire = createRequire('/opt/buzz-playwright/node_modules/@playwright/mcp/package.json')
process.stdout.write(join(dirname(runtimeRequire.resolve('playwright/package.json')), 'cli.js'))
NODE
)"
env PLAYWRIGHT_BROWSERS_PATH="$browser_root" \
  node "$playwright_cli" install --with-deps chromium

install -o root -g root -m 0644 \
  "$script_dir/buzz-playwright-apparmor" \
  /etc/apparmor.d/buzz-playwright
apparmor_parser -r /etc/apparmor.d/buzz-playwright

install -o root -g root -m 0755 \
  "$script_dir/buzz-playwright-mcp" \
  /usr/local/libexec/buzz-playwright-mcp
install -o root -g root -m 0755 \
  "$script_dir/buzz-browser-smoke.mjs" \
  /usr/local/bin/buzz-browser-smoke
install -o root -g root -m 0755 \
  "$script_dir/probe-mcp.mjs" \
  /usr/local/bin/buzz-playwright-mcp-probe
install -o root -g root -m 0755 \
  "$script_dir/buzz-capability-doctor" \
  /usr/local/bin/buzz-capability-doctor

for user in buzzchief buzzbuilder; do
  home="$(getent passwd "$user" | cut -d: -f6)"
  config="${home}/.claude.json"
  tmp="$(mktemp)"
  jq '.mcpServers.playwright = {
    type: "stdio",
    command: "/usr/local/libexec/buzz-playwright-mcp",
    args: []
  }' "$config" > "$tmp"
  install -o "$user" -g "$user" -m 0600 "$tmp" "$config"
  rm -f "$tmp"
done

for user in buzzreview buzzadmin; do
  home="$(getent passwd "$user" | cut -d: -f6)"
  runuser -u "$user" -- env HOME="$home" PATH=/usr/local/bin:/usr/bin \
    codex mcp remove playwright >/dev/null 2>&1 || true
  runuser -u "$user" -- env HOME="$home" PATH=/usr/local/bin:/usr/bin \
    codex mcp add playwright -- /usr/local/libexec/buzz-playwright-mcp
done

echo "Installed Playwright MCP ${mcp_version} with sandboxed headless Chromium."
