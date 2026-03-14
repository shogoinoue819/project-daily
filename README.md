# Routine Calendar — 月カレンダーで毎日のルーティンを可視化

# 概要
- 毎日のルーティンを「月カレンダー × カテゴリ/項目フィルタ」で可視化するアプリです。
- 想定ユーザーは、生活習慣を記録・振り返りたい個人ユーザー、および共有カレンダーで食事/家事などを共有したいユーザーです。
- Googleログイン〜個人記録・共有カレンダー作成/参加/記録までの主要機能が実装されています。

# 主な機能
- 個人用機能
  - 月カレンダー表示
  - 日次のルーティン記録（起床/就寝、食事、衛生、カスタム項目）
  - カテゴリ/項目フィルタとチップ表示
  - 項目ごとの色設定
- 共有機能
  - 共有カレンダーの作成/参加（招待コード）
  - 共有カレンダーの月表示・日次記録
  - 食事ステータス、夕食時間帯、家事のチェック共有
  - 共有カレンダーの名称/説明の編集・削除
- 認証機能
  - Firebase Authentication（Googleログインのみ、ポップアップ/リダイレクト対応）
- カスタム項目/フィルタ
  - カスタム項目の追加・編集・削除（checkbox/text/select）
  - カスタム項目もフィルタ対象に自動追加

# 技術スタック
- フロントエンド: Next.js (App Router), React, TypeScript
- UI: Tailwind CSS
- 認証: Firebase Authentication（Google）
- データベース: Firestore
- デプロイ: Vercel（READMEに記載）
- 主要ライブラリ: `firebase`, `next`, `react`

# データ構造・設計
- Firestore 保存構造（概要）
  - 個人データ: `users/{uid}/days/{dateId}`
  - 個人設定: `users/{uid}/settings/customItems`, `users/{uid}/settings/ui`
  - 共有データ: `sharedCalendars/{calendarId}`, `sharedCalendars/{calendarId}/days/{dateId}`
  - 招待コード: `sharedInvites/{inviteCode}`
- 個人データと共有データの分離
  - `users/{uid}` 配下は個人専用、`sharedCalendars` はメンバー共有で明確に分割
- セキュリティルールの考え方
  - 個人データは所有者のみ read/write
  - 共有カレンダーはメンバーのみ read/update、招待コードによる参加を制御

# 工夫した点
- Googleログインのポップアップ失敗時にリダイレクトへ自動フォールバック
- 共有カレンダーのリアルタイム更新（`onSnapshot`）とペンディング書き込みの整合
- カスタム項目を「入力形式（check/text/select）」として汎用化し、フィルタ/UIと連動
- 個人/共有でデータ構造を分離し、Firestore Rulesでアクセス制御を明確化
- 項目ごとの色設定を保存してUIの見通しを高める

# 今後の改善予定
- 共有カレンダーの改善（推測: メンバー管理、権限設定、退出機能）
- 分析・統計（推測: 習慣の傾向可視化）
- テスト/CI整備（推測）

# セットアップ
## 環境変数
`.env.local` を作成し、Firebase設定を記入します。

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...  # Google Cloud Console の OAuth 2.0 クライアント ID（Web アプリケーション）
```

`NEXT_PUBLIC_GOOGLE_CLIENT_ID` は、Firebase Console の Authentication → Sign-in method → Google の「Web SDK の設定」に表示される Web クライアント ID、または [Google Cloud Console](https://console.cloud.google.com/apis/credentials) の OAuth 2.0 クライアント ID を指定してください。

## インストール
```bash
npm install
```

## 起動方法
```bash
npm run dev
```

起動後 `http://localhost:3000` にアクセスし、Googleログイン後に `/app` が表示されます。

# デプロイ
- Vercel の環境変数に `.env.local` と同じ `NEXT_PUBLIC_FIREBASE_*` および `NEXT_PUBLIC_GOOGLE_CLIENT_ID` を登録
- Firebase Console の Authentication → Authorized domains に
  - `localhost`
  - `your-app.vercel.app`
  を追加
- Google Cloud Console の OAuth 2.0 クライアントの「承認済みの JavaScript 生成元」に
  - `http://localhost:3000`
  - `https://your-app.vercel.app`
  を追加（GSI 用）

# 補足
- Authentication は Google のみ有効化されています。
- 共有カレンダーは招待コードで参加する設計です。
