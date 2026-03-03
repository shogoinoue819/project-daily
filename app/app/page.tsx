"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  Timestamp,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/hooks/useAuth";

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
const today = new Date();
const displayYear = today.getFullYear();
const displayMonth = today.getMonth() + 1;
const daysInMonth = new Date(displayYear, displayMonth, 0).getDate();
const startDow = new Date(displayYear, displayMonth - 1, 1).getDay();
const calendarCells = Array.from({ length: 42 }, (_, index) => {
  const day = index - startDow + 1;
  return day >= 1 && day <= daysInMonth ? day : null;
});

type MealOption = "none" | "home" | "lab" | "out";

type DayDoc = {
  date?: Timestamp;
  wakeTime: string | null;
  sleepTime: string | null;
  breakfast: boolean;
  brushAM: boolean;
  showerAM: boolean;
  lunch: MealOption | null;
  dinner: MealOption | null;
  brushPM: boolean;
  showerPM: boolean;
  workout: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

const defaultDayDoc: DayDoc = {
  wakeTime: null,
  sleepTime: null,
  breakfast: false,
  brushAM: false,
  showerAM: false,
  lunch: null,
  dinner: null,
  brushPM: false,
  showerPM: false,
  workout: false,
};

const mealOptions: { value: MealOption; label: string }[] = [
  { value: "none", label: "抜" },
  { value: "home", label: "自炊(家)" },
  { value: "lab", label: "自炊(研)" },
  { value: "out", label: "外食" },
];

const formatDateId = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const parseTime = (value: string) => {
  const [hour, minute] = value.split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }
  return { hour, minute };
};

