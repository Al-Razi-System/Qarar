import Link from "next/link";
import { UserRoles } from "@/features/manage-users/ui/user-roles";
export default async function Page({params}:{params:Promise<{userId:string}>}){
 const {userId}=await params;
 return <div className="mx-auto max-w-5xl"><Link className="mb-5 inline-block text-sm text-[#0066cc]" href="/admin/users">العودة إلى المستخدمين</Link><UserRoles key={userId} userId={userId}/></div>;
}
