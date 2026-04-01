import { NextResponse } from "next/server";
import { getAvailabilityForDate, getMonthAvailability } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const month = searchParams.get("month");
  const sessionToken = searchParams.get("sessionToken") ?? undefined;

  if (date) {
    return NextResponse.json({ date, slots: getAvailabilityForDate(date, sessionToken) });
  }

  if (month) {
    return NextResponse.json({ month, days: getMonthAvailability(month, sessionToken) });
  }

  return NextResponse.json({ message: "date 또는 month 파라미터가 필요합니다." }, { status: 400 });
}
