<div dir="rtl" style="text-align: right;">

# Qarar
## API Specification Document

**اسم المنتج:** Qarar  
**التموضع:** Enterprise Governance & Decision Management Platform  
**نوع الوثيقة:** API Specification Document  
**الإصدار:** 1.0  
**الحالة:** مسودة للمراجعة التأسيسية  
**اللغة:** العربية  
**المرجع الاصطلاحي:** [قاموس المصطلحات المرجعي](00_Glossary_Qarar_Arabic.md)  

---

> **حالة التنفيذ:** هذه وثيقة معمارية تصف الواجهة المستهدفة وليست قائمة بالعقود المنفذة.
> المصدر التنفيذي المعتمد لمطور الواجهة هو
> [`supabase/docs/api/README.md`](../supabase/docs/api/README.md)، والمرجع الدقيق لتواقيع
> `api_v1` هو
> [`supabase/docs/api/12-contract-reference.md`](../supabase/docs/api/12-contract-reference.md).
> لا يعد أي مسار مذكور هنا متاحًا حتى يظهر بحالة `Implemented` في دليل Supabase.

## 1. مقدمة

تهدف هذه الوثيقة إلى تعريف المواصفات المرجعية للواجهات البرمجية `APIs` في `Qarar`، بحيث تعكس نموذج المجال، والإطار الحوكمي، ودورات الحياة التشغيلية، وقواعد الصلاحيات والعزل المؤسسي، والتكاملات الداخلية والخارجية.

في `Qarar`، لا يجب أن تصمم الواجهات البرمجية انطلاقاً من الجداول فقط، بل من منطق الأعمال نفسه. ولذلك فإن واجهات النظام يجب أن تعبر عن:

- الكيانات الجوهرية
- أفعال الحوكمة
- انتقالات المسارات
- دورة القرار
- دورة الاجتماع
- دورة المحضر
- دورة التنفيذ والمتابعة

بالتالي، هذه الوثيقة تصف `API` بوصفه طبقة تشغيل وتكامل مؤسسية، لا مجرد قناة تقنية لقراءة البيانات وكتابتها.

---

## 2. هدف الوثيقة

تهدف هذه الوثيقة إلى:

- تعريف المبادئ العامة لتصميم `API` في `Qarar`
- تحديد مجموعات الموارد الأساسية
- تحديد العمليات المرجعية على كل مورد
- تعريف الأفعال الحوكمية والسياقية
- توضيح أسلوب المصادقة والتفويض والعزل المؤسسي
- وضع أساس واضح للتكامل بين الواجهة الأمامية والخدمات والتكاملات المؤسسية

---

## 3. الأساس المرجعي لهذه الوثيقة

تم بناء مواصفات `API` على أساس الوثائق التالية:

- `06_Domain_Model_Qarar_Arabic`
- `07_Data_Model_Qarar_Arabic`
- `08_Workflow_Framework_Qarar_Arabic`
- `09_Functional_Requirements_Qarar_Arabic`
- `13_Decision_Lifecycle_Qarar_Arabic`
- `14_Meeting_Lifecycle_Qarar_Arabic`
- `16_Permission_Framework_Qarar_Arabic`
- `17_SaaS_Architecture_Qarar_Arabic`
- `18_AI_Framework_Qarar_Arabic`

### القاعدة

كل مورد أو عملية أو فعل في هذه الوثيقة يجب أن يكون له أصل واضح في نموذج الأعمال أو دورة الحياة أو الصلاحيات.

---

## 4. المبادئ العامة لتصميم API

يجب أن تلتزم واجهات `Qarar API` بالمبادئ التالية:

- **Business-Oriented APIs**
- **Resource + Action Model**
- **Tenant-Aware by Design**
- **Secure by Default**
- **Lifecycle-Aligned Operations**
- **Audit-Safe Operations**
- **Consistent Error Handling**
- **Extensible Without Breaking Clients**

---

## 5. النمط العام للـ API

يعتمد `Qarar` على نمط:

- موارد رئيسية `Resources`
- عمليات قياسية على الموارد
- أفعال متخصصة `Domain Actions`

### مثال مفاهيمي

