import type { Metadata } from "next";
import { AccountWorkspace, type SelfAccount } from "@/features/account/ui/account-workspace";
import { qararRpc, qararRpcV2 } from "@/shared/api/qarar-server";
export const metadata: Metadata = { title: "حسابي" };
export default async function AccountPage() {
  const account = await qararRpc<SelfAccount>("get_my_account", {});
  const avatar = await qararRpcV2<{revision:number;has_image:boolean}>("get_my_avatar_v2", {});
  return <AccountWorkspace key={account.id} account={{...account,avatar_revision:avatar.revision,has_avatar:avatar.has_image}} />;
}
