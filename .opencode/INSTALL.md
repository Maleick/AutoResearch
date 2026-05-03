# Installing Auto Research for OpenCode

For the public raw install handoff, see [`../INSTALL.md`](../INSTALL.md).

## Prerequisites

- [OpenCode.ai](https://opencode.ai) installed

## Recommended: OpenCode Plugin Install

Add Auto Research to the `plugin` array in your global or project-level `opencode.json`:

```json
{
  "plugin": ["opencode-autoresearch"]
}
```

Restart OpenCode. OpenCode installs npm plugins automatically and registers the Auto Research commands.

Verify inside OpenCode by running:

```text
/autoresearch
```

## Optional: Global CLI Install

Install the CLI globally if you also want `autoresearch` and `opencode-autoresearch` on your shell `PATH`:

```bash
npm install -g opencode-autoresearch
opencode-autoresearch doctor
```

For one-time use without a global install:

```bash
npx opencode-autoresearch doctor
```

## Commands

After installation, these commands are available in OpenCode:

- `/autoresearch`
- `/autoresearch:plan`
- `/autoresearch:debug`
- `/autoresearch:fix`
- `/autoresearch:learn`
- `/autoresearch:predict`
- `/autoresearch:scenario`
- `/autoresearch:security`
- `/autoresearch:ship`

## Updating

OpenCode refreshes npm plugins when it starts. Restart OpenCode after changing `opencode.json` or after a new Auto Research package release is published.

To pin a version:

```json
{
  "plugin": ["opencode-autoresearch@3.3.3"]
}
```

## Troubleshooting

### Plugin not loading

1. Verify the package name in `opencode.json` is `opencode-autoresearch`.
2. Restart OpenCode after editing config.
3. Check OpenCode logs with `opencode run --print-logs "hello"`.

### CLI not found

1. Run `npm install -g opencode-autoresearch`.
2. Verify your npm global bin directory is on `PATH`.
3. Run `opencode-autoresearch doctor`.

## Getting Help

- Issues: https://github.com/Maleick/AutoResearch/issues
- Documentation: https://github.com/Maleick/AutoResearch#readme