export default function AppPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [selectedDate] = useState(() => new Date());
  const [dayDoc, setDayDoc] = useState<DayDoc>(defaultDayDoc);
  const [wakeTimeInput, setWakeTimeInput] = useState("");
  const [sleepTimeInput, setSleepTimeInput] = useState("");
  const [prevSleepTime, setPrevSleepTime] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, router, user]);

  const handleLogout = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  useEffect(() => {
    if (!user) {
      return;
    }

    const dateId = formatDateId(selectedDate);
    const ref = doc(db, "users", user.uid, "days", dateId);
    const unsubscribe = onSnapshot(ref, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as Partial<DayDoc>;
        const nextDoc = { ...defaultDayDoc, ...data };
        setDayDoc(nextDoc);
        setWakeTimeInput(nextDoc.wakeTime ?? "");
        setSleepTimeInput(nextDoc.sleepTime ?? "");
      } else {
        setDayDoc(defaultDayDoc);
        setWakeTimeInput("");
        setSleepTimeInput("");
      }
      setSaveError(null);
    });

    return () => unsubscribe();
  }, [selectedDate, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const loadPrev = async () => {
      const prevDate = new Date(selectedDate);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevId = formatDateId(prevDate);
      const prevRef = doc(db, "users", user.uid, "days", prevId);
      const snapshot = await getDoc(prevRef);
      if (snapshot.exists()) {
        const data = snapshot.data() as Partial<DayDoc>;
        setPrevSleepTime(data.sleepTime ?? null);
      } else {
        setPrevSleepTime(null);
      }
    };

    loadPrev();
  }, [selectedDate, user]);

  const saveFields = async (fields: Partial<DayDoc>) => {
    if (!user) {
      return;
    }
    setSaving(true);
    setSaveError(null);

    const dateId = formatDateId(selectedDate);
    const ref = doc(db, "users", user.uid, "days", dateId);
    const payload = {
      ...fields,
      date: Timestamp.fromDate(startOfDay(selectedDate)),
      updatedAt: serverTimestamp(),
      ...(dayDoc.createdAt ? {} : { createdAt: serverTimestamp() }),
    };

    try {
      await setDoc(ref, payload, { merge: true });
    } catch (error) {
      setSaveError("保存に失敗しました。再度お試しください。");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const sleepDuration = useMemo(() => {
    if (!prevSleepTime || !dayDoc.wakeTime) {
      return null;
    }
    const prev = parseTime(prevSleepTime);
    const wake = parseTime(dayDoc.wakeTime);
    if (!prev || !wake) {
      return null;
    }
    const prevDate = new Date(selectedDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const sleepDate = new Date(
      prevDate.getFullYear(),
      prevDate.getMonth(),
      prevDate.getDate(),
      prev.hour,
      prev.minute
    );
    if (prev.hour < 12) {
      sleepDate.setDate(sleepDate.getDate() + 1);
    }
    const wakeDate = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
      wake.hour,
      wake.minute
    );
    const diffMinutes = Math.round((wakeDate.getTime() - sleepDate.getTime()) / 60000);
    if (diffMinutes <= 0) {
      return null;
    }
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return `${hours}h${minutes}m`;
  }, [dayDoc.wakeTime, prevSleepTime, selectedDate]);

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
              <div className="text-sm font-semibold">
                {displayYear}年{displayMonth}月
              </div>
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
                <h2 className="text-lg font-semibold">
                  {formatDateId(selectedDate)}
                </h2>
                {sleepDuration ? (
                  <p className="text-xs text-zinc-500">睡眠 {sleepDuration}</p>
                ) : null}
              </div>
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
                {saving ? "保存中..." : "自動保存"}
              </span>
            </div>
            {saveError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                {saveError}
              </div>
            ) : null}

            <div className="space-y-6 text-sm">
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase text-zinc-400">
                  朝
                </h3>
                <label className="flex items-center justify-between">
                  起床時刻
                  <input
                    type="time"
                    value={wakeTimeInput}
                    onChange={(event) => setWakeTimeInput(event.target.value)}
                    onBlur={() => {
                      const nextValue = wakeTimeInput.trim() === "" ? null : wakeTimeInput;
                      if (nextValue !== dayDoc.wakeTime) {
                        setDayDoc((prev) => ({ ...prev, wakeTime: nextValue }));
                        saveFields({ wakeTime: nextValue });
                      }
                    }}
                    className="rounded border border-zinc-200 px-2 py-1 text-xs"
                  />
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={dayDoc.breakfast}
                    onChange={() => {
                      const nextValue = !dayDoc.breakfast;
                      setDayDoc((prev) => ({ ...prev, breakfast: nextValue }));
                      saveFields({ breakfast: nextValue });
                    }}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  朝食 ☕
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={dayDoc.brushAM}
                    onChange={() => {
                      const nextValue = !dayDoc.brushAM;
                      setDayDoc((prev) => ({ ...prev, brushAM: nextValue }));
                      saveFields({ brushAM: nextValue });
                    }}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  歯磨き AM
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={dayDoc.showerAM}
                    onChange={() => {
                      const nextValue = !dayDoc.showerAM;
                      setDayDoc((prev) => ({ ...prev, showerAM: nextValue }));
                      saveFields({ showerAM: nextValue });
                    }}
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
                  {mealOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        const nextValue =
                          dayDoc.lunch === option.value ? null : option.value;
                        setDayDoc((prev) => ({ ...prev, lunch: nextValue }));
                        saveFields({ lunch: nextValue });
                      }}
                      className={`rounded-lg border px-3 py-2 ${
                        dayDoc.lunch === option.value
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-200 text-zinc-600 hover:border-zinc-400"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase text-zinc-400">
                  夜
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {mealOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        const nextValue =
                          dayDoc.dinner === option.value ? null : option.value;
                        setDayDoc((prev) => ({ ...prev, dinner: nextValue }));
                        saveFields({ dinner: nextValue });
                      }}
                      className={`rounded-lg border px-3 py-2 ${
                        dayDoc.dinner === option.value
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-200 text-zinc-600 hover:border-zinc-400"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={dayDoc.brushPM}
                    onChange={() => {
                      const nextValue = !dayDoc.brushPM;
                      setDayDoc((prev) => ({ ...prev, brushPM: nextValue }));
                      saveFields({ brushPM: nextValue });
                    }}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  歯磨き PM
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={dayDoc.showerPM}
                    onChange={() => {
                      const nextValue = !dayDoc.showerPM;
                      setDayDoc((prev) => ({ ...prev, showerPM: nextValue }));
                      saveFields({ showerPM: nextValue });
                    }}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  シャワー PM
                </label>
                <label className="flex items-center justify-between">
                  就寝時刻
                  <input
                    type="time"
                    value={sleepTimeInput}
                    onChange={(event) => setSleepTimeInput(event.target.value)}
                    onBlur={() => {
                      const nextValue = sleepTimeInput.trim() === "" ? null : sleepTimeInput;
                      if (nextValue !== dayDoc.sleepTime) {
                        setDayDoc((prev) => ({ ...prev, sleepTime: nextValue }));
                        saveFields({ sleepTime: nextValue });
                      }
                    }}
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
                    checked={dayDoc.workout}
                    onChange={() => {
                      const nextValue = !dayDoc.workout;
                      setDayDoc((prev) => ({ ...prev, workout: nextValue }));
                      saveFields({ workout: nextValue });
                    }}
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
