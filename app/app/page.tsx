"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  Timestamp,
  collection,
  deleteField,
  doc,
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

type MealOption = "home" | "lab" | "out" | "other";
type LegacyMealOption = MealOption | "none";

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

const mealOptions: { value: MealOption; label: string }[] = [
  { value: "home", label: "自炊(家)" },
  { value: "lab", label: "自炊(研)" },
  { value: "out", label: "外食" },
  { value: "other", label: "その他" },
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
  if (!value || value === "none") {
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

const buildDefaultItemColors = (items: CustomItem[]): Record<string, ColorId> => ({
  ...defaultItemColors,
  ...Object.fromEntries(items.map((item) => [`custom-${item.id}`, "cyan" as ColorId])),
});

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
  const [filters, setFilters] = useState<Record<FilterItemId, boolean>>(initialFilters);
  const [isMobile, setIsMobile] = useState(false);
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const [customItems, setCustomItems] = useState<CustomItem[]>([]);
  const [itemColors, setItemColors] = useState<Record<string, ColorId>>(
    defaultItemColors
  );
  const [colorPickerOpen, setColorPickerOpen] = useState<string | null>(null);
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
    if (!user) {
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
  }, [selectedDate, user]);


  useEffect(() => {
    if (!user) {
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
  }, [currentMonthDate, user]);

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
    other: "その他",
  };
  const mealShortLabel: Record<MealOption, string> = {
    home: "家",
    lab: "研",
    out: "外",
    other: "他",
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
  const customValues = dayDoc.custom ?? {};
  const editingCustomItem = editingCustomId
    ? customItems.find((item) => item.id === editingCustomId) ?? null
    : null;

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
        const label = item.displayLabel?.trim() || item.name;
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
          return (
            <div key={item.id} className="space-y-1">
              <div className="text-xs font-semibold text-zinc-500">{label}</div>
              <select
                value={typeof value === "string" ? value : ""}
                onChange={(event) => updateCustomValue(item.id, event.target.value)}
                className="w-full rounded border border-zinc-200 px-3 py-2 text-sm text-zinc-700"
              >
                <option value="">未選択</option>
                {(item.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
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
          <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
            <h2 className="text-sm font-semibold text-zinc-700">カテゴリ</h2>
            <div className="mt-4 space-y-3 text-sm text-zinc-700">
              {filterGroups.map((group) => {
                const checkedCount = group.items.filter(
                  (item) => filters[item.id]
                ).length;
                const allChecked =
                  group.items.length > 0 && checkedCount === group.items.length;
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
                          className="rounded-full border border-zinc-200 px-2 py-0.5 text-[11px] font-semibold text-zinc-500 hover:bg-zinc-100"
                        >
                          追加
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
                                checked={filters[item.id]}
                                onChange={(event) =>
                                  updateFilter(item.id, event.target.checked)
                                }
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
                                    className="rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-100"
                                  >
                                    編集
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCustomItem(customItem)}
                                    className="rounded border border-red-200 px-1.5 py-0.5 text-[10px] text-red-500 hover:bg-red-50"
                                  >
                                    削除
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
            <div
              className="mt-3 grid grid-cols-7 border border-zinc-200 text-xs [--calendar-row-height:122px] sm:[--calendar-row-height:128px] lg:[--calendar-row-height:144px]"
              style={{
                gridTemplateRows: `repeat(${calendarMeta.weeks}, var(--calendar-row-height))`,
              }}
            >
              {calendarMeta.cells.map((date) => {
                const dateId = formatDateId(date);
                const chips = buildChips(date);
                const visibleChips = chips.slice(0, maxLines);
                const extraCount = chips.length - visibleChips.length;
                const isSelected = dateId === selectedDateId;
                const isCurrentMonth =
                  date.getFullYear() === currentMonthDate.getFullYear() &&
                  date.getMonth() === currentMonthDate.getMonth();
                return (
                  <button
                    key={dateId}
                    type="button"
                    onClick={() => {
                      setSelectedDate(date);
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
                <div className="flex items-center gap-2">
                  <span className="h-4 w-1 rounded-full bg-zinc-900/70" />
                  <h3 className="text-xs font-semibold text-zinc-700">夜</h3>
                </div>
                <div className="text-xs font-semibold text-zinc-500">夕食</div>
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
      </main>
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
                <p className="text-xs text-zinc-500">
                  右パネルに表示する入力欄を作成します。
                </p>
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
              <div className="space-y-1">
                <div className="text-xs font-semibold text-zinc-500">表示形式</div>
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
            <div className="space-y-3 text-sm text-zinc-700">
              {filterGroups.map((group) => {
                const checkedCount = group.items.filter(
                  (item) => filters[item.id]
                ).length;
                const allChecked =
                  group.items.length > 0 && checkedCount === group.items.length;
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
                          className="rounded-full border border-zinc-200 px-2 py-0.5 text-[11px] font-semibold text-zinc-500 hover:bg-zinc-100"
                        >
                          追加
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
                                checked={filters[item.id]}
                                onChange={(event) =>
                                  updateFilter(item.id, event.target.checked)
                                }
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
                                    className="rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-100"
                                  >
                                    編集
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCustomItem(customItem)}
                                    className="rounded border border-red-200 px-1.5 py-0.5 text-[10px] text-red-500 hover:bg-red-50"
                                  >
                                    削除
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
          </aside>
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
                <div className="flex items-center gap-2">
                  <span className="h-4 w-1 rounded-full bg-zinc-900/70" />
                  <h3 className="text-xs font-semibold text-zinc-700">夜</h3>
                </div>
                <div className="text-xs font-semibold text-zinc-500">夕食</div>
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
    </div>
  );
}
