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
    files: ["src/shared/ui/**/*.tsx", "src/features/meetings/ui/stage/**/*.tsx"],
    ignores: [
      "src/shared/ui/form-field.tsx",
      "src/shared/ui/governance-page-header.tsx",
      "src/shared/ui/instruction-editor.tsx",
      "src/shared/ui/logo.tsx",
      "src/shared/ui/page-header.tsx",
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
          selector: "CallExpression[callee.object.name='window'][callee.property.name=/^(alert|confirm|prompt)$/]",
          message: "Use an in-page dialog or inline message instead of a native browser dialog.",
        },
      ],
    },
  },
]);

export default eslintConfig;