- `GET /topics`
- `POST /topics`
- `GET /topics/{id}`
- `PATCH /topics/{id}`
- `POST /topics/{id}/approve`
- `POST /topics/{id}/reject`
- `POST /topics/{id}/refer`

### القاعدة

- عندما يكون الإجراء مجرد تعديل بسيط على المورد، يمكن تمثيله بعملية تحديث.
- عندما يكون الإجراء فعلاً حوكمياً له أثر تدقيقي أو انتقال حالة، يجب أن يمثل كـ `Domain Action` مستقل.

---

## 6. إصدار الواجهات Versioning

### التوصية

يجب أن يدعم `Qarar API` إصداراً واضحاً مثل:

- `/api/v1/...`

### الهدف

- حماية التوافقية
- دعم التطوير المرحلي
- تمكين التوسع مستقبلاً دون كسر العملاء الحاليين

---

## 7. المصادقة Authentication

### الهدف

ضمان أن كل طلب إلى `API` يصدر عن هوية معروفة وصالحة.

### المبادئ

- يجب أن يتطلب `API` مصادقة آمنة لجميع العمليات الحساسة.
- يجب أن تتوافق المصادقة مع `Security Framework`.
- ينبغي دعم:
  - token-based authentication
  - SSO integration
  - MFA-sensitive flows عند الحاجة

### القاعدة

- لا يسمح بالوصول غير المصرح به إلى الموارد المؤسسية.

---

## 8. التفويض Authorization

### الهدف

تطبيق الصلاحيات على مستوى كل endpoint وكل فعل حوكمـي.

### المبادئ

- يجب أن يطبق `API` قواعد `Permission Framework`.
- يجب التحقق من:
  - المؤسسة
  - الدور
  - العضوية
  - السياق
  - حالة الكيان

### أمثلة

- قد يسمح للمستخدم بقراءة موضوع، لكن لا يسمح له باعتماده.
- قد يسمح له بقراءة ملخص التقرير، لكن لا يسمح له بتصديره.
- قد يسمح له بتحديث تكليفاته، لكن لا يسمح له بتعديل القرار المرجعي.

---

## 9. العزل المؤسسي Tenant Scoping

### الهدف

منع أي اختلاط بين بيانات المؤسسات على مستوى الواجهات البرمجية.

### المبادئ

- يجب أن يعمل كل طلب ضمن سياق مؤسسة واضحة.
- يجب أن ترتبط كل الموارد المؤسسية بـ `organization_id` منطقياً.
- يجب منع الوصول إلى مورد من مؤسسة أخرى حتى لو عرف معرفه المباشر.

### التوصية

- يمكن أن يحمل سياق المؤسسة عبر:
  - token claims
  - tenant context in session
  - headers controlled securely

---

## 10. نمط الاستجابة العام

ينبغي أن تكون الاستجابات متسقة في البنية قدر الإمكان.

### مثال مفاهيمي

```json
{
  "data": {},
  "meta": {},
  "links": {}
}
```

### المبادئ

- `data` للمحتوى الرئيسي
- `meta` للمعلومات الإضافية مثل pagination أو counts
- `links` للتنقل إن استخدم

---

## 11. نمط الأخطاء Error Model

يجب أن يكون نموذج الأخطاء موحداً ومفيداً.

### عناصر الخطأ

- `code`
- `message`
- `details`
- `field_errors` عند الحاجة
- `trace_id` أو معرف تتبع عند الحاجة التشغيلية

### المبادئ

- يجب أن تكون الرسالة مفيدة للعميل
- يجب ألا تكشف تفاصيل حساسة
- يجب أن تميز بوضوح بين:
  - خطأ تحقق
  - خطأ صلاحية
  - خطأ حالة
  - خطأ عدم وجود
  - خطأ تشغيل داخلي

---

## 12. التصفح والفلترة والفرز Pagination / Filtering / Sorting

يجب أن تدعم معظم الموارد القابلة للقوائم:

- pagination
- filtering
- sorting
- search

### الموارد التي تتطلب ذلك غالباً

- topics
- meetings
- decisions
- action-items
- notifications
- reports outputs
- audit logs

---

## 13. المجموعات الرئيسية للموارد

الواجهات البرمجية في `Qarar` تقسم منطقياً إلى المجموعات التالية:

