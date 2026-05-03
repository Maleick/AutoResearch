# Install Auto Research

Auto Research is an OpenCode plugin and npm package for structured autonomous improve-verify loops. It keeps runtime state local to the target repository and gates changes with mechanical verification.

## One-Line OpenCode Install

Paste this one line into OpenCode to install and verify Auto Research. This URL follows the latest `main` instructions:

```text
Fetch and follow instructions from https://raw.githubusercontent.com/Maleick/AutoResearch/refs/heads/main/INSTALL.md
```

## Prerequisites

- OpenCode installed and available in your shell.
- Node.js with npm available for the optional CLI path.
- Git installed and available in your shell.
- A target repository with a verification command such as `npm test`, `pytest`, or `go test ./...`.

## Recommended OpenCode Plugin Install

Add Auto Research to your global or project-level `opencode.json` plugin array:

```json
{
  "plugin": ["opencode-autoresearch"]
}
```

Restart OpenCode after editing the configuration. The command family should then be available inside your target repository:

```text
/autoresearch
/autoresearch:plan
/autoresearch:debug
/autoresearch:fix
/autoresearch:learn
/autoresearch:predict
/autoresearch:scenario
/autoresearch:security
/autoresearch:ship
```

## npm Global Install

If you also want the CLI available on your shell `PATH`:

```bash
npm install -g opencode-autoresearch
opencode-autoresearch doctor
opencode-autoresearch --version
```

Then restart OpenCode and run:

```text
/autoresearch
```

## One-Time CLI Path

For one-time CLI use without a global install:

```bash
npx opencode-autoresearch doctor
```

Use the plugin-array install for normal OpenCode usage.

## Verification

These checks do not require secrets:

```bash
npm view opencode-autoresearch version
npm view opencode-autoresearch dist-tags
opencode-autoresearch doctor
```

For a local clone:

```bash
npm install
npm run build
npm run typecheck
npm run verify:pack
npm test
```

To verify command availability, restart OpenCode in a Git repository and run:

```text
/autoresearch
```

## Updating

For plugin-array installs, restart OpenCode after a new Auto Research package release is available. To pin a specific version:

```json
{
  "plugin": ["opencode-autoresearch@3.3.3"]
}
```

For npm global installs:

```bash
npm install -g opencode-autoresearch@latest
npm list -g opencode-autoresearch --depth=0
```

## Troubleshooting

### Plugin Not Loading

- Confirm `opencode.json` is valid JSON.
- Confirm the plugin entry is in the top-level `plugin` array.
- Restart OpenCode after changing the config.
- Check OpenCode logs with `opencode run --print-logs "hello"`.

### Commands Not Found

- Restart OpenCode so it reloads plugin commands.
- Confirm the package installed successfully with `npm list -g opencode-autoresearch --depth=0` if using the global path.
- Run `/autoresearch` from inside a Git repository, not from an empty directory.

### Runtime Artifacts

- Auto Research writes runtime state to `.autoresearch/` in the target repository.
- Do not commit `.autoresearch/`, `autoresearch-results.tsv`, `autoresearch-report.md`, or `autoresearch-memory.md` unless you intentionally want to share run outputs.

## Safety Notes

- Start with a measurable goal, metric, and verification command.
- Review generated reports before relying on unattended background runs.
- Keep verification mechanical; do not accept improvements based on intuition alone.
- Do not pipe remote install scripts into a shell.

## Links

- Documentation: https://github.com/Maleick/AutoResearch/tree/main/docs
- Wiki: https://github.com/Maleick/AutoResearch/wiki
- Releases: https://github.com/Maleick/AutoResearch/releases
- Issues: https://github.com/Maleick/AutoResearch/issues
