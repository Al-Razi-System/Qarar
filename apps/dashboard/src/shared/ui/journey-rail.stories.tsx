import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { JourneyRail } from "./journey-rail";

const meta: Meta<typeof JourneyRail> = { title: "المعايير/مسار المحطات", component: JourneyRail, args: { label: "مسار المهمة" } };
export default meta;
type Story = StoryObj<typeof JourneyRail>;

export const InProgress: Story = {
  name: "قيد التنفيذ",
  args: { steps: [
    { label: "تكليف", state: "done", detail: "16 أكتوبر" },
    { label: "تنفيذ", state: "current", detail: "40%" },
    { label: "تسليم", state: "upcoming" },
    { label: "تحقق", state: "upcoming" },
  ] },
};
export const Overdue: Story = {
  name: "متأخرة",
  args: { steps: [
    { label: "تكليف", state: "done" },
    { label: "تنفيذ", state: "blocked", detail: "متأخرة 4 أيام" },
    { label: "تسليم", state: "upcoming" },
    { label: "تحقق", state: "upcoming" },
  ] },
};
export const Compact: Story = {
  name: "مختصر للقوائم",
  args: { compact: true, steps: [
    { label: "تكليف", state: "done" },
    { label: "تنفيذ", state: "done" },
    { label: "تسليم", state: "current" },
    { label: "تحقق", state: "upcoming" },
  ] },
};
