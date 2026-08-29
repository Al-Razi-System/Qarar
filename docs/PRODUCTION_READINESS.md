# جاهزية منصة قرار للإنتاج

هذه الوثيقة بوابة تشغيل وليست إعلانًا تلقائيًا بأن البيئة إنتاجية. لا يتم النشر إلا بعد نجاح الأدلة أدناه واعتماد مسؤول الأمن ومالك النظام.

## بوابات إلزامية

1. **الأسرار والبيئة:** انسخ `deploy/production/.env.production.example` إلى مخزن أسرار مشفّر، ثم شغّل `node scripts/validate-production-env.mjs <path>`. يمنع الفاحص HTTP، القيم الافتراضية، التسجيل العام، والتأكيد التلقائي. يجب أن يطابق `SITE_URL` قيمة `APP_ORIGIN` حرفيًا، وأن يكون `API_EXTERNAL_URL` عنوان HTTPS canonical للمسار الدقيق `/auth/v1`.
2. **الجودة والأمن:** شغّل اختبارات قاعدة البيانات و`npm audit --omit=dev --audit-level=high`، ثم `npm run prod:security-audit` ضد نسخة Production التجريبية.
3. **الصلاحيات:** قبل تطبيق `20260816080000_iam_authority_provenance_boundary.sql` شغّل فحص القراءة فقط وفق [دليل احتواء مصدر سلطة IAM](./IAM_AUTHORITY_PROVENANCE_RUNBOOK.md)، ويجب أن تكون `blocking_rows=0`. ثم شغّل `npm run prod:permissions-audit`. راجع الملفين داخل `.production-reports` ووقّع مراجعة كل مدير نظام ودور مرتفع الحساسية. للتنفيذ الصارم استخدم `PERMISSIONS_STRICT=true`.
4. **الأداء:** شغّل اختبار قراءة غير هدّام: `LOAD_BASE_URL=https://... LOAD_CONCURRENCY=25 LOAD_REQUESTS=1000 npm run prod:load-smoke`. الحد الافتراضي: أخطاء ≤1% وP95 ≤750ms.
5. **النسخ والاستعادة:** شغّل `npm run prod:backup` ثم `npm run prod:restore-drill` و`npm run prod:storage-backup-drill`. الاختبار يستعيد قاعدة مؤقتة، ويشفّر كل كائن Storage، وفي البيئة المعزولة يحذف مرفق تحقق مولدًا ثم يستعيده ويحمله ويطابق SHA-256. انشر الحزمة عبر `npm run prod:publish-backup-offsite` إلى حساب منفصل مع KMS وObject Lock.
6. **المرفقات الخبيثة:** شغّل `node --test scripts/upload-malware-scan-production-config.test.mjs` وتحقق من صحة `clamav` بعد `up --wait`. لا يكون النشر جاهزًا إذا غابت قواعد التواقيع أو فشل الماسح؛ راجع [دليل فحص المرفقات](./UPLOAD_MALWARE_SCANNING_RUNBOOK.md).
7. **المراقبة الخارجية:** ولّد إعداد Alertmanager خارج المستودع عبر `npm run prod:render-monitoring` بعد حقن `QARAR_ALERT_WEBHOOK_URL` و`QARAR_ALERT_WEBHOOK_TOKEN`. نفّذ تنبيهًا اصطناعيًا في staging وأثبت وصوله إلى فريق التشغيل. يجمع Loki سجلات JSON، ويراقب Prometheus التطبيق وAuth وقاعدة البيانات عبر Blackbox/Postgres exporters. غياب قناة التنبيه الحقيقية أو عدم وصول الاختبار يعني **No-Go**.

## دليل المراقبة والتصعيد

- لا تُنشر Prometheus أو Alertmanager أو Loki أو exporters على منفذ عام؛ تكون شبكة `monitoring` داخلية فقط.
- يجب أن تستخدم السجلات حقول `timestamp`, `level`, `event`, `requestId` وألا تحتوي بريدًا أو token أو payload حساسًا.
- التنبيهات الحرجة المطلوبة تشغيليًا: توقف dashboard/Auth/DB، ارتفاع 5xx أو P95، تراكم/dead-letter في Outbox، فشل webhook/SMTP، غياب أو فشل Cron، تقادم آخر نسخة ناجحة، ومحاولات login/SSO الشاذة.
- فحوص Outbox/Cron والنسخ تصدر أحداثًا/تقارير تشغيل، وعلى منصة المراقبة تحويل أي فشل أو تقادم إلى alert. لا يكفي وجود rule دون اختبار وصول alert إلى المناوب.
- احتفظ بالسجلات 30 يومًا على الأقل حسب التصنيف، واضبط قناة بديلة وتصعيدًا عند عدم acknowledgment.

