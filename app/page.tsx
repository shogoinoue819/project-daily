export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-zinc-900">
      <main className="w-full max-w-3xl space-y-6 rounded-2xl border border-zinc-200 bg-white p-10 shadow-sm">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-zinc-500">project-daily</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Daily Routine Visualizer
          </h1>
          <p className="text-sm text-zinc-600">
            月カレンダー×カテゴリフィルタで毎日のルーティンを一目で。
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <a
            href="/login"
            className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Login
          </a>
          <a
            href="/app"
            className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-200 px-6 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50"
          >
            Open App
          </a>
        </div>
      </main>
    </div>
  );
}
