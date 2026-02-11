# Chronicle — プロジェクト仕様書

> この文書は Claude Code での開発作業における指示書です。
> 設計方針・技術スタック・機能仕様をすべて含みます。

---

## 1. プロジェクト概要

**Chronicle** — ファイルベースのマークダウンメモアプリケーションを構築する。
データは標準 Markdown ファイルとしてディレクトリに保存し、Git で履歴管理する。
他のエディタ（VS Code, Obsidian, Typora 等）でも開ける互換性を最重要とする。

---

## 2. 技術スタック

| レイヤー | 技術 | 理由 |
|---|---|---|
| フロントエンド | **React** | エコシステム充実 |
| Markdown エディタ | **Milkdown** | Markdown ネイティブ WYSIWYG、内部データが Markdown そのままで互換性◎ |
| バックエンド | **FastAPI** (Python) | 薄い API サーバーで十分、Python はファイル操作・Git 操作が容易 |
| Git 操作 | **gitpython** | Python から Git コマンドをライブラリ経由で実行 |
| 検索（フロント） | **fuse.js** | 軽量 fuzzy match ライブラリ、オートコンプリート用 |
| 実行環境 | **Docker Compose** | フロントエンド（Nginx）+ バックエンド（FastAPI）を構成 |
| 保存形式 | **CommonMark + YAML frontmatter** | 互換性を最大化 |

---

## 3. ディレクトリ構成

### プロジェクト構成

```
project-root/
├── docker-compose.yml
├── frontend/                 # React + Milkdown
│   ├── Dockerfile
│   ├── package.json
│   └── src/
├── backend/                  # FastAPI
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
└── vault/                    # メモの実体 = Git リポジトリ（Docker ボリュームとしてマウント）
    ├── .git/
    ├── assets/
    │   └── images/
    ├── projects/
    ├── daily/
    ├── scratchpad/
    └── inbox.md
```

### vault（メモデータ）の構成

```
vault/
├── assets/
│   └── images/                          # 画像ファイル格納
│       ├── 20240115-a1b2c3.png
│       └── 20240115-d4e5f6.png
├── projects/
│   ├── _index.md                        # 「Projects」ページ自体の内容
│   ├── project-alpha/
│   │   ├── _index.md                    # Project Alpha の概要
│   │   ├── design-notes.md
│   │   ├── meeting-2024-01-15.md
│   │   └── tasks.md
│   └── project-beta/
│       └── _index.md
├── daily/
│   ├── _index.md                        # 日報トップ
│   ├── 2024-01/
│   │   ├── 2024-01-15.md
│   │   └── 2024-01-16.md
│   └── 2024-02/
│       └── ...
├── scratchpad/
│   ├── _index.md
│   └── random-idea.md
└── inbox.md                             # クイックメモ置き場
```

**ルール:**

- ディレクトリ = 親ページ、`_index.md` = そのページ自体の内容
- ディレクトリ内の `.md` ファイル = 子ページ
- ファイル名がスラッグ、frontmatter の `title` が表示名
- 階層の深さに制限なし

---

## 4. Markdown フォーマット仕様

### 基本方針

- **CommonMark 準拠**を厳守する。方言（Wikilink `[[...]]` 等）は使わない
- メタデータは **YAML frontmatter** で管理する
- ページ間リンクは **標準 Markdown 相対リンク** を使用する

### frontmatter 仕様

```yaml
---
title: ページのタイトル
type: note | daily | tasks | kanban
created: 2024-01-15T10:00:00+09:00
tags: [tag1, tag2]
---
```

`type` フィールドによりフロントエンドの表示を切り替える:

| type | 表示 |
|---|---|
| `note` | 通常の Markdown エディタ |
| `daily` | 日付ナビ付きエディタ、前日の「明日やること」を自動引用 |
| `tasks` | チェックボックスをインタラクティブに操作、進捗バー表示 |
| `kanban` | `##` 見出しをカラム、`- [ ]` をカードとして描画。ドラッグ＆ドロップ対応 |

### ノートの例

```markdown
---
title: アーキテクチャメモ
type: note
created: 2024-01-12T14:00:00+09:00
tags: [architecture, design]
---

# アーキテクチャメモ

本文...

![構成図](../assets/images/diagram-001.png)

詳細は [設計メモ](./design-notes.md) を参照。
```

### 日報の例

