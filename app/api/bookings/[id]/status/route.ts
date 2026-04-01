import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminSession } from "@/lib/auth";
import { updateBookingStatus } from "@/lib/db";

export const dynamic = "force-dynamic";

const schema = z.object({
  status: z.enum(["pending", "approved", "rejected", "cancelled"]),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ message: "관리자 인증이 필요합니다." }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "상태값이 올바르지 않습니다." }, { status: 400 });
  }

  const { id } = await context.params;
  const booking = updateBookingStatus(id, parsed.data.status);
  if (!booking) {
    return NextResponse.json({ message: "예약을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ booking });
}
