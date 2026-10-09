import type { Metadata } from "next";
import { AccountWorkspace, type SelfAccount } from "@/features/account/ui/account-workspace";
import { qararRpc } from "@/shared/api/qarar-server";
export const metadata: Metadata = { title: "حسابي" };
export default async function AccountPage() {
  const account = await qararRpc<SelfAccount>("get_my_account", {});
  return <AccountWorkspace key={account.id} account={account} />;
}
