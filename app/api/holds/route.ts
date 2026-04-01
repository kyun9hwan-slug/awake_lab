import { NextResponse } from "next/server";
import { createHold, releaseHold } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { sessionToken, date, startHour, durationHours, replaceHoldId } = await request.json();
    if (!sessionToken || !date) {
      return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });
    }

    const hold = createHold({
      sessionToken,
      date,
      startHour: Number(startHour),
      durationHours: Number(durationHours),
      replaceHoldId,
    });

    return NextResponse.json(hold);
  } catch (error) {
    const message = error instanceof Error ? error.message : "시간 선점에 실패했습니다.";
    return NextResponse.json({ message }, { status: 409 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const sessionToken = searchParams.get("sessionToken") ?? undefined;

  if (!id) {
    return NextResponse.json({ message: "삭제할 hold id가 필요합니다." }, { status: 400 });
  }

  releaseHold(id, sessionToken);
  return NextResponse.json({ ok: true });
}