```markdown
---
title: 2024-01-15 日報
type: daily
created: 2024-01-15T09:00:00+09:00
---

## やったこと
- 設計レビュー

## 明日やること
- プロトタイプ着手
```

### タスクの例

```markdown
---
title: Project Alpha タスク
type: tasks
created: 2024-01-10T10:00:00+09:00
---

- [x] 要件定義
- [ ] 画面設計
- [ ] API 設計
  - [ ] エンドポイント一覧
  - [x] 認証方式決定
```

### Kanban の例

```markdown
---
title: Project Alpha ボード
type: kanban
---

## TODO

- [ ] ER図作成
- [ ] API仕様書

## Doing

- [ ] フロント画面設計

## Done

- [x] 技術選定
- [x] リポジトリ作成
```

---

## 5. API 設計

### ノート操作

```
GET    /api/notes              # ノート一覧
GET    /api/notes/:path        # ノート取得（Markdown 生テキスト）
PUT    /api/notes/:path        # ノート保存
DELETE /api/notes/:path        # ノート削除
```

### ページツリー・管理

```
GET    /api/tree               # ツリー構造を返す
GET    /api/pages/index        # ページインデックス（オートコンプリート用）
POST   /api/pages/:path/create # 子ページ作成（type 指定）
PUT    /api/pages/:path/move   # ページ移動（リンク自動書き換え込み）
GET    /api/templates/:type    # テンプレート取得
```

### 画像・アセット

```
POST   /api/assets/upload      # 画像アップロード（クリップボードペースト対応）
GET    /api/assets/:filename   # 画像配信
GET    /api/assets/index       # 画像インデックス（サムネイル付き、オートコンプリート用）
```

### Git 操作

```
POST   /api/git/commit         # 手動コミット（GC 込み）
GET    /api/git/log            # コミット履歴
GET    /api/git/diff/:hash     # 差分表示
POST   /api/git/restore/:hash  # 特定リビジョンに復元
```

### メンテナンス

```
POST   /api/gc                 # 手動 GC トリガー（未参照画像削除）
GET    /api/gc/preview         # GC プレビュー（何が消えるか確認）
GET    /api/links/check        # リンク切れ検出
```

### 検索

```
GET    /api/search             # 全文検索（クエリパラメータで条件指定）
```

### ツリー API レスポンス例

```json
{
  "name": "vault",
  "children": [
    {
      "name": "projects",
      "title": "Projects",
      "type": "note",
      "path": "projects/_index.md",
      "children": [
        {
          "name": "project-alpha",
          "title": "Project Alpha",
          "children": [
            { "name": "tasks.md", "title": "タスク", "type": "tasks" },
            { "name": "design-notes.md", "title": "設計メモ", "type": "note" }
          ]
        }
      ]
    },
    {
      "name": "daily",
      "title": "日報",
      "children": []
    }
  ]
}
```

---

## 6. 画像管理

### アップロードフロー（クリップボードペースト）

```
ユーザーが Ctrl+V
  → paste イベント発火
  → clipboard に image/png 等があるか判定
  → あれば POST /api/assets/upload に送信
  → レスポンス: { "path": "assets/images/20240115-a1b2c3.png" }
  → エディタに ![](../assets/images/20240115-a1b2c3.png) を挿入
```

- ファイル名は `{YYYYMMDD}-{6桁短縮ハッシュ}.{ext}` 形式
- 保存先は `vault/assets/images/`

### 画像ガベージコレクション（GC）

**方針:** Markdown ファイルから参照されなくなった画像を自動削除する。

**参照検出パターン:**

```
![alt](path)          — 標準 Markdown 画像
<img src="path">      — HTML 画像タグ
```

**GC のタイミング:**

1. **Git コミット時（メイン）** — コミット直前に全 `.md` をスキャンし、未参照画像を特定・削除してからコミット。削除も履歴に含まれるため、誤削除時は Git から復元可能
2. **定期 GC（補助）** — バックエンドで 10 分ごとに実行

**安全策:**

- **猶予期間（grace period）:** 作成から 5 分以内の画像は GC 対象外とする（アップロード直後〜Markdown 挿入までのタイムラグ対策）
- **コメントアウトされた参照:** 安全側に倒し、HTML コメント内の参照も「有効」として扱う（削除しない）

### 画像の Git 管理

- `vault/assets/images/` を Git にそのまま含める（シンプル方式）
- 小〜中規模（数百枚程度）なら問題なし
- 将来リポジトリが肥大化した場合は Git LFS に移行可能

