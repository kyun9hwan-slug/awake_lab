"use client";

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useMemo, useState } from "react";

function formatPhoneNumber(value: string) {
  const numbers = value.replace(/[^0-9]/g, "");
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
  return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
}
import { InlineEditor, ImageArrayEditor } from "@/components/inline-editor";
import { calculatePrice, formatCurrency } from "@/lib/pricing";
import {
  defaultConfig,
  discountLabels,
  type DiscountType,
  type ServiceKey,
  type SiteConfig,
} from "@/lib/site-config";
import {
  formatDisplayTimeRange,
  formatFullDate,
  getMonthLabel,
  shiftMonth,
  toDateKey,
  toMonthKey,
} from "@/lib/time";

interface AvailabilitySlot {
  startHour: number;
  available: boolean;
  maxDuration: number;
  displayRange: string;
}

interface MonthSummary {
  date: string;
  status: "available" | "full" | "closed";
  availableStarts: number;
}

interface HoldResponse {
  id: string;
  date: string;
  startHour: number;
  durationHours: number;
  expiresAt: string;
}

interface FormState {
  applicantName: string;
  phone: string;
  email: string;
  teamName: string;
  headCount: number;
  extraPeople: number;
  discountType: DiscountType;
  serviceKey: ServiceKey;
  noticesAgreed: boolean;
  customDiscountCode: string;
  proofFile: File | null;
  withEngineer: boolean;
}

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];

const defaultFormState: FormState = {
  applicantName: "",
  phone: "",
  email: "",
  teamName: "",
  headCount: 10,
  extraPeople: 0,
  discountType: "none",
  serviceKey: "practice",
  noticesAgreed: false,
  customDiscountCode: "",
  proofFile: null,
  withEngineer: false,
};

