# WorldModel Studio

Electron 多语言 RAG 研究与创作应用，支持简体中文、English、日本語。

## 使用

本机应用位于 `release/mac-arm64/WorldModel Studio.app`。

开发运行 `npm install` 后执行 `npm run dev`。生产运行 `npm run build` 后执行 `npm start`。

`npm run prepare:knowledge` 将项目 PDF 预提取为 `electron/resources/knowledge.json`。应用包包含提取后的知识和预计算的 300 个 1024 维向量，界面隐藏图书文件与封面。新增的个人 PDF、文本、附件、会话和产物保存在本机应用数据目录。

## 功能

- 分页检索、向量嵌入、引用原文与流式 Markdown 对话
- AI 回复、提示词建议与创作提示词跟随当前 UI 语言，已验证英语与日语真实输出
- 可选择并保存 ZenMux 思考强度，自动模式省略参数，所有请求省略 temperature
- 文件选择、拖放、粘贴附件及可删除缩略图
- 图像全屏查看，滚轮缩放、拖动平移、双击复位
- 图像/视频生成可添加参考图，已有图片可一键复用为独立参考附件
- 图像比例及视频比例、时长控件，所选时长同时约束 AI 分镜、动作和口播提示词
- 理论驱动的提示词建议、短视频提示词、图像与视频生成适配
- 模型 ID、显示名称、用途及媒体协议管理
- 最近会话可单独删除与置顶，置顶状态本地保存
- 自动发现环境、系统及本机常见端口的代理，在代理与直连之间切换并记住成功路径，亦可手动选择直连、系统代理或自定义 HTTP/HTTPS/SOCKS 代理
- 会话批量导出和删除，删除同步移除附件、产物和依赖知识
- 文本复制，媒体下载，图像复制及 macOS 视频文件引用复制

API Key 在设置中输入，使用 Electron safeStorage 加密保存到本机 `worldmodel-studio` 应用数据目录。设置与会话在开发版和打包版之间共享。

## ZenMux 接口

对话使用 `/chat/completions`，思考强度通过 `reasoning_effort` 传递。自动、none、minimal、low、medium、high、xhigh 可选，实际支持范围由模型决定。

默认嵌入模型为 `openai/text-embedding-3-large`，通过 `/embeddings` 调用，使用 1024 维向量及小批量索引。嵌入失败时显示错误并使用文字匹配检索。

媒体协议采用 ZenMux 官方定义。OpenAI 图像模型默认 OpenAI Images，可选 Google Gemini。Google 图像模型使用 Google Gemini。Omni 视频使用 Google Interactions，Veo/Seedance 等视频使用 Google Vertex AI。OpenAI Images 参考图请求使用 `/images/edits` JSON `images` 数组，Gemini 图像请求使用 Vertex `generateContent`，Vertex 视频使用 `predictLongRunning` 与 `fetchPredictOperation`。图像和视频生成按钮会发起真实收费请求。平台 `/models` 列表与模型网页可能存在差异，Omni 和 Nano Banana 的官方模型页已核实。Omni 1.2 Flash 的 10 秒 720p 视频已真实生成并验证播放，图像生成尚未进行真实出图验证。

官方参考

- https://zenmux.ai/docs/api/openai/create-chat-completion.html
- https://zenmux.ai/docs/guide/advanced/reasoning.html
- https://zenmux.ai/docs/guide/advanced/embeddings.html
- https://zenmux.ai/docs/api/vertexai/create-interaction-native.html

## 检查

`npm test` 执行服务层回归检查。`npm run build` 构建界面。`npm run dist` 生成本机应用目录。扫描 PDF 需要预先 OCR。

用户指定的 Claude brainstorm Skill 已尝试调用。由于本机 Claude OAuth 会话过期，技术方案由 Codex 写入 `docs/claude-brainstorm-spec.md`。

## 媒体控制参数依据

Omni 1.2 允许 3–15 秒，原生 `response_format.duration` 采用 `"5s"` 字符串，`aspect_ratio` 可设 16:9 或 9:16。Veo 控件提供文档明确列出的 5、8 秒。OpenAI Images 比例映射为 `size`，Gemini 映射为 `generationConfig.imageConfig.aspectRatio`，Vertex 视频映射为 `parameters.aspectRatio` 与 `parameters.durationSeconds`。

- https://zenmux.ai/google/gemini-omni-1.2-flash
- https://zenmux.ai/docs/api/openai/generate-an-image.html
- https://zenmux.ai/docs/api/vertexai/generate-content.html
- https://zenmux.ai/docs/api/vertexai/generate-videos.html
- https://github.com/google-gemini/cookbook/blob/main/quickstarts/Get_started_Omni.ipynb

新增参数已完成请求格式和界面验证，付费媒体生成的新增比例、时长组合尚未逐项验证。

## 下载与发布

- 官网 https://bennix.github.io/WorldAIVideo/
- 安装包 https://github.com/bennix/WorldAIVideo/releases/latest
- 平台包为 macOS Apple Silicon / Intel DMG、Windows x64 安装向导、Linux x64 DEB / RPM。
- macOS 发布包使用 Developer ID 签名、Apple 公证及 stapler 票据验证。
- Windows 安装包当前使用未签名发行，源码内保留 Windows 打包配置。

GitHub Actions 的 `Build desktop packages` 工作流在平台原生运行器上打包，并实际启动应用验证内置知识和 PDF 原生解析、封面生成。Intel Mac 构建结果在本机 Developer ID 签名及公证后生成 DMG 发布。

本机复用钥匙串配置时，可设置 `APPLE_KEYCHAIN_PROFILE=WorldAIVideo-notary` 后执行 `npm run dist:mac`。凭据保存在本机钥匙串。最新已公证 Apple Silicon DMG 保留于 `release/WorldModel-Studio-Latest-mac-arm64.dmg`。

Landing Page 源码位于 `landing/`，运行 `npm run landing:preview` 本地预览。页面使用应用截图和本机生成的 15 秒视频示例，支持中文、英文和日文。GitHub Pages 由 `Publish landing page` 工作流发布。
