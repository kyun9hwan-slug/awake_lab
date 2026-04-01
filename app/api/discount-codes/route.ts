import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/auth";
import { getDiscountCodes, createDiscountCode, deleteDiscountCode, getDiscountCode } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  code: z.string().trim().min(1, "코드를 입력해 주세요.").toUpperCase(),
  discountRate: z.coerce.number().min(0).max(100),
  description: z.string().trim().min(1, "설명을 입력해 주세요."),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const checkCode = searchParams.get("code");
  
  if (checkCode) {
    const code = getDiscountCode(checkCode.toUpperCase());
    if (code) {
      return NextResponse.json({ valid: true, code });
    }
    return NextResponse.json({ valid: false, message: "유효하지 않은 코드입니다." });
  }

  if (!(await isAdminSession())) {
    return NextResponse.json({ message: "관리자 인증이 필요합니다." }, { status: 401 });
  }

  return NextResponse.json({ codes: getDiscountCodes() });
}

export async function POST(request: Request) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ message: "관리자 인증이 필요합니다." }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." }, { status: 400 });
  }

  try {
    const code = createDiscountCode(parsed.data.code, parsed.data.discountRate, parsed.data.description);
    return NextResponse.json({ code });
  } catch {
    return NextResponse.json({ message: "이미 존재하는 코드이거나 생성에 실패했습니다." }, { status: 409 });
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ message: "관리자 인증이 필요합니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  
  if (!code) {
    return NextResponse.json({ message: "삭제할 코드가 필요합니다." }, { status: 400 });
  }

  deleteDiscountCode(code);
  return NextResponse.json({ ok: true });
}
