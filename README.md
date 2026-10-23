[简体中文](README.md) | [English](README.en.md)

# 幕匠 Studio TV

基于 BeefTV 二次开发的本地 AI 漫剧与短剧创作工作台，连接模型 API 与 ComfyUI，围绕剧本、分镜、素材和镜头制作完善个人创作流程。

本仓库由 [Slash214](https://github.com/Slash214) 维护，当前用于个人本地创作与开发。以已有工作台为基础，优先解决实际制作中的问题，逐步积累可复用的创作流程。

## 项目定位

在一个画布中组织故事、人物、场景、分镜图片和视频镜头，按需使用自己的模型接口或本地 ComfyUI。允许导入外部制作的素材，并由创作者选择和确认使用哪个版本。

当前仍在持续开发，模型与工作流的可用性取决于实际配置；不承诺一键生成完整漫剧。仓库说明使用「幕匠 Studio TV」名称，应用中的部分界面、包名与脚本仍沿用 BeefTV。

## 功能概览

| 模块 | 用途 |
| --- | --- |
| 项目与自由画布 | 用文本、图片、视频节点及连线组织创作内容和素材关系 |
| 创作助手 | 辅助整理故事、剧本、分镜和提示词，配合画布操作 |
| 素材管理 | 导入和复用人物、场景、道具以及外部生成的图片、视频 |
| 模型渠道 | 配置自己的文本、图片、视频等模型 API |
| 本地生成 | 接入 ComfyUI，配置图片与视频工作流、输入映射和默认用途 |
| 镜头制作与处理 | 使用参考图准备生成任务，预览、选用和处理生成结果 |

本分支的二开内容主要涉及本地开发启动、ComfyUI 工作流接入、H3 Director 输入适配、Qwen 图片工作流准备，以及画布中的模型与工作流选择。

## 建议的制作流程

```text
想法 / 小说 / 剧本
        ↓
整理剧本并确认
        ↓
人物、场景与道具设定
        ↓
拆分镜，准备并确认图片
        ↓
配置视频工作流，逐镜生成与审看
        ↓
声音处理、剪辑与导出
```

这是逐阶段制作的工作方式，包含人工确认。图片可通过配置的接口生成，也可从 Midjourney 等工具导入；视频可交给本地 ComfyUI。具体声音、剪辑和导出能力请按所用工具与工作流核对，先验证一个短镜头，再扩大制作范围。

## 本地启动（Windows 源码开发）

准备 Git、Go 1.25 或以上、Bun、Node.js 24，以及 Go CGO 构建所需的 GCC 工具链，并确保命令可在终端使用。使用本地生成时，另外准备可运行的 ComfyUI、模型和对应节点。

```powershell
git clone https://github.com/Slash214/mujiang-studio-tv.git
cd mujiang-studio-tv
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```

启动脚本会安装缺少的前端依赖、准备助手运行时并编译本地后端。首次运行需要网络，耗时取决于依赖下载和编译情况。

- 工作台：<http://localhost:13000>
- 本地后端：`http://127.0.0.1:18080`
- 开发数据：`.local/project-workbench-debug/`
- 启动日志：`.local/logs/`

如果端口已被占用，脚本会退出，请先确认已有服务。进入工作台后，在模型配置中填写自己的 API 信息，在本地生成设置中连接 ComfyUI 并配置工作流。

Windows 桌面构建入口为 `scripts/build-beeftv-windows-release.ps1`，具体工具链、打包与 WebView2 要求见[桌面发布文档](docs/desktop-release.md)。源码开发启动和桌面打包是不同流程。

## 技术栈

| 层次 | 技术 |
| --- | --- |
| 前端 | React、TypeScript、Vite、Ant Design、Tailwind CSS |
| 状态与数据请求 | Zustand、TanStack Query |
| 后端与存储 | Go、Gin、GORM、SQLite |
| 桌面 | Wails、Windows WebView2 |
| 助手运行时 | Node.js、pi SDK |
| 生成与媒体处理 | 模型 API、ComfyUI、FFmpeg |

## 配置与数据安全

- 仓库不包含个人 API Key、项目数据库、聊天记录、创作素材或模型权重；上游自带的演示和测试资源保留。
- `.local/`、`.env`、数据库和 `.settings-key` 等本地文件不应提交到 Git。
- API 服务、ComfyUI、模型权重及插件需要自行配置，上传源码不会同时备份这些运行环境。
- 当前按本机工作台使用，不应直接作为开放公网的多人服务部署。

## 文档入口

- [文档目录](docs/index.md)
- [本地开发说明](docs/content/docs/backend/local-development.mdx)
- [工作台功能概览](docs/content/docs/overview/features.mdx)
- [模型配置持久化](docs/local-model-config-persistence.md)
- [桌面构建与发布](docs/desktop-release.md)

部分文档沿用 BeefTV 上游说明，请结合本分支的实际代码、配置和验证结果使用。

## 项目来源与许可

本项目基于 [BeefTV](https://github.com/glanderness/BeefTV) 二次开发，保留原项目提交历史、版权声明及第三方归属。感谢上游作者与贡献者。

许可范围以仓库中的 [LICENSE](LICENSE)、[NOTICE](NOTICE) 和[第三方声明](THIRD_PARTY_NOTICES.md) 为准。项目名称和 README 的调整不改变现有许可；本仓库不另行授予超出原许可范围的商业使用或再分发权利。具体说明见[许可文档](docs/content/docs/overview/licensing.mdx)。
