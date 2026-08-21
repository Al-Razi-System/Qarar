# دليل تهيئة المدير الأول

هذا الإجراء هو المسار الوحيد المراجع لإنشاء أول مدير نظام لمؤسسة في Qarar بعد احتواء المرحلة 0. لا توجد شاشة تسجيل ذاتي، ولا يجوز استدعاء عقد bootstrap من المتصفح أو تطبيق العميل.

## الحد الأمني

العقد الخادمي `service_bootstrap_organization_admin` يقبل الطلب فقط إذا تحققت جميع الشروط التالية داخل معاملة واحدة. تنفذه هوية IAM خادمية غير قابلة للدخول، ولا يمكن الوصول إليه إلا من واجهة `api_v1` ذات دور الخدمة:

- المؤسسة موجودة وحالتها `active`.
- لا يوجد أي ملف مستخدم في المؤسسة، بصرف النظر عن حالته أو صلاحياته.
- هوية Auth المطلوبة موجودة، بريدها مؤكد، غير محظورة، وبريدها مطابق للبريد المعتمد.
- هوية Auth لا تملك ملفًا في أي مؤسسة أخرى.
- مرجع موافقة خارجي بصيغة تذكرة صارمة وطول من 8 إلى 128 محرفًا.
- لا يمكن اختيار الصلاحية من المدخلات: الحساب الناتج يكون فقط `is_system_admin=true`.

يقفل الإجراء المؤسسة بقفل معاملات استشاري، ويسجل حدثي تدقيق واضحين `iam.bootstrap.admin.requested` و`iam.bootstrap.admin.completed`. لا توجد إعادة محاولة تلقائية، ولا يسمح المسار بإضافة مدير ثانٍ أو استعادة مدير قائم.

## المتطلبات السابقة

1. انشر الترحيل `20260816070000_initial_admin_bootstrap.sql` واختبارات الإصدار في بيئة مماثلة للإنتاج أولًا. لا تطبق هذا الدليل من محطة مطور عادية.
2. أنشئ المؤسسة مسبقًا وتحقق من أنها فعالة ولا تحتوي أي ملف في `qarar_iam.users`.
3. أنشئ هوية Auth خارج هذا السكربت عبر عملية إدارة هوية معتمدة، وأثبت ملكية البريد بتأكيده. السكربت لا ينشئ كلمات مرور أو دعوات أو مستخدمي Auth.
4. افتح تذكرة تغيير بموافقتين منفصلتين على الأقل: مالك المؤسسة ومشغّل المنصة. استخدم رقم التذكرة كـ`approval_reference`؛ الصيغة المسموحة هي أحرف/أرقام ثم `.`, `_`, `:`, `/`, `-` بطول 8–128.
5. شغّل العملية من مضيف إداري محمي، عبر HTTPS، مع مفتاح `service_role` مركب كملف سرّي. لا تضع المفتاح في ملف JSON أو في سطر الأوامر أو في سجل الطرفية.

إذا كانت SSO متوقفة بانتظار تحقق موثوق، فلا تعِد تفعيلها لأجل هذه الخطوة. أنشئ هوية Auth المؤكدة بعملية المنصة المعتمدة فقط.

## ملف طلب غير سرّي

انسخ القالب [initial-admin-bootstrap.example.json](../deploy/production/initial-admin-bootstrap.example.json) إلى مسار محمي خارج المستودع، واستبدل القيم. لا تضف أي حقول أخرى ولا تضع أسرارًا فيه.

```json
{
  "organization_code": "university_a",
  "auth_user_id": "00000000-0000-4000-8000-000000000000",
  "email": "first.admin@university.example",
  "full_name_ar": "المدير الأول",
  "full_name_en": "First Administrator",
  "employee_no": "EMP-001",
  "mobile": "+966500000000",
  "job_title": "Platform Administrator",
  "approval_reference": "CHG-20260816-001"
}
```

## التنفيذ

لا تمرر المفتاح كوسيط. استخدم ملف أسرار مثبتًا بصلاحية قراءة للمشغّل فقط. المثال التالي لا يطبع أي قيمة سرية:

```powershell
$bootstrapConfig = 'C:\secure\qarar\initial-admin-bootstrap.json'
$bootstrap = Get-Content -LiteralPath $bootstrapConfig -Raw | ConvertFrom-Json

$env:QARAR_SUPABASE_URL = 'https://api.example.gov'
$env:QARAR_SUPABASE_SERVICE_ROLE_KEY_FILE = 'C:\run\secrets\qarar_service_role_key'
$env:QARAR_BOOTSTRAP_APPROVED = 'true'
$env:QARAR_BOOTSTRAP_APPROVAL_ID = $bootstrap.approval_reference

$confirmation = "BOOTSTRAP $($bootstrap.organization_code) $($bootstrap.auth_user_id) $($bootstrap.approval_reference)"
npm run prod:bootstrap-initial-admin -- --config $bootstrapConfig --confirm $confirmation --dry-run
```

`--dry-run` يتحقق من ملف الطلب، الموافقة، والهوية المؤكدة في Auth، لكنه لا يحجز المؤسسة ولا يستبدل فحص قاعدة البيانات الذري. بعد مراجعة ناتج الخطة المقنع فقط، احذف `--dry-run` ونفذ الأمر نفسه مرة واحدة:

```powershell
npm run prod:bootstrap-initial-admin -- --config $bootstrapConfig --confirm $confirmation
```

يتطلب السكربت في كل تشغيل:

- `QARAR_BOOTSTRAP_APPROVED=true`.
- `QARAR_BOOTSTRAP_APPROVAL_ID` مطابقًا حرفيًا لـ`approval_reference`.
- عبارة `--confirm` المطابقة حرفيًا لـ`BOOTSTRAP <organization_code> <auth_user_id> <approval_reference>`.
- `QARAR_SUPABASE_URL` كأصل HTTPS فقط، بلا مسار أو بيانات اعتماد مضمنة.
- أحد المصدرين فقط للمفتاح: `QARAR_SUPABASE_SERVICE_ROLE_KEY_FILE` (المفضل) أو `QARAR_SUPABASE_SERVICE_ROLE_KEY` المحقون من مخزن أسرار.

لا تعالج رسالة فشل عامة بإعادة المحاولة العمياء. راجع التذكرة، حالة المؤسسة، هوية Auth، وسجل التدقيق أولًا.

## التحقق بعد النجاح

1. سجّل دخول المدير الأول من قناة Auth المعتمدة، وتحقق من أن حسابه في المؤسسة الصحيحة فقط.
2. راجع حدثي التدقيق أعلاه وتطابق `approval_reference`، ثم شغّل `npm run prod:permissions-audit` واحفظ التقرير خارج Git.
3. استخدم مسارات إدارة المستخدمين العادية لإنشاء الحسابات اللاحقة؛ لا تستخدم سكربت bootstrap مرة ثانية.
4. أزل متغيرات الموافقة وملف المفتاح من جلسة التشغيل أو أوقف المهمة قصيرة العمر، ثم دوّن النتيجة في تذكرة التغيير.

## الإخفاق والاستعادة

إذا فقد المدير الأول إمكانية الدخول، أو كانت المؤسسة تحتوي ملفًا خاطئًا، لا تعدّل `qarar_iam.users` أو `auth.users` يدويًا ولا تفتح التسجيل العام. هذا حادث وصول متميز يحتاج إجراء break-glass منفصلًا، بموافقتين، ومراجعة أمنية، وترحيل/تصحيح أمامي مخصص. يظل هذا المسار مقفلاً عمدًا أمام المؤسسات التي لها أي ملف مستخدم.
