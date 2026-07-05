<div dir="rtl" style="text-align: right;">

# إعدادات GitHub Project لمشروع Qarar

## 1. الهدف

هذا الملف مرجع تنفيذي مختصر لإنشاء `GitHub Project` الخاص بـ `Qarar` بقيم وحقول موحدة مع المشاريع الأخرى قدر الإمكان.

---

## 2. اسم المشروع المقترح

```text
Qarar MVP Delivery Board
```

---

## 3. الحالات Status

حقل: `Status`  
النوع: `Single Select`

القيم:

- `Backlog`
- `Ready`
- `In Progress`
- `Review`
- `Changes Requested`
- `Testing`
- `Done`

ملاحظة:

- لا يستخدم `Blocked` كحالة مستقلة
- عند التعثر يستخدم وسم `blocked`

---

## 4. الأولوية Priority

حقل: `Priority`  
النوع: `Single Select`

القيم:

- `High`
- `Medium`
- `Low`

---

## 5. الشدة Severity

حقل: `Severity`  
النوع: `Single Select`

القيم:

- `Critical`
- `High`
- `Medium`
- `Low`

---

## 6. الملكية Owner

حقل: `Owner`  
النوع: `Single Select`

القيم:

- `Flutter`
- `Supabase / Integration`
- `Python Backend`
- `QA`
- `Project Lead`

ملاحظة:

- `Python Backend` يبقى خياراً احتياطياً عند الحاجة

---

## 7. المساحة Area

حقل: `Area`  
النوع: `Single Select`

القيم:

- `Flutter`
- `Backend`
- `Supabase`
- `Database`
- `Integration`
- `QA`
- `Docs`
- `Setup`
- `Security`
- `Reporting`

---

## 8. السبرنت Sprint

حقل: `Sprint`  
النوع: `Single Select`

القيم الأولية:

- `Sprint 00 - Setup & Governance`
- `Sprint 01 - Core Topic Flow`
- `Sprint 02 - Meetings & Agenda`
- `Sprint 03 - Attendance, Quorum & Voting`
- `Sprint 04 - AI Minutes & Approval`
- `Sprint 05 - Decisions & Execution`
- `Sprint 06 - Reporting, Notifications & Ops`
- `Sprint 07 - Hardening & MVP Closure`

ملاحظة:

- يستخدم `Sprint` هنا كحاوية تخطيطية ضمن `Scrumban`

---

## 9. الحقول القياسية المطلوبة

ينصح بالإبقاء على الحقول القياسية التالية:

- `Title`
- `Assignees`
- `Status`
- `Labels`
- `Linked pull requests`
- `Milestone`
- `Repository`
- `Reviewers`
- `Parent issue`
- `Sub-issues progress`
- `Created`
- `Updated`
- `Closed`

---

## 10. الحقول المخصصة المطلوبة

- `Sprint`
- `Owner`
- `Area`
- `Priority`
- `Start Date`
- `End Date`
- `Severity`

---

## 11. الحقول الاختيارية الخاصة بـ Qarar

- `Release`
- `Module`
- `Risk`
- `Type`

---

## 12. التسميات Labels المقترحة

- `blocked`
- `backend`
- `flutter`
- `supabase`
- `docs`
- `qa`
- `security`
- `reporting`
- `ai`
- `bug`
- `enhancement`

---

## 13. القواعد الأساسية

1. كل عنصر منفذ يجب أن يرتبط بـ `Issue` أو بطاقة واضحة.
2. كل `Pull Request` يجب أن يرتبط بعنصر في المشروع.
3. كل عنصر يبدأ من `Backlog` أو `Ready` ويمر عبر الحالات المعتمدة.
4. لا ينقل عنصر إلى `Done` إلا بعد المراجعة والاختبار.
5. أي تعثر يعالج عبر وسم `blocked` لا عبر حالة منفصلة.

---

## 14. مسار العمل المختصر

```text
Backlog -> Ready -> In Progress -> Review -> Changes Requested/Testing -> Done
```

---

## 15. ربطه مع GitFlow

- العمل يبدأ من `dev`
- فروع التنفيذ تكون `feature/...` أو `bugfix/...` أو `docs/...`
- الدمج يكون إلى `dev` عبر `Pull Request`
- `main` مخصص للإصدارات المستقرة فقط

</div>
