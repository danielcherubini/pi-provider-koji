# pi-provider-koji

[Pi agent](https://pi.dev) extension that auto-discovers models from a local [koji](https://github.com/danielcherubini/koji) server and registers them as a provider.

## What it does

When pi starts (or on `/reload`), this extension:

1. Auto-detects koji on ports `11434` or `8080`
2. Fetches available models from koji's API
3. Registers a `koji` provider in pi with all discovered models

Models appear in `/model` immediately — no manual `models.json` editing needed.

## Installation

### Option A: npm (recommended)

```bash
pi install npm:pi-provider-koji
```

### Option B: git

```bash
pi install git:github.com/danielcherubini/pi-provider-koji
```

Use `-l` to install to project scope (`.pi/settings.json`) instead of global:

```bash
pi install -l npm:pi-provider-koji
```

### Option C: Local development

```bash
git clone https://github.com/danielcherubini/pi-provider-koji.git
cd pi-provider-koji
npm install

# Install from local path
pi install ./pi-provider-koji
```

## Configuration

By default, the extension auto-detects koji on `127.0.0.1:11434` and `127.0.0.1:8080`.

No configuration is needed if koji is running locally on the default port.

### Remote koji server

Add the koji URL to `~/.pi/agent/settings.json`:

```json
{
  "packages": ["npm:pi-provider-koji"],
  "pi-provider-koji": {
    "url": "http://myserver:11434"
  }
}
```

Or use the `KOJI_URL` environment variable (takes priority over settings.json):

```bash
export KOJI_URL=http://myserver:11434
```

**Priority order:** `KOJI_URL` env var → `settings.json` → auto-detect localhost

### Authentication

If your koji instance is gated behind a bearer token, configure one of:

1. **`KOJI_TOKEN` environment variable** (highest priority):

   ```bash
   export KOJI_TOKEN=your-token-here
   ```

2. **`token` field in `~/.pi/agent/settings.json`**:

   ```json
   {
     "packages": ["npm:pi-provider-koji"],
     "pi-provider-koji": {
       "url": "https://koji.example.com",
       "token": "your-token-here"
     }
   }
   ```

The token is sent as `Authorization: Bearer <token>` on both model discovery and inference requests, and is used as pi's `apiKey` for the registered provider. When unset, no auth header is sent (fine for localhost).

**Priority order:** `KOJI_TOKEN` env var → `settings.json` token → none

## How it works

On startup, the extension registers koji's models with pi in two phases:

1. **Synchronous pre-registration** (so models are available during pi's initial scope resolution — pi ignores configured models that aren't registered by then):
   - If `~/.pi/agent/koji-models.json` exists from a prior run, register every cached model with its real metadata.
   - Otherwise, register only the models the user has enabled (`enabledModels` / `defaultModel`) with conservative `contextWindow`/`maxTokens` estimates.
2. **Async refresh** on `session_start`: fetch the live model list from koji, re-register with fresh data, and overwrite `~/.pi/agent/koji-models.json` for the next startup.

This means koji models stay selectable even if koji is briefly offline when pi boots, and config jitter (context limits, new/removed models) settles within one session.

The extension fetches models from koji's `/koji/v1/opencode/models` endpoint and maps them to pi's provider format:

| Koji field                          | Pi field        | Fallback                      |
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

## Migrating from pi-koji

This package was previously published as `pi-koji`. To migrate:

1. Reinstall: `pi install npm:pi-provider-koji`
2. Rename the settings key in `~/.pi/agent/settings.json` from `"pi-koji"` to `"pi-provider-koji"`
3. Uninstall the old package

## Development

```bash
npm install
npm test          # Run tests in watch mode
npm run test:run  # Run tests once
npm run typecheck # Type check
```

## Requirements

- [koji](https://github.com/danielcherubini/koji) running locally with `koji serve`
- [pi](https://pi.dev) agent

## License

MIT
