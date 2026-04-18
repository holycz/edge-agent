本文档用于指导智能体理解、生成、维护和扩展「AI划词问答助手」插件源代码，明确插件核心逻辑、代码结构、接口规范及智能体操作约束，确保智能体生成的代码与原插件保持一致性、可运行性，避免出现报错（如CORS跨域、消息通信失败等）。

一、项目架构

本项目已重构为前后端分离架构：

```
edge-agent/
├── frontend/          # 浏览器插件前端（只存UI和通信）
│   ├── background.js   # 服务工作者：转发请求到后端
│   ├── content.js      # 页面内容提取
│   ├── sidepanel.js    # 侧边栏UI逻辑
│   ├── sidepanel.html
│   ├── sidepanel.css
│   ├── style.css
│   ├── manifest.json
│   └── lib/            # 依赖库（marked, highlight.js）
├── backend/           # Python 后端（敏感功能）
│   ├── run.py          # 启动入口
│   ├── requirements.txt
│   ├── .env            # API Key 配置（不提交git）
│   ├── .env.example
│   └── app/
│       ├── __init__.py
│       ├── main.py       # FastAPI 应用入口
│       ├── config.py     # 配置读取/动态更新
│       ├── schemas.py    # Pydantic 数据模型
│       ├── ai_client.py  # AI API SSE 流式请求
│       ├── routes.py     # API 路由
│       └── prompts.py    # 提示词模板
└── AGENTS.md          # 本文档
```

二、前端（frontend/）

插件基于Chrome/Edge浏览器Manifest V3开发，核心功能是实现「划词交互+AI问答」，解决浏览器插件调用后端服务的跨域问题，提供简洁易用的UI交互。

### 2.1 核心功能

- 划词操作：选中网页任意文字，右键菜单可选择「AI问答」「文字改写」「内容总结」，触发AI请求并展示结果。

- 页面对话：双击网页空白处打开AI对话面板，输入问题可基于当前网页全文内容进行AI问答。

- UI交互：可拖动的对话面板，支持关闭、输入发送、消息展示，样式简洁且适配各类网页。

### 2.2 前端与后端通信

前端通过 `background.js` 转发流式请求到后端：

1. `GET_BACKEND_URL` - 获取后端服务地址（默认 http://localhost:8765）
2. `API_STREAM_REQUEST` - 发送流式请求到后端
3. 前端通过 `fetch` 调用后端 REST API：
   - `GET  /api/config` - 获取配置（不包含敏感信息如API Key）
   - `POST /api/config` - 保存配置（仅支持运行时配置，不含API Key/URL/Model）
   - `POST /api/build-prompt` - 构建提示词消息列表
   - `POST /api/chat` (SSE) - 流式AI对话

**注意**：前端不直接存储或传输 API Key，所有 AI 请求都通过后端代理。

三、后端（backend/）

后端使用 FastAPI 框架，负责处理所有敏感操作和 AI 接口代理。

### 3.1 启动后端

```bash
cd backend
pip install -r requirements.txt
# 编辑 .env 文件配置 API_KEY
python run.py
```

### 3.2 后端功能

- **配置管理** (`config.py`): 从 `.env` 读取 API_KEY、API_URL、MODEL 等敏感配置。支持运行时配置更新（温度、tokens等），敏感配置只能通过 `.env` 修改。
- **AI 流式代理** (`ai_client.py`): 通过 `httpx.AsyncClient` 向 AI API 发送 SSE 请求，解析 `<think>` 标签并返回结构化流式事件。
- **提示词构建** (`prompts.py` + `routes.py`): 根据前端传来的上下文、历史对话、用户问题，构建符合各功能的提示词消息列表。
- **API 路由** (`routes.py`):
  - `GET  /api/config` - 返回安全配置（不含API Key）
  - `POST /api/config` - 更新运行时配置（不含API Key/URL/Model）
  - `POST /api/build-prompt` - 根据 action 构建 messages
  - `POST /api/chat` - SSE 流式代理到 AI API

### 3.3 环境变量配置 (.env)

```
API_KEY=your_api_key_here
API_URL=https://integrate.api.nvidia.com/v1
MODEL=qwen/qwen3-next-80b-a3b-instruct
MY_NAME=           # 用于总结领导批示时识别
OTHER_INFO=        # 额外个人身份信息
PORT=8765
```

四、开发规范

### 4.1 前端开发

- 插件代码位于 `frontend/` 目录
- 所有对 AI API 的请求必须通过 `background.js` 转发到后端
- 不存储或显示 API Key，设置面板只显示 API Key 配置状态（已配置/未配置）
- 提示词构建通过调用后端 `/api/build-prompt`，不内置完整提示词逻辑

### 4.2 后端开发

- 代码位于 `backend/app/` 目录
- 敏感配置（API_KEY, API_URL, MODEL）只能通过 `.env` 文件修改
- 运行时可修改的配置保存在内存中，重启后从 `.env` 重新加载
- 流式响应使用 `StreamingResponse` + SSE 格式

### 4.3 安全注意事项

- `.env` 文件包含 API Key，绝不能提交到 git（已配置 `backend/.gitignore`）
- 前端不接触 API Key，配置界面只显示状态
- 后端不将 API Key 返回给前端

五、接口规范

### 5.1 后端 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/config | 获取安全配置 |
| POST | /api/config | 更新运行时配置（ConfigUpdate）|
| POST | /api/build-prompt | 构建提示词（PromptRequest）|
| POST | /api/chat | 流式对话（ChatRequest，SSE）|

### 5.2 数据模型

详见 `backend/app/schemas.py` 文件。

### 5.3 流式事件格式

```json
{"type": "STREAM_CHUNK", "content": "...", "contentType": "think_start"}
{"type": "STREAM_CHUNK", "content": "思考内容", "contentType": "think"}
{"type": "STREAM_CHUNK", "content": "", "contentType": "think_end"}
{"type": "STREAM_CHUNK", "content": "回答内容", "contentType": "content"}
{"type": "STREAM_DONE"}
{"type": "STREAM_ERROR", "error": "错误信息"}
```

六、调试与部署

### 6.1 本地开发

1. 启动后端：`cd backend && python run.py`
2. 加载插件：Chrome/Edge 开发者模式，加载 `frontend/` 目录
3. 检查后端连接：设置面板应显示 "已配置"（API Key 配置时）

### 6.2 生产部署

- 后端需要部署到可访问的服务器
- 修改 `frontend/background.js` 中的 `BACKEND_URL` 常量或实现动态配置
- 建议使用 HTTPS 和认证中间件保护后端 API
