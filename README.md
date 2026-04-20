# Gemma Chat

A local AI assistant for Apple Silicon Macs — powered by Google's Gemma 4, running entirely on your machine via [MLX](https://github.com/ml-explore/mlx). No account, no cloud, no data leaves your Mac.

Chat with it, or switch into **Build mode** and have it write code for you with a live preview canvas.

![Gemma Chat](Gemma-app-icon.png)

## Features

- 🧠 **Local Gemma 4** via [MLX-LM](https://github.com/ml-explore/mlx-examples/tree/main/llms/mlx_lm) — optimized for Apple Silicon
- 🔄 **Model switching** — swap between e2b (1.5 GB), e4b (3 GB), 27B MoE (8 GB), and 31B (18 GB) on the fly
- 🛠 **Build mode** — coding agent that writes multi-file projects into a workspace and renders a live preview
- 🪄 **Live code streaming** — watch Gemma type files character-by-character with a blinking cursor
- 🌐 **Tool use** — web search (DuckDuckGo), fetch URL, calculator, filesystem, bash
- 🎤 **Local speech-to-text** via in-browser Whisper ([transformers.js](https://github.com/huggingface/transformers.js))
- 💾 **Zero-install first run** — Python venv + MLX runtime auto-provisions on first launch
- ✨ **Premium UI** — smooth animations, 3D Gemma branding, dark mode throughout

## Tech Stack

- **Electron** + **Vite** + **React 19** + **TypeScript** + **Tailwind**
- **MLX-LM** as the model runtime (auto-installed into a local venv)
- **transformers.js** (`onnx-community/whisper-base.en`) for STT, WebGPU with WASM fallback
- Per-conversation workspaces served by a local HTTP server; previewed in an `<iframe>`

## Getting Started

**Prerequisites:** macOS (Apple Silicon), Python 3.10–3.13, Node 20+.

```bash
npm install
npm run dev
```

On first launch the app will:
1. Detect Python 3.10–3.13 on your system (Homebrew recommended: `brew install python@3.13`).
2. Create a virtual environment at `~/Library/Application Support/gemma-chat/mlx/venv/`.
3. Install `mlx-lm` and dependencies into the venv.
4. Start the MLX-LM server on `127.0.0.1:11434`.
5. Download the model you picked (default: Gemma 4 E4B, ~3 GB) from Hugging Face.
6. Drop you straight into the chat.

Model weights are cached in `~/Library/Application Support/gemma-chat/models/`.

## Available Models

| Model | Size | Description |
|---|---|---|
| Gemma 4 E2B | 1.5 GB | Fastest. Great for simple Q&A and quick tasks. |
| Gemma 4 E4B | 3 GB | **Recommended.** Best balance of speed and capability. |
| Gemma 4 27B MoE | 8 GB | Larger MoE model. Stronger reasoning, slower. |
| Gemma 4 31B | 18 GB | Full 31B. Maximum quality, needs 32 GB+ RAM. |

Switch models anytime from the model picker in the top-right corner of the chat header.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Run the Electron app with Vite HMR. |
| `npm run build` | Type-check + build main/preload/renderer bundles. |
| `npm run dist` | Build a signed `.dmg` via electron-builder. |
| `npm run typecheck` | Run TypeScript across main and web projects. |

## Architecture

```
src/
├── main/              Electron main process
│   ├── index.ts       Window + IPC handlers + agent loop
│   ├── mlx.ts         MLX-LM install/start/stop/chat + progress parsing
│   ├── workspace.ts   Per-conversation workspace + static file server
│   └── tools.ts       Tool definitions + system prompts + XML action parser
├── preload/           contextBridge API surface
├── renderer/src/
│   ├── components/
│   │   ├── Setup.tsx      First-run onboarding + model picker + download progress
│   │   ├── Chat.tsx       Main chat layout + model switcher dropdown
│   │   ├── Sidebar.tsx    Conversation list
│   │   ├── Message.tsx    Assistant / user bubbles + tool cards + activity bar
│   │   ├── Composer.tsx   Input + mic button
│   │   └── Canvas.tsx     Preview / Code / Files tabs for Build mode
│   └── lib/whisper.ts     Browser Whisper pipeline
└── shared/types.ts    IPC + message types + model registry
```

### MLX Runtime

The app manages its own Python virtual environment. On first launch it:
1. Finds a compatible Python (3.10–3.13) via Homebrew or system paths.
2. Creates a venv with pip forced to use public PyPI (bypasses corporate registries).
3. Installs `mlx-lm` which pulls in MLX, transformers, and safetensors.
4. Spawns `mlx_lm.server` as a child process serving an OpenAI-compatible API.

Model downloads from Hugging Face are tracked via stderr parsing, with progress surfaced to the UI in real-time.

### Agent Loop

In Build mode, each assistant turn streams from the MLX server; any `<action name="…">…</action>` blocks are parsed out of the stream, executed, and their results are threaded back into the next turn. The loop runs up to 40 rounds per user message.

### Tool Protocol

Small models struggle with nested JSON escaping, so tools are invoked via an XML-ish block:

```
<action name="write_file">
<path>index.html</path>
<content>
<!doctype html>
…
</content>
</action>
```

`<content>` is parsed greedily to the **last** `</content>` so file bodies can contain nearly anything. Defensive post-processing strips stray ``` fences the model sometimes emits.

### Live Code Streaming

As Gemma streams into a `<content>` block, the main process throttle-writes partial file content to disk every ~450ms. The Canvas's **Code** tab renders that content with line numbers and a blinking cursor; the **Preview** tab's iframe reloads every ~350ms (debounced) so pages build in front of you.

## Credits

- [Gemma](https://ai.google.dev/gemma) by Google DeepMind
- [MLX](https://github.com/ml-explore/mlx) by Apple Machine Learning Research
- [Hugging Face transformers.js](https://github.com/huggingface/transformers.js) + [onnx-community](https://huggingface.co/onnx-community) for local Whisper
- Agent-harness patterns adapted from [google-ai-edge/gallery](https://github.com/google-ai-edge/gallery)

## License

MIT