---

## 7. リンクオートコンプリート

### 動作フロー

```
ユーザーが [ を入力
  → オートコンプリートポップアップ起動
  → キー入力に応じてページ一覧をインクリメンタル fuzzy 検索
  → 候補を選択
  → [選択したページのタイトル](../relative/path.md) が挿入される
```

### ポップアップ UI

```
┌─────────────────────────────────────────────┐
│ 🔍 desig                                    │
├─────────────────────────────────────────────┤
│ 📝 設計メモ                                  │
│    projects/project-alpha/design-notes.md    │
│                                              │
│ 📝 DB設計方針                                │
│    projects/project-beta/db-design.md        │
│                                              │
│ ✅ 設計タスク                                 │
│    projects/project-alpha/tasks.md           │
└─────────────────────────────────────────────┘
```

- **タイトル**（frontmatter `title`）を主表示、**パス**と **type アイコン**を補助表示
- **検索対象:** タイトルとファイルパスの両方に対して fuzzy match（fuse.js）
- **データソース:** `GET /api/pages/index` から取得。起動時にフロントエンドにロードし、ファイル変更時に更新

### 相対パス自動計算

挿入リンクは**現在編集中のファイルからの相対パス**を自動計算する:

```
現在: projects/project-alpha/tasks.md
選択: projects/project-alpha/design-notes.md
挿入: [設計メモ](./design-notes.md)

現在: daily/2024-01/2024-01-15.md
選択: projects/project-alpha/design-notes.md
挿入: [設計メモ](../../projects/project-alpha/design-notes.md)
```

### 画像オートコンプリート

`![` 入力時にも同様にオートコンプリートを起動:

```
┌─────────────────────────────────────────────┐
│ 🔍 diagram                                  │
├─────────────────────────────────────────────┤
│ 🖼 [thumb] diagram-001.png                  │
│            assets/images/diagram-001.png     │
│                                              │
│ 🖼 [thumb] diagram-flow-002.png             │
│            assets/images/diagram-flow-002.png│
└─────────────────────────────────────────────┘
```

---

## 8. リンク整合性

### リンク切れ検出

Git コミット時（GC と同タイミング）に全 Markdown のリンク先を検証し、リンク切れがあれば警告する。

```
GET /api/links/check
```

レスポンス例:

```json
{
  "broken": [
    {
      "file": "projects/project-alpha/tasks.md",
      "line": 12,
      "link": "./old-page.md",
      "suggestion": "./renamed-page.md"
    }
  ]
}
```

### ページ移動時のリンク自動書き換え

`PUT /api/pages/:path/move` 実行時に、移動対象ファイルを参照している全 Markdown 内のリンクパスを自動で書き換える。

---

## 9. 全文検索

### 基本方針

vault 内の全 Markdown ファイルを対象とした全文検索機能を提供する。
初期実装は Python によるファイル直接走査（grep 方式）で実装し、ファイル数が増大した場合は Meilisearch 等の検索エンジンへ移行可能な設計とする。

### API

```
GET /api/search?q={query}&regex=false&case=false&type={type}&path={path_prefix}&page=1&per_page=20
```

パラメータ:

- `q` — 検索クエリ（必須）
- `regex` — 正規表現モード（デフォルト: false）
- `case` — 大文字小文字の区別（デフォルト: false）
- `type` — ページタイプでフィルタ（note / daily / tasks / kanban、省略時は全タイプ）
- `path` — ディレクトリパスでフィルタ（例: `projects/`、省略時は全体）
- `page`, `per_page` — ページネーション

レスポンス例:

```json
{
  "query": "設計",
  "total": 12,
  "results": [
    {
      "path": "projects/project-alpha/design-notes.md",
      "title": "設計メモ",
      "type": "note",
      "matches": [
        {
          "line": 15,
          "context": "...今回の**設計**方針としては、ファイルベースを..."
        },
        {
          "line": 42,
          "context": "...DB**設計**については以下の通り..."
        }
      ]
    },
    {
      "path": "projects/project-alpha/tasks.md",
      "title": "タスク",
      "type": "tasks",
      "matches": [
        {
          "line": 8,
          "context": "...[ ] API **設計**..."
        }
      ]
    }
  ]
}
```

### バックエンド実装方針（grep 方式）

