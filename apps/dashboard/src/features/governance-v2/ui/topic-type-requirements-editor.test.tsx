import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { initialRequirements, requirementsPayload, type Requirements } from "../model/topic-type-requirements";
import { TopicTypeRequirementsEditor } from "./topic-type-requirements-editor";

function Harness({ onValue }: { onValue: (value: Requirements) => void }) {
  const [value, setValue] = useState<Requirements>({ ...initialRequirements, scheduleKind: "seasonal", startsOn: "2026-01-01" });
  onValue(value);
  return <TopicTypeRequirementsEditor value={value} onChange={setValue} sourceItems={[]} loading={false} error="" onRetry={() => undefined}/>;
}
it("lets a seasonal date be a period with its own end, and says so in words", async () => {
  let latest: Requirements = initialRequirements;
  const user = userEvent.setup();
  render(<Harness onValue={value => { latest = value; }}/>);
  await user.clear(screen.getByLabelText("شهر الموعد الموسمي 1"));
  await user.type(screen.getByLabelText("شهر الموعد الموسمي 1"), "9");
  await user.clear(screen.getByLabelText("يوم الموعد الموسمي 1"));
  await user.type(screen.getByLabelText("يوم الموعد الموسمي 1"), "1");
  await user.click(screen.getByRole("checkbox", { name: /فترة وليست يومًا واحدًا/ }));
  expect(screen.getByLabelText("شهر نهاية الفترة الموسمية 1")).toHaveValue(9);
  await user.clear(screen.getByLabelText("يوم نهاية الفترة الموسمية 1"));
  await user.type(screen.getByLabelText("يوم نهاية الفترة الموسمية 1"), "30");
  expect(screen.getByText(/كل سنة في 1 – 30 سبتمبر/)).toBeInTheDocument();
  expect(requirementsPayload(latest).schedule.rule_config).toMatchObject({ dates: [{ month: 9, day: 1, to_month: 9, to_day: 30 }] });
  await user.click(screen.getByRole("checkbox", { name: /فترة وليست يومًا واحدًا/ }));
  expect(screen.queryByLabelText("شهر نهاية الفترة الموسمية 1")).not.toBeInTheDocument();
  expect(requirementsPayload(latest).schedule.rule_config).toMatchObject({ dates: [{ month: 9, day: 1 }] });
});
