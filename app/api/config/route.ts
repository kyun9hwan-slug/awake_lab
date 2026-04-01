import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/auth";
import { getConfig, saveConfig } from "@/lib/db";
import type { SiteConfig } from "@/lib/site-config";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getConfig());
}

export async function PATCH(request: Request) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ message: "관리자 인증이 필요합니다." }, { status: 401 });
  }

  const config = (await request.json()) as SiteConfig;
  return NextResponse.json(saveConfig(config));
}
