# OpenCode Install

For the public raw install handoff, see [`../INSTALL.md`](../INSTALL.md).

## Recommended: OpenCode Plugin Install

Add Auto Research to the `plugin` array in your global or project-level `opencode.json`:

```json
{
  "plugin": ["opencode-autoresearch@latest"]
}
```

Restart OpenCode. OpenCode installs npm plugins automatically at startup.

## Verify Installation

Start the setup wizard inside OpenCode:

```text
/autoresearch
```

## Optional: Global CLI Install

```bash
npm install -g opencode-autoresearch
opencode-autoresearch doctor
```

For one-time CLI use:

```bash
npx opencode-autoresearch doctor
```

## OpenCode Commands

| Command | Purpose |
| --- | --- |
| `/autoresearch` | Run the main improve-verify loop |
| `/autoresearch:plan` | Planning workflow |
| `/autoresearch:debug` | Debugging workflow |
| `/autoresearch:fix` | Fix workflow |
| `/autoresearch:learn` | Learning workflow |
| `/autoresearch:predict` | Prediction workflow |
| `/autoresearch:scenario` | Scenario expansion |
| `/autoresearch:security` | Security review |
| `/autoresearch:ship` | Ship-readiness workflow |

## Hermes Agent Commands

Hermes uses cronjobs and `delegate_task` instead of slash commands. See [`../skills/hermes/INTEGRATION.md`](../skills/hermes/INTEGRATION.md) for the full command mapping.

| OpenCode Command | Hermes Equivalent |
|-----------------|-------------------|
| `/autoresearch` | Cron runs iteration loop |
| `/autoresearch:plan` | Subagent task: plan experiments |
| `/autoresearch:debug` | Subagent task: debug failures |
| `/autoresearch:fix` | Subagent task: fix issues |
| `/autoresearch:learn` | Memory tool + pattern analysis |
| `autoresearch init` | Manual setup (same CLI) |
| `autoresearch status` | `cat .autoresearch/state.json` |
| `autoresearch launch` | `hermes cron create` |
| `autoresearch stop` | `hermes cron pause` |
| `autoresearch resume` | `hermes cron resume` |

## Runtime Artifacts

Artifacts are stored under the working directory:

| Artifact | Purpose |
| --- | --- |
| `.autoresearch/state.json` | Current run state |
| `.autoresearch/launch.json` | Background launch manifest |
| `autoresearch-results.tsv` | Iteration log |
| `autoresearch-report.md` | End-of-run report |
| `autoresearch-memory.md` | Reusable memory |

## Updating

The `opencode-autoresearch@latest` plugin entry follows the current npm `latest` release. Restart OpenCode after a new Auto Research package release is available. To pin a fixed version instead:

```json
{
  "plugin": ["opencode-autoresearch@3.3.4"]
}
```

## Troubleshooting

### Plugin not loading

1. Verify `opencode.json` uses `"plugin": ["opencode-autoresearch@latest"]`.
2. Restart OpenCode after editing config.
3. Check logs with `opencode run --print-logs "hello"`.

### CLI not found

1. Run `npm install -g opencode-autoresearch`.
2. Verify your npm global bin directory is on `PATH`.
3. Run `opencode-autoresearch doctor`.

## Uninstall CLI

```bash
npm uninstall -g opencode-autoresearch
```
