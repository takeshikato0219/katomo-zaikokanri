# カトーモーター 在庫表管理アプリ

React + TypeScript + Vite で構築された在庫管理Webアプリケーションです。

## 主な機能

- **在庫管理** - 商品マスタ、在庫数、最小在庫管理
- **QRコード機能** - QRコード生成・スキャン・印刷
- **入出庫管理** - 購入入庫、使用出庫、調整
- **発注管理** - 仕入先別の発注・受取管理
- **顧客管理** - 顧客マスタ、顧客別使用集計
- **データ連携** - CSV/Excelインポート/エクスポート
- **月次集計** - 仕入先別・顧客別集計レポート
- **AI機能** - 需要予測、自然言語検索、レポート生成、音声認識

## 技術スタック

- **フロントエンド**: React 19, TypeScript
- **ビルドツール**: Vite
- **スタイリング**: Tailwind CSS
- **QRコード**: html5-qrcode, qrcode.react
- **AI**: OpenAI API
- **データ処理**: xlsx

## セットアップ

### 必要条件

- Node.js 18以上
- npm または yarn

### インストール

```bash
# 依存関係のインストール
npm install

# 環境変数の設定
cp .env.example .env
# .envファイルを編集してOpenAI APIキーを設定
```

### 開発サーバーの起動

```bash
npm run dev
```

### ビルド

```bash
npm run build
```

### プレビュー

```bash
npm run preview
```

## 環境変数

| 変数名 | 説明 |
|--------|------|
| `VITE_OPENAI_API_KEY` | OpenAI APIキー（AI機能に必要） |

## ディレクトリ構造

```
src/
├── components/       # Reactコンポーネント
│   └── ai/          # AI関連コンポーネント
├── hooks/           # カスタムフック
├── services/        # ビジネスロジック
│   └── ai/          # AI関連サービス
├── utils/           # ユーティリティ関数
├── types/           # TypeScript型定義
├── data/            # データファイル
└── assets/          # 静的ファイル
```

## ライセンス

Private
