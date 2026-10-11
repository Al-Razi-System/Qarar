"use client";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { InlineMessage } from "@/shared/ui/inline-message";
export default function PermissionsError({ reset }: { reset: () => void }) {
  return (
    <Card className="space-y-4">
      <h1 className="text-q-h2 font-bold">الأدوار والصلاحيات</h1>
      <InlineMessage tone="error">
        تعذر تحميل إدارة الوصول. تحقق من اتصالك وصلاحية حسابك ثم أعد المحاولة.
      </InlineMessage>
      <Button onClick={reset}>إعادة المحاولة</Button>
    </Card>
  );
}
