import { Card } from "@/shared/ui/card";
export default function PermissionsLoading() {
  return (
    <Card>
      <p role="status" className="text-q-ui text-q-text-2">
        جارٍ تحميل الأدوار والصلاحيات…
      </p>
    </Card>
  );
}
