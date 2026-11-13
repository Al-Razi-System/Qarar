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
      "src/app/(auth)/**/*.tsx", "src/features/auth/**/*.tsx", "src/features/authentication/**/*.tsx", "src/features/sso/**/*.tsx", "src/app/(dashboard)/admin/sso/**/*.tsx",
      "src/features/topics/ui/topic-action-dialog.tsx",
      "src/features/topics/ui/topic-corrections-panel.tsx",
      "src/features/topics/ui/topic-creation-progress.tsx",
      "src/features/topics/ui/topic-custom-route-designer.tsx",
      "src/features/topics/ui/topic-details-workspace.tsx",
      "src/features/topics/ui/topic-governance-method-selector.tsx",
      "src/features/topics/ui/topic-list.tsx",
      "src/features/topics/ui/topic-pdf-download-button.tsx",
      "src/features/topics/ui/topic-prior-route-designer.tsx",
      "src/features/topics/ui/topic-schedule-occurrences.tsx",
      "src/features/topics/ui/topic-status-badge.tsx",
      "src/features/topics/ui/topic-summary-panel.tsx",
      "src/features/topics/ui/topics-workspace.tsx",
      "src/features/topics/ui/typed-topic-details.tsx",
      "src/features/meetings/ui/agenda-candidate-details-dialog.tsx",
      "src/features/meetings/ui/attendance-qr-dialog.tsx",
      "src/features/meetings/ui/completed-meeting-summary.tsx",
      "src/features/meetings/ui/direct-agenda-topic-dialog.tsx",
      "src/features/meetings/ui/invitation-timing-dialog.tsx",
      "src/features/meetings/ui/meeting-archive-policy.tsx",
      "src/features/meetings/ui/meeting-closure-room.tsx",
      "src/features/meetings/ui/meeting-details-journey.tsx",
      "src/features/meetings/ui/meeting-minutes-download-button.tsx",
      "src/features/meetings/ui/meeting-minutes-workspace.tsx",
      "src/features/meetings/ui/meeting-preparation-confirmation-dialog.tsx",
      "src/features/meetings/ui/meeting-quorum-field.tsx",
      "src/features/meetings/ui/meeting-row.tsx",
      "src/features/meetings/ui/meeting-schedule-dialog.tsx",
      "src/features/meetings/ui/meeting-self-check-in.tsx",
      "src/features/meetings/ui/meeting-start-confirmation-dialog.tsx",
      "src/features/meetings/ui/meeting-types-workspace.tsx",
      "src/features/meetings/ui/meetings-calendar.tsx",
      "src/features/meetings/ui/meetings-workspace.tsx",
      "src/features/meetings/ui/qr-check-in-scanner.tsx",
      "src/features/meetings/ui/quorum-decision-gate.tsx",
      "src/features/meetings/ui/rejected-vote-resolution-dialog.tsx",
      "src/features/meetings/ui/scheduled-agenda-proposal-dialog.tsx",
      "src/features/meetings/ui/scheduled-agenda-suggestions.tsx",
      "src/app/(dashboard)/admin/topics/[topicId]/loading.tsx",
      "src/app/(dashboard)/admin/topics/[topicId]/page.tsx",
      "src/app/(dashboard)/admin/topics/page.tsx",
      "src/app/(dashboard)/admin/meetings/[meetingId]/live/page.tsx",
      "src/app/(dashboard)/admin/meetings/[meetingId]/minutes/page.tsx",
      "src/app/(dashboard)/admin/meetings/[meetingId]/page.tsx",
      "src/app/(dashboard)/admin/meetings/page.tsx",
      "src/app/(dashboard)/meetings/check-in/page.tsx",
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
      // Parallel visual migration batch A.
      "src/features/councils/ui/**/*.tsx",
      "src/features/manage-users/ui/**/*.tsx",
      "src/features/delegations/ui/**/*.tsx",
      "src/features/approvals/ui/**/*.tsx",
      "src/app/(dashboard)/admin/councils/**/*.tsx",
      "src/app/(dashboard)/admin/organizational-units/**/*.tsx",
      "src/app/(dashboard)/admin/users/**/*.tsx",
      "src/app/(dashboard)/admin/delegations/**/*.tsx",
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
