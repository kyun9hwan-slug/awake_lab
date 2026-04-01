import { createHash } from "node:crypto";
import { cookies } from "next/headers";

export const adminCookieName = "awakelab_admin_session";

export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD ?? "0923";
}

function createSessionValue(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export function getAdminSessionValue(): string {
  return createSessionValue(getAdminPassword());
}

export async function isAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(adminCookieName)?.value === getAdminSessionValue();
}
