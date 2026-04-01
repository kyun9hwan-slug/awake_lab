import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/auth";
import { createBooking, getBookings, getConfig, getDiscountCode, getSaeedenWeeklyHours } from "@/lib/db";
import { calculatePrice } from "@/lib/pricing";
import type { DiscountType, ServiceKey } from "@/lib/site-config";

export const dynamic = "force-dynamic";

const bookingSchema = z.object({
  applicantName: z.string().trim().min(1, "신청자를 입력해 주세요."),
  phone: z.string().regex(/^010-\d{4}-\d{4}$/, "휴대전화 번호를 010-0000-0000 형식으로 입력해 주세요."),
  email: z.string().trim().email("이메일 형식이 올바르지 않습니다."),
  teamName: z.string().trim().min(1, "팀 이름을 입력해 주세요."),
  headCount: z.coerce.number().int().min(1).max(10),
  extraPeople: z.coerce.number().int().min(0).max(50),
  discountType: z.enum(["none", "dankook", "company", "saeeden", "custom"]),
  withEngineer: z.enum(["true", "false"]).optional(),
  serviceKey: z.enum(["practice", "recording", "recording_filming"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startHour: z.coerce.number().int().min(0).max(23),
  durationHours: z.coerce.number().int().min(2).max(12),
  sessionToken: z.string().min(8),
  holdId: z.string().optional(),
  customDiscountCode: z.string().optional(),
  noticesAgreed: z.literal("true"),
});

async function saveAttachment(file: File): Promise<{ attachmentPath: string; attachmentName: string }> {
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const fileName = `${randomUUID()}-${safeName}`;
  const absolutePath = path.join(uploadDir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(absolutePath, buffer);

  return {
    attachmentPath: `/uploads/${fileName}`,
    attachmentName: file.name,
  };
}

export async function GET() {
  if (!(await isAdminSession())) {
    return NextResponse.json({ message: "관리자 인증이 필요합니다." }, { status: 401 });
  }

  return NextResponse.json({ bookings: getBookings() });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const parsed = bookingSchema.safeParse({
      applicantName: formData.get("applicantName"),
      phone: formData.get("phone"),
      email: formData.get("email"),
      teamName: formData.get("teamName"),
      headCount: formData.get("headCount"),
      extraPeople: formData.get("extraPeople") || 0,
      discountType: formData.get("discountType"),
      customDiscountCode: formData.get("customDiscountCode") || undefined,
      serviceKey: formData.get("serviceKey"),
      withEngineer: formData.get("withEngineer") ?? "false",
      date: formData.get("date"),
      startHour: formData.get("startHour"),
      durationHours: formData.get("durationHours"),
      sessionToken: formData.get("sessionToken"),
      holdId: formData.get("holdId") || undefined,
      noticesAgreed: formData.get("noticesAgreed"),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." },
        { status: 400 },
      );
    }

    const payload = parsed.data;
    const proofFile = formData.get("proofFile");
    if (payload.discountType !== "none" && payload.discountType !== "saeeden") {
      if (!(proofFile instanceof File) || proofFile.size === 0) {
        return NextResponse.json({ message: "할인 증빙 파일을 첨부해 주세요." }, { status: 400 });
      }
    }

    if (payload.discountType === "saeeden") {
      const targetDate = new Date(`${payload.date}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffTime = targetDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays > 7) {
        return NextResponse.json({ message: "새에덴교회 부서 신청은 7일 이내 신청만 가능합니다." }, { status: 400 });
      }

      const weeklyHours = getSaeedenWeeklyHours(payload.phone, payload.date);
      if (weeklyHours + payload.durationHours > 4) {
        return NextResponse.json({ message: `새에덴교회 부서는 주 4시간까지만 예약 가능합니다. (선택 주간에 이미 ${weeklyHours}시간 예약됨)` }, { status: 400 });
      }
    }

    const config = getConfig();
    let customDiscountRate = 0;
    let finalDiscountType = payload.discountType;

    if (payload.discountType === "custom" && payload.customDiscountCode) {
      const customCode = getDiscountCode(payload.customDiscountCode.toUpperCase());
      if (!customCode) {
        return NextResponse.json({ message: "유효하지 않은 할인코드입니다." }, { status: 400 });
      }
      customDiscountRate = customCode.discountRate / 100;
      finalDiscountType = "custom"; // Save code as discountType in db
    }

    const price = calculatePrice({
      config,
      serviceKey: payload.serviceKey as ServiceKey,
      durationHours: payload.durationHours,
      headCount: payload.headCount,
      extraPeople: payload.extraPeople,
      discountType: finalDiscountType as DiscountType,
      withEngineer: payload.withEngineer === "true",
      customDiscountRate,
    });

    let attachmentPath: string | null = null;
    let attachmentName: string | null = null;
    if (proofFile instanceof File && proofFile.size > 0) {
      const attachment = await saveAttachment(proofFile);
      attachmentPath = attachment.attachmentPath;
      attachmentName = attachment.attachmentName;
    }

    const booking = createBooking(
      {
        applicantName: payload.applicantName,
        phone: payload.phone,
        email: payload.email,
        teamName: payload.teamName,
        headCount: payload.headCount,
        extraPeople: payload.extraPeople,
        discountType: payload.discountType as DiscountType,
        serviceKey: payload.serviceKey as ServiceKey,
        withEngineer: payload.withEngineer === "true",
        date: payload.date,
        startHour: payload.startHour,
        durationHours: payload.durationHours,
        totalPrice: price.totalAmount,
        attachmentPath,
        attachmentName,
      },
      payload.holdId,
      payload.sessionToken,
    );

    return NextResponse.json({ booking });
  } catch (error) {
    const message = error instanceof Error ? error.message : "예약 접수에 실패했습니다.";
    return NextResponse.json({ message }, { status: 409 });
  }
}
