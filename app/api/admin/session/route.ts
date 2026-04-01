import { NextResponse } from "next/server";
import { adminCookieName, getAdminPassword, getAdminSessionValue } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { password } = (await request.json()) as { password?: string };
  if (password !== getAdminPassword()) {
    return NextResponse.json({ message: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: adminCookieName,
    value: getAdminSessionValue(),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: adminCookieName,
    value: "",
    path: "/",
    expires: new Date(0),
  });
  return response;
}
