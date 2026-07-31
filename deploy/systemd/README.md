# systemd units for always-on Buzz agents

These units run [`buzz-acp`](../../crates/buzz-acp/README.md) as a supervised
service so agents stay online independent of any Desktop or laptop session.

See the full framework: [docs/self-host-backend-framework.md](../../docs/self-host-backend-framework.md).

## Files

| File | Purpose |
|------|---------|
| `buzz-acp@.service` | Unprivileged template unit (`buzz-acp@buzz-coder`) |
| `buzz-acp-common.env.example` | Shared, non-secret capabilities |
| `buzz-acp.env.example` | Per-agent identity and harness settings |
| `team-instructions.md.example` | Shared operating policy |

An optional root-owned `/etc/buzz-acp/common-secrets.env` can hold credentials
that every identity needs. Keep private agent keys in the per-agent files.

## Install

```bash
sudo cp buzz-acp@.service /etc/systemd/system/
sudo mkdir -p /etc/buzz-acp
sudo useradd --create-home --shell /usr/sbin/nologin buzz-coder
sudo cp buzz-acp-common.env.example /etc/buzz-acp/common.env
sudo cp team-instructions.md.example /etc/buzz-acp/team-instructions.md
sudo cp buzz-acp.env.example /etc/buzz-acp/buzz-coder.env
sudo edit /etc/buzz-acp/common.env      # common policy + allowlist
sudo edit /etc/buzz-acp/buzz-coder.env  # key + relay + harness
sudo chmod 600 /etc/buzz-acp/*.env
sudo systemctl daemon-reload
sudo systemctl enable --now buzz-acp@buzz-coder
sudo systemctl status buzz-acp@buzz-coder
```

Add each service account to the same Unix groups when agents should share
repositories or operator tools. Keep their private keys and harness credentials
in separate `0600` environment files; identity isolation is not a capability
tier. The template makes only the service account's home writable; place its
working clones there.

For a user unit, install under `~/.config/systemd/user/`, remove `User=%i`, and
use `systemctl --user`. The system-wide template is preferred for multiple
isolated identities on one host.

## Requirements

- `buzz-acp` installed at `/usr/local/bin/buzz-acp` (or edit `ExecStart`)
- Relay reachable at the **same host string** clients use
- A dedicated Unix account for each instance name
- Agent pubkey is a relay/channel member as required by your join policy
