import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const css = readFileSync(`${process.cwd()}/src/app/globals.css`, "utf8");
const darkAt = css.indexOf('[data-theme="dark"]');
const light = css.slice(0, darkAt);
const dark = css.slice(darkAt, css.indexOf("\n}", darkAt));

const token = (block: string, name: string) => {
  const match = block.match(new RegExp(`\\n\\s*${name}:\\s*(#[0-9a-fA-F]{6});`));
  if (!match) throw new Error(`token ${name} not found`);
  return match[1];
};
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

const pairs: Array<[string, string]> = [
  ["--q-text", "--q-bg"], ["--q-text", "--q-surface"], ["--q-text-2", "--q-bg"], ["--q-text-2", "--q-surface"],
  ["--q-text-3", "--q-surface-2"], ["--q-link", "--q-surface-2"], ["--q-text", "--q-rail"], ["--q-text-2", "--q-rail"], ["--q-text-3", "--q-rail"], ["--q-link", "--q-surface"], ["--q-on-accent", "--q-accent"], ["--q-accent-text", "--q-surface"], ["--q-text-3", "--q-surface"], ["--q-link", "--q-bg"], ["--q-on-primary", "--q-primary"], ["--q-on-stage", "--q-stage-from"],
  ["--q-on-header", "--q-header"], ["--q-success", "--q-success-soft"], ["--q-danger", "--q-danger-soft"], ["--q-warning", "--q-warning-soft"],
];

it.each(pairs.filter(([fg, bg]) => !(fg === "--q-on-stage" && bg === "--q-stage-from")))("light theme: %s on %s keeps readable contrast (4.5:1)", (fg, bg) => {
  expect(ratio(token(light, fg), token(light, bg))).toBeGreaterThanOrEqual(4.5);
});
it.each(pairs.filter(([fg]) => fg !== "--q-on-primary"))("dark theme: %s on %s keeps readable contrast (4.5:1)", (fg, bg) => {
  expect(ratio(token(dark, fg), token(dark, bg))).toBeGreaterThanOrEqual(4.5);
});
