# AI 有声内容创作工具

这是一个面向有声书/有声内容制作的前端工作台，用来管理小说画本、角色/CV、音频对轨、后期标记和 Reaper 导出流程。

当前仓库是前端部分，主要使用 React + Vite + Dexie/IndexedDB。部分本地能力需要配合 Electron 助手使用，例如读取本地音频路径、调用 Whisper/faster-whisper、写入 Audition CuePoint、批量转码等。

## 主要功能

- 小说章节导入与画本编辑
- 角色、CV、声线和角色描述管理
- DeepSeek 辅助画本、局部重画和角色资料生成
- 音频对轨：按章节、按 CV/角色、按返音标记匹配
- AI 辅助对轨：通过 faster-whisper GPU 生成时间戳后匹配脚本
- 后期制作：场景、BGM、音效、音效组和文本标记
- 导出音频与 Reaper 工程
- 本地 IndexedDB 保存项目数据

## 本地运行

需要先安装 Node.js。

```bash
npm install
npm run dev
```

默认 Vite 地址通常是：

```text
http://127.0.0.1:5173/
```

如果配合 Electron 助手运行，请在项目外层的 `electron-app` 中启动本地壳程序。Electron 会提供更多本地文件和音频处理能力。

## 环境变量

前端可以使用 `.env.local` 保存本地 API Key。不要把真实 Key 提交到 GitHub。

常见配置包括：

```text
GEMINI_API_KEY=你的 Gemini Key
```

DeepSeek、Codex 等配置也可以在应用内的“设置”界面填写，并保存到本地 IndexedDB。

## 数据说明

项目数据主要保存在浏览器 IndexedDB 中。换浏览器、换域名、换端口时，IndexedDB 数据可能不是同一份。

例如以下地址会被浏览器视为不同来源：

```text
http://localhost:5173/
http://127.0.0.1:5173/
```

如果要找旧数据，请尽量使用原来打开项目时相同的域名和端口。

## AI 辅助对轨

现有的 CuePoint/标记对轨逻辑会继续保留，它是最快的路径。只有在没有标记、标记数量不对、或者需要自动分析音频时，才建议使用 AI 辅助对轨。

AI 辅助对轨的推荐本地方案是：

- faster-whisper
- NVIDIA GPU
- `small + cuda + float16 + beam_size 1`

前端按钮会调用 Electron 后端接口，再由本地 Python 环境执行 faster-whisper。原始 MP3 的 CuePoint 不会被直接修改，应用只会在网页项目数据里保存和应用切片结果。

## 构建

```bash
npm run build
```

构建产物在 `dist/`，可以用于静态部署。纯前端部署时，涉及本地文件系统、Whisper、Audition 标记写入等功能不可用，需要 Electron 助手提供本地能力。

## GitHub

仓库地址：

```text
https://github.com/NewbieAuntieCodes/audiobook-tool
```

