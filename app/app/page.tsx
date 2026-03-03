"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useAuth } from "@/lib/hooks/useAuth";

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
const displayYear = 2026;
const displayMonth = 3;
const daysInMonth = new Date(displayYear, displayMonth, 0).getDate();
const startDow = new Date(displayYear, displayMonth - 1, 1).getDay();
const calendarCells = Array.from({ length: 42 }, (_, index) => {
  const day = index - startDow + 1;
  return day >= 1 && day <= daysInMonth ? day : null;
});

export default function AppPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, router, user]);

  const handleLogout = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
        読み込み中...
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              project-daily
            </p>
            <h1 className="text-lg font-semibold">Daily Routine Dashboard</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-zinc-200 px-3 py-1 text-sm font-medium hover:bg-zinc-100"
            >
              今日
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-zinc-200 px-3 py-1 text-sm font-medium hover:bg-zinc-100"
              >
                ←
              </button>
              <div className="text-sm font-semibold">2026年3月</div>
              <button
                type="button"
                className="rounded-full border border-zinc-200 px-3 py-1 text-sm font-medium hover:bg-zinc-100"
              >
                →
              </button>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-6 py-6 lg:flex-row">
        <section className="w-full lg:w-64">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-700">カテゴリ</h2>
            <div className="mt-4 space-y-3 text-sm text-zinc-700">
              {[
                {
                  title: "睡眠",
                  items: ["起床時刻", "就寝時刻", "睡眠時間"],
                },
                {
                  title: "食事",
                  items: ["朝食", "昼食", "夕食"],
                },
                {
                  title: "衛生",
                  items: ["歯磨き AM", "歯磨き PM", "シャワー AM", "シャワー PM"],
                },
                {
                  title: "その他",
                  items: ["筋トレ"],
                },
              ].map((group) => (
                <div key={group.title} className="space-y-2">
                  <label className="flex items-center gap-2 font-medium">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                    {group.title}
                  </label>
                  <div className="space-y-1 pl-6 text-xs text-zinc-500">
                    {group.items.map((item) => (
                      <label key={item} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-zinc-300"
                        />
                        {item}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="min-w-0 flex-1">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-7 gap-2 border-b border-zinc-100 pb-2 text-center text-xs font-semibold text-zinc-500">
              {weekdays.map((day) => (
                <div key={day}>{day}</div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-7 gap-2 text-xs">
              {calendarCells.map((date, index) =>
                date ? (
                  <button
                    key={`${displayYear}-${displayMonth}-${date}`}
                    type="button"
                    className="flex min-h-20 flex-col gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-2 text-left hover:border-zinc-400"
                  >
                    <div className="text-sm font-semibold text-zinc-800">
                      {date}
                    </div>
                    <div className="space-y-1 text-[11px] text-zinc-500">
                      <div className="truncate rounded bg-sky-50 px-1 py-0.5 text-sky-700">
                        起 07:30
                      </div>
                      <div className="truncate rounded bg-amber-50 px-1 py-0.5 text-amber-700">
                        ☕
                      </div>
                      <div className="truncate rounded bg-emerald-50 px-1 py-0.5 text-emerald-700">
                        🪥 AM
                      </div>
                    </div>
                  </button>
                ) : (
                  <div
                    key={`empty-${index}`}
                    className="min-h-20 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/40"
                  />
                )
              )}
            </div>
          </div>
        </section>

        <section className="w-full lg:w-80">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                  Selected
                </p>
                <h2 className="text-lg font-semibold">2026-03-03</h2>
              </div>
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
                自動保存
              </span>
            </div>

            <div className="space-y-6 text-sm">
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase text-zinc-400">
                  朝
                </h3>
                <label className="flex items-center justify-between">
                  起床時刻
                  <input
                    type="time"
                    className="rounded border border-zinc-200 px-2 py-1 text-xs"
                  />
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  朝食 ☕
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  歯磨き AM
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  シャワー AM
                </label>
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase text-zinc-400">
                  昼
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {["抜", "自炊(家)", "自炊(研)", "外食"].map((label) => (
                    <button
                      key={label}
                      type="button"
                      className="rounded-lg border border-zinc-200 px-3 py-2 text-zinc-600 hover:border-zinc-400"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase text-zinc-400">
                  夜
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {["抜", "自炊(家)", "自炊(研)", "外食"].map((label) => (
                    <button
                      key={label}
                      type="button"
                      className="rounded-lg border border-zinc-200 px-3 py-2 text-zinc-600 hover:border-zinc-400"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  歯磨き PM
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  シャワー PM
                </label>
                <label className="flex items-center justify-between">
                  就寝時刻
                  <input
                    type="time"
                    className="rounded border border-zinc-200 px-2 py-1 text-xs"
                  />
                </label>
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase text-zinc-400">
                  その他
                </h3>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  筋トレ 💪
                </label>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
