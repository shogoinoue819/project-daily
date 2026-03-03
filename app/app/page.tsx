"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/hooks/useAuth";

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

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

const filterGroups = [
  {
    id: "sleep",
    label: "睡眠",
    items: [
      { id: "wakeTime", label: "起床時刻" },
      { id: "sleepTime", label: "就寝時刻" },
      { id: "sleepDuration", label: "睡眠時間" },
    ],
  },
  {
    id: "meal",
    label: "食事",
    items: [
      { id: "breakfast", label: "朝食" },
      { id: "lunch", label: "昼食" },
      { id: "dinner", label: "夕食" },
    ],
  },
  {
    id: "hygiene",
    label: "衛生",
    items: [
      { id: "brushAM", label: "歯磨き AM" },
      { id: "brushPM", label: "歯磨き PM" },
      { id: "showerAM", label: "シャワー AM" },
      { id: "showerPM", label: "シャワー PM" },
    ],
  },
  {
    id: "other",
    label: "その他",
    items: [{ id: "workout", label: "筋トレ" }],
  },
] as const;

type FilterGroup = (typeof filterGroups)[number];
type FilterItemId = FilterGroup["items"][number]["id"];

const initialFilters = Object.fromEntries(
  filterGroups.flatMap((group) => group.items.map((item) => [item.id, true]))
) as Record<FilterItemId, boolean>;

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

const computeSleepDuration = (prevSleep: string, wake: string, baseDate: Date) => {
  const prev = parseTime(prevSleep);
  const wakeTime = parseTime(wake);
  if (!prev || !wakeTime) {
    return null;
  }
  const prevDate = new Date(baseDate);
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
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    wakeTime.hour,
    wakeTime.minute
  );
  const diffMinutes = Math.round((wakeDate.getTime() - sleepDate.getTime()) / 60000);
  if (diffMinutes <= 0) {
    return null;
  }
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return `${hours}h${minutes}m`;
};

