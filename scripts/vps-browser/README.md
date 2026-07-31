# VPS browser QA

This installs one pinned Playwright MCP runtime and a matching Chromium build for
the Buzz engineering agents. Browser sessions are headless, sandboxed, isolated,
and retain bounded QA artifacts under each agent's own state directory.

Ubuntu restricts unprivileged user namespaces, which Chromium needs for its own
sandbox. The installer adds a narrow AppArmor `userns` allowance for only the
root-owned Playwright Chrome binaries. It does not disable the global Ubuntu
restriction, Chromium's sandbox, or systemd `NoNewPrivileges`.

Install from a trusted Buzz checkout:

```bash
sudo ./scripts/vps-browser/install.sh
```

The installer configures Claude Code for `buzzchief` and `buzzbuilder`, and Codex
for `buzzreview` and `buzzadmin`. It intentionally leaves `NO_BROWSER=1` service
settings alone because those only suppress interactive OAuth login choices on a
remote host.

Mechanical smoke test:

```bash
buzz-browser-smoke https://staging.toolchat.ai
```

The command exits non-zero if Chromium cannot launch, navigation fails, or the
screenshot cannot be written. On success it prints the HTTP status, final URL,
page title, screenshot path, and screenshot SHA-256.

To prove the MCP transport and agent-facing browser tool catalog end to end:

```bash
buzz-playwright-mcp-probe https://staging.toolchat.ai
```
