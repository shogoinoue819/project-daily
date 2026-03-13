"use client";

import Image from "next/image";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  Timestamp,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/hooks/useAuth";

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

type MealOption = "home" | "lab" | "out";
type LegacyMealOption = MealOption | "none" | "other";

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
  custom?: Record<string, CustomValue>;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

type CustomInputType = "check" | "text" | "select";
type CustomItem = {
  id: string;
  name: string;
  inputType: CustomInputType;
  displayLabel?: string;
  options?: string[];
};
type CustomValue = boolean | string | null;

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
  custom: {},
};

type SharedMealStatus = "ok" | "maybe" | "no" | "unset";
type SharedChoreId = "laundry" | "vacuum" | "bathroom" | "trash" | "dishes";
type SharedEntry = {
  breakfast: SharedMealStatus;
  lunch: SharedMealStatus;
  dinner: SharedMealStatus;
  dinnerSlots: number[];
  chores: Record<SharedChoreId, boolean>;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};
type SharedDayDoc = {
  date?: Timestamp;
  entries?: Record<string, SharedEntry>;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};
type SharedMemberInfo = {
  displayName: string;
  photoURL: string | null;
  joinedAt?: Timestamp;
};
type SharedCalendar = {
  id: string;
  name: string;
  ownerId: string;
  memberIds: string[];
  memberInfo: Record<string, SharedMemberInfo>;
  memberColors?: Record<string, Record<string, ColorId>>;
  inviteCode: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

const defaultSharedEntry: SharedEntry = {
  breakfast: "unset",
  lunch: "unset",
  dinner: "unset",
  dinnerSlots: [],
  chores: {
    laundry: false,
    vacuum: false,
    bathroom: false,
    trash: false,
    dishes: false,
  },
};

const sharedMealStatusOptions: { value: SharedMealStatus; label: string }[] = [
  { value: "ok", label: "〇" },
  { value: "maybe", label: "△" },
  { value: "no", label: "×" },
];

const sharedMealStatusLabel: Record<SharedMealStatus, string> = {
  ok: "〇",
  maybe: "△",
  no: "×",
  unset: "-",
};

const sharedDinnerSlots = [18, 19, 20, 21, 22, 23];

const sharedChoreItems: { id: SharedChoreId; label: string; short: string }[] = [
  { id: "laundry", label: "洗濯", short: "洗" },
  { id: "vacuum", label: "掃除機", short: "掃" },
  { id: "bathroom", label: "風呂トイレ掃除", short: "風" },
  { id: "trash", label: "ゴミ出し", short: "ゴ" },
  { id: "dishes", label: "皿洗い", short: "皿" },
];

const mealOptions: { value: MealOption; label: string }[] = [
  { value: "home", label: "自炊(家)" },
  { value: "lab", label: "自炊(研)" },
  { value: "out", label: "外食" },
];

const baseFilterGroups = [
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
      { id: "brushAM", label: "歯磨き(朝)" },
      { id: "brushPM", label: "歯磨き(夜)" },
      { id: "showerAM", label: "シャワー(朝)" },
      { id: "showerPM", label: "シャワー(夜)" },
    ],
  },
];

type FilterItemId = string;
type FilterGroup = {
  id: string;
  label: string;
  items: { id: FilterItemId; label: string; customId?: string }[];
  isCustom?: boolean;
};
const colorPalette = [
  { id: "blue", label: "Blue", chip: "bg-sky-50 text-sky-700", dot: "bg-sky-500" },
  {
    id: "green",
    label: "Green",
    chip: "bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
  {
    id: "yellow",
    label: "Yellow",
    chip: "bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
  },
  {
    id: "orange",
    label: "Orange",
    chip: "bg-orange-50 text-orange-700",
    dot: "bg-orange-500",
  },
  { id: "red", label: "Red", chip: "bg-rose-50 text-rose-700", dot: "bg-rose-500" },
  {
    id: "purple",
    label: "Purple",
    chip: "bg-violet-50 text-violet-700",
    dot: "bg-violet-500",
  },
  {
    id: "pink",
    label: "Pink",
    chip: "bg-pink-50 text-pink-700",
    dot: "bg-pink-500",
  },
  {
    id: "indigo",
    label: "Indigo",
    chip: "bg-indigo-50 text-indigo-700",
    dot: "bg-indigo-500",
  },
  {
    id: "teal",
    label: "Teal",
    chip: "bg-teal-50 text-teal-700",
    dot: "bg-teal-500",
  },
  {
    id: "cyan",
    label: "Cyan",
    chip: "bg-cyan-50 text-cyan-700",
    dot: "bg-cyan-500",
  },
  {
    id: "lime",
    label: "Lime",
    chip: "bg-lime-50 text-lime-700",
    dot: "bg-lime-500",
  },
  { id: "gray", label: "Gray", chip: "bg-zinc-100 text-zinc-700", dot: "bg-zinc-500" },
] as const;

type ColorId = (typeof colorPalette)[number]["id"];

const colorStyles = Object.fromEntries(
  colorPalette.map((color) => [color.id, color])
) as Record<ColorId, (typeof colorPalette)[number]>;

const defaultItemColors: Record<string, ColorId> = {
  wakeTime: "blue",
  sleepTime: "blue",
  sleepDuration: "blue",
  breakfast: "orange",
  lunch: "orange",
  dinner: "orange",
  brushAM: "teal",
  brushPM: "teal",
  showerAM: "indigo",
  showerPM: "indigo",
};

const baseFilterItemIds = baseFilterGroups.flatMap((group) =>
  group.items.map((item) => item.id)
);
const initialFilters = Object.fromEntries(
  baseFilterItemIds.map((id) => [id, true])
) as Record<FilterItemId, boolean>;

const sharedFilterGroups = [
  {
    id: "shared-meal",
    label: "食事",
    items: [
      { id: "shared-breakfast", label: "朝" },
      { id: "shared-lunch", label: "昼" },
      { id: "shared-dinner", label: "夜" },
      { id: "shared-dinner-slots", label: "夜の時間帯" },
    ],
  },
  {
    id: "shared-chores",
    label: "家事",
    items: sharedChoreItems.map((item) => ({
      id: `shared-${item.id}`,
      label: item.label,
    })),
  },
] as const;

const sharedFilterItemIds = sharedFilterGroups.flatMap((group) =>
  group.items.map((item) => item.id)
);

const initialSharedFilters = Object.fromEntries(
  sharedFilterItemIds.map((id) => [id, true])
) as Record<string, boolean>;

const defaultSharedItemColors: Record<string, ColorId> = {
  "shared-breakfast": "orange",
  "shared-lunch": "orange",
  "shared-dinner": "orange",
  "shared-dinner-slots": "purple",
  ...Object.fromEntries(
    sharedChoreItems.map((item) => [`shared-${item.id}`, "teal" as ColorId])
  ),
};

const formatDateId = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

const parseDateIdToLocalDate = (dateId: string) => {
  const [year, month, day] = dateId.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
};

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const parseTime = (value: string) => {
  const [hour, minute] = value.split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }
  return { hour, minute };
};

