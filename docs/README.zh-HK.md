[English](../README.md) | [繁體中文（台灣）](README.zh-TW.md) | **繁體中文（香港）** | [简体中文](README.zh-CN.md)

---

# LinguaMCP

> AI 語言導師嘅開放課程協議 — 透過每日練習，自然學習任何語言。

## 係咩嚟？

LinguaMCP 係一個 [MCP（Model Context Protocol）](https://modelcontextprotocol.io/) 伺服器，提供結構化課程嘅每日語言練習。支援 Claude、Cursor、Windsurf，或者任何支援 MCP 嘅 AI 工具。

唔用閃卡，唔鑽文法。你透過對話自然練習。AI 導師知道你學過咩、追蹤你嘅進度，喺你準備好嘅時候引入新內容。

## 快速開始

### 方式一：零配置 SQLite（推薦）

```bash
# 全域安裝
npm install -g lingua-mcp

# 初始化資料庫同課程
lingua-mcp-init

# 啟動伺服器
lingua-mcp
```

就咁簡單。唔使設定資料庫、唔使 API key、唔使雲端服務。你嘅學習進度儲存喺 `~/.lingua-mcp/lingua.db`。

### 方式二：Supabase（雲端或自架）

```bash
# 複製同安裝
git clone https://github.com/Marsmanleo/LinguaMCP.git
cd LinguaMCP
npm install

# 設定環境變數
cp .env.example .env
# 編輯 .env，填入你嘅 Supabase 憑證

# 執行 Supabase 遷移（喺 supabase/migrations/）
# 然後匯入課程
npm run ingest

# 啟動伺服器
npm start
```

## 設定你嘅 AI 工具

### Claude Desktop

加入你嘅 `claude_desktop_config.json`：

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

加入你嘅 MCP 設定：

```json
{
  "lingua": {
    "command": "node",
    "args": ["/path/to/LinguaMCP/server.mjs"]
  }
}
```

### Supabase 模式

啟動前設定環境變數：

```bash
SUPABASE_BASE_URL=https://your-project.supabase.co \
SUPABASE_ANON_KEY=your-anon-key \
node server.mjs
```

## MCP 工具

連接後，你嘅 AI 工具會得到 **六個工具** — 三個練習用、三個內容管理用：

### 練習工具

| 工具 | 說明 |
|------|------|
| `get_today_lesson` | 返回你下一個未掌握嘅課程，附帶上下文同練習提示 |
| `get_user_progress` | 顯示已掌握、已練習、剩餘數量 |
| `log_response` | 記錄你嘅練習回覆（分數 1-5，≥4 = 已掌握） |

### 內容管理工具

| 工具 | 說明 |
|------|------|
| `add_lesson` | 加入新課程到章節（標題、內容、類型、難度、標籤） |
| `add_resource` | 連結外部資源到課程（YouTube、文章、Podcast） |
| `remove_lesson` | 軟刪除課程（標記為已棄用，唔會再派發） |

#### 加入課程

AI 可以從任何來源加入課程 — YouTube 頻道、文章、或原創內容：

```
AI：「我搵到一段好正嘅 YouTube 片，講 however 同 although 嘅分別。
     要唔要加做課程？」

你：「好啊，加落 Linking Words 技能書度」

AI：→ 呼叫 add_lesson，帶標題、內容、難度
   ← 「課程加入成功」
```

#### 管理資源

連結外部教材到任何課程做參考：

```
AI：→ 呼叫 add_resource，帶 lesson_id、url、type="youtube"
   ← 「資源『Emily Daily English EP1』已加入」
```

#### 移除低質素課程

將課程標記為已棄用，唔會刪除資料：

```
AI：→ 呼叫 remove_lesson，帶 lesson_id、reason="冇咩用"
   ← 「課程已標記為棄用」
```

## 課程

目前使用 [English-level-up-tips](https://github.com/byoungd/English-level-up-tips)（5 萬+ stars，MIT License）嘅結構化內容。

**可用技能書：**
- 🔗 **Linking Words（連接詞）** — 4 個章節、20 課，涵蓋對比、遞進、因果、條件連接詞

更多技能書同語言即將推出。

## 運作方式

```
┌─────────────┐     MCP      ┌─────────────┐     查詢     ┌──────────┐
│  你嘅 AI    │──────────────▶│  LinguaMCP  │──────────────▶│  資料庫  │
│  工具       │◀──────────────│  伺服器     │◀──────────────│          │
└─────────────┘   課程同進度   └─────────────┘   進度同課程   └──────────┘
```

1. 你同 AI 工具正常傾偈
2. AI 呼叫 LinguaMCP 攞今日嘅課程
3. 你透過對話練習
4. LinguaMCP 追蹤你掌握咗咩、下一步係咩

## 儲存模式

| 模式 | 何時使用 | 資料庫 | 適合 |
|------|----------|--------|------|
| **SQLite** | 冇設定 `SUPABASE_BASE_URL` | `~/.lingua-mcp/lingua.db` | 個人使用、自架 |
| **Supabase** | 有設定 `SUPABASE_BASE_URL` | PostgreSQL（PostgREST） | 雲端、多用戶、團隊 |

同樣嘅工具、同樣嘅回應、同樣嘅課程。伺服器自動偵測使用邊個模式。

## 貢獻

睇 [CONTRIBUTING.md](../CONTRIBUTING.md) 了解如何加入課程內容、儲存適配器、或語言支援。

## 授權

Apache License 2.0 — 見 [LICENSE](../LICENSE)。

課程內容來自 English-level-up-tips，採用 MIT 授權。

## 相關項目

- [MarsNMe](https://github.com/Marsmanleo/MarsNMe) — AI 記憶伴侶（姊妹項目）
- [Model Context Protocol](https://modelcontextprotocol.io/) — 令呢一切成為可能嘅協議
