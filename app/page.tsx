import { HomePage } from "@/components/home-page";
import { isAdminSession } from "@/lib/auth";

export default async function Page() {
  const isAdmin = await isAdminSession();
  return <HomePage isAdmin={isAdmin} />;
}
