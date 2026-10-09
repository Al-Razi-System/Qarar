import { redirect } from "next/navigation";
import { qararRpcV2, QararApiError } from "@/shared/api/qarar-server";
import { RouteDesigner } from "@/features/regulations/ui/route-designer";
import { verifyRouteInventory, type RouteInventory } from "@/features/regulations/model/route-designer";

export default async function WorkflowsPage() {
  let data: RouteInventory | null = null;
  let failure = "تعذر تحميل المسارات. أعد تحميل الصفحة للمحاولة مجددًا.";
  try {
    data = verifyRouteInventory(await qararRpcV2<RouteInventory>("admin_get_route_layouts_v2", {}));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login?next=/admin/workflows");
    if (error instanceof QararApiError && error.code === "42501") failure = "ليست لديك صلاحية إدارة المسارات.";
  }
  if (data) return <RouteDesigner initialData={data} />;
  return <section dir="rtl" className="rounded-2xl border border-slate-200 bg-white p-8"><h1 className="text-xl font-bold">مسارات الموضوعات</h1><p role="alert" className="mt-4 text-sm text-slate-600">{failure}</p></section>;
}
