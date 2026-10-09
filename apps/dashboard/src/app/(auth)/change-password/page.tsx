import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TemporaryPasswordForm } from "@/features/authentication/ui/temporary-password-form";

export default async function ChangePasswordPage() {
  const store = await cookies();
  if (!store.get("qarar_temporary_access_token")) redirect("/login");
  return <section className="col-span-full mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-5 py-10"><TemporaryPasswordForm /></section>;
}