- المؤسسات والإدارة العامة
- الوحدات الحوكمية والعضويات
- اللوائح والسياسات
- الموضوعات
- المسارات
- الاجتماعات
- الحضور والتصويت
- القرارات
- التكليفات والتنفيذ
- المحاضر والمصادقات
- الإشعارات والتصعيد
- التقارير والتحليلات
- السجل التدقيقي
- الذكاء الاصطناعي

---

## 14. واجهات المؤسسات والإدارة العامة

### الموارد الأساسية

- `/organizations`
- `/organization-settings`
- `/reference-data`

### عمليات مرجعية

- `GET /organizations/{id}`
- `PATCH /organizations/{id}`
- `GET /organizations/{id}/settings`
- `PATCH /organizations/{id}/settings`

### ملاحظات

- يجب أن تكون هذه الواجهات عالية الحساسية وصلاحيتها محدودة.

---

## 15. واجهات الوحدات الحوكمية والعضويات

### الموارد الأساسية

- `/governance-units`
- `/governance-unit-types`
- `/memberships`
- `/roles`
- `/users`

### عمليات مرجعية

- `GET /governance-units`
- `POST /governance-units`
- `GET /governance-units/{id}`
- `PATCH /governance-units/{id}`
- `POST /governance-units/{id}/deactivate`

- `GET /memberships`
- `POST /memberships`
- `PATCH /memberships/{id}`
- `POST /memberships/{id}/end`

### ملاحظات

- يجب أن تدعم هذه الواجهات البناء الهرمي للوحدات والعلاقات بينها.

---

## 16. واجهات اللوائح والسياسات

### الموارد الأساسية

- `/policies`
- `/policy-items`

### عمليات مرجعية

- `GET /policies`
- `POST /policies`
- `GET /policies/{id}`
- `PATCH /policies/{id}`
- `POST /policies/{id}/activate`
- `POST /policies/{id}/archive`

- `GET /policy-items`
- `POST /policy-items`
- `PATCH /policy-items/{id}`

### عمليات خاصة

- `POST /policy-items/{id}/attach-workflow`
- `POST /policy-items/{id}/detach-workflow`

---

## 17. واجهات الموضوعات

### الموارد الأساسية

- `/topics`
- `/topic-categories`
- `/topic-attachments`

### عمليات مرجعية

- `GET /topics`
- `POST /topics`
- `GET /topics/{id}`
- `PATCH /topics/{id}`
- `GET /topics/{id}/history`
- `POST /topics/{id}/attachments`

### أفعال حوكمية متخصصة

- `POST /topics/{id}/submit`
- `POST /topics/{id}/approve`
- `POST /topics/{id}/reject`
- `POST /topics/{id}/request-completion`
- `POST /topics/{id}/refer`
- `POST /topics/{id}/postpone`
- `POST /topics/{id}/close`

### القاعدة

- هذه الأفعال ليست مجرد تحديث حالة، بل انتقالات حوكمية يجب أن تسجل وتدقق.

---

## 18. واجهات المسارات

### الموارد الأساسية

- `/workflows`
- `/workflow-steps`
- `/workflow-transitions`

### عمليات مرجعية

- `GET /workflows`
- `POST /workflows`
- `GET /workflows/{id}`
- `PATCH /workflows/{id}`
- `POST /workflows/{id}/activate`
- `POST /workflows/{id}/deactivate`

- `POST /workflows/{id}/steps`
- `PATCH /workflow-steps/{id}`

### أفعال متخصصة

- `POST /topics/{id}/assign-workflow`
- `POST /topics/{id}/change-workflow`
- `POST /topics/{id}/advance`
- `POST /topics/{id}/return`
- `POST /topics/{id}/reroute`

---

## 19. واجهات الاجتماعات

### الموارد الأساسية

- `/meetings`
- `/agenda-items`

### عمليات مرجعية

- `GET /meetings`
- `POST /meetings`
- `GET /meetings/{id}`
- `PATCH /meetings/{id}`
- `POST /meetings/{id}/reschedule`
- `POST /meetings/{id}/cancel`

### أفعال دورة الحياة