const normalizeTimeToStep = (value: string, stepMinutes = 5) => {
  if (!value) {
    return "";
  }
  const parsed = parseTime(value);
  if (!parsed) {
    return "";
  }
  const total = parsed.hour * 60 + parsed.minute;
  const rounded = Math.round(total / stepMinutes) * stepMinutes;
  const normalized = Math.min(Math.max(rounded, 0), 24 * 60 - stepMinutes);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const timeOptions = {
  hours: Array.from({ length: 24 }, (_, index) => index),
  minutes: Array.from({ length: 12 }, (_, index) => index * 5),
};

const formatTimeValue = (hour: number, minute: number) =>
  `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

const splitTimeValue = (value: string) => {
  const parsed = parseTime(value);
  if (!parsed) {
    return { hour: "", minute: "" };
  }
  return {
    hour: String(parsed.hour).padStart(2, "0"),
    minute: String(parsed.minute).padStart(2, "0"),
  };
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

const normalizeMealValue = (value?: LegacyMealOption | null) => {
  if (!value || value === "none" || value === "other") {
    return null;
  }
  return value;
};

const normalizeDayDoc = (
  data?: Partial<
    DayDoc & {
      lunch?: LegacyMealOption | null;
      dinner?: LegacyMealOption | null;
    }
  >
) => {
  if (!data) {
    return { ...defaultDayDoc };
  }
  return {
    ...defaultDayDoc,
    ...data,
    lunch: normalizeMealValue(data.lunch),
    dinner: normalizeMealValue(data.dinner),
    custom: data.custom ?? {},
  };
};

const normalizeSharedEntry = (data?: Partial<SharedEntry>): SharedEntry => ({
  ...defaultSharedEntry,
  ...data,
  dinnerSlots: data?.dinnerSlots ?? [],
  chores: {
    ...defaultSharedEntry.chores,
    ...(data?.chores ?? {}),
  },
});

const isSameSharedEntry = (a?: SharedEntry, b?: SharedEntry) => {
  if (!a || !b) {
    return false;
  }
  if (a.breakfast !== b.breakfast) return false;
  if (a.lunch !== b.lunch) return false;
  if (a.dinner !== b.dinner) return false;
  if (a.dinnerSlots.length !== b.dinnerSlots.length) return false;
  for (let i = 0; i < a.dinnerSlots.length; i += 1) {
    if (a.dinnerSlots[i] !== b.dinnerSlots[i]) return false;
  }
  const choreKeys = new Set([
    ...Object.keys(a.chores),
    ...Object.keys(b.chores),
  ]) as Set<SharedChoreId>;
  for (const key of choreKeys) {
    if (a.chores[key] !== b.chores[key]) return false;
  }
  return true;
};

const formatDinnerRanges = (slots: number[]) => {
  if (!slots.length) {
    return "";
  }
  const sorted = [...slots].sort((a, b) => a - b);
  const ranges: Array<{ start: number; end: number }> = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    if (current === prev + 1) {
      prev = current;
      continue;
    }
    ranges.push({ start, end: prev });
    start = current;
    prev = current;
  }
  ranges.push({ start, end: prev });
  return ranges.map((range) => `${range.start}-${range.end}`).join(", ");
};

const generateInviteCode = () =>
  Math.random().toString(36).slice(2, 8).toUpperCase();

const buildDefaultItemColors = (items: CustomItem[]): Record<string, ColorId> => ({
  ...defaultItemColors,
  ...Object.fromEntries(items.map((item) => [`custom-${item.id}`, "cyan" as ColorId])),
});

function AppPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [currentMonthDate, setCurrentMonthDate] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [calendarMode, setCalendarMode] = useState<"personal" | "shared">("personal");
  const [dayDoc, setDayDoc] = useState<DayDoc>(defaultDayDoc);
  const [hasDayDoc, setHasDayDoc] = useState(false);
  const [wakeTimeInput, setWakeTimeInput] = useState("");
  const [sleepTimeInput, setSleepTimeInput] = useState("");
  const [wakeHourInput, setWakeHourInput] = useState("");
  const [wakeMinuteInput, setWakeMinuteInput] = useState("");
  const [sleepHourInput, setSleepHourInput] = useState("");
  const [sleepMinuteInput, setSleepMinuteInput] = useState("");
  const [timePickerOpen, setTimePickerOpen] = useState<"wake" | "sleep" | null>(
    null
  );
  const [timePickerValue, setTimePickerValue] = useState<{
    hour: number;
    minute: number;
  } | null>(null);
  const timePickerRef = useRef<HTMLDivElement | null>(null);
  const [, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [monthData, setMonthData] = useState<Record<string, DayDoc>>({});
  const [monthLoading, setMonthLoading] = useState(false);
  const [monthError, setMonthError] = useState<string | null>(null);
  const [sharedCalendars, setSharedCalendars] = useState<SharedCalendar[]>([]);
  const [selectedSharedId, setSelectedSharedId] = useState<string | null>(null);
  const [sharedCalendarDetail, setSharedCalendarDetail] = useState<SharedCalendar | null>(
    null
  );
  const [sharedMonthData, setSharedMonthData] = useState<Record<string, SharedDayDoc>>(
    {}
  );
  const [sharedMonthLoading, setSharedMonthLoading] = useState(false);
  const [sharedMonthError, setSharedMonthError] = useState<string | null>(null);
  const [sharedSaveError, setSharedSaveError] = useState<string | null>(null);
  const [sharedDrawerOpen, setSharedDrawerOpen] = useState(false);
  const [sharedEditingEntry, setSharedEditingEntry] =
    useState<SharedEntry>(defaultSharedEntry);
  const [sharedEditingDirty, setSharedEditingDirty] = useState(false);
  const pendingSharedWritesRef = useRef<Record<string, SharedEntry>>({});
  const [sharedCreateModalOpen, setSharedCreateModalOpen] = useState(false);
  const [sharedCalendarName, setSharedCalendarName] = useState("");
  const [sharedCreateError, setSharedCreateError] = useState<string | null>(null);
  const [sharedCreateLoading, setSharedCreateLoading] = useState(false);
  const [sharedInviteModalOpen, setSharedInviteModalOpen] = useState(false);
  const [sharedInviteCalendarId, setSharedInviteCalendarId] = useState<string | null>(
    null
  );
  const [sharedInviteCopied, setSharedInviteCopied] = useState<
    "link" | "code" | null
  >(null);
  const [sharedInvitePreview, setSharedInvitePreview] = useState<{
    name: string;
    inviteCode: string;
  } | null>(null);
  const [sharedJoinCode, setSharedJoinCode] = useState("");
  const [sharedJoinError, setSharedJoinError] = useState<string | null>(null);
  const [sharedJoinLoading, setSharedJoinLoading] = useState(false);
  const [filters, setFilters] = useState<Record<FilterItemId, boolean>>(initialFilters);
  const [sharedFilters, setSharedFilters] =
    useState<Record<string, boolean>>(initialSharedFilters);
  const [isMobile, setIsMobile] = useState(false);
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const [customItems, setCustomItems] = useState<CustomItem[]>([]);
  const [itemColors, setItemColors] = useState<Record<string, ColorId>>(
    defaultItemColors
  );
  const [sharedItemColors, setSharedItemColors] =
    useState<Record<string, ColorId>>(defaultSharedItemColors);
  const [colorPickerOpen, setColorPickerOpen] = useState<string | null>(null);
  const [sharedColorPickerOpen, setSharedColorPickerOpen] = useState<string | null>(
    null
  );
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customModalMode, setCustomModalMode] = useState<"create" | "edit">("create");
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null);
  const [customForm, setCustomForm] = useState<{
    name: string;
    inputType: CustomInputType;
    displayLabel: string;
    optionsText: string;
  }>({
    name: "",
    inputType: "check",
    displayLabel: "",
    optionsText: "",
  });
  const [customFormError, setCustomFormError] = useState<string | null>(null);
  const colorPickerRef = useRef<HTMLDivElement | null>(null);
  const handledInviteCodeRef = useRef<string | null>(null);
  const sharedDrawerRef = useRef<HTMLDivElement | null>(null);
  const sharedCalendarRef = useRef<HTMLDivElement | null>(null);
  const sharedColorPickerRef = useRef<HTMLDivElement | null>(null);
  const pendingSharedSelectionRef = useRef<string | null>(null);

  const customFilterItems = useMemo(
    () =>
      customItems.map((item) => ({
        id: `custom-${item.id}`,
        label: item.name,
        customId: item.id,
      })),
    [customItems]
  );
  const filterGroups = useMemo<FilterGroup[]>(
    () => [
      ...baseFilterGroups,
      {
        id: "custom",
        label: "カスタム",
        items: customFilterItems,
        isCustom: true,
      },
    ],
    [customFilterItems]
  );
  const filterItemIdSet = useMemo(() => {
    return new Set([...baseFilterItemIds, ...customFilterItems.map((item) => item.id)]);
  }, [customFilterItems]);

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
    if (!user || calendarMode !== "personal") {
      return;
    }

    const dateId = formatDateId(selectedDate);
    const ref = doc(db, "users", user.uid, "days", dateId);
    const unsubscribe = onSnapshot(ref, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as Partial<DayDoc>;
        const nextDoc = normalizeDayDoc(data);
        setDayDoc(nextDoc);
        const wakeValue = nextDoc.wakeTime ?? "";
        const sleepValue = nextDoc.sleepTime ?? "";
        setWakeTimeInput(wakeValue);
        setSleepTimeInput(sleepValue);
        const wakeParts = splitTimeValue(wakeValue);
        const sleepParts = splitTimeValue(sleepValue);
        setWakeHourInput(wakeParts.hour);
        setWakeMinuteInput(wakeParts.minute);
        setSleepHourInput(sleepParts.hour);
        setSleepMinuteInput(sleepParts.minute);
        setHasDayDoc(true);
      } else {
        setDayDoc(defaultDayDoc);
        setWakeTimeInput("");
        setSleepTimeInput("");
        setWakeHourInput("");
        setWakeMinuteInput("");
        setSleepHourInput("");
        setSleepMinuteInput("");
        setHasDayDoc(false);
      }
      setSaveError(null);
    });

    return () => unsubscribe();
  }, [calendarMode, selectedDate, user]);


  useEffect(() => {
    if (!user || calendarMode !== "personal") {
      return;
    }

    const year = currentMonthDate.getFullYear();
    const monthIndex = currentMonthDate.getMonth();
    const firstDay = new Date(year, monthIndex, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const lastDay = new Date(year, monthIndex, daysInMonth);
    const endOffset = 6 - lastDay.getDay();
    const rangeStart = new Date(year, monthIndex, 1 - startOffset);
    const rangeEnd = new Date(year, monthIndex, daysInMonth + endOffset, 23, 59, 59, 999);

    setMonthLoading(true);
    const monthQuery = query(
      collection(db, "users", user.uid, "days"),
      where("date", ">=", Timestamp.fromDate(rangeStart)),
      where("date", "<=", Timestamp.fromDate(rangeEnd)),
      orderBy("date", "asc")
    );

    const unsubscribe = onSnapshot(
      monthQuery,
      (snapshot) => {
        const next: Record<string, DayDoc> = {};
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Partial<DayDoc>;
          next[docSnap.id] = normalizeDayDoc(data);
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
  }, [calendarMode, currentMonthDate, user]);

  useEffect(() => {
    if (!user) {
      return;
    }
    const calendarsQuery = query(
      collection(db, "sharedCalendars"),
      where("memberIds", "array-contains", user.uid)
    );
    const unsubscribe = onSnapshot(
      calendarsQuery,
      (snapshot) => {
        const next: SharedCalendar[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Omit<SharedCalendar, "id">;
          next.push({ ...data, id: docSnap.id });
        });
        next.sort(
          (a, b) =>
            (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0)
        );
        setSharedCalendars(next);
      },
      (error) => {
        console.error(error);
      }
    );
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (calendarMode !== "shared") {
      return;
    }
    if (!selectedSharedId && sharedCalendars.length > 0) {
      setSelectedSharedId(sharedCalendars[0].id);
      return;
    }
    if (selectedSharedId && sharedCalendars.some((calendar) => calendar.id === selectedSharedId)) {
      if (pendingSharedSelectionRef.current === selectedSharedId) {
        pendingSharedSelectionRef.current = null;
      }
      return;
    }
    if (
      selectedSharedId &&
      sharedCalendars.length > 0 &&
      !sharedCalendars.some((calendar) => calendar.id === selectedSharedId)
    ) {
      if (pendingSharedSelectionRef.current === selectedSharedId) {
        return;
      }
      setSelectedSharedId(sharedCalendars[0].id);
    }
  }, [calendarMode, selectedSharedId, sharedCalendars]);

  useEffect(() => {
    if (!user || !selectedSharedId) {
      setSharedCalendarDetail(null);
      return;
    }
    const ref = doc(db, "sharedCalendars", selectedSharedId);
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as Omit<SharedCalendar, "id">;
          setSharedCalendarDetail({ ...data, id: snapshot.id });
        }
      },
      (error) => {
        console.error(error);
      }
    );
    return () => unsubscribe();
  }, [selectedSharedId, user]);

  useEffect(() => {
    if (!user || calendarMode !== "shared" || !selectedSharedId) {
      setSharedMonthData({});
      setSharedMonthLoading(false);
      setSharedMonthError(null);
      return;
    }

    const year = currentMonthDate.getFullYear();
    const monthIndex = currentMonthDate.getMonth();
    const firstDay = new Date(year, monthIndex, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const lastDay = new Date(year, monthIndex, daysInMonth);
    const endOffset = 6 - lastDay.getDay();
    const rangeStart = new Date(year, monthIndex, 1 - startOffset);
    const rangeEnd = new Date(year, monthIndex, daysInMonth + endOffset, 23, 59, 59, 999);

    setSharedMonthLoading(true);
    const monthQuery = query(
      collection(db, "sharedCalendars", selectedSharedId, "days"),
      where("date", ">=", Timestamp.fromDate(rangeStart)),
      where("date", "<=", Timestamp.fromDate(rangeEnd)),
      orderBy("date", "asc")
    );

    const unsubscribe = onSnapshot(
      monthQuery,
      (snapshot) => {
        const next: Record<string, SharedDayDoc> = {};
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as SharedDayDoc;
          const entries: Record<string, SharedEntry> = {};
          Object.entries(data.entries ?? {}).forEach(([uid, entry]) => {
            entries[uid] = normalizeSharedEntry(entry);
          });
          next[docSnap.id] = { ...data, entries };
        });
        const pendingMap = pendingSharedWritesRef.current;
        if (user && Object.keys(pendingMap).length > 0) {
          Object.entries(pendingMap).forEach(([dateId, pendingEntry]) => {
            const day = next[dateId] ?? { entries: {} };
            const snapshotEntry = day.entries?.[user.uid];
            if (!isSameSharedEntry(snapshotEntry, pendingEntry)) {
              next[dateId] = {
                ...day,
                date: day.date ?? Timestamp.fromDate(startOfDay(parseDateIdToLocalDate(dateId))),
                entries: {
                  ...(day.entries ?? {}),
                  [user.uid]: pendingEntry,
                },
              };
            }
          });
        }
        setSharedMonthData(next);
        setSharedMonthLoading(false);
        setSharedMonthError(null);
        if (user && Object.keys(pendingMap).length > 0) {
          const nextPending = { ...pendingMap };
          Object.entries(pendingMap).forEach(([dateId, pendingEntry]) => {
            const snapshotEntry = next[dateId]?.entries?.[user.uid];
            if (isSameSharedEntry(snapshotEntry, pendingEntry)) {
              delete nextPending[dateId];
            }
          });
          pendingSharedWritesRef.current = nextPending;
        }
      },
      (error) => {
        console.error(error);
        setSharedMonthLoading(false);
        setSharedMonthError("共有カレンダーの月データ取得に失敗しました。");
      }
    );

    return () => unsubscribe();
  }, [calendarMode, currentMonthDate, selectedSharedId, user]);

  useEffect(() => {
    if (!user) {
      return;
    }
    const ref = doc(db, "users", user.uid, "settings", "customItems");
    const unsubscribe = onSnapshot(ref, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as { items?: CustomItem[] };
        setCustomItems(
          (data.items ?? []).map((item) => ({
            ...item,
            inputType: item.inputType ?? "check",
            displayLabel: item.displayLabel ?? "",
            options: item.options ?? [],
          }))
        );
      } else {
        setCustomItems([]);
      }
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (calendarMode === "shared") {
      setRightDrawerOpen(false);
    }
  }, [calendarMode]);

  useEffect(() => {
    if (calendarMode !== "shared") {
      setSharedDrawerOpen(false);
    }
  }, [calendarMode]);

  useEffect(() => {
    if (!sharedDrawerOpen || calendarMode !== "shared") {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (sharedDrawerRef.current?.contains(target)) {
        return;
      }
      if (sharedCalendarRef.current?.contains(target)) {
        return;
      }
      setSharedDrawerOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [calendarMode, sharedDrawerOpen]);

  useEffect(() => {
    if (!isMobile) {
      setLeftDrawerOpen(false);
      setRightDrawerOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) {
      return;
    }
    if (rightDrawerOpen) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
    document.body.style.overflow = "";
    return undefined;
  }, [isMobile, rightDrawerOpen]);

  useEffect(() => {
    if (!user) {
      return;
    }
    const settingsRef = doc(db, "users", user.uid, "settings", "ui");
    const unsubscribe = onSnapshot(settingsRef, (snapshot) => {
      const defaults = buildDefaultItemColors(customItems);
      if (snapshot.exists()) {
        const data = snapshot.data() as {
          itemColors?: Partial<Record<string, ColorId>>;
        };
        const normalizedItemColors = Object.fromEntries(
          Object.entries(data.itemColors ?? {}).filter(([, value]) => Boolean(value))
        ) as Record<string, ColorId>;
        setItemColors({
          ...defaults,
          ...normalizedItemColors,
        });
      } else {
        setItemColors(defaults);
      }
    });

    return () => unsubscribe();
  }, [customItems, user]);

  useEffect(() => {
    setFilters((prev) => {
      const next = { ...prev };
      customFilterItems.forEach((item) => {
        if (!(item.id in next)) {
          next[item.id] = true;
        }
      });
      Object.keys(next).forEach((key) => {
        if (!filterItemIdSet.has(key)) {
          delete next[key];
        }
      });
      return next;
    });
  }, [customFilterItems, filterItemIdSet]);

  useEffect(() => {
    if (!colorPickerOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (!colorPickerRef.current) {
        return;
      }
      if (!colorPickerRef.current.contains(event.target as Node)) {
        setColorPickerOpen(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [colorPickerOpen]);

  useEffect(() => {
    if (!sharedColorPickerOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (!sharedColorPickerRef.current) {
        return;
      }
      if (!sharedColorPickerRef.current.contains(event.target as Node)) {
        setSharedColorPickerOpen(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [sharedColorPickerOpen]);

  useEffect(() => {
    if (!timePickerOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (!timePickerRef.current) {
        return;
      }
      if (!timePickerRef.current.contains(event.target as Node)) {
        setTimePickerOpen(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [timePickerOpen]);

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

  const selectedSharedCalendar = useMemo(
    () => sharedCalendars.find((calendar) => calendar.id === selectedSharedId) ?? null,
    [sharedCalendars, selectedSharedId]
  );
  const activeSharedCalendar = sharedCalendarDetail ?? selectedSharedCalendar;
  const inviteModalCalendar = useMemo(() => {
    if (!sharedInviteCalendarId) {
      return null;
    }
    return sharedCalendars.find((calendar) => calendar.id === sharedInviteCalendarId) ?? null;
  }, [sharedCalendars, sharedInviteCalendarId]);

  const sharedPartnerId = useMemo(() => {
    if (!user || !activeSharedCalendar) {
      return null;
    }
    return (
      activeSharedCalendar.memberIds.find((memberId) => memberId !== user.uid) ?? null
    );
  }, [activeSharedCalendar, user]);

  const sharedPartnerColors = useMemo(() => {
    if (!sharedPartnerId || !activeSharedCalendar?.memberColors) {
      return defaultSharedItemColors;
    }
    return {
      ...defaultSharedItemColors,
      ...(activeSharedCalendar.memberColors[sharedPartnerId] ?? {}),
    };
  }, [activeSharedCalendar, sharedPartnerId]);

  useEffect(() => {
    if (!user || calendarMode !== "shared") {
      return;
    }
    const dateId = formatDateId(selectedDate);
    const sourceEntry = sharedMonthData[dateId]?.entries?.[user.uid];
    if (sharedEditingDirty) {
      if (sourceEntry) {
        setSharedEditingEntry(normalizeSharedEntry(sourceEntry));
      }
      setSharedEditingDirty(false);
      return;
    }
    setSharedEditingEntry(normalizeSharedEntry(sourceEntry));
    setSharedSaveError(null);
  }, [calendarMode, selectedDate, sharedEditingDirty, sharedMonthData, user]);

  useEffect(() => {
    if (!user || calendarMode !== "shared") {
      return;
    }
    const storedColors = activeSharedCalendar?.memberColors?.[user.uid];
    if (!storedColors) {
      return;
    }
    setSharedItemColors({
      ...defaultSharedItemColors,
      ...storedColors,
    });
  }, [activeSharedCalendar, calendarMode, user]);

  const commitSharedEntry = async (nextEntry: SharedEntry) => {
    if (!user || !selectedSharedId) {
      return;
    }
    setSharedSaveError(null);
    setSharedEditingDirty(true);
    const dateId = formatDateId(selectedDate);
    const prevEntry = sharedMonthData[dateId]?.entries?.[user.uid];
    pendingSharedWritesRef.current = {
      ...pendingSharedWritesRef.current,
      [dateId]: nextEntry,
    };
    setSharedMonthData((prev) => {
      const prevDay = prev[dateId];
      const nextEntries = {
        ...(prevDay?.entries ?? {}),
        [user.uid]: nextEntry,
      };
      return {
        ...prev,
        [dateId]: {
          ...prevDay,
          date: Timestamp.fromDate(startOfDay(selectedDate)),
          entries: nextEntries,
        },
      };
    });
    const ref = doc(db, "sharedCalendars", selectedSharedId, "days", dateId);
    const payload = {
      date: Timestamp.fromDate(startOfDay(selectedDate)),
      updatedAt: serverTimestamp(),
      entries: {
        [user.uid]: {
          ...nextEntry,
          updatedAt: serverTimestamp(),
          ...(nextEntry.createdAt ? {} : { createdAt: serverTimestamp() }),
        },
      },
    };
    try {
      await setDoc(ref, payload, { merge: true });
      setSharedEditingDirty(false);
    } catch (error) {
      setSharedSaveError("保存に失敗しました。再度お試しください。");
      setSharedEditingDirty(false);
      const nextPending = { ...pendingSharedWritesRef.current };
      delete nextPending[dateId];
      pendingSharedWritesRef.current = nextPending;
      setSharedMonthData((prev) => {
        const prevDay = prev[dateId];
        if (!prevDay) {
          return prev;
        }
        const nextEntries = { ...(prevDay.entries ?? {}) };
        if (prevEntry) {
          nextEntries[user.uid] = prevEntry;
        } else {
          delete nextEntries[user.uid];
        }
        return {
          ...prev,
          [dateId]: {
            ...prevDay,
            entries: nextEntries,
          },
        };
      });
      console.error(error);
    }
  };

  const updateSharedEntry = (updater: (prev: SharedEntry) => SharedEntry) => {
    setSharedEditingEntry((prev) => {
      const next = updater(prev);
      commitSharedEntry(next);
      return next;
    });
  };

  const createSharedCalendar = async () => {
    if (!user || !sharedCalendarName.trim()) {
      setSharedCreateError("カレンダー名を入力してください。");
      return;
    }
    setSharedCreateLoading(true);
    setSharedCreateError(null);
    const calendarRef = doc(collection(db, "sharedCalendars"));
    let inviteCode = generateInviteCode();
    let hasUniqueCode = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const inviteRef = doc(db, "sharedInvites", inviteCode);
      const snapshot = await getDoc(inviteRef);
      if (!snapshot.exists()) {
        hasUniqueCode = true;
        break;
      }
      inviteCode = generateInviteCode();
    }
    if (!hasUniqueCode) {
      setSharedCreateError("招待コードの生成に失敗しました。再度お試しください。");
      setSharedCreateLoading(false);
      return;
    }
    const payload = {
      name: sharedCalendarName.trim(),
      ownerId: user.uid,
      memberIds: [user.uid],
      memberInfo: {
        [user.uid]: {
          displayName: user.displayName ?? "ユーザー",
          photoURL: user.photoURL ?? null,
          joinedAt: serverTimestamp(),
        },
      },
      memberColors: {
        [user.uid]: defaultSharedItemColors,
      },
      inviteCode,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    try {
      await setDoc(calendarRef, payload);
      await setDoc(doc(db, "sharedInvites", inviteCode), {
        calendarId: calendarRef.id,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
      });
      setSharedCalendarName("");
      setSharedCreateModalOpen(false);
      setCalendarMode("shared");
      setSelectedSharedId(calendarRef.id);
      pendingSharedSelectionRef.current = calendarRef.id;
      setSharedInviteCalendarId(calendarRef.id);
      setSharedInvitePreview({ name: payload.name, inviteCode });
      setSharedInviteModalOpen(true);
    } catch (error) {
      console.error(error);
      setSharedCreateError("共有カレンダーの作成に失敗しました。");
    } finally {
      setSharedCreateLoading(false);
    }
  };

  const closeSharedCreateModal = () => {
    setSharedCreateModalOpen(false);
    setSharedCreateError(null);
  };

  const joinSharedCalendarByCode = useCallback(async (code: string) => {
    if (!user) {
      return;
    }
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setSharedJoinError("招待コードを入力してください。");
      return;
    }
    setSharedJoinLoading(true);
    setSharedJoinError(null);
    try {
      const inviteRef = doc(db, "sharedInvites", trimmed);
      const inviteSnap = await getDoc(inviteRef);
      if (!inviteSnap.exists()) {
        setSharedJoinError("招待コードが見つかりませんでした。");
        return;
      }
      const inviteData = inviteSnap.data() as { calendarId?: string };
      if (!inviteData.calendarId) {
        setSharedJoinError("招待コードが無効です。");
        return;
      }
      const calendarRef = doc(db, "sharedCalendars", inviteData.calendarId);
      await setDoc(
        calendarRef,
        {
          memberIds: arrayUnion(user.uid),
          [`memberInfo.${user.uid}`]: {
            displayName: user.displayName ?? "ユーザー",
            photoURL: user.photoURL ?? null,
            joinedAt: serverTimestamp(),
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setCalendarMode("shared");
      setSelectedSharedId(inviteData.calendarId);
      pendingSharedSelectionRef.current = inviteData.calendarId;
      setSharedJoinCode("");
    } catch (error) {
      console.error(error);
      setSharedJoinError("参加に失敗しました。再度お試しください。");
    } finally {
      setSharedJoinLoading(false);
    }
  }, [user]);

  const closeSharedInviteModal = () => {
    setSharedInviteModalOpen(false);
    setSharedInviteCalendarId(null);
    setSharedInvitePreview(null);
  };

  useEffect(() => {
    if (!user) {
      return;
    }
    const inviteCode = searchParams?.get("invite");
    if (!inviteCode || handledInviteCodeRef.current === inviteCode) {
      return;
    }
    handledInviteCodeRef.current = inviteCode;
    joinSharedCalendarByCode(inviteCode);
  }, [joinSharedCalendarByCode, searchParams, user]);

  const getInviteLink = (code: string) => {
    if (typeof window === "undefined") {
      return "";
    }
    return `${window.location.origin}/app?invite=${code}`;
  };

  const copyInviteText = async (text: string, type: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(text);
      setSharedInviteCopied(type);
      setTimeout(() => setSharedInviteCopied(null), 2000);
    } catch (error) {
      console.error(error);
    }
  };

  const updateSharedMealStatus = (
    meal: "breakfast" | "lunch" | "dinner",
    value: SharedMealStatus
  ) => {
    updateSharedEntry((prev) => {
      const nextValue = prev[meal] === value ? "unset" : value;
      if (meal === "dinner" && nextValue !== "ok" && nextValue !== "maybe") {
        return { ...prev, dinner: nextValue, dinnerSlots: [] };
      }
      return { ...prev, [meal]: nextValue } as SharedEntry;
    });
  };

  const toggleSharedDinnerSlot = (slot: number) => {
    updateSharedEntry((prev) => {
      const current = prev.dinnerSlots;
      const exists = current.includes(slot);
      const next = exists
        ? current.filter((value) => value !== slot).sort((a, b) => a - b)
        : [...current, slot].sort((a, b) => a - b);
      return { ...prev, dinnerSlots: next };
    });
  };

  const toggleSharedChore = (id: SharedChoreId) => {
    updateSharedEntry((prev) => ({
      ...prev,
      chores: { ...prev.chores, [id]: !prev.chores[id] },
    }));
  };

  const calendarMeta = useMemo(() => {
    const year = currentMonthDate.getFullYear();
    const monthIndex = currentMonthDate.getMonth();
    const firstDay = new Date(year, monthIndex, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const lastDay = new Date(year, monthIndex, daysInMonth);
    const endOffset = 6 - lastDay.getDay();
    const totalDays = daysInMonth + startOffset + endOffset;
    const weeks = Math.ceil(totalDays / 7);
    const startDate = new Date(year, monthIndex, 1 - startOffset);
    const cells = Array.from({ length: weeks * 7 }, (_, index) => {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + index);
      return date;
    });
    return { cells, weeks };
  }, [currentMonthDate]);

  const maxLines = isMobile ? 3 : 4;

  const mealFullLabel: Record<MealOption, string> = {
    home: "自炊(家)",
    lab: "自炊(研)",
    out: "外食",
  };
  const mealShortLabel: Record<MealOption, string> = {
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
    const wakeColor = colorStyles[itemColors.wakeTime].chip;
    const sleepColor = colorStyles[itemColors.sleepTime].chip;
    const durationColor = colorStyles[itemColors.sleepDuration].chip;
    const breakfastColor = colorStyles[itemColors.breakfast].chip;
    const lunchColor = colorStyles[itemColors.lunch].chip;
    const dinnerColor = colorStyles[itemColors.dinner].chip;
    const brushAmColor = colorStyles[itemColors.brushAM].chip;
    const brushPmColor = colorStyles[itemColors.brushPM].chip;
    const showerAmColor = colorStyles[itemColors.showerAM].chip;
    const showerPmColor = colorStyles[itemColors.showerPM].chip;
    const mealLabel = (value: MealOption) =>
      isMobile ? mealShortLabel[value] : mealFullLabel[value];

    if (filters.wakeTime && docData.wakeTime) {
      chips.push({
        id: `${dateId}-wake`,
        label: `起 ${docData.wakeTime}`,
        className: wakeColor,
      });
    }
    if (filters.sleepTime && docData.sleepTime) {
      chips.push({
        id: `${dateId}-sleep`,
        label: `寝 ${docData.sleepTime}`,
        className: sleepColor,
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
            className: durationColor,
          });
        }
      }
    }
    if (filters.breakfast && docData.breakfast) {
      chips.push({
        id: `${dateId}-breakfast`,
        label: "☕",
        className: breakfastColor,
      });
    }
    if (filters.lunch && docData.lunch) {
      chips.push({
        id: `${dateId}-lunch`,
        label: `昼: ${mealLabel(docData.lunch)}`,
        className: lunchColor,
      });
    }
    if (filters.dinner && docData.dinner) {
      chips.push({
        id: `${dateId}-dinner`,
        label: `夜: ${mealLabel(docData.dinner)}`,
        className: dinnerColor,
      });
    }
    if (filters.brushAM && docData.brushAM) {
      chips.push({
        id: `${dateId}-brush-am`,
        label: "🦷(朝)",
        className: brushAmColor,
      });
    }
    if (filters.brushPM && docData.brushPM) {
      chips.push({
        id: `${dateId}-brush-pm`,
        label: "🦷(夜)",
        className: brushPmColor,
      });
    }
    if (filters.showerAM && docData.showerAM) {
      chips.push({
        id: `${dateId}-shower-am`,
        label: "🛀(朝)",
        className: showerAmColor,
      });
    }
    if (filters.showerPM && docData.showerPM) {
      chips.push({
        id: `${dateId}-shower-pm`,
        label: "🛀(夜)",
        className: showerPmColor,
      });
    }
    const customValues = docData.custom ?? {};
    customItems.forEach((item) => {
      const filterId = `custom-${item.id}`;
      if (!filters[filterId]) {
        return;
      }
      const value = customValues[item.id];
      const hasValue =
        item.inputType === "check" ? Boolean(value) : typeof value === "string" && value;
      if (!hasValue) {
        return;
      }
      const label = item.displayLabel?.trim() || item.name;
      const chipLabel =
        item.inputType === "check" ? label : `${label}: ${String(value)}`;
      const colorId = itemColors[filterId] ?? "cyan";
      chips.push({
        id: `${dateId}-${filterId}`,
        label: chipLabel,
        className: colorStyles[colorId].chip,
      });
    });
    return chips;
  };

  const buildSharedLines = (entry: SharedEntry, colorMap: Record<string, ColorId>) => {
    const lines: { id: string; label: string; className: string }[] = [];
    if (sharedFilters["shared-breakfast"] && entry.breakfast !== "unset") {
      lines.push({
        id: "shared-breakfast",
        label: `朝：${sharedMealStatusLabel[entry.breakfast]}`,
        className: colorStyles[colorMap["shared-breakfast"]].chip,
      });
    }
    if (sharedFilters["shared-lunch"] && entry.lunch !== "unset") {
      lines.push({
        id: "shared-lunch",
        label: `昼：${sharedMealStatusLabel[entry.lunch]}`,
        className: colorStyles[colorMap["shared-lunch"]].chip,
      });
    }
    if (sharedFilters["shared-dinner"] && entry.dinner !== "unset") {
      lines.push({
        id: "shared-dinner",
        label: `夜：${sharedMealStatusLabel[entry.dinner]}`,
        className: colorStyles[colorMap["shared-dinner"]].chip,
      });
    }
    if (sharedFilters["shared-dinner-slots"] && entry.dinnerSlots.length > 0) {
      lines.push({
        id: "shared-dinner-slots",
        label: formatDinnerRanges(entry.dinnerSlots),
        className: colorStyles[colorMap["shared-dinner-slots"]].chip,
      });
    }
    sharedChoreItems.forEach((item) => {
      if (!sharedFilters[`shared-${item.id}`]) {
        return;
      }
      if (!entry.chores[item.id]) {
        return;
      }
      lines.push({
        id: `shared-${item.id}`,
        label: item.label,
        className: colorStyles[colorMap[`shared-${item.id}`]].chip,
      });
    });
    return lines;
  };

  const renderSharedCompact = (entry: SharedEntry, colorMap: Record<string, ColorId>) => {
    const lines = buildSharedLines(entry, colorMap);
    const visible = lines.slice(0, 4);
    const extraCount = lines.length - visible.length;
    return (
      <div className="space-y-0.5 text-[10px] text-zinc-500">
        {visible.map((line) => (
          <div
            key={line.id}
            className={`truncate rounded px-1 py-0.5 ${line.className}`}
          >
            {line.label}
          </div>
        ))}
        {extraCount > 0 ? (
          <div className="truncate rounded bg-zinc-100 px-1 py-0.5 text-[10px] text-zinc-500">
            +{extraCount}
          </div>
        ) : null}
      </div>
    );
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

  const toggleSharedGroup = (
    group: (typeof sharedFilterGroups)[number],
    checked: boolean
  ) => {
    setSharedFilters((prev) => {
      const next = { ...prev };
      group.items.forEach((item) => {
        next[item.id] = checked;
      });
      return next;
    });
  };

  const updateSharedFilter = (id: string, checked: boolean) => {
    setSharedFilters((prev) => ({ ...prev, [id]: checked }));
  };

  const updateSharedItemColor = (itemId: string, colorId: ColorId) => {
    setSharedColorPickerOpen(null);
    const nextColors = { ...sharedItemColors, [itemId]: colorId };
    setSharedItemColors(nextColors);
    if (!user || !selectedSharedId) {
      return;
    }
    const calendarRef = doc(db, "sharedCalendars", selectedSharedId);
    setDoc(
      calendarRef,
      {
        memberColors: {
          [user.uid]: nextColors,
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch((error) => console.error(error));
  };

  const updateItemColor = async (itemId: FilterItemId, colorId: ColorId) => {
    setColorPickerOpen(null);
    setItemColors((prev) => {
      const next = { ...prev, [itemId]: colorId };
      if (user) {
        const settingsRef = doc(db, "users", user.uid, "settings", "ui");
        setDoc(settingsRef, { itemColors: next }, { merge: true }).catch((error) =>
          console.error(error)
        );
      }
      return next;
    });
  };

  const openCreateCustomModal = () => {
    setCustomModalMode("create");
    setEditingCustomId(null);
    setCustomForm({
      name: "",
      inputType: "check",
      displayLabel: "",
      optionsText: "",
    });
    setCustomFormError(null);
    setCustomModalOpen(true);
  };

  const openEditCustomModal = (item: CustomItem) => {
    setCustomModalMode("edit");
    setEditingCustomId(item.id);
    setCustomForm({
      name: item.name,
      inputType: item.inputType,
      displayLabel: item.displayLabel ?? "",
      optionsText: (item.options ?? []).join("\n"),
    });
    setCustomFormError(null);
    setCustomModalOpen(true);
  };

  const closeCustomModal = () => {
    setCustomModalOpen(false);
    setCustomFormError(null);
  };

  const parseOptions = (value: string) =>
    value
      .split("\n")
      .map((option) => option.trim())
      .filter(Boolean);

  const persistCustomItems = async (items: CustomItem[]) => {
    if (!user) {
      return;
    }
    const ref = doc(db, "users", user.uid, "settings", "customItems");
    try {
      await setDoc(ref, { items }, { merge: true });
    } catch (error) {
      setSaveError("カスタム項目の保存に失敗しました。");
      console.error(error);
    }
  };

  const clearCustomValueFromDay = (itemId: string) => {
    const nextCustom = { ...(dayDoc.custom ?? {}) };
    if (itemId in nextCustom) {
      delete nextCustom[itemId];
      setDayDoc((prev) => ({ ...prev, custom: nextCustom }));
      saveFields({ custom: nextCustom });
    }
  };

  const removeCustomItemData = async (itemId: string) => {
    if (!user) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const snapshot = await getDocs(collection(db, "users", user.uid, "days"));
      const batch = writeBatch(db);
      let hasUpdates = false;
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as DayDoc;
        if (data.custom && itemId in data.custom) {
          batch.update(docSnap.ref, { [`custom.${itemId}`]: deleteField() });
          hasUpdates = true;
        }
      });
      if (hasUpdates) {
        await batch.commit();
      }
    } catch (error) {
      setSaveError("カスタム項目の削除に失敗しました。");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCustomItem = async (item: CustomItem) => {
    const confirmed = window.confirm(
      "このカスタム項目を削除します。すでに入力したデータも削除されますがよろしいですか？"
    );
    if (!confirmed) {
      return;
    }
    await removeCustomItemData(item.id);
    const nextItems = customItems.filter((custom) => custom.id !== item.id);
    await persistCustomItems(nextItems);
    clearCustomValueFromDay(item.id);
    closeCustomModal();
  };

  const handleSaveCustomItem = async () => {
    const name = customForm.name.trim();
    if (!name) {
      setCustomFormError("項目名を入力してください。");
      return;
    }
    const displayLabel = customForm.displayLabel.trim();
    const options =
      customForm.inputType === "select" ? parseOptions(customForm.optionsText) : [];
    if (customForm.inputType === "select" && options.length === 0) {
      setCustomFormError("選択項目を1つ以上入力してください。");
      return;
    }

    if (customModalMode === "create") {
      const newItem: CustomItem = {
        id: crypto.randomUUID(),
        name,
        inputType: customForm.inputType,
        displayLabel,
        options,
      };
      await persistCustomItems([...customItems, newItem]);
      closeCustomModal();
      return;
    }

    const target = customItems.find((item) => item.id === editingCustomId);
    if (!target) {
      closeCustomModal();
      return;
    }
    const inputTypeChanged = target.inputType !== customForm.inputType;
    const optionsChanged =
      customForm.inputType === "select" &&
      JSON.stringify(target.options ?? []) !== JSON.stringify(options);
    if (inputTypeChanged || optionsChanged) {
      const confirmed = window.confirm(
        "入力形式の変更により既存の入力データが消える可能性があります。続行しますか？"
      );
      if (!confirmed) {
        return;
      }
      await removeCustomItemData(target.id);
      clearCustomValueFromDay(target.id);
    }
    const nextItems = customItems.map((item) =>
      item.id === target.id
        ? {
            ...item,
            name,
            inputType: customForm.inputType,
            displayLabel,
            options,
          }
        : item
    );
    await persistCustomItems(nextItems);
    closeCustomModal();
  };

  const updateCustomValue = (itemId: string, value: CustomValue) => {
    const nextCustom = { ...(dayDoc.custom ?? {}) };
    if (value === null || value === "" || value === false) {
      delete nextCustom[itemId];
    } else {
      nextCustom[itemId] = value;
    }
    setDayDoc((prev) => ({ ...prev, custom: nextCustom }));
    saveFields({ custom: nextCustom });
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

  const openTimePicker = (field: "wake" | "sleep") => {
    const current = field === "wake" ? wakeTimeInput : sleepTimeInput;
    const parsed = parseTime(current) ?? { hour: 7, minute: 0 };
    setTimePickerValue({ hour: parsed.hour, minute: parsed.minute });
    setTimePickerOpen(field);
  };

  const sanitizeDigits = (value: string) => value.replace(/\D/g, "").slice(0, 2);

  const updateManualTime = (
    field: "wake" | "sleep",
    part: "hour" | "minute",
    value: string
  ) => {
    const next = sanitizeDigits(value);
    if (field === "wake") {
      if (part === "hour") {
        setWakeHourInput(next);
      } else {
        setWakeMinuteInput(next);
      }
      const hour = part === "hour" ? next : wakeHourInput;
      const minute = part === "minute" ? next : wakeMinuteInput;
      if (hour && minute) {
        setWakeTimeInput(formatTimeValue(Number(hour), Number(minute)));
      } else {
        setWakeTimeInput("");
      }
    } else {
      if (part === "hour") {
        setSleepHourInput(next);
      } else {
        setSleepMinuteInput(next);
      }
      const hour = part === "hour" ? next : sleepHourInput;
      const minute = part === "minute" ? next : sleepMinuteInput;
      if (hour && minute) {
        setSleepTimeInput(formatTimeValue(Number(hour), Number(minute)));
      } else {
        setSleepTimeInput("");
      }
    }
  };

  const commitManualTime = (field: "wake" | "sleep") => {
    if (field === "wake") {
      if (!wakeHourInput || !wakeMinuteInput) {
        setWakeTimeInput("");
        if (dayDoc.wakeTime !== null) {
          setDayDoc((prev) => ({ ...prev, wakeTime: null }));
          saveFields({ wakeTime: null });
        }
        return;
      }
      const normalized = normalizeTimeToStep(
        formatTimeValue(Number(wakeHourInput), Number(wakeMinuteInput))
      );
      const parts = splitTimeValue(normalized);
      setWakeHourInput(parts.hour);
      setWakeMinuteInput(parts.minute);
      setWakeTimeInput(normalized);
      if (normalized !== dayDoc.wakeTime) {
        setDayDoc((prev) => ({ ...prev, wakeTime: normalized }));
        saveFields({ wakeTime: normalized });
      }
      return;
    }

    if (!sleepHourInput || !sleepMinuteInput) {
      setSleepTimeInput("");
      if (dayDoc.sleepTime !== null) {
        setDayDoc((prev) => ({ ...prev, sleepTime: null }));
        saveFields({ sleepTime: null });
      }
      return;
    }
    const normalized = normalizeTimeToStep(
      formatTimeValue(Number(sleepHourInput), Number(sleepMinuteInput))
    );
    const parts = splitTimeValue(normalized);
    setSleepHourInput(parts.hour);
    setSleepMinuteInput(parts.minute);
    setSleepTimeInput(normalized);
    if (normalized !== dayDoc.sleepTime) {
      setDayDoc((prev) => ({ ...prev, sleepTime: normalized }));
      saveFields({ sleepTime: normalized });
    }
  };

  const commitTimePicker = (field: "wake" | "sleep", hour: number, minute: number) => {
    const normalized = formatTimeValue(hour, minute);
    if (field === "wake") {
      setWakeTimeInput(normalized);
      const parts = splitTimeValue(normalized);
      setWakeHourInput(parts.hour);
      setWakeMinuteInput(parts.minute);
      if (normalized !== dayDoc.wakeTime) {
        setDayDoc((prev) => ({ ...prev, wakeTime: normalized }));
        saveFields({ wakeTime: normalized });
      }
    } else {
      setSleepTimeInput(normalized);
      const parts = splitTimeValue(normalized);
      setSleepHourInput(parts.hour);
      setSleepMinuteInput(parts.minute);
      if (normalized !== dayDoc.sleepTime) {
        setDayDoc((prev) => ({ ...prev, sleepTime: normalized }));
        saveFields({ sleepTime: normalized });
      }
    }
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
  const displayDate = `${selectedDate.getFullYear()}/${selectedDate.getMonth() + 1}/${selectedDate.getDate()}`;
  const canEditDinnerSlots =
    sharedEditingEntry.dinner === "ok" || sharedEditingEntry.dinner === "maybe";

  useEffect(() => {
    if (calendarMode !== "shared") {
      return;
    }
    setSharedEditingDirty(false);
  }, [calendarMode, selectedDate]);
  const customValues = dayDoc.custom ?? {};
  const editingCustomItem = editingCustomId
    ? customItems.find((item) => item.id === editingCustomId) ?? null
    : null;
  const sharedInviteCode = activeSharedCalendar?.inviteCode ?? "";
  const sharedInviteLink = sharedInviteCode ? getInviteLink(sharedInviteCode) : "";
  const inviteModalName =
    inviteModalCalendar?.name ?? sharedInvitePreview?.name ?? "";
  const inviteModalCode =
    inviteModalCalendar?.inviteCode ?? sharedInvitePreview?.inviteCode ?? "";
  const inviteModalLink = inviteModalCode ? getInviteLink(inviteModalCode) : "";
  const sharedMailtoLink = sharedInviteLink
    ? `mailto:?subject=${encodeURIComponent(
        "共有カレンダーの招待"
      )}&body=${encodeURIComponent(
        `招待コード: ${sharedInviteCode}\n招待リンク: ${sharedInviteLink}`
      )}`
    : "";
  const activeMonthError = calendarMode === "shared" ? sharedMonthError : monthError;
  const activeMonthLoading =
    calendarMode === "shared" ? sharedMonthLoading : monthLoading;

  const renderCustomInputs = () => (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="h-4 w-1 rounded-full bg-zinc-900/70" />
        <h3 className="text-xs font-semibold text-zinc-700">カスタム</h3>
      </div>
      {customItems.length === 0 ? (
        <div className="text-xs text-zinc-400">まだカスタム項目がありません。</div>
      ) : null}
      {customItems.map((item) => {
        const label = item.name;
        const value = customValues[item.id];
        if (item.inputType === "check") {
          return (
            <label key={item.id} className="flex w-fit items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(value)}
                onChange={() => updateCustomValue(item.id, !Boolean(value))}
                className="h-4 w-4 rounded border-zinc-300"
              />
              {label}
            </label>
          );
        }
        if (item.inputType === "select") {
          const options = item.options ?? [];
          const optionCount = options.length;
          const gridColsClass =
            optionCount <= 1
              ? "grid-cols-1"
              : optionCount === 2
                ? "grid-cols-2"
                : optionCount === 3
                  ? "grid-cols-3"
                  : optionCount === 4
                    ? "grid-cols-4"
                    : optionCount <= 6
                      ? "grid-cols-3"
                      : "grid-cols-4";
          return (
            <div key={item.id} className="space-y-1">
              <div className="text-xs font-semibold text-zinc-500">{label}</div>
              <div className={`grid ${gridColsClass} gap-2 text-xs`}>
                {options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      const nextValue = value === option ? "" : option;
                      updateCustomValue(item.id, nextValue);
                    }}
                    className={`rounded-lg border px-3 py-2 ${
                      value === option
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 text-zinc-600 hover:border-zinc-400"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          );
        }
        return (
          <div key={item.id} className="space-y-1">
            <div className="text-xs font-semibold text-zinc-500">{label}</div>
            <input
              type="text"
              value={typeof value === "string" ? value : ""}
              onChange={(event) => updateCustomValue(item.id, event.target.value)}
              className="w-full rounded border border-zinc-200 px-3 py-2 text-sm text-zinc-700"
              placeholder="入力"
            />
          </div>
        );
      })}
    </div>
  );

  const renderPersonalCategories = () => (
    <div className="mt-4 space-y-3 text-sm text-zinc-700">
      {filterGroups.map((group) => {
        const checkedCount = group.items.filter((item) => filters[item.id]).length;
        const allChecked = group.items.length > 0 && checkedCount === group.items.length;
        const indeterminate = checkedCount > 0 && !allChecked;
        return (
          <div key={group.id} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 font-medium">
                <ParentCheckbox
                  checked={allChecked}
                  indeterminate={indeterminate}
                  onChange={(checked) => toggleGroup(group, checked)}
                />
                {group.label}
              </label>
              {group.isCustom ? (
                <button
                  type="button"
                  onClick={openCreateCustomModal}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 hover:bg-zinc-100"
                  aria-label="カスタム項目を追加"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              ) : null}
            </div>
            <div className="space-y-1 pl-6 text-xs text-zinc-500">
              {group.items.map((item) => {
                const customItem = item.customId
                  ? customItems.find((custom) => custom.id === item.customId)
                  : null;
                return (
                  <div key={item.id} className="flex items-center justify-between">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={filters[item.id] ?? false}
                        onChange={(event) => updateFilter(item.id, event.target.checked)}
                        className="h-3.5 w-3.5 rounded border-zinc-300"
                      />
                      {item.label}
                    </label>
                    <div className="flex items-center gap-2">
                      {customItem ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditCustomModal(customItem)}
                            className="inline-flex h-6 w-6 items-center justify-center rounded border border-zinc-200 text-zinc-500 hover:bg-zinc-100"
                            aria-label={`${customItem.name}を編集`}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                            </svg>
                          </button>
                        </>
                      ) : null}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setColorPickerOpen(
                              colorPickerOpen === item.id ? null : item.id
                            )
                          }
                          className={`h-3.5 w-3.5 rounded-full border border-white shadow ${
                            colorStyles[itemColors[item.id] ?? "cyan"].dot
                          }`}
                          aria-label={`${item.label}の色を選択`}
                        />
                        {colorPickerOpen === item.id ? (
                          <div
                            ref={colorPickerRef}
                            className="absolute right-0 z-10 mt-2 w-44 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg"
                          >
                            <div className="grid grid-cols-4 gap-2">
                              {colorPalette.map((color) => (
                                <button
                                  key={color.id}
                                  type="button"
                                  onClick={() =>
                                    updateItemColor(item.id, color.id as ColorId)
                                  }
                                  className={`h-6 w-6 rounded-full border ${
                                    color.id === itemColors[item.id]
                                      ? "border-zinc-900"
                                      : "border-transparent"
                                  } ${color.dot}`}
                                  aria-label={`${color.label}を選択`}
                                />
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderSharedCategories = () => (
    <div className="mt-4 space-y-3 text-sm text-zinc-700">
      {sharedFilterGroups.map((group) => {
        const checkedCount = group.items.filter((item) => sharedFilters[item.id]).length;
        const allChecked = group.items.length > 0 && checkedCount === group.items.length;
        const indeterminate = checkedCount > 0 && !allChecked;
        return (
          <div key={group.id} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 font-medium">
                <ParentCheckbox
                  checked={allChecked}
                  indeterminate={indeterminate}
                  onChange={(checked) => toggleSharedGroup(group, checked)}
                />
                {group.label}
              </label>
            </div>
            <div className="space-y-1 pl-6 text-xs text-zinc-500">
              {group.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={sharedFilters[item.id] ?? false}
                      onChange={(event) =>
                        updateSharedFilter(item.id, event.target.checked)
                      }
                      className="h-3.5 w-3.5 rounded border-zinc-300"
                    />
                    {item.label}
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setSharedColorPickerOpen(
                          sharedColorPickerOpen === item.id ? null : item.id
                        )
                      }
                      className={`h-3.5 w-3.5 rounded-full border border-white shadow ${
                        colorStyles[sharedItemColors[item.id] ?? "cyan"].dot
                      }`}
                      aria-label={`${item.label}の色を選択`}
                    />
                    {sharedColorPickerOpen === item.id ? (
                      <div
                        ref={sharedColorPickerRef}
                        className="absolute right-0 z-10 mt-2 w-44 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg"
                      >
                        <div className="grid grid-cols-4 gap-2">
                          {colorPalette.map((color) => (
                            <button
                              key={color.id}
                              type="button"
                              onClick={() =>
                                updateSharedItemColor(item.id, color.id as ColorId)
                              }
                              className={`h-6 w-6 rounded-full border ${
                                color.id === sharedItemColors[item.id]
                                  ? "border-zinc-900"
                                  : "border-transparent"
                              } ${color.dot}`}
                              aria-label={`${color.label}を選択`}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderSharedMealPicker = (
    label: string,
    value: SharedMealStatus,
    onChange: (next: SharedMealStatus) => void,
    disabled = false
  ) => (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-zinc-500">{label}</div>
      <div className="grid grid-cols-4 gap-2">
        {sharedMealStatusOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
              value === option.value
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 text-zinc-600 hover:border-zinc-400"
            } ${disabled ? "cursor-not-allowed opacity-60 hover:border-zinc-200" : ""}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );

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
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 py-2 sm:px-6">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => setLeftDrawerOpen((prev) => !prev)}
              className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded border border-zinc-200 text-zinc-500 hover:bg-zinc-50 sm:hidden"
              aria-label="メニューを開く"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="hidden space-y-1 sm:block">
              <h1 className="text-lg font-semibold">Routine Calendar</h1>
              <p className="text-xs text-zinc-500">
                月カレンダーで毎日のルーティンを整理
              </p>
            </div>
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

      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 px-2 py-3 sm:px-4 lg:flex-row lg:px-6">
        <section className="hidden w-full lg:block lg:w-64">
          <div className="space-y-3">
            <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
              <h2 className="text-sm font-semibold text-zinc-700">カレンダー</h2>
              <div className="mt-4 space-y-2 text-sm text-zinc-700">
                <button
                  type="button"
                  onClick={() => {
                    setCalendarMode("personal");
                    setLeftDrawerOpen(false);
                  }}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                    calendarMode === "personal"
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 text-zinc-700 hover:border-zinc-400"
                  }`}
                >
                  自分専用
                </button>
                {sharedCalendars.map((calendar) => {
                  const members = calendar.memberIds.map(
                    (memberId) => calendar.memberInfo?.[memberId]
                  );
                  return (
                    <button
                      key={calendar.id}
                      type="button"
                      onClick={() => {
                        setCalendarMode("shared");
                        setSelectedSharedId(calendar.id);
                      }}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                        calendarMode === "shared" && selectedSharedId === calendar.id
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-200 text-zinc-700 hover:border-zinc-400"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{calendar.name}</span>
                        <div className="flex -space-x-1">
                            {members.map((member, index) =>
                              member?.photoURL ? (
                                <Image
                                  key={`${calendar.id}-member-${index}`}
                                  src={member.photoURL}
                                  alt={member.displayName}
                                  width={20}
                                  height={20}
                                  className="h-5 w-5 rounded-full border border-white object-cover"
                                />
                              ) : (
                              <span
                                key={`${calendar.id}-member-${index}`}
                                className="flex h-5 w-5 items-center justify-center rounded-full border border-white bg-zinc-200 text-[10px] text-zinc-500"
                              >
                                ?
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
                {sharedCalendars.length === 0 ? (
                  <div className="text-xs text-zinc-400">
                    共有カレンダーはまだありません。
                  </div>
                ) : null}
              </div>
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => setSharedCreateModalOpen(true)}
                  className="w-full rounded-full border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100"
                >
                  共有カレンダーを新規作成
                </button>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={sharedJoinCode}
                    onChange={(event) => setSharedJoinCode(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        joinSharedCalendarByCode(sharedJoinCode);
                      }
                    }}
                    className="h-9 w-full rounded border border-zinc-200 px-3 text-xs text-zinc-700"
                    placeholder="招待コードを入力"
                  />
                  <button
                    type="button"
                    onClick={() => joinSharedCalendarByCode(sharedJoinCode)}
                    disabled={sharedJoinLoading}
                    className="rounded-full bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
                  >
                    参加
                  </button>
                </div>
                {sharedJoinError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                    {sharedJoinError}
                  </div>
                ) : null}
              </div>
              {calendarMode === "shared" && activeSharedCalendar ? (
                <div className="mt-4 space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
                  <div className="font-semibold text-zinc-700">招待リンク</div>
                  <div className="break-all">{sharedInviteLink || "リンク生成中..."}</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => copyInviteText(sharedInviteLink, "link")}
                      disabled={!sharedInviteLink}
                      className="rounded-full border border-zinc-200 px-3 py-1 text-[11px] font-semibold text-zinc-600 hover:bg-white disabled:opacity-50"
                    >
                      {sharedInviteCopied === "link" ? "コピーしました" : "リンクをコピー"}
                    </button>
                    {sharedMailtoLink ? (
                      <a
                        href={sharedMailtoLink}
                        className="rounded-full border border-zinc-200 px-3 py-1 text-[11px] font-semibold text-zinc-600 hover:bg-white"
                      >
                        メール招待
                      </a>
                    ) : null}
                  </div>
                  <div className="font-semibold text-zinc-700">招待コード</div>
                  <div className="text-sm font-semibold tracking-widest text-zinc-800">
                    {sharedInviteCode}
                  </div>
                  <button
                    type="button"
                    onClick={() => copyInviteText(sharedInviteCode, "code")}
                    className="w-fit rounded-full border border-zinc-200 px-3 py-1 text-[11px] font-semibold text-zinc-600 hover:bg-white"
                  >
                    {sharedInviteCopied === "code" ? "コピーしました" : "コードをコピー"}
                  </button>
                </div>
              ) : null}
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
              <h2 className="text-sm font-semibold text-zinc-700">カテゴリ</h2>
              {calendarMode === "personal" ? renderPersonalCategories() : renderSharedCategories()}
            </div>
          </div>
        </section>

        <section className="min-w-0 flex-1">
          <div
            ref={sharedCalendarRef}
            className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
          >
            <div className="grid grid-cols-7 gap-2 border-b border-zinc-100 pb-2 text-center text-xs font-semibold text-zinc-500">
              {weekdays.map((day) => (
                <div key={day}>{day}</div>
              ))}
            </div>
            {activeMonthError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                {activeMonthError}
              </div>
            ) : null}
            {activeMonthLoading ? (
              <div className="mt-3 text-xs text-zinc-400">月データを読み込み中...</div>
            ) : null}
            <div
              className="mt-3 grid grid-cols-7 border border-zinc-200 text-xs [--calendar-row-height:122px] sm:[--calendar-row-height:128px] lg:[--calendar-row-height:144px]"
              style={{
                gridTemplateRows: `repeat(${calendarMeta.weeks}, var(--calendar-row-height))`,
              }}
            >
              {calendarMeta.cells.map((date) => {
                const dateId = formatDateId(date);
                const chips = calendarMode === "personal" ? buildChips(date) : [];
                const visibleChips = chips.slice(0, maxLines);
                const extraCount = chips.length - visibleChips.length;
                const isSelected = dateId === selectedDateId;
                const isCurrentMonth =
                  date.getFullYear() === currentMonthDate.getFullYear() &&
                  date.getMonth() === currentMonthDate.getMonth();
                const sharedDoc = sharedMonthData[dateId];
                const sharedSelf = normalizeSharedEntry(
                  sharedDoc?.entries?.[user?.uid ?? ""]
                );
                const sharedPartner = sharedPartnerId
                  ? normalizeSharedEntry(sharedDoc?.entries?.[sharedPartnerId])
                  : null;
                return (
                  <button
                    key={dateId}
                    type="button"
                    onClick={() => {
                      setSelectedDate(date);
                      if (calendarMode === "shared") {
                        setSharedDrawerOpen(true);
                        return;
                      }
                      if (isMobile) {
                        setRightDrawerOpen(true);
                      }
                    }}
                    className={`flex h-full flex-col gap-1 overflow-hidden border-l border-t p-2 text-left transition ${
                      isSelected
                        ? "border-zinc-200 bg-zinc-900/5 ring-1 ring-inset ring-zinc-900"
                        : "border-zinc-200 bg-white hover:bg-zinc-50"
                    }`}
                  >
                    <div
                      className={`text-sm font-semibold ${
                        isCurrentMonth ? "text-zinc-800" : "text-zinc-400"
                      }`}
                    >
                      {date.getDate()}
                    </div>
                    {calendarMode === "shared" ? (
                      <div className="mt-1 grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          {renderSharedCompact(sharedSelf, sharedItemColors)}
                        </div>
                        <div className="space-y-1">
                          {sharedPartner
                            ? renderSharedCompact(sharedPartner, sharedPartnerColors)
                            : null}
                        </div>
                      </div>
                    ) : (
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
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {calendarMode === "personal" ? (
          <section className="hidden w-full lg:block lg:w-96">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{displayDate}</h2>
              {!hasDayDoc ? (
                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-semibold text-zinc-500">
                  未入力
                </span>
              ) : null}
            </div>
            {saveError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                {saveError}
              </div>
            ) : null}

            <div className="space-y-6 text-sm">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="h-4 w-1 rounded-full bg-zinc-900/70" />
                  <h3 className="text-xs font-semibold text-zinc-700">朝</h3>
                </div>
                <label className="flex items-center justify-between gap-3">
                  起床時刻
                  <div className="relative flex items-center gap-2">
                    <div className="flex h-10 items-center gap-1 rounded border border-zinc-200 px-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="hh"
                        value={wakeHourInput}
                        onChange={(event) =>
                          updateManualTime("wake", "hour", event.target.value)
                        }
                        onBlur={() => commitManualTime("wake")}
                        className="w-7 bg-transparent text-center text-sm focus:outline-none"
                      />
                      <span className="text-xs text-zinc-400">:</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="mm"
                        value={wakeMinuteInput}
                        onChange={(event) =>
                          updateManualTime("wake", "minute", event.target.value)
                        }
                        onBlur={() => commitManualTime("wake")}
                        className="w-7 bg-transparent text-center text-sm focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => openTimePicker("wake")}
                      className="inline-flex h-10 w-10 items-center justify-center rounded border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
                      aria-label="起床時刻のピッカーを開く"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        aria-hidden="true"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                    </button>
                    {timePickerOpen === "wake" && timePickerValue ? (
                      <div
                        ref={timePickerRef}
                        className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg"
                      >
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <div className="mb-1 text-[11px] font-semibold text-zinc-500">
                              時
                            </div>
                            <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                              {timeOptions.hours.map((hour) => (
                                <button
                                  key={hour}
                                  type="button"
                                  onClick={() => {
                                    const minute = timePickerValue.minute;
                                    setTimePickerValue({ hour, minute });
                                    commitTimePicker("wake", hour, minute);
                                  }}
                                  className={`w-full rounded px-2 py-1 text-left text-sm ${
                                    timePickerValue.hour === hour
                                      ? "bg-zinc-900 text-white"
                                      : "hover:bg-zinc-100"
                                  }`}
                                >
                                  {String(hour).padStart(2, "0")}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="mb-1 text-[11px] font-semibold text-zinc-500">
                              分
                            </div>
                            <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                              {timeOptions.minutes.map((minute) => (
                                <button
                                  key={minute}
                                  type="button"
                                  onClick={() => {
                                    const hour = timePickerValue.hour;
                                    setTimePickerValue({ hour, minute });
                                    commitTimePicker("wake", hour, minute);
                                  }}
                                  className={`w-full rounded px-2 py-1 text-left text-sm ${
                                    timePickerValue.minute === minute
                                      ? "bg-zinc-900 text-white"
                                      : "hover:bg-zinc-100"
                                  }`}
                                >
                                  {String(minute).padStart(2, "0")}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </label>
                <label className="flex w-fit items-center gap-2">
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
                <label className="flex w-fit items-center gap-2">
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
                  歯磨き 🦷
                </label>
                <label className="flex w-fit items-center gap-2">
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
                  シャワー 🛀
                </label>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="h-4 w-1 rounded-full bg-zinc-900/70" />
                  <h3 className="text-xs font-semibold text-zinc-700">昼</h3>
                </div>
                <div className="text-xs font-semibold text-zinc-500">昼食</div>
                <div className="grid grid-cols-3 gap-2 text-xs">
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
                <div className="flex items-center gap-2">
                  <span className="h-4 w-1 rounded-full bg-zinc-900/70" />
                  <h3 className="text-xs font-semibold text-zinc-700">夜</h3>
                </div>
                <div className="text-xs font-semibold text-zinc-500">夕食</div>
                <div className="grid grid-cols-3 gap-2 text-xs">
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
                <label className="flex w-fit items-center gap-2">
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
                  歯磨き 🦷
                </label>
                <label className="flex w-fit items-center gap-2">
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
                  シャワー 🛀
                </label>
                <label className="flex items-center justify-between gap-3">
                  就寝時刻
                  <div className="relative flex items-center gap-2">
                    <div className="flex h-10 items-center gap-1 rounded border border-zinc-200 px-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="hh"
                        value={sleepHourInput}
                        onChange={(event) =>
                          updateManualTime("sleep", "hour", event.target.value)
                        }
                        onBlur={() => commitManualTime("sleep")}
                        className="w-7 bg-transparent text-center text-sm focus:outline-none"
                      />
                      <span className="text-xs text-zinc-400">:</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="mm"
                        value={sleepMinuteInput}
                        onChange={(event) =>
                          updateManualTime("sleep", "minute", event.target.value)
                        }
                        onBlur={() => commitManualTime("sleep")}
                        className="w-7 bg-transparent text-center text-sm focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => openTimePicker("sleep")}
                      className="inline-flex h-10 w-10 items-center justify-center rounded border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
                      aria-label="就寝時刻のピッカーを開く"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        aria-hidden="true"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                    </button>
                    {timePickerOpen === "sleep" && timePickerValue ? (
                      <div
                        ref={timePickerRef}
                        className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg"
                      >
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <div className="mb-1 text-[11px] font-semibold text-zinc-500">
                              時
                            </div>
                            <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                              {timeOptions.hours.map((hour) => (
                                <button
                                  key={hour}
                                  type="button"
                                  onClick={() => {
                                    const minute = timePickerValue.minute;
                                    setTimePickerValue({ hour, minute });
                                    commitTimePicker("sleep", hour, minute);
                                  }}
                                  className={`w-full rounded px-2 py-1 text-left text-sm ${
                                    timePickerValue.hour === hour
                                      ? "bg-zinc-900 text-white"
                                      : "hover:bg-zinc-100"
                                  }`}
                                >
                                  {String(hour).padStart(2, "0")}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="mb-1 text-[11px] font-semibold text-zinc-500">
                              分
                            </div>
                            <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                              {timeOptions.minutes.map((minute) => (
                                <button
                                  key={minute}
                                  type="button"
                                  onClick={() => {
                                    const hour = timePickerValue.hour;
                                    setTimePickerValue({ hour, minute });
                                    commitTimePicker("sleep", hour, minute);
                                  }}
                                  className={`w-full rounded px-2 py-1 text-left text-sm ${
                                    timePickerValue.minute === minute
                                      ? "bg-zinc-900 text-white"
                                      : "hover:bg-zinc-100"
                                  }`}
                                >
                                  {String(minute).padStart(2, "0")}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </label>
              </div>

              {renderCustomInputs()}
            </div>
          </div>
          </section>
        ) : null}
      </main>
      {calendarMode === "shared" ? (
        <aside
          ref={sharedDrawerRef}
          className={`fixed inset-y-0 right-0 z-50 w-full max-w-sm transform border-l border-zinc-200 bg-white p-4 shadow-lg transition-transform ${
            sharedDrawerOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="h-full overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{displayDate}</h2>
              <button
                type="button"
                onClick={() => setSharedDrawerOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-200 text-zinc-500"
                aria-label="パネルを閉じる"
              >
                ✕
              </button>
            </div>
            {sharedSaveError ? (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                {sharedSaveError}
              </div>
            ) : null}
            <div className="space-y-6 text-sm">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="h-4 w-1 rounded-full bg-zinc-900/70" />
                  <h3 className="text-xs font-semibold text-zinc-700">食事</h3>
                </div>
                {renderSharedMealPicker("朝", sharedEditingEntry.breakfast, (next) =>
                  updateSharedMealStatus("breakfast", next)
                )}
                {renderSharedMealPicker("昼", sharedEditingEntry.lunch, (next) =>
                  updateSharedMealStatus("lunch", next)
                )}
                {renderSharedMealPicker("夜", sharedEditingEntry.dinner, (next) =>
                  updateSharedMealStatus("dinner", next)
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="h-4 w-1 rounded-full bg-zinc-900/70" />
                  <h3 className="text-xs font-semibold text-zinc-700">夜の時間帯</h3>
                </div>
                <div
                  className={`grid grid-cols-3 gap-2 ${
                    canEditDinnerSlots ? "" : "opacity-40"
                  }`}
                >
                  {sharedDinnerSlots.map((slot) => {
                    const active = sharedEditingEntry.dinnerSlots.includes(slot);
                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={!canEditDinnerSlots}
                        onClick={() => toggleSharedDinnerSlot(slot)}
                        className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                          active
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : "border-zinc-200 text-zinc-600 hover:border-zinc-400"
                        } ${!canEditDinnerSlots ? "cursor-not-allowed" : ""}`}
                      >
                        {slot}:00
                      </button>
                    );
                  })}
                </div>
                {!canEditDinnerSlots ? (
                  <div className="text-[11px] text-zinc-400">
                    夜が○または△のときに選択できます。
                  </div>
                ) : null}
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="h-4 w-1 rounded-full bg-zinc-900/70" />
                  <h3 className="text-xs font-semibold text-zinc-700">家事</h3>
                </div>
                <div className="space-y-2">
                  {sharedChoreItems.map((item) => (
                    <label key={item.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={sharedEditingEntry.chores[item.id]}
                        onChange={() => toggleSharedChore(item.id)}
                        className="h-4 w-4 rounded border-zinc-300"
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </aside>
      ) : null}
      {sharedCreateModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">
                  共有カレンダーを新規作成
                </h2>
                <p className="text-xs text-zinc-500">恋人との食事・家事を共有</p>
              </div>
              <button
                type="button"
                onClick={closeSharedCreateModal}
                className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-200 text-zinc-500"
                aria-label="モーダルを閉じる"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 space-y-2 text-sm text-zinc-700">
              <div className="text-xs font-semibold text-zinc-500">カレンダー名</div>
              <input
                type="text"
                value={sharedCalendarName}
                onChange={(event) => setSharedCalendarName(event.target.value)}
                className="w-full rounded border border-zinc-200 px-3 py-2 text-sm"
                placeholder="例: ふたりの家事カレンダー"
              />
              {sharedCreateError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                  {sharedCreateError}
                </div>
              ) : null}
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeSharedCreateModal}
                className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={createSharedCalendar}
                disabled={sharedCreateLoading}
                className="rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                作成する
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {sharedInviteModalOpen && (inviteModalCalendar || sharedInvitePreview) ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">
                  招待リンクを共有
                </h2>
                <p className="text-xs text-zinc-500">{inviteModalName}</p>
              </div>
              <button
                type="button"
                onClick={closeSharedInviteModal}
                className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-200 text-zinc-500"
                aria-label="モーダルを閉じる"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-zinc-700">
              <div>
                <div className="text-xs font-semibold text-zinc-500">招待リンク</div>
                <div className="mt-1 break-all rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                  {inviteModalLink}
                </div>
                <button
                  type="button"
                  onClick={() => copyInviteText(inviteModalLink, "link")}
                  disabled={!inviteModalLink}
                  className="mt-2 rounded-full border border-zinc-200 px-3 py-1 text-[11px] font-semibold text-zinc-600 hover:bg-white disabled:opacity-50"
                >
                  {sharedInviteCopied === "link" ? "コピーしました" : "リンクをコピー"}
                </button>
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-500">招待コード</div>
                <div className="mt-1 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold tracking-widest text-zinc-800">
                  {inviteModalCode}
                </div>
                <button
                  type="button"
                  onClick={() => copyInviteText(inviteModalCode, "code")}
                  className="mt-2 rounded-full border border-zinc-200 px-3 py-1 text-[11px] font-semibold text-zinc-600 hover:bg-white"
                >
                  {sharedInviteCopied === "code" ? "コピーしました" : "コードをコピー"}
                </button>
              </div>
              {inviteModalLink ? (
                <a
                  href={`mailto:?subject=${encodeURIComponent(
                    "共有カレンダーの招待"
                  )}&body=${encodeURIComponent(
                    `招待コード: ${inviteModalCode}\n招待リンク: ${inviteModalLink}`
                  )}`}
                  className="inline-flex items-center justify-center rounded-full border border-zinc-200 px-3 py-1 text-[11px] font-semibold text-zinc-600 hover:bg-white"
                >
                  メール招待
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {customModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">
                  {customModalMode === "create"
                    ? "カスタム項目を追加"
                    : "カスタム項目を編集"}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeCustomModal}
                className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-200 text-zinc-500"
                aria-label="モーダルを閉じる"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 space-y-4 text-sm text-zinc-700">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-zinc-500">項目名</div>
                <input
                  type="text"
                  value={customForm.name}
                  onChange={(event) =>
                    setCustomForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  className="w-full rounded border border-zinc-200 px-3 py-2 text-sm"
                  placeholder="例: 読書 📚"
                />
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold text-zinc-500">入力形式</div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {[
                    { value: "check", label: "チェック" },
                    { value: "text", label: "テキスト" },
                    { value: "select", label: "選択" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setCustomForm((prev) => ({
                          ...prev,
                          inputType: option.value as CustomInputType,
                        }))
                      }
                      className={`rounded-lg border px-3 py-2 font-semibold ${
                        customForm.inputType === option.value
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-200 text-zinc-600 hover:border-zinc-400"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              {customForm.inputType === "select" ? (
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-zinc-500">選択項目</div>
                  <textarea
                    value={customForm.optionsText}
                    onChange={(event) =>
                      setCustomForm((prev) => ({
                        ...prev,
                        optionsText: event.target.value,
                      }))
                    }
                    className="min-h-[96px] w-full rounded border border-zinc-200 px-3 py-2 text-sm"
                    placeholder="1行に1つずつ入力"
                  />
                </div>
              ) : null}
              <div className="space-y-1">
                <div className="text-xs font-semibold text-zinc-500">カレンダー表示</div>
                <input
                  type="text"
                  value={customForm.displayLabel}
                  onChange={(event) =>
                    setCustomForm((prev) => ({
                      ...prev,
                      displayLabel: event.target.value,
                    }))
                  }
                  className="w-full rounded border border-zinc-200 px-3 py-2 text-sm"
                  placeholder="空欄なら項目名を使用"
                />
              </div>
              {customFormError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                  {customFormError}
                </div>
              ) : null}
            </div>
            <div className="mt-5 flex items-center justify-between gap-2">
              {customModalMode === "edit" && editingCustomItem ? (
                <button
                  type="button"
                  onClick={() => handleDeleteCustomItem(editingCustomItem)}
                  className="rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-500 hover:bg-red-50"
                >
                  削除する
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeCustomModal}
                  className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleSaveCustomItem}
                  className="rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
                >
                  保存する
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {isMobile ? (
        <>
          <div
            className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${
              leftDrawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            onClick={() => setLeftDrawerOpen(false)}
          />
          <aside
            className={`fixed inset-y-0 left-0 z-50 w-72 transform border-r border-zinc-200 bg-white p-4 shadow-lg transition-transform ${
              leftDrawerOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">
                  Routine Calendar
                </h2>
                <p className="text-xs text-zinc-500">カテゴリ</p>
              </div>
              <button
                type="button"
                onClick={() => setLeftDrawerOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-200 text-zinc-500"
                aria-label="メニューを閉じる"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
                <h2 className="text-sm font-semibold text-zinc-700">カレンダー</h2>
                <div className="mt-3 space-y-2 text-sm text-zinc-700">
                  <button
                    type="button"
                  onClick={() => {
                    setCalendarMode("personal");
                    setLeftDrawerOpen(false);
                  }}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                      calendarMode === "personal"
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 text-zinc-700 hover:border-zinc-400"
                    }`}
                  >
                    自分専用
                  </button>
                  {sharedCalendars.map((calendar) => {
                    const members = calendar.memberIds.map(
                      (memberId) => calendar.memberInfo?.[memberId]
                    );
                    return (
                      <button
                        key={calendar.id}
                        type="button"
                        onClick={() => {
                          setCalendarMode("shared");
                          setSelectedSharedId(calendar.id);
                          setLeftDrawerOpen(false);
                        }}
                        className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                          calendarMode === "shared" && selectedSharedId === calendar.id
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : "border-zinc-200 text-zinc-700 hover:border-zinc-400"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{calendar.name}</span>
                          <div className="flex -space-x-1">
                            {members.map((member, index) =>
                              member?.photoURL ? (
                                <Image
                                  key={`${calendar.id}-member-${index}`}
                                  src={member.photoURL}
                                  alt={member.displayName}
                                  width={20}
                                  height={20}
                                  className="h-5 w-5 rounded-full border border-white object-cover"
                                />
                              ) : (
                                <span
                                  key={`${calendar.id}-member-${index}`}
                                  className="flex h-5 w-5 items-center justify-center rounded-full border border-white bg-zinc-200 text-[10px] text-zinc-500"
                                >
                                  ?
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {sharedCalendars.length === 0 ? (
                    <div className="text-xs text-zinc-400">
                      共有カレンダーはまだありません。
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 space-y-2">
                  <button
                    type="button"
                    onClick={() => setSharedCreateModalOpen(true)}
                    className="w-full rounded-full border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100"
                  >
                    共有カレンダーを新規作成
                  </button>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={sharedJoinCode}
                      onChange={(event) => setSharedJoinCode(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          joinSharedCalendarByCode(sharedJoinCode);
                        }
                      }}
                      className="h-9 w-full rounded border border-zinc-200 px-3 text-xs text-zinc-700"
                      placeholder="招待コードを入力"
                    />
                    <button
                      type="button"
                      onClick={() => joinSharedCalendarByCode(sharedJoinCode)}
                      disabled={sharedJoinLoading}
                      className="rounded-full bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
                    >
                      参加
                    </button>
                  </div>
                  {sharedJoinError ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                      {sharedJoinError}
                    </div>
                  ) : null}
                </div>
              {calendarMode === "shared" && activeSharedCalendar ? (
                  <div className="mt-3 space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
                    <div className="font-semibold text-zinc-700">招待リンク</div>
                    <div className="break-all">{sharedInviteLink || "リンク生成中..."}</div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => copyInviteText(sharedInviteLink, "link")}
                        disabled={!sharedInviteLink}
                        className="rounded-full border border-zinc-200 px-3 py-1 text-[11px] font-semibold text-zinc-600 hover:bg-white disabled:opacity-50"
                      >
                        {sharedInviteCopied === "link" ? "コピーしました" : "リンクをコピー"}
                      </button>
                      {sharedMailtoLink ? (
                        <a
                          href={sharedMailtoLink}
                          className="rounded-full border border-zinc-200 px-3 py-1 text-[11px] font-semibold text-zinc-600 hover:bg-white"
                        >
                          メール招待
                        </a>
                      ) : null}
                    </div>
                    <div className="font-semibold text-zinc-700">招待コード</div>
                    <div className="text-sm font-semibold tracking-widest text-zinc-800">
                      {sharedInviteCode}
                    </div>
                    <button
                      type="button"
                      onClick={() => copyInviteText(sharedInviteCode, "code")}
                      className="w-fit rounded-full border border-zinc-200 px-3 py-1 text-[11px] font-semibold text-zinc-600 hover:bg-white"
                    >
                      {sharedInviteCopied === "code" ? "コピーしました" : "コードをコピー"}
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
                <h2 className="text-sm font-semibold text-zinc-700">カテゴリ</h2>
                {calendarMode === "personal"
                  ? renderPersonalCategories()
                  : renderSharedCategories()}
              </div>
            </div>
          </aside>
          {calendarMode === "personal" ? (
            <>
              <div
                className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${
                  rightDrawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
                onClick={() => setRightDrawerOpen(false)}
              />
              <aside
                className={`fixed inset-y-0 right-0 z-50 w-full max-w-sm transform border-l border-zinc-200 bg-white p-4 shadow-lg transition-transform ${
                  rightDrawerOpen ? "translate-x-0" : "translate-x-full"
                }`}
              >
                <div className="h-full overflow-y-auto">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold">{displayDate}</h2>
                    <button
                      type="button"
                      onClick={() => setRightDrawerOpen(false)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-200 text-zinc-500"
                      aria-label="パネルを閉じる"
                    >
                      ✕
                    </button>
                  </div>
            {!hasDayDoc ? (
              <div className="mb-3 text-[11px] font-semibold text-zinc-500">未入力</div>
            ) : null}
            {saveError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                {saveError}
              </div>
            ) : null}
            <div className="space-y-6 text-sm pb-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="h-4 w-1 rounded-full bg-zinc-900/70" />
                  <h3 className="text-xs font-semibold text-zinc-700">朝</h3>
                </div>
                <label className="flex items-center justify-between gap-3">
                  起床時刻
                  <div className="relative flex items-center gap-2">
                    <div className="flex h-10 items-center gap-1 rounded border border-zinc-200 px-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="hh"
                        value={wakeHourInput}
                        onChange={(event) =>
                          updateManualTime("wake", "hour", event.target.value)
                        }
                        onBlur={() => commitManualTime("wake")}
                        className="w-7 bg-transparent text-center text-sm focus:outline-none"
                      />
                      <span className="text-xs text-zinc-400">:</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="mm"
                        value={wakeMinuteInput}
                        onChange={(event) =>
                          updateManualTime("wake", "minute", event.target.value)
                        }
                        onBlur={() => commitManualTime("wake")}
                        className="w-7 bg-transparent text-center text-sm focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => openTimePicker("wake")}
                      className="inline-flex h-10 w-10 items-center justify-center rounded border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
                      aria-label="起床時刻のピッカーを開く"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        aria-hidden="true"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                    </button>
                    {timePickerOpen === "wake" && timePickerValue ? (
                      <div
                        ref={timePickerRef}
                        className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg"
                      >
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <div className="mb-1 text-[11px] font-semibold text-zinc-500">
                              時
                            </div>
                            <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                              {timeOptions.hours.map((hour) => (
                                <button
                                  key={hour}
                                  type="button"
                                  onClick={() => {
                                    const minute = timePickerValue.minute;
                                    setTimePickerValue({ hour, minute });
                                    commitTimePicker("wake", hour, minute);
                                  }}
                                  className={`w-full rounded px-2 py-1 text-left text-sm ${
                                    timePickerValue.hour === hour
                                      ? "bg-zinc-900 text-white"
                                      : "hover:bg-zinc-100"
                                  }`}
                                >
                                  {String(hour).padStart(2, "0")}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="mb-1 text-[11px] font-semibold text-zinc-500">
                              分
                            </div>
                            <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                              {timeOptions.minutes.map((minute) => (
                                <button
                                  key={minute}
                                  type="button"
                                  onClick={() => {
                                    const hour = timePickerValue.hour;
                                    setTimePickerValue({ hour, minute });
                                    commitTimePicker("wake", hour, minute);
                                  }}
                                  className={`w-full rounded px-2 py-1 text-left text-sm ${
                                    timePickerValue.minute === minute
                                      ? "bg-zinc-900 text-white"
                                      : "hover:bg-zinc-100"
                                  }`}
                                >
                                  {String(minute).padStart(2, "0")}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </label>
                <label className="flex w-fit items-center gap-2">
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
                <label className="flex w-fit items-center gap-2">
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
                  歯磨き 🦷
                </label>
                <label className="flex w-fit items-center gap-2">
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
                  シャワー 🛀
                </label>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="h-4 w-1 rounded-full bg-zinc-900/70" />
                  <h3 className="text-xs font-semibold text-zinc-700">昼</h3>
                </div>
                <div className="text-xs font-semibold text-zinc-500">昼食</div>
                <div className="grid grid-cols-3 gap-2 text-xs">
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
                <div className="flex items-center gap-2">
                  <span className="h-4 w-1 rounded-full bg-zinc-900/70" />
                  <h3 className="text-xs font-semibold text-zinc-700">夜</h3>
                </div>
                <div className="text-xs font-semibold text-zinc-500">夕食</div>
                <div className="grid grid-cols-3 gap-2 text-xs">
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
                <label className="flex w-fit items-center gap-2">
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
                  歯磨き 🦷
                </label>
                <label className="flex w-fit items-center gap-2">
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
                  シャワー 🛀
                </label>
                <label className="flex items-center justify-between gap-3">
                  就寝時刻
                  <div className="relative flex items-center gap-2">
                    <div className="flex h-10 items-center gap-1 rounded border border-zinc-200 px-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="hh"
                        value={sleepHourInput}
                        onChange={(event) =>
                          updateManualTime("sleep", "hour", event.target.value)
                        }
                        onBlur={() => commitManualTime("sleep")}
                        className="w-7 bg-transparent text-center text-sm focus:outline-none"
                      />
                      <span className="text-xs text-zinc-400">:</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="mm"
                        value={sleepMinuteInput}
                        onChange={(event) =>
                          updateManualTime("sleep", "minute", event.target.value)
                        }
                        onBlur={() => commitManualTime("sleep")}
                        className="w-7 bg-transparent text-center text-sm focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => openTimePicker("sleep")}
                      className="inline-flex h-10 w-10 items-center justify-center rounded border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
                      aria-label="就寝時刻のピッカーを開く"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        aria-hidden="true"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                    </button>
                    {timePickerOpen === "sleep" && timePickerValue ? (
                      <div
                        ref={timePickerRef}
                        className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg"
                      >
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <div className="mb-1 text-[11px] font-semibold text-zinc-500">
                              時
                            </div>
                            <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                              {timeOptions.hours.map((hour) => (
                                <button
                                  key={hour}
                                  type="button"
                                  onClick={() => {
                                    const minute = timePickerValue.minute;
                                    setTimePickerValue({ hour, minute });
                                    commitTimePicker("sleep", hour, minute);
                                  }}
                                  className={`w-full rounded px-2 py-1 text-left text-sm ${
                                    timePickerValue.hour === hour
                                      ? "bg-zinc-900 text-white"
                                      : "hover:bg-zinc-100"
                                  }`}
                                >
                                  {String(hour).padStart(2, "0")}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="mb-1 text-[11px] font-semibold text-zinc-500">
                              分
                            </div>
                            <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                              {timeOptions.minutes.map((minute) => (
                                <button
                                  key={minute}
                                  type="button"
                                  onClick={() => {
                                    const hour = timePickerValue.hour;
                                    setTimePickerValue({ hour, minute });
                                    commitTimePicker("sleep", hour, minute);
                                  }}
                                  className={`w-full rounded px-2 py-1 text-left text-sm ${
                                    timePickerValue.minute === minute
                                      ? "bg-zinc-900 text-white"
                                      : "hover:bg-zinc-100"
                                  }`}
                                >
                                  {String(minute).padStart(2, "0")}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </label>
              </div>

              {renderCustomInputs()}
            </div>
            </div>
          </aside>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default function AppPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
          読み込み中...
        </div>
      }
    >
      <AppPageContent />
    </Suspense>
  );
}
