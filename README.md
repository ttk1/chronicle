# Chronicle

> **Status: 開発中** — 基本機能は実装済みですが、改善・機能追加を継続しています。

ファイルベースのマークダウンメモアプリケーション。
データは標準 Markdown ファイルとしてディレクトリに保存し、Git で履歴管理する。
VS Code、Obsidian、Typora 等の他エディタでもそのまま開ける互換性を重視した設計。

本プロジェクトのコーディングはすべて [Claude Code](https://docs.anthropic.com/en/docs/claude-code) を使用して行っています。

## 特徴

- **WYSIWYG エディタ** — Milkdown による Markdown ネイティブ編集
- **ページ階層管理** — ディレクトリ構造をツリービューで表示・操作
- **画像管理** — クリップボードペーストで画像アップロード、未参照画像の自動 GC
- **リンクオートコンプリート** — `[` 入力でページ検索、`![` で画像検索
- **全文検索** — Ctrl+Shift+F でインクリメンタル検索（正規表現対応）
- **Git 連携** — GUI からコミット・履歴閲覧・差分表示・リビジョン復元
- **日報自動生成** — テンプレートから日報を作成、前日の「明日やること」を自動引用
- **カレンダービュー** — 日報を月間カレンダーで一覧表示
- **Kanban ボード** — `##` 見出しをカラム、`- [ ]` をカードとしてドラッグ＆ドロップ
- **タスクビュー** — チェックボックスの一括操作と進捗バー表示

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | React + Vite + TypeScript + Milkdown v7 |
| バックエンド | FastAPI (Python) |
| Git 操作 | gitpython |
| 検索 (フロント) | fuse.js |
| 実行環境 | Docker Compose (Nginx + FastAPI) |
| 保存形式 | CommonMark + YAML frontmatter |

## セットアップ

### 前提条件

- Docker および Docker Compose

### 起動

```bash
docker compose build && docker compose up -d
```

- フロントエンド: http://localhost:3000
- バックエンド API: http://localhost:8000

### 停止

```bash
docker compose down
```

## ディレクトリ構成

```
chronicle/
├── docker-compose.yml
├── frontend/              # React + Milkdown
│   ├── Dockerfile
│   ├── package.json
│   └── src/
├── backend/               # FastAPI
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       └── routers/       # API エンドポイント
└── vault/                 # メモデータ (Docker ボリュームとしてマウント)
    ├── assets/images/     # アップロード画像
    ├── projects/          # プロジェクトページ
    ├── daily/             # 日報 (YYYY-MM/YYYY-MM-DD.md)
    └── inbox.md           # クイックメモ
```

## Markdown フォーマット

全てのページは CommonMark + YAML frontmatter 形式:

```markdown
---
title: ページタイトル
type: note
created: 2024-01-15T10:00:00+09:00
tags: [tag1, tag2]
---

# ページタイトル

本文...
```

### ページタイプ

| type | 表示 |
|---|---|
| `note` | Milkdown WYSIWYG エディタ |
| `daily` | 日報テンプレート (やったこと / 明日やること) |
| `tasks` | チェックボックス + 進捗バー |
| `kanban` | `##` = カラム、`- [ ]` = カード の Kanban ボード |

## API エンドポイント

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/notes/:path` | ノート取得 |
| PUT | `/api/notes/:path` | ノート保存 |
| DELETE | `/api/notes/:path` | ノート削除 |
| GET | `/api/tree` | ツリー構造取得 |
| POST | `/api/pages/:path/create` | 子ページ作成 |
| PUT | `/api/pages/:path/move` | ページ移動 |
| GET | `/api/pages/index` | ページ一覧 (オートコンプリート用) |
| POST | `/api/assets/upload` | 画像アップロード |
| GET | `/api/assets/index` | 画像一覧 |
| GET | `/api/search` | 全文検索 |
| POST | `/api/git/commit` | コミット (GC 込み) |
| GET | `/api/git/log` | コミット履歴 |
| GET | `/api/git/diff/:hash` | 差分表示 |
| POST | `/api/git/restore/:hash` | リビジョン復元 |
| POST | `/api/gc` | 画像 GC 実行 |
| GET | `/api/gc/preview` | GC プレビュー |
| GET | `/api/links/check` | リンク切れ検出 |
| POST | `/api/daily/today` | 今日の日報作成 |
| GET | `/api/daily/calendar` | カレンダーデータ取得 |
| GET | `/api/daily/months` | 日報がある月一覧 |

## ライセンス

MIT
