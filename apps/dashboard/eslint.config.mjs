import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-e2e/**",
    "out/**",
    "build/**",
    "storybook-static/**",
    "next-env.d.ts",
  ]),
  {
    // Design standards (docs/design/DESIGN_STANDARDS_AR.md): shared components
    // take every colour and size from the tokens in globals.css. The ignore list
    // names the components written before the standards; it may only shrink.
    // Add a feature folder here when its screens are migrated to the standards.
    files: [
      "src/shared/ui/**/*.tsx",
      "src/features/permissions/ui/permission-matrix.tsx",
      "src/app/(dashboard)/admin/permissions/**/*.tsx",
      "src/features/account/ui/**/*.tsx",
      "src/features/topics/ui/typed-topic-creator.tsx",
      "src/features/topics/ui/topic-submission-attachments.tsx",
      "src/app/(dashboard)/admin/topics/new/page.tsx",
      "src/features/meetings/ui/stage/**/*.tsx",
      "src/features/meetings/ui/meeting-agenda-panel.tsx",
      "src/features/meetings/ui/submitted-agenda-suggestions.tsx",
      "src/features/meetings/ui/agenda-instructions-dialog.tsx",
      // The live meeting room, migrated file by file.
      "src/features/meetings/ui/live-meeting-room.tsx",
      "src/features/meetings/ui/chair-attendance-console.tsx",
      "src/features/meetings/ui/attendance-verification-row.tsx",
      "src/features/meetings/ui/member-check-in-card.tsx",
      "src/features/meetings/ui/decision-composer-dialog.tsx",
      "src/features/meetings/ui/topic-attachments-panel.tsx",
      "src/features/meetings/ui/vote-result-panel.tsx",
      // Governance administration, migrated screen by screen.
      "src/features/audit/ui/**/*.tsx",
      "src/features/sessions/ui/**/*.tsx",
      "src/app/(dashboard)/admin/audit/**/*.tsx",
      "src/app/(dashboard)/admin/sessions/**/*.tsx",
      "src/features/oversight/ui/**/*.tsx",
      "src/app/(dashboard)/admin/oversight/**/*.tsx",
      "src/app/(dashboard)/admin/violations/**/*.tsx",
      "src/widgets/app-shell/ui/**/*.tsx",
      "src/features/home/ui/**/*.tsx",
      "src/features/performance/ui/**/*.tsx",
      "src/app/(dashboard)/admin/performance/**/*.tsx",
      "src/app/(dashboard)/admin/page.tsx",
    ],
    ignores: [
      "src/shared/ui/form-field.tsx",
      "src/shared/ui/governance-page-header.tsx",
      "src/shared/ui/instruction-editor.tsx",
      "src/**/*.test.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z_-])/]",
          message: "Use a design token (bg-q-*, text-q-*, border-q-*) instead of a hand-written colour.",
        },
        {
          selector: "TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z_-])/]",
          message: "Use a design token (bg-q-*, text-q-*, border-q-*) instead of a hand-written colour.",
        },
        {
          selector: "Literal[value=/text-\\[\\d+(\\.\\d+)?px\\]/]",
          message: "Use the type scale (text-q-caption … text-q-h1); 13px is the smallest allowed size.",
        },
        {
          selector: "Literal[value=/^ar-[A-Z]{2}(-u-ca-[a-z]+)?$/]",
          message: "Add -u-nu-latn to the locale so numbers print as 0123 like the rest of the product.",
        },
        {
          selector: "CallExpression[callee.object.name='window'][callee.property.name=/^(alert|confirm|prompt)$/]",
          message: "Use an in-page dialog or inline message instead of a native browser dialog.",
        },
      ],
    },
  },
  {
    // One numeral system on screen (0123): an Arabic formatting locale always
    // carries nu-latn. A bare "ar-SA" prints ١٢٣ beside 2026 from the database.
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: ["src/shared/ui/**", "src/features/permissions/ui/permission-matrix.tsx", "src/app/(dashboard)/admin/permissions/**", "src/features/account/ui/**", "src/features/topics/ui/typed-topic-creator.tsx", "src/features/topics/ui/topic-submission-attachments.tsx", "src/app/(dashboard)/admin/topics/new/page.tsx", "src/features/meetings/ui/**", "src/features/audit/ui/**", "src/features/sessions/ui/**", "src/app/(dashboard)/admin/audit/**", "src/app/(dashboard)/admin/sessions/**", "src/features/oversight/ui/**", "src/app/(dashboard)/admin/oversight/**", "src/app/(dashboard)/admin/violations/**", "src/widgets/app-shell/ui/**", "src/features/home/ui/**", "src/features/performance/ui/**", "src/app/(dashboard)/admin/performance/**", "src/app/(dashboard)/admin/page.tsx"],
    rules: {
      "no-restricted-syntax": ["error", { selector: "Literal[value=/^ar-[A-Z]{2}(-u-ca-[a-z]+)?$/]", message: "Add -u-nu-latn to the locale so numbers print as 0123 like the rest of the product." }],
    },
  },
]);

export default eslintConfig;