export default function AppPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [currentMonthDate, setCurrentMonthDate] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [dayDoc, setDayDoc] = useState<DayDoc>(defaultDayDoc);
  const [hasDayDoc, setHasDayDoc] = useState(false);
  const [wakeTimeInput, setWakeTimeInput] = useState("");
  const [sleepTimeInput, setSleepTimeInput] = useState("");
  const [prevSleepTime, setPrevSleepTime] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [monthData, setMonthData] = useState<Record<string, DayDoc>>({});
  const [monthLoading, setMonthLoading] = useState(false);
  const [monthError, setMonthError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<FilterItemId, boolean>>(initialFilters);
  const [isMobile, setIsMobile] = useState(false);

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
        setHasDayDoc(true);
      } else {
        setDayDoc(defaultDayDoc);
        setWakeTimeInput("");
        setSleepTimeInput("");
        setHasDayDoc(false);
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

  useEffect(() => {
    if (!user) {
      return;
    }

    const monthStart = new Date(
      currentMonthDate.getFullYear(),
      currentMonthDate.getMonth(),
      1
    );
    const monthEnd = new Date(
      currentMonthDate.getFullYear(),
      currentMonthDate.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );

    setMonthLoading(true);
    const monthQuery = query(
      collection(db, "users", user.uid, "days"),
      where("date", ">=", Timestamp.fromDate(monthStart)),
      where("date", "<=", Timestamp.fromDate(monthEnd)),
      orderBy("date", "asc")
    );

    const unsubscribe = onSnapshot(
      monthQuery,
      (snapshot) => {
        const next: Record<string, DayDoc> = {};
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Partial<DayDoc>;
          next[docSnap.id] = { ...defaultDayDoc, ...data };
        });
        setMonthData(next);
        setMonthLoading(false);
        setMonthError(null);
      },
      (error) => {
        setMonthLoading(false);
        setMonthError("月データの取得に失敗しました。");
        console.error(error);
      }
    );

    return () => unsubscribe();
  }, [currentMonthDate, user]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

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
    return computeSleepDuration(prevSleepTime, dayDoc.wakeTime, selectedDate);
  }, [dayDoc.wakeTime, prevSleepTime, selectedDate]);

  const calendarCells = useMemo(() => {
    const year = currentMonthDate.getFullYear();
    const monthIndex = currentMonthDate.getMonth();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const startDow = new Date(year, monthIndex, 1).getDay();
    return Array.from({ length: 42 }, (_, index) => {
      const day = index - startDow + 1;
      if (day < 1 || day > daysInMonth) {
        return null;
      }
      return new Date(year, monthIndex, day);
    });
  }, [currentMonthDate]);

  const hasMonthData = Object.keys(monthData).length > 0;

  const maxLines = isMobile ? 3 : 5;

  const mealShortLabel: Record<MealOption, string> = {
    none: "抜",
    home: "家",
    lab: "研",
    out: "外",
  };

  const buildChips = (date: Date) => {
    const dateId = formatDateId(date);
    const docData = monthData[dateId];
    if (!docData) {
      return [];
    }

    const chips: { id: string; label: string; className: string }[] = [];
    if (filters.wakeTime && docData.wakeTime) {
      chips.push({
        id: `${dateId}-wake`,
        label: `起 ${docData.wakeTime}`,
        className: "bg-sky-50 text-sky-700",
      });
    }
    if (filters.sleepTime && docData.sleepTime) {
      chips.push({
        id: `${dateId}-sleep`,
        label: `寝 ${docData.sleepTime}`,
        className: "bg-sky-50 text-sky-700",
      });
    }
    if (filters.sleepDuration && docData.wakeTime) {
      const prevDate = new Date(date);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDoc = monthData[formatDateId(prevDate)];
      if (prevDoc?.sleepTime) {
        const duration = computeSleepDuration(prevDoc.sleepTime, docData.wakeTime, date);
        if (duration) {
          chips.push({
            id: `${dateId}-duration`,
            label: `睡 ${duration}`,
            className: "bg-sky-50 text-sky-700",
          });
        }
      }
    }
    if (filters.breakfast && docData.breakfast) {
      chips.push({
        id: `${dateId}-breakfast`,
        label: "☕",
        className: "bg-amber-50 text-amber-700",
      });
    }
    if (filters.lunch && docData.lunch) {
      chips.push({
        id: `${dateId}-lunch`,
        label: `昼 ${mealShortLabel[docData.lunch]}`,
        className: "bg-amber-50 text-amber-700",
      });
    }
    if (filters.dinner && docData.dinner) {
      chips.push({
        id: `${dateId}-dinner`,
        label: `夜 ${mealShortLabel[docData.dinner]}`,
        className: "bg-amber-50 text-amber-700",
      });
    }
    if (filters.brushAM && docData.brushAM) {
      chips.push({
        id: `${dateId}-brush-am`,
        label: "🪥 AM",
        className: "bg-emerald-50 text-emerald-700",
      });
    }
    if (filters.brushPM && docData.brushPM) {
      chips.push({
        id: `${dateId}-brush-pm`,
        label: "🪥 PM",
        className: "bg-emerald-50 text-emerald-700",
      });
    }
    if (filters.showerAM && docData.showerAM) {
      chips.push({
        id: `${dateId}-shower-am`,
        label: "🛀 AM",
        className: "bg-indigo-50 text-indigo-700",
      });
    }
    if (filters.showerPM && docData.showerPM) {
      chips.push({
        id: `${dateId}-shower-pm`,
        label: "🛀 PM",
        className: "bg-indigo-50 text-indigo-700",
      });
    }
    if (filters.workout && docData.workout) {
      chips.push({
        id: `${dateId}-workout`,
        label: "💪",
        className: "bg-violet-50 text-violet-700",
      });
    }
    return chips;
  };

  const toggleGroup = (group: FilterGroup, checked: boolean) => {
    setFilters((prev) => {
      const next = { ...prev };
      group.items.forEach((item) => {
        next[item.id] = checked;
      });
      return next;
    });
  };

  const updateFilter = (id: FilterItemId, checked: boolean) => {
    setFilters((prev) => ({ ...prev, [id]: checked }));
  };

  const ParentCheckbox = ({
    checked,
    indeterminate,
    onChange,
  }: {
    checked: boolean;
    indeterminate: boolean;
    onChange: (checked: boolean) => void;
  }) => {
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => {
      if (ref.current) {
        ref.current.indeterminate = indeterminate;
      }
    }, [indeterminate]);

    return (
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-zinc-300"
      />
    );
  };

  const handleToday = () => {
    const now = new Date();
    setSelectedDate(now);
    setCurrentMonthDate(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const shiftMonth = (delta: number) => {
    const next = new Date(
      currentMonthDate.getFullYear(),
      currentMonthDate.getMonth() + delta,
      1
    );
    setCurrentMonthDate(next);
    setSelectedDate(next);
  };

  const selectedDateId = formatDateId(selectedDate);

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
              onClick={handleToday}
              className="rounded-full border border-zinc-200 px-3 py-1 text-sm font-medium hover:bg-zinc-100"
            >
              今日
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="rounded-full border border-zinc-200 px-3 py-1 text-sm font-medium hover:bg-zinc-100"
              >
                ←
              </button>
              <div className="text-sm font-semibold">
                {currentMonthDate.getFullYear()}年
                {currentMonthDate.getMonth() + 1}月
              </div>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
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
              {filterGroups.map((group) => {
                const checkedCount = group.items.filter(
                  (item) => filters[item.id]
                ).length;
                const allChecked = checkedCount === group.items.length;
                const indeterminate = checkedCount > 0 && !allChecked;
                return (
                  <div key={group.id} className="space-y-2">
                    <label className="flex items-center gap-2 font-medium">
                      <ParentCheckbox
                        checked={allChecked}
                        indeterminate={indeterminate}
                        onChange={(checked) => toggleGroup(group, checked)}
                      />
                      {group.label}
                    </label>
                    <div className="space-y-1 pl-6 text-xs text-zinc-500">
                      {group.items.map((item) => (
                        <label key={item.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={filters[item.id]}
                            onChange={(event) =>
                              updateFilter(item.id, event.target.checked)
                            }
                            className="h-3.5 w-3.5 rounded border-zinc-300"
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
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
            {monthError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                {monthError}
              </div>
            ) : null}
            {monthLoading ? (
              <div className="mt-3 text-xs text-zinc-400">月データを読み込み中...</div>
            ) : null}
            {!monthLoading && !monthError && !hasMonthData ? (
              <div className="mt-3 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                この月のデータはまだありません。
              </div>
            ) : null}
            <div className="mt-3 grid grid-cols-7 gap-2 text-xs">
              {calendarCells.map((date, index) => {
                if (!date) {
                  return (
                    <div
                      key={`empty-${index}`}
                      className="min-h-20 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/40"
                    />
                  );
                }
                const dateId = formatDateId(date);
                const chips = buildChips(date);
                const visibleChips = chips.slice(0, maxLines);
                const extraCount = chips.length - visibleChips.length;
                const isSelected = dateId === selectedDateId;
                return (
                  <button
                    key={dateId}
                    type="button"
                    onClick={() => setSelectedDate(date)}
                    className={`flex min-h-20 flex-col gap-1 rounded-xl border p-2 text-left transition ${
                      isSelected
                        ? "border-zinc-900 bg-zinc-900/5"
                        : "border-zinc-200 bg-zinc-50 hover:border-zinc-400"
                    }`}
                  >
                    <div className="text-sm font-semibold text-zinc-800">
                      {date.getDate()}
                    </div>
                    <div className="space-y-1 text-[11px] text-zinc-500">
                      {visibleChips.map((chip) => (
                        <div
                          key={chip.id}
                          className={`truncate rounded px-1 py-0.5 ${chip.className}`}
                        >
                          {chip.label}
                        </div>
                      ))}
                      {extraCount > 0 ? (
                        <div className="truncate rounded bg-zinc-100 px-1 py-0.5 text-zinc-500">
                          +{extraCount}
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
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
                <h2 className="text-lg font-semibold">{selectedDateId}</h2>
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
            {!hasDayDoc && !saveError ? (
              <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                この日の入力はまだありません。
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