## روابط Auth وإعادة التوجيه

`ADDITIONAL_REDIRECT_URLS` قائمة مفصولة بفواصل لعناوين HTTPS كاملة وcanonical فقط. لا تقبل
الروابط wildcard أو بيانات اعتماد ضمن الرابط أو query/fragment أو صيغًا بديلة مثل المنفذ الافتراضي
`443`. يجب أن يكون مصدر كل رابط موجودًا حرفيًا في `ALLOWED_ORIGINS`، وأن تحتوي القائمة على
`${APP_ORIGIN}/auth/callback` بالقيمة الفعلية؛ يمكن إدراج مسارات تطبيق ثابتة أخرى عند الحاجة، مثل
`/auth/reset`، بشرط أن تظل عناوين كاملة دقيقة على مصدر مسموح. لا تُنشئ هذه القائمة من إدخال مستخدم
ولا توسعها لتشمل نطاقات خارجية دون مراجعة أمنية.

شغّل بوابة هذه السياسة محليًا قبل النشر:

```sh
node --test scripts/auth-redirect-production-config.test.mjs
node scripts/validate-production-env.mjs /secure/qarar.env
```

## تشغيل Production

```sh
docker compose --env-file /secure/qarar.env \
  -f supabase/docker/docker-compose.yml \
  -f deploy/production/docker-compose.production.yml config
docker compose --env-file /secure/qarar.env \
  -f supabase/docker/docker-compose.yml \
  -f deploy/production/docker-compose.production.yml up -d --build --wait
```

جميع المنافذ الحساسة مرتبطة بـ`127.0.0.1` أو غير منشورة. يجب وضع Reverse Proxy/WAF بإنهاء TLS أمام لوحة التحكم وKong، ومنع الوصول العام إلى Studio وMetrics وقاعدة البيانات.

## شرط حافة الدخول وحماية محاولات تسجيل الدخول

لا تعتمد المنصة على `X-Forwarded-For` القادم من العميل. قبل تشغيل الإنتاج، يجب أن يكون الـReverse Proxy الوحيد الذي يصل إلى منفذي لوحة التحكم وKong المحليين هو الذي **يمسح ويستبدل** الرأس الداخلي `X-Qarar-Client-IP` بعنوان العميل الذي تحقّق منه. يغلق مسار تسجيل الدخول بـ`503` إن غاب الرأس أو كان غير عنوان IP صالح؛ وهذا مقصود لمنع تحول الحماية إلى عداد مشترك أو قابل للتزوير.

مثال Nginx (استبدل نطاقات الموازن الموثوق بها بالقيم الفعلية؛ لا تضف نطاقات عامة):

```nginx
# فقط عند وجود CDN/LB موثوق أمام Nginx.
set_real_ip_from 10.0.0.0/8;       # نطاق الموازن الداخلي الفعلي فقط
real_ip_header X-Forwarded-For;
real_ip_recursive on;

# داخل كتلة الخادم الخاصة بلوحة التحكم:
location / {
    # يعيد كتابة أي قيمة أرسلها العميل ولا يمررها كما هي.
    proxy_set_header X-Qarar-Client-IP $remote_addr;
    proxy_set_header Host $host;
    proxy_pass http://127.0.0.1:3000;
}

# داخل كتلة خادم الـAPI/Kong المنفصلة: أعد استخدام الرأس نفسه، مع upstream Kong.
location / {
    proxy_set_header X-Qarar-Client-IP $remote_addr;
    proxy_set_header Host $host;
    proxy_pass http://127.0.0.1:54321;
}
```

