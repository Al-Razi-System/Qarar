# تطبيق حزمة Open Source Readiness على Qarar

هذه الحزمة أُعدت لاستبدال `README.md` وإضافة:

- `LICENSE`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`

## تنبيه قانوني

قبل الدمج النهائي، يجب أن يؤكد مالك المستودع أو المنظمة أن:

1. منظمة `Al-Razi-System` تملك حق ترخيص الكود والتوثيق.
2. لا توجد أجزاء منسوخة من مشاريع أخرى بترخيص غير متوافق.
3. اختيار Apache License 2.0 مقبول للجهة والمؤسسة.
4. أي شعارات أو علامات تجارية لا يمنح الترخيص حق استخدامها خارج الحدود القانونية.

## التطبيق عبر Git

ضع الملفات الخمسة في جذر المستودع، ثم نفّذ:

```bash
git checkout dev
git pull origin dev
git checkout -b docs/open-source-readiness

git add README.md LICENSE CONTRIBUTING.md SECURITY.md CODE_OF_CONDUCT.md
git commit -m "docs: prepare Qarar for open-source contributions"
git push -u origin docs/open-source-readiness
```

بعد ذلك افتح Pull Request إلى `dev`.

## الفحوصات المقترحة

```bash
npm install
npm run docker:config
npm run test:api-docs
npm run test:compatibility
```

لأن التغييرات توثيقية، قد لا تتطلب تشغيل جميع اختبارات التكامل، لكن يجب التأكد من عدم وجود روابط داخلية مكسورة.

## لقطات الواجهة

لم تُضف صور وهمية. README يوضح أن لوحة الإدارة قيد الدمج في PR #126 وأن الصور يجب إضافتها بعد اعتماد الواجهة. عند توفر الصور، ضعها داخل:

```text
docs/assets/screenshots/
```

ثم حدّث قسم "لقطات الواجهة".

## ملاحظة عن تكامل GitHub

تمت محاولة إنشاء فرع تلقائيًا، لكن تكامل GitHub أعاد `403 Resource not accessible by integration`. لذلك لم تُكتب أي تغييرات مباشرة إلى المستودع ولم يُفتح PR تلقائيًا.
