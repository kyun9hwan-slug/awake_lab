import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin-login-form";
import { isAdminSession } from "@/lib/auth";

export default async function AdminLoginPage() {
  if (await isAdminSession()) {
    redirect("/admin");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0b0f] px-6 py-10">
      <AdminLoginForm />
    </main>
  );
}
