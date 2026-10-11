import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SelfAvatar } from "./self-avatar";
const meta = { title: "المعايير/الصورة الشخصية", component: SelfAvatar, args: { name: "عمر محمد", source: "data:,", large: true } } satisfies Meta<typeof SelfAvatar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Light: Story = {};
export const Dark: Story = { decorators: [(Story) => <div data-theme="dark" className="bg-q-bg p-8"><Story /></div>] };
