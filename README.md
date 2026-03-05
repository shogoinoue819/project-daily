# Routine Calendar

毎日のルーティンを「月カレンダー × カテゴリ/項目フィルタ」で可視化するアプリです。

## Setup

1. `.env.local` を作成（例）

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

2. 依存関係をインストール

```bash
npm install
```

3. 開発サーバー起動

```bash
npm run dev
```

`http://localhost:3000` でGoogleログイン後に `/app` が表示されます。

## Firebase 注意点

- Authentication は Google のみ有効化
- Firestore は `users/{uid}/days/{dateId}` に保存
- Firebase Console の Authentication → Authorized domains に `localhost` を追加

## Deploy (Vercel)

- Vercel の環境変数に `.env.local` と同じ `NEXT_PUBLIC_FIREBASE_*` を登録
- Firebase Console の Authorized domains に `your-app.vercel.app` を追加
