# OVO - Open Video Operator

ウェブ技術を利用した動画編集ソフト

## セットアップ

### 1. 依存関係のインストール
```bash
npm install
```

### 2. サーバーの起動
```bash
npm start
```

サーバーは `http://localhost:3000` で起動します。

### 3. ブラウザでアクセス
```
http://localhost:3000/index.html
```

## API エンドポイント

### POST /api/capture-element
DOM要素を画像化します。

**リクエストボディ:**
```json
{
  "html": "<div>...</div>",
  "css": ".class { color: red; }",
  "width": 1920,
  "height": 1080,
  "selector": ".target-element"
}
```

**レスポンス:**
```json
{
  "success": true,
  "image": "data:image/png;base64,..."
}
```

### POST /api/capture-frames
複数フレームを一括でキャプチャします。

**リクエストボディ:**
```json
{
  "frames": [
    {
      "html": "<div>...</div>",
      "css": "...",
      "width": 1920,
      "height": 1080,
      "selector": ".element",
      "frameNumber": 0
    }
  ]
}
```

### GET /api/health
サーバーの状態を確認します。

## 技術スタック

- **フロントエンド**: HTML5, Canvas API, WebCodecs API
- **バックエンド**: Node.js, Express
- **DOM キャプチャ**: Puppeteer
- **動画処理**: mp4-muxer