تستخدم لوحة التحكم عدادات Redis مشتركة بمفاتيح HMAC للبريد والـIP، إضافة إلى سقف عام، لذلك لا تحفظ أو تسجل هذه القيم الخام. Redis غير منشور على مضيف الشبكة، محمي بكلمة مرور، ويحتفظ فقط بعدادات قصيرة العمر عبر AOF؛ تنتهي المفاتيح تلقائيًا بواسطة TTL. يضيف Kong سقفًا Redis مشتركًا لمسار `/auth/v1/token` حتى لا يُتجاوز الحد باستدعاء GoTrue مباشرة. يجب أن تبقى متغيرات `QARAR_LOGIN_RATE_LIMIT_*` صالحة في فاحص البيئة قبل النشر.

## فحص المرفقات قبل التخزين

يرسل BFF للوحة التحكم المرفقات المقبولة مبدئيًا إلى sidecar ClamAV الداخلي عبر بروتوكول TCP محلي، ثم يكتب فقط نتيجة `Clean` في bucket الخاص. لا يوجد URL فحص خارجي ولا منفذ ClamAV منشور. في الإنتاج تكون `QARAR_UPLOAD_SCAN_*` إلزامية ويعيد التطبيق `503` عند عطل الماسح بدل تخزين ملف غير مفحوص. تحدد إجراءات الشبكة وعمر قاعدة التواقيع واختبار EICAR المصرح به في [دليل فحص المرفقات](./UPLOAD_MALWARE_SCANNING_RUNBOOK.md).

## سياسة النسخ والتعافي

- نسخة كاملة يومية مشفرة، وWAL/PITR كل 5 دقائق إن وفّرها مشغّل البنية.
- الاحتفاظ: 7 يومية، 4 أسبوعية، 12 شهرية، ونسخة خارج الموقع/الحساب.
- الهدف التشغيلي: `RPO ≤ 15 دقيقة` و`RTO ≤ 4 ساعات`، ويعدّل بعد اختبار واقعي.
- تمرين استعادة شهري مع توثيق الحجم والمدة ونتيجة فحص المستخدمين واللوائح والمرفقات.
- ملف النسخة وSHA-256 لا يدخلان Git؛ انقلهما فورًا إلى تخزين مشفر غير قابل للتعديل.
- يرفض فاحص الإنتاج غياب bucket خارج الحساب أو KMS مؤسسي أو retention أقل من 30 يومًا. أداة النشر تستخدم SSE-KMS وObject Lock بوضع `COMPLIANCE`، ولا تقبل مفتاحًا محليًا ثابتًا كبديل عن KMS.
- يحفظ تمرين Storage تقرير `.production-reports/storage-recovery.json` وفيه عدد الكائنات والحجم ومدة النسخ ومدة الاستعادة وRPO المقاس ونتيجة تنزيل المرفق المستعاد. تقارن النتائج بالأهداف `RPO ≤ 15 دقيقة` و`RTO ≤ 4 ساعات` قبل توقيع Go.

## مراجعة الصلاحيات

- مراجعة شهرية للحسابات النشطة، وكل 90 يومًا للأدوار العادية، وفورية عند تغيير الوظيفة أو المغادرة.
- إبقاء 1–3 مديري نظام نشطين، ومنع أي عضوية نشطة لحساب معطل أو دور متوقف.
- حساب المراجع مستقل عن المنشئ/المعتمد، ولا تستخدم حسابات مشتركة.
- تدوين الاستثناءات بتاريخ انتهاء ومالك ومبرر، وإلغاء الوصول فور انتهاء الحاجة.

## النشر والرجوع

1. خذ نسخة واختبر سلامتها قبل الترحيل.
2. شغّل الترحيلات واختبارات العقود على نسخة مطابقة للإنتاج.
3. انشر بصورة immutable تحمل SHA للالتزام، ثم نفّذ health/security/load smoke.
4. راقب الأخطاء وP95 ومعدل الدخول الفاشل مدة 30 دقيقة.
5. عند الفشل أوقف حركة المرور، أعد صورة التطبيق السابقة، ولا تعكس ترحيلًا هادمًا؛ استخدم forward-fix أو استعادة معتمدة.

## قرار Go/No-Go

قرار **Go** يحتاج: جميع وظائف CI خضراء، صفر ثغرات High/Critical غير مقبولة، استعادة ناجحة حديثة، اختبار تحميل ناجح، ومراجعة صلاحيات موقعة. خلاف ذلك القرار **No-Go** حتى إغلاق الملاحظة أو قبول خطر رسمي محدود المدة.
