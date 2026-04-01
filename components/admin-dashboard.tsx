"use client";

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/pricing";
import type { BookingStatus, SiteConfig } from "@/lib/site-config";
import { defaultConfig } from "@/lib/site-config";
import { formatDisplayTimeRange, formatFullDate } from "@/lib/time";
import { type DiscountCodeRecord } from "@/lib/db";

interface BookingRecord {
  id: string;
  applicantName: string;
  phone: string;
  email: string;
  teamName: string;
  headCount: number;
  extraPeople: number;
  discountType: string;
  serviceKey: string;
  date: string;
  startHour: number;
  durationHours: number;
  totalPrice: number;
  withEngineer: boolean;
  attachmentPath: string | null;
  attachmentName: string | null;
  status: BookingStatus;
  createdAt: string;
}

export function AdminDashboard() {
  const router = useRouter();
  const [config, setConfig] = useState<SiteConfig>(defaultConfig);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [discountCodes, setDiscountCodes] = useState<DiscountCodeRecord[]>([]);
  const [newCode, setNewCode] = useState("");
  const [newCodeRate, setNewCodeRate] = useState(10);
  const [newCodeDesc, setNewCodeDesc] = useState("");

  async function loadData() {
    const [configResponse, bookingsResponse, codesResponse] = await Promise.all([
      fetch("/api/config", { cache: "no-store" }),
      fetch("/api/bookings", { cache: "no-store" }),
      fetch("/api/discount-codes", { cache: "no-store" }),
    ]);

    if (bookingsResponse.status === 401) {
      router.push("/admin/login");
      return;
    }

    const configData = (await configResponse.json()) as SiteConfig;
    const bookingData = (await bookingsResponse.json()) as { bookings: BookingRecord[] };
    setConfig(configData);
    setBookings(bookingData.bookings);
    if (codesResponse.ok) {
      const codesData = await codesResponse.json();
      setDiscountCodes(codesData.codes || []);
    }
  }

  useEffect(() => {
    loadData().catch(() => {
      setMessage("관리자 데이터를 불러오지 못했습니다.");
    });
  }, []);

  async function saveConfig() {
    setIsSaving(true);
    setMessage("");
    const response = await fetch("/api/config", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(config),
    });
    setIsSaving(false);

    if (!response.ok) {
      setMessage("설정 저장에 실패했습니다.");
      return;
    }

    setMessage("설정을 저장했습니다.");
    await loadData();
  }

  async function updateStatus(id: string, status: BookingStatus) {
    const response = await fetch(`/api/bookings/${id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      setMessage("예약 상태 변경에 실패했습니다.");
      return;
    }

    setMessage("예약 상태를 변경했습니다.");
    await loadData();
  }

  async function handleCreateCode() {
    if (!newCode || !newCodeDesc) {
      setMessage("코드와 설명을 모두 입력해주세요.");
      return;
    }
    const res = await fetch("/api/discount-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: newCode, discountRate: newCodeRate, description: newCodeDesc }),
    });
    if (res.ok) {
      setMessage("할인코드가 생성되었습니다.");
      setNewCode("");
      setNewCodeDesc("");
      loadData();
    } else {
      const err = await res.json();
      setMessage(err.message || "할인코드 생성 실패");
    }
  }

  async function handleDeleteCode(code: string) {
    if (!confirm(`정말 ${code} 코드를 삭제하시겠습니까?`)) return;
    const res = await fetch(`/api/discount-codes?code=${encodeURIComponent(code)}`, { method: "DELETE" });
    if (res.ok) {
      setMessage("삭제되었습니다.");
      loadData();
    }
  }

  async function logout() {
    await fetch("/api/admin/session", { method: "DELETE" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 text-white md:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm tracking-[0.3em] text-[#d4b07b]">ADMIN CONSOLE</p>
          <h1 className="mt-2 text-4xl font-semibold">Awake Lab 관리자 페이지</h1>
        </div>
        <button
          type="button"
          onClick={logout}
          className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/70 transition hover:border-white/40 hover:text-white"
        >
          로그아웃
        </button>
      </div>

      {message ? <p className="mt-4 text-sm text-[#f1ddbd]">{message}</p> : null}

      <div className="mt-10 grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold">운영 설정</h2>
            <button
              type="button"
              onClick={saveConfig}
              disabled={isSaving}
              className="rounded-full bg-[#d4b07b] px-5 py-3 text-sm font-semibold text-black transition hover:bg-[#e4c391] disabled:opacity-60"
            >
              {isSaving ? "저장 중..." : "설정 저장"}
            </button>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <label className="space-y-2 text-sm text-white/75">
              <span>메인 타이틀</span>
              <input
                value={config.heroTitle}
                onChange={(event) => setConfig((current) => ({ ...current, heroTitle: event.target.value }))}
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 outline-none"
              />
            </label>
            <label className="space-y-2 text-sm text-white/75">
              <span>운영 시작 시간</span>
              <input
                type="number"
                value={config.openHour}
                onChange={(event) => setConfig((current) => ({ ...current, openHour: Number(event.target.value) }))}
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 outline-none"
              />
            </label>
            <label className="space-y-2 text-sm text-white/75 md:col-span-2">
              <span>서브 타이틀</span>
              <textarea
                rows={4}
                value={config.heroSubtitle}
                onChange={(event) => setConfig((current) => ({ ...current, heroSubtitle: event.target.value }))}
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 outline-none"
              />
            </label>
            <label className="space-y-2 text-sm text-white/75">
              <span>운영 종료 시간</span>
              <input
                type="number"
                value={config.closeHour}
                onChange={(event) => setConfig((current) => ({ ...current, closeHour: Number(event.target.value) }))}
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 outline-none"
              />
            </label>
            <label className="space-y-2 text-sm text-white/75">
              <span>4번째 금요일 차단 시작 시간</span>
              <input
                type="number"
                value={config.fridayClosedFromHour}
                onChange={(event) =>
                  setConfig((current) => ({ ...current, fridayClosedFromHour: Number(event.target.value) }))
                }
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 outline-none"
              />
            </label>
            <label className="space-y-2 text-sm text-white/75">
              <span>기본 예약 시간</span>
              <input
                type="number"
                value={config.minBookingHours}
                onChange={(event) =>
                  setConfig((current) => ({ ...current, minBookingHours: Number(event.target.value) }))
                }
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 outline-none"
              />
            </label>
            <label className="space-y-2 text-sm text-white/75">
              <span>홀드 시간 (분)</span>
              <input
                type="number"
                value={config.holdMinutes}
                onChange={(event) => setConfig((current) => ({ ...current, holdMinutes: Number(event.target.value) }))}
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 outline-none"
              />
            </label>
            <label className="space-y-2 text-sm text-white/75">
              <span>엔지니어 시간당 추가비</span>
              <input
                type="number"
                value={config.engineerHourlyRate}
                onChange={(event) => setConfig((current) => ({ ...current, engineerHourlyRate: Number(event.target.value) }))}
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 outline-none"
              />
            </label>
            <label className="space-y-2 text-sm text-white/75 md:col-span-2">
              <span>오후 8시 이후 안내 문구</span>
              <input
                value={config.afterHoursInquiryMessage}
                onChange={(event) =>
                  setConfig((current) => ({ ...current, afterHoursInquiryMessage: event.target.value }))
                }
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 outline-none"
              />
            </label>
            <label className="space-y-2 text-sm text-white/75 md:col-span-2">
              <span>메인 이미지 URL 목록 (줄바꿈 구분)</span>
              <textarea
                rows={5}
                value={config.heroImages.join("\n")}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    heroImages: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean),
                  }))
                }
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 outline-none"
              />
            </label>
            <label className="space-y-2 text-sm text-white/75 md:col-span-2">
              <span>필수 안내 문구 (줄바꿈 구분)</span>
              <textarea
                rows={8}
                value={config.requiredNotices.join("\n")}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    requiredNotices: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean),
                  }))
                }
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 outline-none"
              />
            </label>
          </div>

          <div className="mt-8 space-y-4">
            <h3 className="text-lg font-semibold">서비스 가격</h3>
            {config.services.map((service, index) => (
              <div key={service.key} className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 md:grid-cols-[1fr_180px]">
                <input
                  value={service.label}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      services: current.services.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, label: event.target.value } : item,
                      ),
                    }))
                  }
                  className="rounded-2xl border border-white/10 bg-black/25 px-4 py-4 outline-none"
                />
                <input
                  type="number"
                  value={service.hourlyRate}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      services: current.services.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, hourlyRate: Number(event.target.value) } : item,
                      ),
                    }))
                  }
                  className="rounded-2xl border border-white/10 bg-black/25 px-4 py-4 outline-none"
                />
                <textarea
                  rows={3}
                  value={service.description}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      services: current.services.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, description: event.target.value } : item,
                      ),
                    }))
                  }
                  className="rounded-2xl border border-white/10 bg-black/25 px-4 py-4 outline-none md:col-span-2"
                />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
          <h2 className="text-2xl font-semibold">할인코드 관리</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-[1fr_100px_2fr_auto] md:items-end">
            <label className="space-y-2 text-sm text-white/75">
              <span>코드 (영문/숫자)</span>
              <input value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())} className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 outline-none" />
            </label>
            <label className="space-y-2 text-sm text-white/75">
              <span>할인율 (%)</span>
              <input type="number" min="0" max="100" value={newCodeRate} onChange={e => setNewCodeRate(Number(e.target.value))} className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 outline-none" />
            </label>
            <label className="space-y-2 text-sm text-white/75">
              <span>설명/메모</span>
              <input value={newCodeDesc} onChange={e => setNewCodeDesc(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 outline-none" />
            </label>
            <button onClick={handleCreateCode} className="rounded-2xl bg-[#d4b07b] px-6 py-3 font-semibold text-black hover:bg-[#e4c391]">
              생성
            </button>
          </div>
          
          <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
            <div className="grid grid-cols-[1fr_80px_2fr_auto] border-b border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/70">
              <div>코드</div>
              <div>할인율</div>
              <div>설명</div>
              <div className="w-16 text-center">관리</div>
            </div>
            <div className="divide-y divide-white/5">
              {discountCodes.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-white/50">생성된 할인코드가 없습니다.</div>
              ) : discountCodes.map(code => (
                <div key={code.code} className="grid items-center grid-cols-[1fr_80px_2fr_auto] px-4 py-3 text-sm">
                  <div className="font-semibold text-white">{code.code}</div>
                  <div className="text-[#f1ddbd]">{code.discountRate}%</div>
                  <div className="text-white/70">{code.description}</div>
                  <button onClick={() => handleDeleteCode(code.code)} className="rounded-full bg-rose-500/20 px-3 py-1 text-xs text-rose-300 hover:bg-rose-500/30">
                    삭제
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
          <h2 className="text-2xl font-semibold">예약 신청 현황</h2>
          <div className="mt-6 space-y-4">
            {bookings.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/65">
                아직 접수된 예약이 없습니다.
              </div>
            ) : (
              bookings.map((booking) => (
                <article key={booking.id} className="rounded-[1.75rem] border border-white/10 bg-black/20 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs tracking-[0.25em] text-[#d4b07b]">{booking.status.toUpperCase()}</p>
                      <h3 className="mt-2 text-xl font-semibold">{booking.teamName}</h3>
                      <p className="mt-2 text-sm text-white/65">
                        {booking.applicantName} / {booking.phone} / {booking.email}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-white/70">
                      {formatFullDate(booking.date)} / {formatDisplayTimeRange(booking.startHour, booking.durationHours)}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 text-sm text-white/70 md:grid-cols-2">
                    <p>인원: {booking.headCount + booking.extraPeople}명</p>
                    <p>금액: {formatCurrency(booking.totalPrice)}</p>
                    <p>할인: {booking.discountType === "none" ? "없음" : booking.discountType}</p>
                    <p>엔지니어: {booking.withEngineer ? "추가" : "없음"}</p>
                    <p>접수일: {new Date(booking.createdAt).toLocaleString("ko-KR")}</p>
                  </div>

                  {booking.attachmentPath ? (
                    <a
                      href={booking.attachmentPath}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex text-sm text-[#f1ddbd] underline"
                    >
                      증빙 파일 보기: {booking.attachmentName ?? "첨부파일"}
                    </a>
                  ) : null}

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => updateStatus(booking.id, "approved")}
                      className="rounded-full bg-emerald-400/85 px-4 py-2 text-sm font-medium text-black"
                    >
                      승인
                    </button>
                    <button
                      type="button"
                      onClick={() => updateStatus(booking.id, "rejected")}
                      className="rounded-full bg-rose-400/85 px-4 py-2 text-sm font-medium text-black"
                    >
                      거절
                    </button>
                    <button
                      type="button"
                      onClick={() => updateStatus(booking.id, "cancelled")}
                      className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/80"
                    >
                      취소 처리
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
