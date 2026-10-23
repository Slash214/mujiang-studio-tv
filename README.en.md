[简体中文](README.md) | [English](README.en.md)

# Mujiang Studio TV

A local AI motion-comic and short-drama workspace customized from BeefTV. Connect model APIs and ComfyUI to organize scripts, storyboards, assets, and video shots for personal production.

Maintained by [Slash214](https://github.com/Slash214), this repository is currently intended for personal local creation and development. It builds on an existing workspace to address practical production problems and develop reusable creative workflows.

## Purpose

Organize stories, characters, locations, storyboard images, and video shots on one canvas. Use your own model APIs or local ComfyUI, import externally created media, and choose which versions to adopt.

Development is ongoing. Model and workflow availability depends on your configuration; this is not a promise of one-click episode production. The repository uses the Mujiang Studio TV name, while some application UI, package names, and scripts retain BeefTV naming.

## Features

| Module | Purpose |
| --- | --- |
| Projects and canvas | Organize creative content and media relationships with text, image, and video nodes and connections |
| Creative assistant | Help prepare stories, scripts, storyboards, and prompts alongside canvas operations |
| Asset management | Import and reuse characters, locations, props, and externally generated images and videos |
| Model channels | Configure your own text, image, video, and other model APIs |
| Local generation | Connect ComfyUI and configure image and video workflows, input mappings, and default usage slots |
| Shot production and processing | Prepare generation tasks with references, then preview, select, and process results |

Customizations in this branch primarily cover local development startup, ComfyUI workflow integration, H3 Director input adaptation, Qwen image workflow preparation, and model and workflow selection on the canvas.

## Suggested production flow

```text
Idea / novel / script
        ↓
Prepare and confirm the script
        ↓
Define characters, locations, and props
        ↓
Plan shots, prepare and approve images
        ↓
Configure video workflows, generate and review individual shots
        ↓
Sound, editing, and export
```

This is a staged process with human review. Generate images through configured APIs or import them from tools such as Midjourney; use local ComfyUI for video generation. Check sound, editing, and export capabilities against your chosen tools and workflows. Validate one short shot before scaling up.

## Local startup (Windows source development)

Install Git, Go 1.25 or later, Bun, Node.js 24, and a GCC toolchain for Go CGO builds. Make their commands available in your terminal. Local generation additionally requires a working ComfyUI installation, models, and the corresponding nodes.

```powershell
git clone https://github.com/Slash214/mujiang-studio-tv.git
cd mujiang-studio-tv
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```

The startup script installs missing frontend dependencies, prepares the assistant runtime, and builds the local backend. The first run requires network access; startup time depends on downloads and compilation.

- Workspace: <http://localhost:13000>
- Local backend: `http://127.0.0.1:18080`
- Development data: `.local/project-workbench-debug/`
- Startup logs: `.local/logs/`

The script exits if a required port is occupied; check existing services first. In the workspace, configure your own API credentials under model settings, then connect ComfyUI and configure workflows under local generation settings.

Windows desktop builds use `scripts/build-beeftv-windows-release.ps1`. See the [desktop release guide](docs/desktop-release.md) for toolchain, packaging, and WebView2 requirements. Source development startup and desktop packaging are separate workflows.

## Technology

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite, Ant Design, Tailwind CSS |
| State and data fetching | Zustand, TanStack Query |
| Backend and storage | Go, Gin, GORM, SQLite |
| Desktop | Wails, Windows WebView2 |
| Assistant runtime | Node.js, pi SDK |
| Generation and media processing | Model APIs, ComfyUI, FFmpeg |

## Configuration and data safety

- Personal API keys, project databases, chat history, creative assets, and model weights are not included. Existing upstream demo and test resources are retained.
- Do not commit local files such as `.local/`, `.env`, databases, or `.settings-key`.
- Configure API services, ComfyUI, model weights, and plugins separately. Uploading source code does not back up these runtime environments.
- This is currently a local workspace; do not deploy it directly as a public multi-user service.

## Documentation

- [Documentation index](docs/index.md)
- [Local development](docs/content/docs/backend/local-development.mdx)
- [Workspace features](docs/content/docs/overview/features.mdx)
- [Model configuration persistence](docs/local-model-config-persistence.md)
- [Desktop builds and releases](docs/desktop-release.md)

Some documents retain upstream BeefTV guidance. Use them together with this branch's actual code, configuration, and validation results.

## Origin and licensing

This project is customized from [BeefTV](https://github.com/glanderness/BeefTV). Its original commit history, copyright notices, and third-party attributions are retained. Thanks to the upstream authors and contributors.

License scope is defined by [LICENSE](LICENSE), [NOTICE](NOTICE), and [third-party notices](THIRD_PARTY_NOTICES.md). Changes to the project name and README do not alter those terms. This repository does not grant additional commercial-use or redistribution rights beyond the applicable licenses. See the [licensing guide](docs/content/docs/overview/licensing.mdx).
