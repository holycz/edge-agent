本文档用于指导智能体理解、生成、维护和扩展「AI划词问答助手」插件源代码，明确插件核心逻辑、代码结构、接口规范及智能体操作约束，确保智能体生成的代码与原插件保持一致性、可运行性，避免出现报错（如CORS跨域、消息通信失败等）。

一、项目架构

本项目已重构为前后端分离架构：

```
edge-agent/
├── frontend/                    # 浏览器插件前端（只存UI和通信）
│   ├── background.js            # 服务工作者：转发请求到后端
│   ├── content.js               # 页面内容提取
│   ├── sidepanel.js             # 侧边栏UI逻辑
│   ├── sidepanel.html
│   ├── sidepanel.css
│   ├── style.css
│   ├── manifest.json
│   └── lib/                     # 依赖库（marked, highlight.js）
├── backend/                     # Python 后端（敏感功能）
│   ├── run.py                   # 启动入口
│   ├── requirements.txt
│   ├── .env                     # API Key 配置（不提交git）
│   ├── .env.example
│   └── app/
│       ├── __init__.py
│       ├── main.py              # FastAPI 应用入口
│       ├── config.py            # 配置读取/动态更新
│       ├── schemas.py           # Pydantic 数据模型
│       ├── ai_client.py         # AI API SSE 流式请求
│       ├── routes.py            # API 路由
│       ├── prompts.py           # 提示词模板
│       └── prompt_builder.py    # 提示词构建器
└── AGENTS.md                    # 本文档
```

二、前端（frontend/）

插件基于Chrome/Edge浏览器Manifest V3开发，核心功能是实现「划词交互+AI问答」，解决浏览器插件调用后端服务的跨域问题，提供简洁易用的UI交互。

### 2.1 核心功能

- 划词操作：选中网页任意文字，右键菜单可选择「AI问答」「文字改写」「内容总结」，触发AI请求并展示结果。

- 页面对话：双击网页空白处打开AI对话面板，输入问题可基于当前网页全文内容进行AI问答。

- UI交互：可拖动的对话面板，支持关闭、输入发送、消息展示，样式简洁且适配各类网页。

### 2.2 智能体架构

前端不再使用 `/api/build-prompt` 构建提示词，而是直接调用智能体接口：

| 智能体ID | 接口路径 | 功能说明 | 对应前端操作 |
|----------|----------|----------|--------------|
| 1 | `/sxzypt/scene_gateway/agent/open/1` | 网页总结智能体 | 未选中文本时点击「总结该网页」 |
| 2 | `/sxzypt/scene_gateway/agent/open/2` | 文本润色智能体 | 选中文本时点击「润色改写」 |
| 3 | `/sxzypt/scene_gateway/agent/open/3` | 文本稽核智能体 | 选中文本时点击「稽核检查」 |
| 4 | `/sxzypt/scene_gateway/agent/open/4` | AI问答智能体 | 页面对话输入问题 |
| 205a099ade6a4c4fb454e11f96ee6a18 | `/sxzypt/scene_gateway/agent/open/205a099ade6a4c4fb454e11f96ee6a18` | 公文批示总结智能体 | 未选中文本时点击「总结领导批示」 |

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

- **配置管理** (`config.py`): 从 `.env` 读取 API_KEY、API_URL、MODEL 等敏感配置。
- **AI 流式代理** (`ai_client.py`): 通过 `httpx.AsyncClient` 向 AI API 发送 SSE 请求，解析 `reasoning_content` 等字段。
- **提示词构建** (`prompts.py` + `prompt_builder.py`): 各智能体根据功能自动构建提示词。
- **API 路由** (`routes.py`): 5个智能体接口（见上表）

### 3.3 环境变量配置 (.env)

```
API_KEY=your_api_key_here
API_URL=https://integrate.api.nvidia.com/v1
MODEL=qwen/qwen3-next-80b-a3b-instruct
MY_NAME=                     # 用于总结领导批示时识别
OTHER_INFO=                  # 额外个人身份信息
PORT=8765
```

### 3.4 流式事件格式

后端返回标准 OpenAI SSE 格式：

```
data: {"choices": [{"delta":{"status":"processing"}}]}          # 思考开始
data: {"choices": [{"delta":{"reasoning_content":"..."}}]}       # 思考内容
data: {"choices": [{"delta":{"performanceMetrics":{...}}}]}        # 思考结束，性能指标
data: {"choices": [{"delta":{"content":"回答内容"}}]}              # 回答内容
data: {"choices": [{"delta":{"content":"end#end"}}]}               # 流结束
```

四、开发规范

### 4.1 前端开发

- 插件代码位于 `frontend/` 目录
- 所有对 AI API 的请求必须通过 `background.js` 转发到后端
- 不存储或显示 API Key
- 配置保存在 `chrome.storage.sync` 本地存储
- 调用智能体时使用 `callAgent(agentId, text, action, pageContent, pageMetadata)` 函数

### 4.2 后端开发

- 代码位于 `backend/app/` 目录
- 敏感配置（API_KEY, API_URL, MODEL）只能通过 `.env` 文件修改
- 流式响应使用 `StreamingResponse` + SSE 格式
- 每个智能体独立路由，在内部调用 `PromptBuilder` 构建提示词

### 4.3 安全注意事项

- `.env` 文件包含 API Key，绝不能提交到 git（已配置 `backend/.gitignore`）
- 前端不接触 API Key
- 后端不将 API Key 返回给前端

五、接口规范

### 5.1 后端 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/sxzypt/scene_gateway/agent/open/1` | 网页总结智能体（SSE）|
| POST | `/sxzypt/scene_gateway/agent/open/2` | 文本润色智能体（SSE）|
| POST | `/sxzypt/scene_gateway/agent/open/3` | 文本稽核智能体（SSE）|
| POST | `/sxzypt/scene_gateway/agent/open/4` | AI问答智能体（SSE）|
| POST | `/sxzypt/scene_gateway/agent/open/205a099ade6a4c4fb454e11f96ee6a18` | 公文批示总结智能体（SSE）|

### 5.2 数据模型

请求体格式（`ChatRequest`）：

```json
{
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "stream": true,
  "enable_thinking": true,
  "page_cookies": {}
}
```

### 5.3 前端消息通信

1. `GET_BACKEND_URL` - 获取后端服务地址（默认 http://localhost:8765）
2. `API_STREAM_REQUEST` - 发送流式请求到后端，需包含 `endpoint` 字段

六、调试与部署

### 6.1 本地开发

1. 启动后端：`cd backend && python run.py`
2. 加载插件：Chrome/Edge 开发者模式，加载 `frontend/` 目录
3. 检查后端连接：尝试发送消息，看是否能收到流式响应

### 6.2 生产部署

- 后端需要部署到可访问的服务器
- 修改 `frontend/background.js` 中的 `BACKEND_URL` 常量或实现动态配置
- 建议使用 HTTPS 和认证中间件保护后端 API