- vault 内の全 `.md` ファイルを走査し、クエリ文字列（または正規表現）でマッチングする
- マッチした行の前後コンテキスト（前後 30 文字程度）を切り出して返す
- マッチ箇所を `**keyword**` 形式でハイライト情報として返す
- frontmatter を解析し、`type` / `path` フィルタを適用する
- ファイル数が数千程度であれば十分な速度が出る

### 将来的な移行パス

ファイル数が数万規模になった場合、Meilisearch コンテナを Docker Compose に追加して移行する。Meilisearch は CJK（日本語）トークナイズが標準で組み込まれている。バックエンドの検索 API のインターフェースは変えず、内部実装のみ差し替える設計とする。

### フロントエンド UI

VS Code の `Ctrl+Shift+F` ライクな検索パネルを実装する:

```
┌─────────────────────────────────────────────┐
│ 🔍 設計                              [検索]  │
│ ☐ 大文字小文字を区別  ☐ 正規表現            │
│ [タイプ: 全て ▼] [パス: 全体 ▼]             │
├─────────────────────────────────────────────┤
│                                              │
│ 📝 設計メモ                        3 matches │
│    projects/project-alpha/design-notes.md    │
│                                              │
│    L15: ...今回の【設計】方針としては、ファイ... │
│    L42: ...DB【設計】については以下の通り...     │
│    L58: ...画面【設計】の詳細は...              │
│                                              │
│ ✅ タスク                          1 match   │
│    projects/project-alpha/tasks.md           │
│                                              │
│    L8:  ...[ ] API 【設計】...               │
│                                              │
│ 📝 2024-01-15 日報                 1 match   │
│    daily/2024-01/2024-01-15.md               │
│                                              │
│    L5:  ...【設計】レビュー...                 │
│                                              │
└─────────────────────────────────────────────┘
```

動作:

- インクリメンタル検索（入力から 300ms debounce 後に自動検索）
- 各マッチ行クリックで該当ファイルの該当行にジャンプ
- ファイル名クリックでファイルを開く
- キーボードショートカット `Ctrl+Shift+F` で検索パネルをトグル

---

## 10. 日報の自動化

- **「今日の日報を作成」ボタン** — テンプレートから `daily/YYYY-MM/YYYY-MM-DD.md` を自動生成
- **前日引用:** 前日の「明日やること」セクションを取得し、新しい日報の「やること」に自動挿入
- **カレンダービュー:** `daily/` 配下のファイル名（日付）からカレンダーを描画。日付クリックで該当日報を開く

---

## 11. Docker Compose 構成

```yaml
# docker-compose.yml（概要）
services:
  frontend:
    build: ./frontend
    ports:
      - "3000:80"       # Nginx で React ビルド済みファイルを配信
    depends_on:
      - backend

  backend:
    build: ./backend
    ports:
      - "8000:8000"     # FastAPI
    volumes:
      - ./vault:/app/vault   # メモデータをマウント
```

---

## 12. 開発の進め方（推奨順序）

### Phase 1: 基盤

1. Docker Compose でフロントエンド + バックエンドの雛形を構築
2. FastAPI でファイル読み書き API（`/api/notes`）を実装
3. React + Milkdown で基本的な Markdown 編集画面を実装
4. vault ディレクトリの初期構造を作成

### Phase 2: ページ階層とナビゲーション

5. ツリー API（`/api/tree`）を実装
6. サイドバーにツリービューを実装
7. ページ作成・移動 API を実装
8. frontmatter `type` に応じた表示切り替え

### Phase 3: 画像とオートコンプリート

9. 画像アップロード API + クリップボードペースト対応
10. リンクオートコンプリート（`[` 入力時）
11. 画像オートコンプリート（`![` 入力時）
12. ページインデックス API

### Phase 4: 検索

13. バックエンド全文検索 API（grep 方式）を実装
14. フロントエンド検索パネル UI を実装（Ctrl+Shift+F）
15. インクリメンタル検索 + 結果から該当行ジャンプ

### Phase 5: Git 連携とメンテナンス

16. gitpython で Git 操作 API（commit, log, diff, restore）
17. 画像 GC（コミット時 + 定期）
18. リンク切れ検出
19. ページ移動時のリンク自動書き換え

### Phase 6: 便利機能

20. 日報テンプレート自動生成 + 前日引用
21. カレンダービュー
22. Kanban ビュー（ドラッグ＆ドロップ）
23. タスクビュー（進捗バー）