- `POST /meetings/{id}/prepare`
- `POST /meetings/{id}/open`
- `POST /meetings/{id}/suspend`
- `POST /meetings/{id}/resume`
- `POST /meetings/{id}/mark-waiting-for-minutes`
- `POST /meetings/{id}/mark-waiting-for-approval`
- `POST /meetings/{id}/close`
- `POST /meetings/{id}/archive`

### القاعدة

- يجب أن تعكس واجهات الاجتماع انتقالات الحالات المعتمدة مثل `مخطط` و`مجدول` و`جاهز للانعقاد` و`قيد الانعقاد` و`بانتظار المحضر` و`بانتظار المصادقة` و`مغلق` و`مؤرشف`.

## 20. واجهات الحضور والنصاب

### الموارد الأساسية

- `/attendance-records`

### عمليات مرجعية

- `GET /meetings/{id}/attendance`
- `POST /meetings/{id}/attendance`
- `PATCH /attendance-records/{id}`

### أفعال متخصصة

- `GET /meetings/{id}/quorum-status`
- `POST /meetings/{id}/recalculate-quorum`

### الملاحظات

- يجب أن تكون هذه العمليات مرتبطة بصلاحيات تشغيلية واضحة.

---

## 21. واجهات التصويت

### الموارد الأساسية

- `/votes`

### عمليات مرجعية

- `GET /meetings/{id}/votes`
- `GET /topics/{id}/votes`

### أفعال متخصصة

- `POST /topics/{id}/open-voting`
- `POST /topics/{id}/vote`
- `POST /topics/{id}/close-voting`
- `GET /topics/{id}/vote-result`

### القاعدة

- لا يجب تمكين التصويت إلا عندما يكون السياق مفتوحاً لذلك وصلاحية العضو قائمة.

---

## 22. واجهات القرارات

### الموارد الأساسية

- `/decisions`
- `/decision-types`

### عمليات مرجعية

- `GET /decisions`
- `POST /decisions`
- `GET /decisions/{id}`
- `PATCH /decisions/{id}`
- `GET /decisions/{id}/history`

### أفعال دورة الحياة

- `POST /decisions/{id}/submit-for-approval`
- `POST /decisions/{id}/return-to-review`
- `POST /decisions/{id}/approve`
- `POST /decisions/{id}/reject`
- `POST /decisions/{id}/cancel`
- `POST /decisions/{id}/send-to-execution`
- `POST /decisions/{id}/mark-under-follow-up`
- `POST /decisions/{id}/close`

### القاعدة

- يجب أن تعكس هذه الواجهات حالات القرار المعتمدة مثل `مسجل` و`قيد المراجعة` و`جاهز للاعتماد` و`معتمد` و`محال للتنفيذ` و`قيد المتابعة` و`مغلق` و`ملغى` و`مرفوض`.

---

## 23. واجهات التكليفات والتنفيذ

### الموارد الأساسية

- `/action-items`
- `/action-evidence`
- `/follow-up-records`

### عمليات مرجعية

- `GET /action-items`
- `POST /action-items`
- `GET /action-items/{id}`
- `PATCH /action-items/{id}`
- `GET /action-items/{id}/evidence`
- `POST /action-items/{id}/evidence`
- `GET /action-items/{id}/follow-ups`
- `POST /action-items/{id}/follow-ups`

### أفعال دورة الحياة

- `POST /action-items/{id}/start`
- `POST /action-items/{id}/update-progress`
- `POST /action-items/{id}/mark-complete`
- `POST /action-items/{id}/close`
- `POST /action-items/{id}/cancel`

---

## 24. واجهات المحاضر

### الموارد الأساسية

- `/meeting-minutes`
- `/minutes-approvals`

### عمليات مرجعية

- `GET /meetings/{id}/minutes`
- `GET /meeting-minutes/{id}`
- `PATCH /meeting-minutes/{id}`

### أفعال دورة الحياة

- `POST /meetings/{id}/minutes/generate-draft`
- `POST /meeting-minutes/{id}/submit-for-review`
- `POST /meeting-minutes/{id}/mark-ready-for-approval`
- `POST /meeting-minutes/{id}/approve`
- `POST /meeting-minutes/{id}/reject`
- `POST /meeting-minutes/{id}/finalize`

### القاعدة

