# تقرير جاهزية الإنتاج — 2026-08-20

## القرار الحالي

**No-Go للإطلاق النهائي حتى الآن.** أُغلقت ثغرات وظيفية وأمنية كبيرة وأصبحت بوابات البناء وقاعدة البيانات والتعافي والمراقبة معرفة في المستودع، لكن مساحة العمل الحالية غير نظيفة، ولا يوجد commit مرشح خضع لـCI كامل، كما لم تُحقن أسرار staging الحقيقية ولم يصل تنبيه اصطناعي إلى فريق التشغيل.

## الأدلة المثبتة في مساحة العمل

| المجال | الحالة | الدليل |
|---|---:|---|
| TypeScript للوحة التحكم | ناجح | `npm --prefix dashboard run typecheck` في 2026-08-20 |
| تكوين Compose الإنتاجي | ناجح ساكنًا | خدمات التطبيق والمراقبة الست تُحل دون متغيرات Compose مفقودة |
| مراقبة availability/latency/DB | جاهزة للربط | Prometheus + Blackbox + Postgres exporter + Alertmanager، بلا منافذ عامة |
| تجميع السجلات | جاهز للربط | Promtail إلى Loki، retention 30 يومًا وشبكة داخلية |
| قناة التنبيه | غير مثبتة خارجيًا | renderer يرفض HTTP/token القصير، لكن يلزم webhook حقيقي واختبار وصول |
| SBOM وcontainer scan | معرفة في CI | Anchore SBOM وTrivy High/Critical على صورة SHA |
| الصورة immutable | مشروطة | لا تُنشر GHCR إلا من tag `v*` وبعد نجاح الوظائف الثلاث |
| حالة المستودع | مانع إطلاق | أكثر من 200 مسار معدل/غير متتبع عند الفحص؛ لا commit مرشح |
| Docker runtime محلي | غير متاح | Docker Desktop daemon متوقف، لذلك لم يُعد تشغيل الصورة/stack في هذه الدورة |

## بوابات ما زالت إلزامية قبل Go

1. مراجعة التغييرات وتقسيمها إلى commits منطقية بواسطة مالكي المجالات، ثم code review مستقل.
2. تشغيل workflow `Production Readiness` كاملًا على SHA المرشح؛ لا يكفي نجاح أوامر متفرقة محليًا.
3. تشغيل صورة Production خلف reverse proxy الحقيقي واختبار login وinvite/activate/reset/MFA من المتصفح.
4. تنفيذ SMTP وnotification webhook حقيقيين في staging، وإثبات وصول alert اصطناعي إلى قناة فريق التشغيل.
5. تنفيذ EICAR المصرح به، وحدود Storage للحجم/quota/timeout، واختبارات load لمسارات login وRPC والرفع لا health فقط.
6. UAT بحسابات وأدوار حقيقية مع إثبات العزل والاعتماد المزدوج وoffboarding.
7. تشغيل SAST وTrivy وSBOM ومراجعة النتائج؛ أي High/Critical غير مقبول يحتاج إصلاحًا أو قبول خطر رسمي مؤقت.
8. بعد خضرة كل ما سبق فقط: إنشاء tag موقّع `vX.Y.Z`؛ تنشر CI صورة GHCR تحمل tag وSHA وprovenance/SBOM.

## تقسيم commits المقترح

1. `security/iam-database`: ترحيلات الاحتواء، حدود authority، العقود وpgTAP.
2. `auth/account-lifecycle`: activation/recovery/MFA/SSO-disabled وE2E.
3. `operations/outbox-backup`: dispatcher وCron والنسخ/Storage والاستعادة.
4. `dashboard/admin`: واجهات الإدارة والطلبات والجلسات والحوكمة.
5. `platform/hardening`: rate limit، upload scan، CORS/CSRF، production Compose.
6. `observability/release`: Prometheus/Loki/Alertmanager، CI، SBOM/Trivy وتقارير الجاهزية.

لا يُنصح بعمل commit شامل واحد؛ سيصعب التدقيق والرجوع وتحديد مصدر أي regression.
