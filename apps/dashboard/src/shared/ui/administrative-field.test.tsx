import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  AdministrativeInput,
  AdministrativeSelect,
  AdministrativeTextArea,
} from "./administrative-field";
it("connects Arabic labels and hints to native accessible fields", () => {
  render(
    <>
      <AdministrativeInput label="اسم الدور" hint="اكتب اسمًا واضحًا" />
      <AdministrativeSelect label="النطاق">
        <option>المجلس</option>
      </AdministrativeSelect>
      <AdministrativeTextArea label="الوصف" />
    </>,
  );
  expect(screen.getByLabelText("اسم الدور")).toHaveAccessibleDescription(
    "اكتب اسمًا واضحًا",
  );
  expect(screen.getByRole("combobox", { name: "النطاق" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "الوصف" })).toBeInTheDocument();
});
