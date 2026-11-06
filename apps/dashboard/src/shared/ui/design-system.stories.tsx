import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card } from "./card";
import { InlineMessage } from "./inline-message";
import { MemberSeat } from "./member-seat";
import { SegmentedControl } from "./segmented-control";

/**
 * The shared building blocks of every Qarar screen, shown in both modes.
 * Rules and values: docs/design/DESIGN_STANDARDS_AR.md.
 */
const meta: Meta = { title: "المعايير/المكونات الأساسية" };
export default meta;

function Showcase() {
  const [target, setTarget] = useState<"person" | "unit">("person");
  return (
    <div className="flex flex-col gap-6 bg-q-bg p-8 font-sans text-q-text">
      <h1 className="m-0 text-q-h1 font-bold">المكونات الأساسية</h1>

      <Card className="flex flex-col gap-4">
        <h2 className="m-0 text-q-h3 font-bold">الأزرار</h2>
        <div className="flex flex-wrap gap-3">
          <Button>إجراء أساسي</Button>
          <Button variant="secondary">ثانوي</Button>
          <Button variant="ghost">نصي</Button>
          <Button variant="danger">إجراء لا رجعة فيه</Button>
          <Button pending pendingLabel="جارٍ الحفظ…">حفظ</Button>
          <Button disabled>معطّل</Button>
        </div>
        <InlineMessage tone="info">الزر المعطّل يُكتب بجانبه سبب التعطيل دائماً.</InlineMessage>
      </Card>

      <Card live className="flex flex-col gap-4">
        <h2 className="m-0 text-q-h3 font-bold">الشارات والرسائل الموضعية</h2>
        <div className="flex flex-wrap gap-2">
          <Badge tone="live">الجاري الآن</Badge>
          <Badge tone="success">مكتمل</Badge>
          <Badge tone="warning">يحتاج إجراء</Badge>
          <Badge tone="danger">مرفوض</Badge>
          <Badge tone="info">التصويت مفتوح</Badge>
          <Badge>مسودة</Badge>
        </div>
        <InlineMessage tone="error">حدد موعداً قبل حفظ التكليف.</InlineMessage>
        <InlineMessage tone="success">تم حفظ القرار.</InlineMessage>
        <InlineMessage tone="warning">لا يُرسل المحضر قبل أن يتضمن النص الحالي للقرار.</InlineMessage>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="m-0 text-q-h3 font-bold">مفتاح الاختيار</h2>
        <SegmentedControl
          label="التكليف موجّه إلى"
          value={target}
          onChange={setTarget}
          options={[{ value: "person", label: "شخص" }, { value: "unit", label: "وحدة" }]}
          className="max-w-xs"
        />
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="m-0 text-q-h3 font-bold">مقعد العضو</h2>
        <div className="flex flex-wrap gap-4">
          <MemberSeat name="د. منصور" status="present" roleLabel="الرئيس" chair onOpen={() => undefined} />
          <MemberSeat name="د. هدى" status="voted" roleLabel="المقرر" />
          <MemberSeat name="د. ماجد" status="waiting" roleLabel="عضو" />
          <MemberSeat name="د. سعاد" status="excused" roleLabel="عضو" />
          <MemberSeat name="د. طارق" status="absent" roleLabel="عضو" />
        </div>
      </Card>
    </div>
  );
}

type Story = StoryObj;

export const Light: Story = { name: "الوضع الفاتح", render: () => <Showcase /> };

export const Dark: Story = {
  name: "الوضع الليلي",
  render: () => <div data-theme="dark"><Showcase /></div>,
};