- يجب أن تعكس هذه الأفعال بوضوح الفرق بين:
  - المسودة الذكية
  - مراجعة المقرر
  - المصادقة الرسمية

---

## 25. واجهات الاعتمادات العامة

### الموارد الأساسية

- `/approvals`
- `/approval-rules`

### عمليات مرجعية

- `GET /approvals`
- `POST /approvals`
- `GET /approvals/{id}`
- `PATCH /approval-rules/{id}`

### أفعال متخصصة

- `POST /approvals/{id}/approve`
- `POST /approvals/{id}/reject`
- `POST /approvals/{id}/return`

---

## 26. واجهات الإشعارات والتصعيد

### الموارد الأساسية

- `/notifications`
- `/notification-rules`
- `/escalations`

### عمليات مرجعية

- `GET /notifications`
- `GET /notifications/{id}`
- `POST /notification-rules`
- `PATCH /notification-rules/{id}`

- `GET /escalations`
- `GET /escalations/{id}`

### أفعال متخصصة

- `POST /notifications/{id}/mark-read`
- `POST /notifications/{id}/resend`
- `POST /action-items/{id}/escalate`
- `POST /escalations/{id}/close`
- `POST /escalations/{id}/raise-level`

---

## 27. واجهات التقارير والتحليلات

### الموارد الأساسية

- `/dashboards`
- `/reports`
- `/kpis`

### عمليات مرجعية

- `GET /dashboards/executive`
- `GET /dashboards/governance`
- `GET /dashboards/decisions`
- `GET /dashboards/meetings`
- `GET /dashboards/execution`
- `GET /dashboards/compliance`

- `GET /reports/council-performance`
- `GET /reports/meetings`
- `GET /reports/topics`
- `GET /reports/decisions`
- `GET /reports/action-items`
- `GET /reports/compliance`
- `GET /reports/attendance`
- `GET /reports/minutes`
- `GET /reports/escalations`

### الملاحظات

- يجب دعم التصفية والزمن والوحدة والجهة والحالة وغيرها.

---

## 28. واجهات السجل التدقيقي

### الموارد الأساسية

- `/audit-logs`

### عمليات مرجعية

- `GET /audit-logs`
- `GET /audit-logs/{id}`

### الملاحظات

- هذه الواجهات عالية الحساسية ويجب تقييدها بعناية.

---

## 29. واجهات الذكاء الاصطناعي

### الموارد الأساسية

- `/ai/minutes`
- `/ai/jobs`

### عمليات مرجعية

- `POST /ai/minutes/generate-draft`
- `GET /ai/jobs/{id}`
- `GET /ai/minutes/{meeting_id}/draft`

### القاعدة

- يجب أن تعكس هذه الواجهات أن AI يولد مسودة، لا محضراً معتمداً.

---

## 30. أفعال الحوكمة الخاصة Domain Actions

هناك أفعال لا ينبغي اختزالها في `PATCH`, لأنها تمثل انتقالات حوكميـة حقيقية، مثل:

- approve
- reject
- refer
- postpone
- request-completion
- open
- close
- finalize
- escalate
- send-to-execution

### القاعدة

- هذه الأفعال يجب أن تسجل كتغيرات مقصودة ذات أثر وتدقيق.

---

## 31. الواجهات غير المتزامنة Async Operations

بعض العمليات في `Qarar` يجب أن تدعم التنفيذ غير المتزامن، مثل:

- توليد مسودة المحضر
- بعض التقارير الثقيلة
- تصدير بيانات كبيرة
- بعض التحليلات المستقبلية

### التوصية

- يجب أن تدعم هذه العمليات:
  - إنشاء المهمة
  - تتبع حالتها
  - جلب النتيجة
  - معالجة الفشل

---
## 32. التحقق من الحالة State Validation

يجب أن يتحقق `API` من صحة الحالة قبل تنفيذ الأفعال.

### أمثلة


- لا يمكن التصويت إذا لم يفتح التصويت
- لا يمكن فتح الاجتماع إلا إذا كان في حالة `جاهز للانعقاد` أو ما يعادلها حسب السياسة
- لا يمكن إغلاق الاجتماع قبل استكمال متطلبات الإغلاق
- لا يمكن اعتماد محضر غير جاهز للمصادقة
- لا يمكن إحالة قرار للتنفيذ إذا لم يعتمد عند الحاجة
- لا يمكن تحويل القرار إلى `قيد المتابعة` قبل إرساله للتنفيذ

