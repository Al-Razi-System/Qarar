# المساهمة في Qarar

<div dir="rtl">

شكرًا لاهتمامك بالمساهمة في **Qarar**. يهدف المشروع إلى بناء بنية مفتوحة وموثوقة لإدارة الحوكمة المؤسسية والمجالس والاجتماعات واللوائح والقرارات، مع اهتمام خاص بالبيئات العربية.

يرجى قراءة [مدونة السلوك](CODE_OF_CONDUCT.md) و[سياسة الأمان](SECURITY.md) قبل بدء المساهمة.

## قبل البدء

- ابحث في الـIssues المفتوحة للتأكد من أن العمل غير مكرر.
- افتح Issue قبل التغييرات الكبيرة أو المعمارية أو الأمنية.
- لا تنشر ثغرات أمنية في Issue عامة؛ اتبع `SECURITY.md`.
- اجعل كل Pull Request محدود النطاق وقابلًا للمراجعة.
- لا تضع مفاتيح API أو كلمات مرور أو بيانات مؤسسات حقيقية داخل المستودع.

## بيئة التطوير

المتطلبات الأساسية:

- Git
- Node.js وnpm
- Docker وDocker Compose
- Bash أو Git Bash/WSL لتشغيل بعض سكربتات الاختبار
- Supabase CLI عند استخدام أوامر `supabase:*`

### تشغيل البيئة محليًا

```bash
git clone https://github.com/Al-Razi-System/Qarar.git
cd Qarar
git checkout dev

npm install
cp supabase/docker/.env.example supabase/docker/.env
```

عدّل القيم الافتراضية والأسرار داخل `supabase/docker/.env` قبل التشغيل. لا تستخدم القيم الافتراضية في بيئة عامة أو إنتاجية.

```bash
npm run docker:config
npm run docker:start
npm run docker:status
```

لإيقاف البيئة:

```bash
npm run docker:stop
```

## سير العمل المقترح

1. أنشئ Fork أو فرعًا من `dev`.
2. استخدم اسم فرع واضح، مثل:
   - `feature/council-reporting`
   - `fix/tenant-isolation`
   - `docs/api-example`
   - `test/voting-concurrency`
   - `security/permission-hardening`
3. نفّذ تغييرًا واحدًا مترابطًا في كل PR.
4. أضف أو حدّث الاختبارات والتوثيق المرتبطين.
5. اربط PR بالـIssue باستخدام `Closes #123` عندما يكون ذلك صحيحًا.

## رسائل الـCommit

نفضّل رسائل قصيرة وفق Conventional Commits:

```text
feat(councils): add council status history
fix(security): prevent cross-tenant agenda access
test(voting): cover concurrent vote closure
docs(api): document minutes approval contract
```

## متطلبات Pull Request

يجب أن يوضح الوصف:

- المشكلة أو الحاجة.
- ما الذي تغير.
- أثر التغيير على المستخدمين والعقود والبيانات.
- خطة الترحيل عند تعديل قاعدة البيانات.
- الاختبارات التي تم تشغيلها.
- المخاطر والقيود والأجزاء الخارجة عن النطاق.

## بوابة الجودة

شغّل الاختبارات المرتبطة بنطاقك. من الأوامر المتاحة:

```bash
npm run docker:config
npm run test:iam-edge
npm run test:iam-http
npm run test:sprint01-http
npm run test:sprint03-http
npm run test:sprint035-http
npm run test:sprint036-http
npm run test:compatibility
npm run test:api-docs
```

تتطلب اختبارات HTTP تشغيل بيئة Docker المحلية وإعداد الأسرار اللازمة.

لا يُعد التغيير مكتملًا عندما يمس قاعدة البيانات أو عقود API إلا بعد:

- إضافة Migration آمن وقابل للتكرار.
- حماية العزل بين المؤسسات.
- تطبيق RLS والصلاحيات المناسبة.
- إضافة اختبارات Cross-Tenant.
- إضافة اختبارات التزامن وRollback وIdempotency عند الحاجة.
- تحديث سجل عقود `api_v1` ووثائق الواجهة.
- المحافظة على توافق الهجرة والواجهات المعلنة.

## معايير مراجعة الكود

يركز المراجعون على:

- صحة منطق الحوكمة ودورات الحالات.
- عزل المؤسسات ومنع تسرب البيانات.
- أقل صلاحية ممكنة.
- سلامة Migrations والبيانات القائمة.
- العقود الثابتة وقابلية التكامل.
- الاختبارات، الوضوح، وقابلية الصيانة.
- عدم تحويل مخرجات الذكاء الاصطناعي إلى قرار أو اعتماد تلقائي.

## التوثيق واللغة

- التوثيق العربي مرحب به وهو جزء أساسي من المشروع.
- أضف مصطلحات إنجليزية عند الحاجة للتكامل التقني.
- حافظ على اتساق المصطلحات مع القاموس والوثائق الموجودة في `docs/`.
- حدّث أمثلة API عند تغيير أي عقد.

## الترخيص

بإرسال مساهمة إلى هذا المستودع، فإنك توافق على ترخيص مساهمتك وفق [Apache License 2.0](LICENSE)، ما لم يُتفق كتابيًا على غير ذلك.

</div>
