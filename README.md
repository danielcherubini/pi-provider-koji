# pi-provider-tama

[Pi agent](https://pi.dev) extension that auto-discovers models from a local [tama](https://github.com/danielcherubini/tama) server and registers them as a provider.

## What it does

When pi starts (or on `/reload`), this extension:

1. Auto-detects tama on ports `11434` or `8080`
2. Fetches available models from tama's API
3. Registers a `tama` provider in pi with all discovered models

Models appear in `/model` immediately — no manual `models.json` editing needed.

## Installation

### Option A: npm (recommended)

```bash
pi install npm:pi-provider-tama
```

### Option B: git

```bash
pi install git:github.com/danielcherubini/pi-provider-tama
```

Use `-l` to install to project scope (`.pi/settings.json`) instead of global:

```bash
pi install -l npm:pi-provider-tama
```

### Option C: Local development

```bash
git clone https://github.com/danielcherubini/pi-provider-tama.git
cd pi-provider-tama
npm install

# Install from local path
pi install ./pi-provider-tama
```

## Configuration

By default, the extension auto-detects tama on `127.0.0.1:11434` and `127.0.0.1:8080`.

No configuration is needed if tama is running locally on the default port.

### Remote tama server

Add the tama URL to `~/.pi/agent/settings.json`:

```json
{
  "packages": ["npm:pi-provider-tama"],
  "pi-provider-tama": {
    "url": "http://myserver:11434"
  }
}
```

Or use the `TAMA_URL` environment variable (takes priority over settings.json):

```bash
export TAMA_URL=http://myserver:11434
```

**Priority order:** `TAMA_URL` env var → `settings.json` → auto-detect localhost

### Authentication

If your tama instance is gated behind a bearer token, configure one of:

1. **`TAMA_TOKEN` environment variable** (highest priority):

   ```bash
   export TAMA_TOKEN=your-token-here
   ```

2. **`token` field in `~/.pi/agent/settings.json`**:

   ```json
   {
     "packages": ["npm:pi-provider-tama"],
     "pi-provider-tama": {
       "url": "https://tama.example.com",
       "token": "your-token-here"
     }
   }
   ```

The token is sent as `Authorization: Bearer <token>` on both model discovery and inference requests, and is used as pi's `apiKey` for the registered provider. When unset, no auth header is sent (fine for localhost).

**Priority order:** `TAMA_TOKEN` env var → `settings.json` token → none

## How it works

The extension is an **async factory**: pi awaits it before resolving which
models are available, so every tama model is registered before pi decides
what's selectable. No caching layer, no sync pre-registration dance.

On startup the factory:

1. Resolves the tama URL/token (env → `settings.json` → auto-detect localhost).
2. Fetches the live model list from `/tama/v1/opencode/models`.
3. Calls `pi.registerProvider("tama", …)` with every discovered model.

It also re-runs the same flow on `session_start`, so `/reload` picks up
models that were added to tama after pi started.

> Requires pi with async-factory support (pi-mono ≥ Jan 2026,
> commit `aea9f843`). If tama is offline when pi boots, no tama models
> register — bring tama up and run `/reload`.

Discovered models are mapped to pi's provider format:

| Tama field                          | Pi field        | Fallback                      |
| ----------------------------------- | --------------- | ----------------------------- |
| `id` (lowercased HF repo)           | model `id`      | —                             |
| `name` (pretty display)             | model `name`    | `id`                          |
| `context_length` or `limit.context` | `contextWindow` | `128000`                      |
| `limit.output`                      | `maxTokens`     | `contextWindow / 16` or `8192`|
| `modalities.input`                  | `input`         | `["text"]`                    |

All models are registered with:

- `api: "openai-completions"` (OpenAI-compatible)
- `reasoning: false`
- `cost: { input: 0, output: 0, ... }` (local = free)
- `compat: { supportsDeveloperRole: false, supportsReasoningEffort: false }`

## Migrating from pi-tama

This package was previously published as `pi-tama`. To migrate:

1. Reinstall: `pi install npm:pi-provider-tama`
2. Rename the settings key in `~/.pi/agent/settings.json` from `"pi-tama"` to `"pi-provider-tama"`
3. Uninstall the old package

## Development

```bash
npm install
npm test          # Run tests in watch mode
npm run test:run  # Run tests once
npm run typecheck # Type check
```

## Requirements

- [tama](https://github.com/danielcherubini/tama) running locally with `tama serve`
- [pi](https://pi.dev) agent

## License

MIT
