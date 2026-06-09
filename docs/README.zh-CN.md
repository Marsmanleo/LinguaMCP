[English](../README.md) | [繁體中文（台灣）](README.zh-TW.md) | [繁體中文（香港）](README.zh-HK.md) | **简体中文**

---

# LinguaMCP

> AI 语言教师的开放课程协议——通过每日练习，自然学习任何语言。

## 是什么？

LinguaMCP 是一个 [MCP（Model Context Protocol）](https://modelcontextprotocol.io/) 服务器，提供结构化课程的每日语言练习。支持 Claude、Cursor、Windsurf，或任何支持 MCP 的 AI 工具。

不用闪卡，不钻语法。你通过对话自然练习。AI 教师知道你学过什么、追踪你的进度，在你准备好的时候引入新内容。

## 快速开始

### 方式一：零配置 SQLite（推荐）

```bash
# 全局安装
npm install -g lingua-mcp

# 初始化数据库与课程
lingua-mcp-init

# 启动服务器
lingua-mcp
```

就这么简单。不需要设置数据库、不需要 API 密钥、不需要云服务。你的学习进度存储在 `~/.lingua-mcp/lingua.db`。

### 方式二：Supabase（云或自建）

```bash
# 克隆并安装
git clone https://github.com/Marsmanleo/LinguaMCP.git
cd LinguaMCP
npm install

# 设置环境
cp .env.example .env
# 编辑 .env 填入你的 Supabase 凭证

# 运行 Supabase 迁移（在 supabase/migrations/ 中）
# 然后导入课程
npm run ingest

# 启动服务器
npm start
```

## 配置你的 AI 工具

### Claude Desktop

添加到你的 `claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "lingua": {
      "command": "npx",
      "args": ["-y", "lingua-mcp"]
    }
  }
}
```

### Cursor / Windsurf

添加到你的 MCP 设置：

```json
{
  "lingua": {
    "command": "node",
    "args": ["/path/to/LinguaMCP/server.mjs"]
  }
}
```

### Supabase 模式

启动前设置环境变量：

```bash
SUPABASE_BASE_URL=https://your-project.supabase.co \
SUPABASE_ANON_KEY=your-anon-key \
node server.mjs
```

## MCP 工具

连接后，你的 AI 工具获得 **六个工具**——三个用于练习，三个用于内容管理：

### 练习工具

| 工具 | 说明 |
|------|------|
| `get_today_lesson` | 返回你下一个未掌握的课程，含上下文和练习提示 |
| `get_user_progress` | 显示已掌握、已练习和剩余课程数 |
| `log_response` | 记录你的练习回答（评分 1-5，≥4 分为已掌握） |

### 管理工具

| 工具 | 说明 |
|------|------|
| `add_lesson` | 向章节添加新课程（标题、内容、类型、难度、标签） |
| `add_resource` | 为课程关联外部资源（YouTube、文章、播客） |
| `remove_lesson` | 软删除课程（标记为已弃用，不再提供学习） |

#### 添加课程

你的 AI 可以从任何来源添加课程——YouTube 频道、文章或原创内容：

```
AI: "我找到了一个关于 'however' 和 'although' 的优质 YouTube 视频。
     要把它添加为课程吗？"

你: "好，添加到连接词技能书中"

AI: → 调用 add_lesson（标题、内容、难度）
   ← "课程添加成功"
```

#### 管理资源

为任何课程关联外部学习材料：

```
AI: → 调用 add_resource（lesson_id, url, type="youtube"）
   ← "资源 'Emily Daily English EP1' 已添加"
```

#### 移除低质量课程

将课程标记为已弃用而不删除数据：

```
AI: → 调用 remove_lesson（lesson_id, reason="不太有用"）
   ← "课程已弃用"
```

## 课程内容

当前使用 [English-level-up-tips](https://github.com/byoungd/English-level-up-tips)（5 万+ Star，MIT 许可）的结构化内容。

**可用技能书：**
- 🔗 **连接词** — 4 个章节，20 节课，涵盖对比、补充、因果和条件连接词

更多技能书和语言即将推出。

## 工作原理

```
┌─────────────┐     MCP      ┌─────────────┐     查询     ┌──────────┐
│  你的 AI    │──────────────▶│  LinguaMCP  │──────────────▶│  数据库  │
│  工具       │◀──────────────│  服务器     │◀──────────────│          │
└─────────────┘  课程与进度   └─────────────┘  进度与课程   └──────────┘
```

1. 你正常与 AI 工具聊天
2. AI 调用 LinguaMCP 获取今日课程
3. 你通过对话练习
4. LinguaMCP 追踪你已掌握的内容和下一步

## 架构

```
server.mjs              ← MCP 服务器入口
storage/
  interface.mjs         ← 存储接口
  supabase.mjs          ← Supabase/PostgREST 适配器
  sqlite.mjs            ← SQLite 适配器（零配置）
schema/
  sqlite.sql            ← SQLite schema
scripts/
  ingest-english-tips.ts  ← 内容导入（Supabase）
  init-sqlite.mjs         ← 内容导入（SQLite）
src/
  index.ts              ← TypeScript 类型定义
```

## 存储模式

| 模式 | 条件 | 数据库 | 适用于 |
|------|------|--------|--------|
| **SQLite** | 未设置 `SUPABASE_BASE_URL` | `~/.lingua-mcp/lingua.db` | 个人使用、自建 |
| **Supabase** | 已设置 `SUPABASE_BASE_URL` | PostgreSQL via PostgREST | 云端、多用户、团队 |

相同的工具、相同的响应、相同的课程。服务器自动检测使用哪种模式。

## 贡献

关于如何添加课程内容、存储适配器或语言支持，请参阅 [CONTRIBUTING.md](../CONTRIBUTING.md)。

## 许可

Apache License 2.0——详见 [LICENSE](../LICENSE)。

课程内容来自 English-level-up-tips，采用 MIT 许可。

## 相关项目

- [MarsNMe](https://github.com/Marsmanleo/MarsNMe) — AI 记忆伙伴（姊妹项目）
- [Model Context Protocol](https://modelcontextprotocol.io/) — 让这一切成为可能的协议
