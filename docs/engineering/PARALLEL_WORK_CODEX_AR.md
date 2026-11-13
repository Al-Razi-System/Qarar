<div dir="rtl" style="text-align: right;">

# العمل المتزامن: Claude يدير و Codex ينفذ (13 نوفمبر 2026)

الفرع الأساسي: `codex/cross-council-return-20261027`. Claude يعمل عليه مباشرة في `/home/partner/Qarar`.

## قواعد Codex (ملزمة لكل دفعة)

1. اعمل في **worktree مستقل** وفرع مستقل من الفرع الأساسي، ولا تعمل في `/home/partner/Qarar` نفسه:
   `git worktree add ../Qarar-codex-<batch> -b codex/<batch> origin/codex/cross-council-return-20261027`.
2. اقرأ أولًا: `AGENTS.md`، `docs/design/DESIGN_STANDARDS_AR.md`، وأعلى `docs/design/HANDOFF_AR.md`.
3. **ممنوع لمسه** (ملك Claude): `supabase/**`، `apps/dashboard/src/shared/ui/**`،
   `apps/dashboard/src/app/globals.css`، `apps/dashboard/src/app/layout.tsx`،
   `apps/dashboard/src/widgets/**`، `apps/dashboard/src/features/performance/**`،
   `apps/dashboard/src/features/oversight/**`، `apps/dashboard/src/features/home/**`،
   `docs/design/HANDOFF_AR.md`. إن احتجت مكوّنًا مشتركًا ناقصًا أو تغييرًا في القاعدة، **توقف واكتب الطلب** في
   وصف الـPR ولا تنفذه.
4. لا ترحيلات قاعدة، ولا تطبيق على `devqarar`، ولا تعديل سلوك: هذه الدفعات **ترحيل مظهر فقط**. أي نص أو
   منطق أو طلب شبكة يبقى كما هو.
5. الترحيل معناه: استبدال كل لون مكتوب يدويًا وكل `text-[Npx]` بقيم المعايير (`bg-q-*`، `text-q-*`،
   `border-q-*`، `rounded-q-*`، `text-q-caption … text-q-h1`)، لا نص أصغر من 13، هدف الضغط 44 على الأقل،
   واستخدام مكونات `shared/ui` الموجودة (`Button`، `Badge`، `Card`، `InlineMessage`، `Dialog`،
   `SegmentedControl`، `PageHeader`) بدل النسخ المحلية. لا تسمية صغيرة فوق العناوين. الأرقام: أي لغة
   `ar-SA` تحمل `-u-nu-latn`. البرتقالي (`q-accent`) للتأخير والتنبيه فقط.
6. بعد ترحيل مجلد، أضفه إلى قائمة `files` في `apps/dashboard/eslint.config.mjs` (القسم الأول)، وهذا **السطر
   الوحيد** المسموح لك في ذلك الملف.
7. قبل التسليم داخل `apps/dashboard`: `npx tsc --noEmit -p .` و`npx eslint src` (صفر أخطاء) و
   `npx vitest run <مجلدات الدفعة>`، ومن الجذر `npm run test:development-governance`. حدّث الاختبارات التي
   تعتمد على أصناف CSS فقط، ولا تحذف اختبارًا.
8. commit واحد لكل شاشة، ثم `git push -u origin codex/<batch>` وافتح PR **إلى**
   `codex/cross-council-return-20261027` (لا إلى `main`). لا تدمج بنفسك: Claude يراجع ويدمج.
9. في وصف الـPR: الملفات المرحّلة، ما لم تستطع ترحيله ولماذا، ونتائج الفحوص حرفيًا.

## الدفعات

| الدفعة | الفرع | النطاق (كله داخل `apps/dashboard/src`) |
|---|---|---|
| A | `codex/migrate-councils-users` | `features/councils/**`، `features/manage-users/**`، `features/delegations/**`، `features/approvals/**`، وصفحاتها تحت `app/(dashboard)/admin/{councils,organizational-units,users,delegations}` |
| B | `codex/migrate-auth` | `app/(auth)/**`، `features/auth/**`، `features/authentication/**`، `features/sso/**`، `app/(dashboard)/admin/sso` |
| C | `codex/migrate-topics-meetings` | الملفات غير المرحّلة في `features/topics/**` و`features/meetings/**` (عدا مجلدات `pdf/` و`server/` وما هو مذكور أصلًا في قائمة lint) وصفحاتها |
| D | `codex/migrate-regulations` | `features/regulations/**` و`features/governance-v2/**` وصفحات `regulations` و`workflows` و`governance-model` و`settings`؛ ملفات `*.module.css` تُحوَّل ألوانها إلى `var(--q-*)` |

الدفعات مستقلة ولا تتقاطع ملفاتها، فيمكن تشغيلها معًا. الأولوية: A ثم B ثم C ثم D.

## ما يبقى عند Claude

لوحة متابعة الموضوعات، لوحة متابعة المستخدمين، تصدير التقرير، أنواع القرارات، قرار الاقتراع السري، وكل
عقود القاعدة، ومراجعة ودمج دفعات Codex.

</div>