### القاعدة

- state guard
- permission guard
- policy guard
- tenant scope guard

- اكتمال الحقول المطلوبة
- صحة الأنواع
- صحة العلاقات المرجعية
- توافق القيم مع القواعد المرجعية
- توافق الحالة والسياق مع الإجراء المطلوب

---

## 34. التتبع والتدقيق

العمليات الحساسة عبر `API` يجب أن تدعم:

- تسجيل الفاعل
- تسجيل التوقيت
- تسجيل الكيان المستهدف
- تسجيل نوع الفعل
- حفظ الأثر عند تغيير الحالات أو الاعتمادات أو المسارات

---

## 35. الصلاحيات على مستوى الـ API

كل endpoint يجب أن يرتبط بواحد أو أكثر من:

- permission scope
- role requirement
- membership requirement
- entity ownership / tenant check
- state guard

### المبدأ

- لا يكفي وصف الواجهة، بل يجب لاحقاً أن تربط هذه المواصفات بمصفوفة صلاحيات تنفيذية.

---

## 36. التصفية والبحث والفرز

يجب أن تدعم الواجهات المناسبة إمكانات مثل:

- `page`
- `page_size`
- `sort_by`
- `sort_order`
- `search`
- `status`
- `date_from`
- `date_to`
- `unit_id`
- `meeting_id`
- `decision_type`

### القاعدة

- يجب أن تكون هذه الأنماط موحدة قدر الإمكان بين الموارد.

---

## 37. التصدير والتكاملات

ينبغي أن تدعم بعض الواجهات إمكانات مثل:

- تصدير تقارير
- تحميل محاضر
- تحميل قرارات
- التكامل مع الإشعارات أو الهوية أو الأرشفة

### القاعدة

- يجب أن تكون صلاحية التصدير منفصلة أحياناً عن صلاحية العرض.

---

## 38. الحاجة إلى المخططات

نعم، هذه الوثيقة تحديداً تستفيد كثيراً من:

- مخطط Resource Map
- مخطط Lifecycle Actions by Entity
- مخطط Authorization Flow
- مخطط Async Job Flow

### التوصية

- يثبت النص أولاً
- ثم تضاف مخططات رسمية في نسخة لاحقة

---

## 39. أولويات الإصدار الأول

في الإصدار الأول، يجب أن تغطي الواجهات البرمجية على الأقل:

- الوحدات الحوكمية
- المستخدمين والعضويات
- اللوائح
- الموضوعات
- المسارات
- الاجتماعات
- الحضور
- التصويت
- القرارات
- التكليفات
- المحاضر
- المصادقات
- الإشعارات الأساسية
- التقارير الأساسية
- الذكاء الاصطناعي للمسودة الأولى للمحضر

---

## 40. التوصيات التحليلية

- يجب أن تبنى واجهات `Qarar` على منطق الأعمال لا على تصميم الجداول فقط.
- يجب أن تظهر الانتقالات الحوكمية كأفعال مستقلة واضحة.
- يجب أن تبقى الواجهات منسجمة مع `Domain Model` و`Workflow Framework`.
- يجب تصميم `API` منذ البداية مع مراعاة العزل المؤسسي والصلاحيات والتدقيق.
- يجب ترجمة هذه الوثيقة لاحقاً إلى مواصفات تنفيذية أدق مثل:
  - request/response contracts
  - field-level validation
  - permission mapping

---

## 41. خاتمة

تمثل هذه الوثيقة الجسر بين التحليل المؤسسي والحوكمي من جهة، والتنفيذ البرمجي الفعلي من جهة أخرى. وعندما تبنى واجهات `Qarar API` على هذا الأساس، فإن المنصة تصبح قادرة على خدمة الواجهة الأمامية، والتكاملات، والتقارير، والذكاء الاصطناعي، والتوسع المؤسسي، من دون أن تفقد اتساقها أو جوهرها الحوكمي. ولهذا تعد هذه الوثيقة من أهم وثائق التحول من التحليل إلى التنفيذ.

</div>
