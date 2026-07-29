# اختيار اللائحة عند إنشاء الموضوع

هذا الدليل يصف عقد الواجهة المعتمد لربط الموضوع بلائحة واحدة. لا يكتب التطبيق مباشرة في
جداول اللوائح أو الموضوعات، ولا يرسل معرف لائحة من قائمة محلية غير متحقق منها.

## المبدأ

قد توجد عدة لوائح فعالة تنطبق على الفئة نفسها والمجلس نفسه في الوقت نفسه. هذا وضع طبيعي،
وليس تعارضًا في البيانات. تعرض الواجهة الخيارات المؤهلة للمستخدم، ثم يختار المستخدم لائحة
واحدة مناسبة للموضوع. يعيد الخادم فحص الاختيار داخل معاملة الإنشاء نفسها، ولذلك لا يمكن
ربط موضوع بلائحة منتهية أو معلقة أو لا تنطبق على مجلسه أو فئته.

لا تعني هذه العملية تطبيق أكثر من لائحة على موضوع واحد: كل موضوع ينشأ بهذا المسار يرتبط
بنسخة وبند ونطاق واحد محدد، وتبقى هذه اللقطة تاريخية حتى إذا تغيرت اللائحة لاحقًا.

## ما يجب تحميله أولًا

1. استدع `get_topic_form_options` لتحميل فئات الموضوعات والمجالس التي يملك المستخدم فيها
   `topics.create`.
2. عندما يختار المستخدم الفئة والمجلس والأولوية ومصدر الموضوع، استدع
   `get_topic_regulation_options`.
3. اعرض `items` للمستخدم باسم اللائحة وبندها وإصدارها وملخص مسارها. لا تعرض المعرفات الفنية.
4. إذا لم توجد خيارات، أوقف الإرسال واعرض حالة الحوكمة المناسبة. لا تنشئ موضوعًا غير منظم.
5. عند اختيار خيار واحد، احتفظ بكائن `selection` كما أعاده الخادم ثم أرسله إلى أمر الإنشاء.

## استعراض اللوائح المتاحة

```text
POST /rest/v1/rpc/get_topic_regulation_options
Accept-Profile: api_v1
Content-Profile: api_v1
Authorization: Bearer <access-token>
```

```json
{
  "p_governance_unit_id": "<uuid>",
  "p_topic_category_id": "<uuid>",
  "p_priority": "medium",
  "p_source_type": "new",
  "p_effective_on": "2026-07-28"
}
```

الاستجابة المختصرة:

```json
{
  "governance_unit_id": "<uuid>",
  "topic_category_id": "<uuid>",
  "effective_on": "2026-07-28",
  "total": 2,
  "items": [
    {
      "selection": {
        "policy_id": "<uuid>",
        "policy_version_id": "<uuid>",
        "policy_item_id": "<uuid>",
        "scope_assignment_id": "<uuid>"
      },
      "policy": { "code": "academic-2026", "name_ar": "لائحة الشؤون الأكاديمية" },
      "version": { "number": 2, "label": "إصدار 2026" },
      "item": { "code": "4.2", "title_ar": "اعتماد الخطة الدراسية" },
      "scope": { "type": "governance_unit", "priority": 10 },
      "governance_mode": "regulation_required",
      "automation_status": "ready",
      "routing_outcome": "resolved",
      "can_start_workflow": true
    }
  ]
}
```

اعرض الخيارات كلها، حتى لو تطابقت في الفئة والمجلس والأولوية. لا تستخدم `score` أو ترتيب
المصفوفة لاختيار لائحة تلقائيًا. يمكن للواجهة اختيار الخيار الوحيد تلقائيًا عند `total=1`،
أما عند تعدد الخيارات فيلزم اختيار صريح من المستخدم.

`can_start_workflow=true` يعني أن اللائحة تملك مسارًا فعالًا صالحًا. أما
`custom_route_required` أو `policy_partially_ready` أو `blocked` فهي معلومات حالة؛ لا تخفها
من الواجهة، ولا تعاملها كمسار قابل للتنفيذ.

## إنشاء موضوع باللائحة المختارة

```text
POST /rest/v1/rpc/create_topic_with_selected_regulation
Accept-Profile: api_v1
Content-Profile: api_v1
Authorization: Bearer <access-token>
```

```json
{
  "p_title_ar": "اعتماد الخطة الدراسية للعام القادم",
  "p_description": "طلب عرض واعتماد الخطة الدراسية بعد استكمال المرفقات والمتطلبات.",
  "p_category_id": "<uuid>",
  "p_current_unit_id": "<uuid>",
  "p_policy_id": "<selection.policy_id>",
  "p_policy_version_id": "<selection.policy_version_id>",
  "p_policy_item_id": "<selection.policy_item_id>",
  "p_scope_assignment_id": "<selection.scope_assignment_id>",
  "p_priority": "medium",
  "p_source_type": "new",
  "p_title_en": null,
  "p_client_request_id": "<uuid يولده العميل مرة واحدة>"
}
```

يعيد الخادم فحص الفئة والمجلس والأولوية والمصدر وتاريخ سريان اللائحة، ثم يسجل قرار الاختيار
في السجل التدقيقي وينسخ اللائحة والمسار إلى لقطة الموضوع ويبدأ أول خطوة إن كانت النتيجة
`resolved`. فشل التحقق يتراجع عن المعاملة كاملة، لذلك لا ينشأ موضوع جزئي.

النتيجة الناجحة تتضمن `topic_id` و`decision_id` و`policy_id` و`policy_version_id` و
`policy_item_id` و`scope_assignment_id` و`routing_status`. عند وجود مسار فعال تتضمن أيضًا
`workflow_instance_id` و`current_workflow_step_id` وتكون `routing_status` مساوية
`routing_ready`.

## إعادة الإرسال والتغير المتزامن

- أنشئ `p_client_request_id` عند أول ضغط على الإرسال وأعد استخدامه عند انقطاع الشبكة.
- إذا وصل الطلب نفسه مرة ثانية، يعيد الخادم الموضوع والمسار المسجلين أصلًا مع
  `idempotent_replay=true`؛ لا يعيد ربطه باختيار جديد.
- إذا عُلقت أو انتهت اللائحة بعد تحميل القائمة وقبل الإرسال، يعيد الخادم `23514` برسالة أن
  اللائحة المختارة لم تعد مؤهلة. أعد تحميل الخيارات واطلب من المستخدم الاختيار مرة أخرى.
- لا تعتمد على أن نتائج استعراض سابقة ما زالت صالحة، ولا تحفظ الخيارات بين المؤسسات.

## العقود القديمة

`create_topic_with_workflow` و`create_topic` باقيان لتوافق المستهلكين القدامى اللذين يعتمدان
المطابقة التلقائية. لا تستخدمهما أي واجهة جديدة عندما توجد إمكانية اختيار اللائحة؛ المسار
الجديد هو الاستعراض ثم `create_topic_with_selected_regulation`.

لإظهار اللائحة والمسار بعد الإنشاء استخدم `get_topic_governance` ثم
`get_topic_workflow`. لا تقرأ جداول `qarar_governance` مباشرة.