function buildCalendarCells(monthKey: string, summaries: MonthSummary[]) {
  const firstDay = new Date(`${monthKey}-01T00:00:00`);
  const startDay = firstDay.getDay();
  const daysInMonth = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0).getDate();
  const summaryMap = new Map(summaries.map((item) => [item.date, item]));

  const cells: Array<{ date: string | null; day: number | null; summary?: MonthSummary }> = [];
  for (let index = 0; index < startDay; index += 1) {
    cells.push({ date: null, day: null });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${monthKey}-${String(day).padStart(2, "0")}`;
    cells.push({ date, day, summary: summaryMap.get(date) });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ date: null, day: null });
  }

  return cells;
}

function getStatusCopy(summary?: MonthSummary) {
  if (!summary) {
    return "-";
  }
  if (summary.status === "available") {
    return `가능 ${summary.availableStarts}`;
  }
  if (summary.status === "closed") {
    return "휴무";
  }
  return "마감";
}

export function HomePage({ isAdmin = false }: { isAdmin?: boolean }) {
  const [config, setConfig] = useState<SiteConfig>(defaultConfig);
  const [visitorSession, setVisitorSession] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(() => toMonthKey(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [monthSummaries, setMonthSummaries] = useState<MonthSummary[]>([]);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [selectedStartHour, setSelectedStartHour] = useState<number | null>(null);
  const [selectedDurationHours, setSelectedDurationHours] = useState(2);
  const [hold, setHold] = useState<HoldResponse | null>(null);
  const [holdSecondsLeft, setHoldSecondsLeft] = useState(0);
  const [formState, setFormState] = useState<FormState>(defaultFormState);
  const [heroIndex, setHeroIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectionMessage, setSelectionMessage] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const [verifiedDiscountRate, setVerifiedDiscountRate] = useState(0);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function updateConfigField<K extends keyof SiteConfig>(key: K, value: SiteConfig[K]) {
    if (!isAdmin) return;
    const nextConfig = { ...config, [key]: value };
    const res = await fetch("/api/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextConfig),
    });
    if (res.ok) {
      setConfig(nextConfig);
    }
  }

  async function updateServiceDescription(index: number, description: string) {
    if (!isAdmin) return;
    const nextServices = config.services.map((svc, i) => i === index ? { ...svc, description } : svc);
    await updateConfigField("services", nextServices);
  }

  useEffect(() => {
    const existing = window.localStorage.getItem("awakelab-visitor-session");
    const session = existing ?? crypto.randomUUID();
    if (!existing) {
      window.localStorage.setItem("awakelab-visitor-session", session);
    }
    setVisitorSession(session);
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadConfig() {
      const response = await fetch("/api/config", { cache: "no-store" });
      const data = (await response.json()) as SiteConfig;
      if (!ignore) {
        setConfig(data);
        setSelectedDurationHours(data.minBookingHours);
      }
    }

    loadConfig().catch(() => {
      if (!ignore) {
        setSelectionMessage("설정 정보를 불러오지 못했습니다.");
      }
    });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeroIndex((current) => (current + 1) % config.heroImages.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [config.heroImages.length]);

  async function fetchMonthAvailability(monthKey = selectedMonth) {
    if (!visitorSession) {
      return;
    }

    const response = await fetch(
      `/api/availability?month=${monthKey}&sessionToken=${visitorSession}`,
      { cache: "no-store" },
    );
    const data = (await response.json()) as { days: MonthSummary[] };
    setMonthSummaries(data.days);
    setLoading(false);
  }

  async function fetchSlots(date = selectedDate) {
    if (!visitorSession || !date) {
      return;
    }

    const response = await fetch(
      `/api/availability?date=${date}&sessionToken=${visitorSession}`,
      { cache: "no-store" },
    );
    const data = (await response.json()) as { slots: AvailabilitySlot[] };
    setSlots(data.slots);
  }

  useEffect(() => {
    fetchMonthAvailability().catch(() => {
      setSelectionMessage("월별 예약 현황을 불러오지 못했습니다.");
      setLoading(false);
    });
  }, [selectedMonth, visitorSession]);

  useEffect(() => {
    fetchSlots().catch(() => {
      setSelectionMessage("시간대 정보를 불러오지 못했습니다.");
    });
  }, [selectedDate, visitorSession]);

  useEffect(() => {
    if (monthSummaries.length === 0) {
      return;
    }

    const current = monthSummaries.find((item) => item.date === selectedDate);
    if (current && selectedDate.startsWith(selectedMonth)) {
      return;
    }

    const nextDate =
      monthSummaries.find((item) => item.status === "available") ??
      monthSummaries.find((item) => item.status !== "closed") ??
      monthSummaries[0];

    if (nextDate) {
      setSelectedDate(nextDate.date);
    }
  }, [monthSummaries, selectedDate, selectedMonth]);

  useEffect(() => {
    if (!hold) {
      setHoldSecondsLeft(0);
      return;
    }

    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.floor((new Date(hold.expiresAt).getTime() - Date.now()) / 1000));
      setHoldSecondsLeft(remaining);

      if (remaining === 0) {
        setHold(null);
        setSelectedStartHour(null);
        setSelectionMessage("시간 선점이 만료되었습니다. 다시 선택해 주세요.");
        fetchMonthAvailability().catch(() => undefined);
        fetchSlots().catch(() => undefined);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [hold]);

  const selectedSlot = useMemo(
    () => slots.find((slot) => slot.startHour === selectedStartHour),
    [slots, selectedStartHour],
  );

  const price = useMemo(
    () =>
      calculatePrice({
        config,
        serviceKey: formState.serviceKey,
        durationHours: selectedDurationHours,
        headCount: formState.headCount,
        extraPeople: formState.extraPeople,
        discountType: formState.discountType,
        customDiscountRate: verifiedDiscountRate / 100,
        withEngineer: formState.withEngineer,
      }),
    [
      config,
      formState.discountType,
      verifiedDiscountRate,
      formState.extraPeople,
      formState.headCount,
      formState.serviceKey,
      formState.withEngineer,
      selectedDurationHours,
    ],
  );

  const calendarCells = useMemo(
    () => buildCalendarCells(selectedMonth, monthSummaries),
    [monthSummaries, selectedMonth],
  );

  async function reserveSlot(startHour: number, durationHours: number) {
    if (!visitorSession) {
      return;
    }

    setSelectionMessage("");
    const response = await fetch("/api/holds", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionToken: visitorSession,
        date: selectedDate,
        startHour,
        durationHours,
        replaceHoldId: hold?.id,
      }),
    });

    const data = (await response.json()) as HoldResponse | { message: string };
    if (!response.ok) {
      setSelectionMessage("message" in data ? data.message : "시간을 선점할 수 없습니다.");
      await fetchMonthAvailability();
      await fetchSlots();
      return;
    }

    setHold(data as HoldResponse);
    setSelectedStartHour(startHour);
    setSelectedDurationHours(durationHours);
    setSubmitMessage("");
    await fetchMonthAvailability();
    await fetchSlots();
  }

  async function releaseCurrentHold() {
    if (!hold || !visitorSession) {
      return;
    }

    await fetch(`/api/holds?id=${hold.id}&sessionToken=${visitorSession}`, {
      method: "DELETE",
    });
    setHold(null);
    setSelectedStartHour(null);
  }

  async function verifyDiscountCode() {
    if (!formState.customDiscountCode.trim()) return;
    setIsVerifyingCode(true);
    setSelectionMessage("");
    const response = await fetch(`/api/discount-codes?code=${encodeURIComponent(formState.customDiscountCode)}`);
    const data = await response.json();
    setIsVerifyingCode(false);
    
    if (data.valid) {
      setVerifiedDiscountRate(data.code.discountRate);
      setSelectionMessage(`할인 코드 적용됨: ${data.code.description} (${data.code.discountRate}%)`);
    } else {
      setVerifiedDiscountRate(0);
      setSelectionMessage("유효하지 않거나 만료된 코드입니다.");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitMessage("");

    if (!hold || selectedStartHour === null) {
      setSubmitMessage("먼저 예약 시간을 선택해 주세요.");
      return;
    }

    if (!formState.noticesAgreed) {
      setSubmitMessage("필수 안내 문구에 동의해야 예약할 수 있습니다.");
      return;
    }

    if (!/^010-\d{4}-\d{4}$/.test(formState.phone)) {
      setSubmitMessage("휴대전화 번호를 010-0000-0000 형식으로 정확히 입력해 주세요.");
      return;
    }

    if (formState.discountType === "saeeden") {
      const targetDate = new Date(`${selectedDate}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffTime = targetDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays > 7) {
        setSubmitMessage("새에덴교회 부서 신청은 7일 이내 신청만 가능합니다.");
        return;
      }
    }

    const formData = new FormData();
    formData.set("applicantName", formState.applicantName);
    formData.set("phone", formState.phone);
    formData.set("email", formState.email);
    formData.set("teamName", formState.teamName);
    formData.set("headCount", String(formState.headCount));
    formData.set("extraPeople", String(formState.extraPeople));
    formData.set("discountType", formState.discountType);
    formData.set("serviceKey", formState.serviceKey);
    formData.set("withEngineer", formState.withEngineer ? "true" : "false");
    if (formState.discountType === "custom") {
      formData.set("customDiscountCode", formState.customDiscountCode);
    }
    formData.set("date", selectedDate);
    formData.set("startHour", String(selectedStartHour));
    formData.set("durationHours", String(selectedDurationHours));
    formData.set("sessionToken", visitorSession);
    formData.set("holdId", hold.id);
    formData.set("noticesAgreed", "true");
    if (formState.proofFile) {
      formData.set("proofFile", formState.proofFile);
    }

    setIsSubmitting(true);
    const response = await fetch("/api/bookings", {
      method: "POST",
      body: formData,
    });
    const data = (await response.json()) as { message?: string };
    setIsSubmitting(false);

    if (!response.ok) {
      setSubmitMessage(data.message ?? "예약 접수에 실패했습니다.");
      await fetchMonthAvailability();
      await fetchSlots();
      return;
    }

    setSubmitMessage("예약 신청이 접수되었습니다. 관리자 승인 후 확정됩니다.");
    setFormState(defaultFormState);
    setHold(null);
    setSelectedStartHour(null);
    await fetchMonthAvailability();
    await fetchSlots();
  }

  const serviceAllowsEngineer =
    formState.serviceKey === "recording" || formState.serviceKey === "recording_filming";

  const proofLabel =
    formState.discountType === "dankook"
      ? "학생증 첨부"
      : formState.discountType === "company"
        ? "재직증명서 첨부 (1개월 발부 이내)"
        : "증빙 파일";

  const discountSummaryLabel =
    formState.discountType === "none"
      ? "-0원"
      : formState.discountType === "saeeden"
        ? "-100%"
        : formState.discountType === "custom"
          ? `-${verifiedDiscountRate}%`
          : formState.discountType === "dankook"
            ? "시간당 5만원 적용"
            : `-${Math.round(config.discountRate * 100)}%`;

  return (
    <main className="bg-[#0b0b0f] text-white">
      <section className="relative min-h-screen overflow-hidden">
        <div className="absolute inset-0">
          {isAdmin ? (
            <ImageArrayEditor images={config.heroImages} onSave={(val) => updateConfigField("heroImages", val)}>
              {config.heroImages.map((image, index) => (
                <div
                  key={image}
                  className="absolute inset-0 bg-cover bg-center transition-opacity duration-700"
                  style={{
                    backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.42), rgba(0, 0, 0, 0.72)), url(${image})`,
                    opacity: index === heroIndex ? 1 : 0,
                  }}
                />
              ))}
            </ImageArrayEditor>
          ) : (
            config.heroImages.map((image, index) => (
              <div
                key={image}
                className="absolute inset-0 bg-cover bg-center transition-opacity duration-700"
                style={{
                  backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.42), rgba(0, 0, 0, 0.72)), url(${image})`,
                  opacity: index === heroIndex ? 1 : 0,
                }}
              />
            ))
          )}
        </div>

        <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col justify-between px-4 py-6 sm:px-6 md:px-10">
          <header className="flex items-center justify-between border-b border-white/10 pb-6">
            <div>
              <p className="text-xs tracking-[0.4em] text-white/60">SPACE RESERVATION</p>
              <h1 className="mt-3 text-2xl font-semibold tracking-[0.3em]">{config.siteName}</h1>
            </div>
            <a
              href="/admin/login"
              className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/65 transition hover:border-white/60 hover:text-white"
            >
              관리자
            </a>
          </header>

          <div className="grid items-end gap-8 py-12 md:gap-10 md:py-16 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-8">
              <div className="space-y-4">
                <p className="text-sm tracking-[0.35em] text-[#d4b07b]">Place of WORSHIP WAKERS</p>
                <h2 className="max-w-4xl text-5xl font-semibold leading-tight md:text-7xl">
                  {config.heroTitle}
                </h2>
                <p className="max-w-2xl text-lg leading-8 text-white/72 md:text-xl">
                  {config.heroSubtitle}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                {config.heroImages.map((image, index) => (
                  <button
                    key={image}
                    type="button"
                    onClick={() => setHeroIndex(index)}
                    className={`h-1.5 w-16 rounded-full transition ${
                      index === heroIndex ? "bg-[#d4b07b]" : "bg-white/20"
                    }`}
                    aria-label={`갤러리 ${index + 1}번`}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-black/35 p-6 backdrop-blur md:p-8">
              <details className="group rounded-2xl border border-white/10 bg-white/5">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4 text-sm font-medium text-white/85">
                  <span>장비 리스트</span>
                  <span className="text-xs text-white/45 transition group-open:rotate-180">▼</span>
                </summary>
                <div className="border-t border-white/10 px-4 py-4">
                  {isAdmin ? (
                    <InlineEditor value={config.equipmentItems.join("\n")} multiline onSave={async (val) => updateConfigField("equipmentItems", val.split("\n").map(i=>i.trim()).filter(Boolean))}>
                      <ul className="space-y-2 text-sm leading-6 text-white/72">
                        {config.equipmentItems.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </InlineEditor>
                  ) : (
                    <ul className="space-y-2 text-sm leading-6 text-white/72">
                      {config.equipmentItems.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
              <div className="mt-8 grid gap-4 grid-cols-1 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm text-white/60">운영 시간</p>
                  <p className="mt-2 text-lg font-medium">09:00 - 20:00</p>
                  <p className="mt-2 text-xs leading-5 text-white/50">
                    오후 8시 이후 이용 문의는 관리자에게 별도 문의해 주세요.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm text-white/60">기본 예약</p>
                  <p className="mt-2 text-lg font-medium">기본 2시간 + @</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => document.getElementById("booking-section")?.scrollIntoView({ behavior: "smooth" })}
                className="mt-8 w-full rounded-full bg-[#d4b07b] px-8 py-5 text-lg font-semibold text-black transition hover:bg-[#e4c391]"
              >
                예약하기
              </button>
            </div>
          </div>
        </div>
      </section>

      <section id="booking-section" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 md:px-10 md:py-20">
        <div className="grid gap-8 md:gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-12">
          <div className="space-y-6">
            <div>
              <p className="text-sm tracking-[0.3em] text-[#d4b07b]">BOOKING STATUS</p>
              <h3 className="mt-3 text-3xl font-semibold">날짜와 시간을 먼저 선택해 주세요</h3>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/5 p-5 md:p-6">
              <div className="mb-5 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setSelectedMonth((current) => shiftMonth(current, -1))}
                  className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
                >
                  이전
                </button>
                <h4 className="text-xl font-medium">{getMonthLabel(selectedMonth)}</h4>
                <button
                  type="button"
                  onClick={() => setSelectedMonth((current) => shiftMonth(current, 1))}
                  className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
                >
                  다음
                </button>
              </div>

              <div className="mb-3 grid grid-cols-7 gap-2 text-center text-xs tracking-[0.25em] text-white/45">
                {weekdayLabels.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {calendarCells.map((cell, index) => {
                  if (!cell.date) {
                    return <div key={`empty-${index}`} className="aspect-square rounded-2xl bg-white/3" />;
                  }

                  const summary = cell.summary;
                  const isSelected = selectedDate === cell.date;
                  const isClosed = summary?.status === "closed";
                  const isFull = summary?.status === "full";

                  return (
                    <button
                      key={cell.date}
                      type="button"
                      onClick={async () => {
                        if (selectedDate !== cell.date) {
                          await releaseCurrentHold();
                        }
                        const nextDate = cell.date;
                        if (nextDate) {
                          setSelectedDate(nextDate);
                        }
                      }}
                      disabled={isClosed}
                      className={`aspect-square rounded-2xl border p-2 text-left transition ${
                        isSelected
                          ? "border-[#d4b07b] bg-[#d4b07b]/15"
                          : isClosed
                            ? "border-white/5 bg-white/5 text-white/25"
                            : isFull
                              ? "border-rose-400/25 bg-rose-400/10 text-white/70"
                              : "border-white/10 bg-white/4 hover:border-white/25 hover:bg-white/8"
                      }`}
                    >
                      <p className="text-sm font-medium">{cell.day}</p>
                      <p className="mt-2 text-[11px] text-white/55">{getStatusCopy(summary)}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/5 p-5 md:p-6">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-white/60">시간 선택</p>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] tracking-[0.18em] text-white/50">
                      24시간제
                    </span>
                  </div>
                  <p className="mt-1 text-xl font-semibold">{formatFullDate(selectedDate)}</p>
                </div>
                <div className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/70">
                  {config.afterHoursInquiryMessage}
                </div>
              </div>

              <div className="mt-6 grid gap-3">
                {loading ? (
                  <p className="text-sm text-white/60">예약 현황을 불러오는 중입니다.</p>
                ) : slots.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/65">
                    선택한 날짜에는 예약 가능한 기본 2시간 슬롯이 없습니다.
                  </p>
                ) : (
                  slots.map((slot) => (
                    <button
                      key={slot.startHour}
                      type="button"
                      disabled={!slot.available}
                      onClick={() => reserveSlot(slot.startHour, config.minBookingHours)}
                      className={`flex flex-col items-start gap-3 rounded-2xl border px-5 py-4 text-left transition sm:flex-row sm:items-center sm:justify-between ${
                        selectedStartHour === slot.startHour
                          ? "border-[#d4b07b] bg-[#d4b07b]/15"
                          : slot.available
                            ? "border-white/10 bg-white/4 hover:border-white/25 hover:bg-white/8"
                            : "border-white/5 bg-white/5 text-white/35"
                      }`}
                    >
                      <div>
                        <p className="font-medium">{slot.startHour.toString().padStart(2, "0")}:00 시작</p>
                        <p className="mt-1 text-sm text-white/55">
                          {slot.available
                            ? `선택 시 ${config.minBookingHours}시간이 자동 적용됩니다`
                            : "현재 선택할 수 없는 시간입니다"}
                        </p>
                      </div>
                      <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/60">
                        {slot.available ? slot.displayRange : "불가"}
                      </span>
                    </button>
                  ))
                )}
              </div>

              {selectedSlot ? (
                <div className="mt-6 rounded-2xl border border-[#d4b07b]/40 bg-[#d4b07b]/10 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-white/60">선택된 예약 시간</p>
                      <p className="mt-2 text-xl font-semibold">
                        {formatDisplayTimeRange(selectedSlot.startHour, selectedDurationHours)}
                      </p>
                    </div>
                    <div className="rounded-full border border-[#d4b07b]/30 px-4 py-2 text-sm text-[#f1ddbd]">
                      시작 시간 선택 시 기본 {config.minBookingHours}시간 자동 적용
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-[#f1ddbd]">
                    {holdSecondsLeft > 0
                      ? `현재 시간은 ${Math.floor(holdSecondsLeft / 60)}분 ${holdSecondsLeft % 60}초 동안 임시 선점되어 있습니다.`
                      : "시간 선점이 만료되면 다시 선택해 주세요."}
                  </p>
                </div>
              ) : null}

              {selectionMessage ? <p className="mt-4 text-sm text-amber-200">{selectionMessage}</p> : null}
            </div>
          </div>

          <div className="space-y-6">
            <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/5">
              <div className="border-b border-white/10 bg-white/[0.03] px-5 py-4">
                <p className="text-sm tracking-[0.24em] text-[#d4b07b]">PRICE MENU</p>
                <h4 className="mt-2 text-xl font-semibold text-white">이용 항목 안내 (인원 최대 10명 이내)</h4>
              </div>
              <div className="divide-y divide-white/10">
                {config.services.map((service, index) => (
                  <div key={service.key} className="grid gap-2 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center">
                    <div>
                      <p className="text-base font-medium text-white">{service.label}</p>
                      {isAdmin ? (
                        <InlineEditor value={service.description} multiline onSave={async (val) => updateServiceDescription(index, val)}>
                          <p className="mt-1 text-sm text-white/55">{service.description}</p>
                        </InlineEditor>
                      ) : (
                        <p className="mt-1 text-sm text-white/55">{service.description}</p>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-[#d4b07b]">시간당 {formatCurrency(service.hourlyRate)}</p>
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="rounded-[2rem] border border-white/10 bg-white/5 p-6 md:p-8">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm tracking-[0.3em] text-[#d4b07b]">APPLICATION</p>
                  <h3 className="mt-2 text-3xl font-semibold">예약 신청서</h3>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/70">
                  예약 확정 방식: 신청 접수 후 관리자 승인
                </div>
              </div>

              <div className="mt-8 grid gap-5 md:grid-cols-2">
                <label className="space-y-2 text-sm text-white/75">
                  <span>신청자</span>
                  <input
                    required
                    value={formState.applicantName}
                    onChange={(event) => setFormState((current) => ({ ...current, applicantName: event.target.value }))}
                    className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 outline-none transition focus:border-[#d4b07b]"
                  />
                </label>
                <label className="space-y-2 text-sm text-white/75">
                  <span>휴대전화</span>
                  <input
                    required
                    value={formState.phone}
                    onChange={(event) => setFormState((current) => ({ ...current, phone: formatPhoneNumber(event.target.value) }))}
                    maxLength={13}
                    placeholder="010-0000-0000"
                    className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 outline-none transition focus:border-[#d4b07b]"
                  />
                </label>
                <label className="space-y-2 text-sm text-white/75">
                  <span>이메일</span>
                  <input
                    required
                    type="email"
                    value={formState.email}
                    onChange={(event) => setFormState((current) => ({ ...current, email: event.target.value }))}
                    className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 outline-none transition focus:border-[#d4b07b]"
                  />
                </label>
                <label className="space-y-2 text-sm text-white/75">
                  <span>팀 이름</span>
                  <input
                    required
                    value={formState.teamName}
                    onChange={(event) => setFormState((current) => ({ ...current, teamName: event.target.value }))}
                    className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 outline-none transition focus:border-[#d4b07b]"
                  />
                </label>
                <label className="space-y-2 text-sm text-white/75">
                  <span>인원</span>
                  <div className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 text-white/85">
                    10명 이내
                  </div>
                </label>
                <label className="space-y-2 text-sm text-white/75">
                  <span>추가 인원</span>
                  <input
                    min={0}
                    type="number"
                    value={formState.extraPeople}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        extraPeople: Math.max(0, Number(event.target.value) || 0),
                      }))
                    }
                    className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 outline-none transition focus:border-[#d4b07b]"
                  />
                </label>
              </div>

              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <label className="space-y-2 text-sm text-white/75">
                  <span>이용 항목</span>
                  <select
                    value={formState.serviceKey}
                    onChange={(event) =>
                      setFormState((current) => {
                        const nextServiceKey = event.target.value as ServiceKey;
                        const nextAllowsEngineer =
                          nextServiceKey === "recording" || nextServiceKey === "recording_filming";
                        return {
                          ...current,
                          serviceKey: nextServiceKey,
                          withEngineer: nextAllowsEngineer ? current.withEngineer : false,
                        };
                      })
                    }
                    className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 outline-none transition focus:border-[#d4b07b]"
                  >
                    {config.services.map((service, index) => (
                      <option key={service.key} value={service.key}>
                        {service.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-white/75">
                  <span>할인 적용</span>
                  <select
                    value={formState.discountType}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        discountType: event.target.value as DiscountType,
                        proofFile: null,
                      }))
                    }
                    className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 outline-none transition focus:border-[#d4b07b]"
                  >
                    <option value="none">선택 안 함</option>
                    <option value="dankook">죽전 단국대학교 동아리</option>
                    <option value="company">인근 회사 사업체 할인</option>
                    <option value="saeeden">용인 새에덴교회 부서</option>
                    <option value="custom">할인 코드 입력</option>
                  </select>
                </label>
              </div>

              {serviceAllowsEngineer ? (
                <label className="mt-5 block rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/80">
                  <span className="block font-medium text-white">엔지니어 추가</span>
                  <span className="mt-2 block leading-6 text-white/65">
                    콘솔을 통한 멀티트랙 레코딩을 해드립니다. 시간당 {formatCurrency(config.engineerHourlyRate)} 추가
                  </span>
                  <label className="mt-4 flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={formState.withEngineer}
                      onChange={(event) =>
                        setFormState((current) => ({ ...current, withEngineer: event.target.checked }))
                      }
                      className="size-4 rounded border-white/25"
                    />
                    <span>엔지니어 추가 신청</span>
                  </label>
                </label>
              ) : null}

              {formState.discountType !== "none" ? (
                <div className="mt-5 rounded-2xl border border-[#d4b07b]/25 bg-[#d4b07b]/10 p-5">
                  <p className="text-sm text-[#f1ddbd]">
                    {formState.discountType === "dankook"
                      ? `${discountLabels.dankook} 할인 적용 시 학생증 첨부가 필요합니다.`
                      : formState.discountType === "company"
                        ? `${discountLabels.company} 할인 적용 시 재직증명서 첨부가 필요합니다. (1개월 발부 이내)`
                        : `${discountLabels.saeeden} 선택 시 비용은 0원 처리되며 관리자에게 별도 문의해 주세요.`}
                  </p>
                  {formState.discountType === "saeeden" ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm leading-6 text-white/75">
                      용인 새에덴 교회 부서는 비용 0원으로 할인 적용되며 신청일로 부터 7일 이내의 시간만 예약 가능합니다.
                    </div>
                  ) : formState.discountType === "custom" ? (
                    <div className="mt-4 flex gap-3">
                      <input
                        value={formState.customDiscountCode}
                        onChange={(e) => {
                          setFormState(cur => ({ ...cur, customDiscountCode: e.target.value.toUpperCase() }));
                          setVerifiedDiscountRate(0);
                        }}
                        placeholder="할인 코드를 입력하세요"
                        className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 text-sm outline-none transition focus:border-[#d4b07b]"
                      />
                      <button
                        type="button"
                        disabled={isVerifyingCode || !formState.customDiscountCode}
                        onClick={verifyDiscountCode}
                        className="rounded-2xl bg-[#d4b07b] px-6 text-sm font-semibold text-black transition hover:bg-[#e4c391] disabled:opacity-50"
                      >
                        적용
                      </button>
                    </div>
                  ) : (
                    <label className="mt-4 block space-y-2 text-sm text-white/80">
                      <span>{proofLabel}</span>
                      <input
                        required
                        type="file"
                        onChange={(event) =>
                          setFormState((current) => ({
                            ...current,
                            proofFile: event.target.files?.[0] ?? null,
                          }))
                        }
                        className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 text-sm outline-none file:mr-4 file:rounded-full file:border-0 file:bg-[#d4b07b] file:px-4 file:py-2 file:text-black"
                      />
                    </label>
                  )}
                </div>
              ) : null}

              <div className="mt-8 rounded-[1.75rem] border border-white/10 bg-black/25 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-white/55">예약 요약</p>
                    <p className="mt-2 text-xl font-semibold">
                      {selectedStartHour === null
                        ? "시간을 선택해 주세요"
                        : `${formatFullDate(selectedDate)} / ${formatDisplayTimeRange(selectedStartHour, selectedDurationHours)}`}
                    </p>
                  </div>
                  <div className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/70">
                    시작 시간 선택 시 기본 2시간 자동 적용
                  </div>
                </div>

                <div className="mt-6 grid gap-3 text-sm text-white/70">
                  <div className="flex items-center justify-between">
                    <span>기본 이용 금액</span>
                    <strong className="text-white">{formatCurrency(price.baseAmount)}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>추가 인원 금액</span>
                    <strong className="text-white">{formatCurrency(price.extraPeopleAmount)}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>엔지니어 추가</span>
                    <strong className="text-white">{formatCurrency(price.engineerAmount)}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>할인 적용</span>
                    <strong className="text-white">{discountSummaryLabel}</strong>
                  </div>
                  <div className="flex items-center justify-between border-t border-white/10 pt-3 text-base">
                    <span>예상 총 금액</span>
                    {formState.discountType === "saeeden" ? (
                      <div className="flex items-center gap-3">
                        <strong className="text-base text-rose-300 line-through decoration-2">{formatCurrency(price.baseAmount + price.extraPeopleAmount)}</strong>
                        <strong className="text-xl text-[#f1ddbd]">0원</strong>
                      </div>
                    ) : (
                      <strong className="text-xl text-[#f1ddbd]">{formatCurrency(price.totalAmount)}</strong>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-8 rounded-[1.75rem] border border-white/10 bg-black/25 p-5">
                <p className="text-lg font-semibold">필수 안내 문구</p>
                <p className="mt-2 text-sm leading-7 text-white/65">
                  아래 안내를 모두 확인하고 동의해야 예약 신청이 가능합니다.
                </p>

                <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                  {isAdmin ? (
                    <InlineEditor value={config.requiredNotices.join("\n")} multiline onSave={async (val) => updateConfigField("requiredNotices", val.split("\n").map(i=>i.trim()).filter(Boolean))}>
                      <ul className="divide-y divide-white/10 text-sm leading-snug text-white/75">
                        {config.requiredNotices.map((notice) => (
                          <li key={notice} className="px-4 py-2.5">
                            {notice}
                          </li>
                        ))}
                      </ul>
                    </InlineEditor>
                  ) : (
                    <ul className="divide-y divide-white/10 text-sm leading-snug text-white/75">
                      {config.requiredNotices.map((notice) => (
                        <li key={notice} className="px-4 py-2.5">
                          {notice}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                
                <p className="mt-8 text-lg font-semibold">취소 및 환불 규정</p>
                <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                  <ul className="divide-y divide-white/10 text-sm leading-snug text-white/75">
                    <li className="flex justify-between px-4 py-2.5"><span>사용 10일전 or 예약 당일</span><span>100% 환불</span></li>
                    <li className="flex justify-between px-4 py-2.5"><span>사용 7일전</span><span>10% 공제 후 환불</span></li>
                    <li className="flex justify-between px-4 py-2.5"><span>사용 3일 전</span><span>30% 공제 후 환불</span></li>
                    <li className="flex justify-between px-4 py-2.5 text-[#f1ddbd]"><span>사용 1일 전</span><span>80% 공제 후 환불</span></li>
                    <li className="flex justify-between px-4 py-2.5 text-rose-300 font-medium"><span>사용 당일</span><span>환불 불가</span></li>
                  </ul>
                </div>

                <label className="mt-6 flex items-start gap-3 rounded-2xl border border-[#d4b07b]/25 bg-[#d4b07b]/10 px-4 py-4 text-sm text-white/90">
                  <input
                    checked={formState.noticesAgreed}
                    onChange={(event) =>
                      setFormState((current) => ({ ...current, noticesAgreed: event.target.checked }))
                    }
                    type="checkbox"
                    className="mt-1 size-4 rounded border-white/25"
                  />
                  <span>
                    필수 안내 및 취소/환불 규정을 모두 확인했으며 이에 동의합니다. (예약 확정 문자나 전화를 받아야 최종 확정됩니다)
                  </span>
                </label>
              </div>

              {submitMessage ? <p className="mt-5 text-sm text-[#f1ddbd]">{submitMessage}</p> : null}

              <button
                type="submit"
                disabled={isSubmitting || !formState.noticesAgreed || !hold}
                className="mt-8 w-full rounded-full bg-[#d4b07b] px-8 py-5 text-lg font-semibold text-black transition hover:bg-[#e4c391] disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/45"
              >
                {isSubmitting ? "예약 신청 중..." : "예약 신청하기"}
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
