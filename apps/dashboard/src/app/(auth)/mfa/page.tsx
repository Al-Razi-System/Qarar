import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MfaForm } from "@/features/auth/ui/mfa-form";

export default async function MfaPage() {
  const store = await cookies();
  if (!store.get("qarar_mfa_access_token")) redirect("/login");

  return (
    <section className="col-span-full mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-3xl font-black">التحقق متعدد العوامل</h1>
      <MfaForm />
    </section>
  );
}
