"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    const response = await fetch("/api/admin/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
    });

    const data = (await response.json()) as { message?: string };
    setIsSubmitting(false);

    if (!response.ok) {
      setMessage(data.message ?? "로그인에 실패했습니다.");
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/5 p-8">
      <p className="text-sm tracking-[0.3em] text-[#d4b07b]">ADMIN ACCESS</p>
      <h1 className="mt-3 text-3xl font-semibold text-white">Awake Lab 관리자 로그인</h1>
      <p className="mt-3 text-sm leading-7 text-white/65">
        기본 비밀번호는 환경변수 `ADMIN_PASSWORD`가 없으면 `0923` 입니다.
      </p>

      <label className="mt-8 block space-y-2 text-sm text-white/75">
        <span>비밀번호</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 outline-none transition focus:border-[#d4b07b]"
        />
      </label>

      {message ? <p className="mt-4 text-sm text-amber-200">{message}</p> : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-8 w-full rounded-full bg-[#d4b07b] px-6 py-4 font-semibold text-black transition hover:bg-[#e4c391] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "로그인 중..." : "로그인"}
      </button>
    </form>
  );
}
