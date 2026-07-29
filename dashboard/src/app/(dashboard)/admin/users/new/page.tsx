import { redirect } from "next/navigation";

export default function LegacyCreateUserPage() {
  redirect("/admin/users");
}
