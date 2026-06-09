# LinguaMCP

> AI 語言教師的開放課程協定 — 透過每日練習，自然學習任何語言。

## 是什麼？

LinguaMCP 是一個 [MCP（Model Context Protocol）](https://modelcontextprotocol.io/) 伺服器，提供結構化課程的每日語言練習。支援 Claude、Cursor、Windsurf，或任何支援 MCP 的 AI 工具。

不用閃卡，不鑽文法。你透過對話自然練習。AI 教師知道你學過什麼、追蹤你的進度，在你準備好的時候引入新內容。

## 快速開始

### 方式一：零配置 SQLite（推薦）

```bash
# 全域安裝
npm install -g lingua-mcp

# 初始化資料庫與課程
lingua-mcp-init

# 啟動伺服器
lingua-mcp
```

就這麼簡單。不需要設定資料庫、不需要 API 金鑰、不需要雲端服務。你的學習進度儲存在 `~/.lingua-mcp/lingua.db`。

### 方式二：Supabase（雲端或自架）

```bash
# 複製並安裝
git clone https://github.com/Marsmanleo/LinguaMCP.git
cd LinguaMCP
npm install

# 設定環境變數
cp .env.example .env
# 編輯 .env，填入你的 Supabase 憑證

# 執行 Supabase 遷移（在 supabase/migrations/）
# 然後匯入課程
npm run ingest

# 啟動伺服器
npm start
```

## 設定你的 AI 工具

### Claude Desktop

加入你的 `claude_desktop_config.json`：

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

加入你的 MCP 設定：

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

連接後，你的 AI 工具會獲得**六個工具** — 三個用於練習、三個用於內容管理：

### 練習工具

| 工具 | 說明 |
|------|------|
| `get_today_lesson` | 回傳你下一個尚未掌握的課程，附帶上下文與練習提示 |
| `get_user_progress` | 顯示已掌握、已練習、剩餘數量 |
| `log_response` | 記錄你的練習回覆（分數 1-5，≥4 = 已掌握） |

### 內容管理工具

| 工具 | 說明 |
|------|------|
| `add_lesson` | 新增課程到章節（標題、內容、類型、難度、標籤） |
| `add_resource` | 連結外部資源到課程（YouTube、文章、Podcast） |
| `remove_lesson` | 軟刪除課程（標記為已棄用，不會再派發） |

#### 新增課程

AI 可以從任何來源新增課程 — YouTube 頻道、文章、或原創內容：

```
AI：「我找到一支很棒的 YouTube 影片，講解 however 和 although 的差異。
     要加入為課程嗎？」

你：「好，加到 Linking Words 技能書裡」

AI：→ 呼叫 add_lesson，帶入標題、內容、難度
   ← 「課程新增成功」
```

#### 管理資源

連結外部教材到任何課程做為參考：

```
AI：→ 呼叫 add_resource，帶入 lesson_id、url、type="youtube"
   ← 「資源『Emily Daily English EP1』已加入」
```

#### 移除低品質課程

將課程標記為已棄用，不會刪除資料：

```
AI：→ 呼叫 remove_lesson，帶入 lesson_id、reason="內容過時"
   ← 「課程已標記為棄用」
```

## 課程

目前使用 [English-level-up-tips](https://github.com/byoungd/English-level-up-tips)（5 萬+ stars，MIT License）的結構化內容。

**可用技能書：**
- 🔗 **Linking Words（連接詞）** — 4 個章節、20 課，涵蓋對比、遞進、因果、條件連接詞

更多技能書與語言即將推出。

## 運作方式

```
┌─────────────┐     MCP      ┌─────────────┐     查詢     ┌──────────┐
│  你的 AI    │──────────────▶│  LinguaMCP  │──────────────▶│  資料庫  │
│  工具       │◀──────────────│  伺服器     │◀──────────────│          │
└─────────────┘   課程與進度   └─────────────┘   進度與課程   └──────────┘
```

1. 你和 AI 工具正常對話
2. AI 呼叫 LinguaMCP 取得今日課程
3. 你透過對話練習
4. LinguaMCP 追蹤你掌握了什麼、下一步是什麼

## 儲存模式

| 模式 | 何時使用 | 資料庫 | 適合 |
|------|----------|--------|------|
| **SQLite** | 未設定 `SUPABASE_BASE_URL` | `~/.lingua-mcp/lingua.db` | 個人使用、自架 |
| **Supabase** | 已設定 `SUPABASE_BASE_URL` | PostgreSQL（PostgREST） | 雲端、多用戶、團隊 |

同樣的工具、同樣的回應、同樣的課程。伺服器自動偵測使用哪個模式。

## 貢獻

請見 [CONTRIBUTING.md](../CONTRIBUTING.md) 了解如何加入課程內容、儲存介面卡、或語言支援。

## 授權

Apache License 2.0 — 見 [LICENSE](../LICENSE)。

課程內容來自 English-level-up-tips，採用 MIT 授權。

## 相關專案

- [MarsNMe](https://github.com/Marsmanleo/MarsNMe) — AI 記憶伴侶（姊妹專案）
- [Model Context Protocol](https://modelcontextprotocol.io/) — 讓這一切成為可能的協定
