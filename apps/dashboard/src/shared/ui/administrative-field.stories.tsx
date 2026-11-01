import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  AdministrativeInput,
  AdministrativeSelect,
  AdministrativeTextArea,
} from "./administrative-field";
const meta = {
  title: "المعايير/حقول الإدارة",
  component: AdministrativeInput,
  args: { label: "اسم الدور", placeholder: "مثل: منسق الاجتماعات" },
} satisfies Meta<typeof AdministrativeInput>;
export default meta;
type Story = StoryObj<typeof meta>;
const fields = () => (
  <div className="space-y-6 bg-q-surface p-6">
    <AdministrativeInput label="اسم الدور" hint="اكتب اسمًا يعكس المسؤولية" />
    <AdministrativeSelect label="أين يُستخدم الدور؟">
      <option>داخل المجالس المحددة</option>
      <option>على مستوى المؤسسة</option>
    </AdministrativeSelect>
    <AdministrativeTextArea label="وصف المسؤوليات" />
  </div>
);
export const Light: Story = { render: fields };
export const Dark: Story = {
  render: fields,
  decorators: [
    (Story) => (
      <div data-theme="dark">
        <Story />
      </div>
    ),
  ],
};
