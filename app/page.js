import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default function RootPage() {
  const c = cookies();
  const token = c.get("auth_token")?.value;

  // jika sudah login langsung ke dashboard, kalau tidak ke login
  if (token) redirect("/dashboard");
  redirect("/login");
}
