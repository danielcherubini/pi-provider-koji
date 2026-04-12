# pi-koji

[Pi agent](https://pi.dev) extension that auto-discovers models from a local [koji](https://github.com/dworznik/koji) server and registers them as a provider.

## What it does

When pi starts (or on `/reload`), this extension:

1. Auto-detects koji on ports `11434` or `8080`
2. Fetches available models from koji's API
3. Registers a `koji` provider in pi with all discovered models

Models appear in `/model` immediately — no manual `models.json` editing needed.

## Installation

### Option A: Symlink into pi extensions (recommended for development)

```bash
git clone https://github.com/youruser/pi-koji.git
cd pi-koji
npm install

# Symlink into pi's global extensions directory
ln -s "$(pwd)" ~/.pi/agent/extensions/pi-koji
```

### Option B: Copy directly

```bash
# Copy the extension into pi's extensions directory
cp -r pi-koji ~/.pi/agent/extensions/pi-koji
cd ~/.pi/agent/extensions/pi-koji
npm install
```

### Option C: Reference in settings.json

Add to `~/.pi/agent/settings.json`:

```json
{
  "extensions": ["/path/to/pi-koji/src/index.ts"]
}
```

## Configuration

By default, the extension auto-detects koji on `127.0.0.1:11434` and `127.0.0.1:8080`.

No configuration is needed if koji is running on the default port.

## How it works

The extension fetches models from koji's `/koji/v1/opencode/models` endpoint and maps them to pi's provider format:

| Koji field | Pi field |
|---|---|
| `id` (lowercased HF repo) | model `id` |
| `name` (pretty display) | model `name` |
| `context_length` | `contextWindow` |
| `context_length / 16` | `maxTokens` |
| `modalities.input` | `input` |

All models are registered with:
- `api: "openai-completions"` (OpenAI-compatible)
- `reasoning: false`
- `cost: { input: 0, output: 0, ... }` (local = free)
- `compat: { supportsDeveloperRole: false, supportsReasoningEffort: false }`

## Development

```bash
npm install
npm test          # Run tests in watch mode
npm run test:run  # Run tests once
npm run typecheck # Type check
```

## Requirements

- [koji](https://github.com/dworznik/koji) running locally with `koji serve`
- [pi](https://pi.dev) agent

## License

MIT
