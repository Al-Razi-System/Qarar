# دليل تشغيل منصة قرار والترحيلات

هذا الدليل مخصص لتشغيل المنصة على جهاز تطوير جديد، وفهم آلية ترحيلات قاعدة البيانات، وإضافة ترحيل جديد واختباره بأمان.

## 1. المتطلبات

- Git.
- Docker Desktop وDocker Compose v2.
- Node.js 22 أو أحدث وnpm.
- PowerShell 7 على Windows.
- Bash أو Git Bash أو WSL لتشغيل سكربتات Shell مباشرة.
- ذاكرة مناسبة لـDocker؛ يوصى بـ8 GB على الأقل للبيئة الكاملة.

تحقق من الأدوات:

```bash
git --version
docker --version
docker compose version
node --version
npm --version
```

## 2. تنزيل النسخة

```bash
git clone https://github.com/Al-Razi-System/Qarar.git
cd Qarar
git checkout codex/production-ready-v1
```

لتحديث النسخة لاحقًا:

```bash
git checkout codex/production-ready-v1
git pull --ff-only origin codex/production-ready-v1
```

## 3. إعداد متغيرات البيئة المحلية

على Linux أو macOS أو Git Bash:

```bash
cp supabase/docker/.env.example supabase/docker/.env
```

على PowerShell:

```powershell
Copy-Item supabase/docker/.env.example supabase/docker/.env
```

افتح `supabase/docker/.env` وغيّر القيم التجريبية، خصوصًا:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `ANON_KEY`
- `SERVICE_ROLE_KEY`
- عناوين `SITE_URL` و`API_EXTERNAL_URL`
- مفاتيح البريد أو الذكاء الاصطناعي إذا كانت الميزة مطلوبة

لا ترفع ملف `.env` إلى Git. الملف متجاهل عمدًا.

## 4. تثبيت التبعيات

```bash
npm ci
npm --prefix dashboard ci
```

استخدم `npm ci` عند تشغيل نسخة ملتزمة لأنه يعتمد على lockfile ويعطي تثبيتًا قابلًا للتكرار.

## 5. فحص Docker Compose قبل التشغيل

```bash
npm run docker:config
```

يجب أن ينتهي الأمر دون أخطاء متغيرات مفقودة. هذا الأمر لا يشغل الخدمات.

## 6. تشغيل المنصة محليًا

```bash
npm run docker:pull
npm run docker:start
npm run docker:status
```

راقب خدمة الترحيلات:

```bash
docker compose --env-file supabase/docker/.env -f supabase/docker/docker-compose.yml logs -f db-migrate
```

عند النجاح ستنتهي خدمة `db-migrate` برمز خروج صفر، ثم تبدأ الخدمات المعتمدة عليها.

شغّل لوحة الإدارة في وضع التطوير:

```bash
npm --prefix dashboard run dev
```

أو اختبر صورة الإنتاج للوحة:

```bash
npm --prefix dashboard run build
npm --prefix dashboard run start
```

## 7. كيف تعمل الترحيلات؟

ملفات الترحيل موجودة داخل:

```text
supabase/migrations/
```

وتُنفذ بالترتيب الأبجدي، لذلك يبدأ اسم كل ملف بطابع زمني:

```text
YYYYMMDDHHMMSS_description.sql
```

مثال:

```text
20260816140000_topic_meeting_integrity_closure.sql
```

خدمة `db-migrate` تشغل:

```text
supabase/docker/qarar/apply-migrations.sh
```

المشغل يقوم بالآتي:

1. يأخذ advisory lock لمنع مشغلين من تطبيق الترحيلات في الوقت نفسه.
2. يتحقق من صلاحيات مستخدم الترحيل وإصدار PostgreSQL.
3. ينشئ سجل `qarar_internal.applied_migrations` إن لم يكن موجودًا.
4. يتحقق أن كل ترحيل مسجل في القاعدة ما زال موجودًا في الإصدار.
5. يحسب SHA-256 لكل ملف.
6. يرفض التشغيل إذا تغيّر محتوى ترحيل سبق تطبيقه.
7. يطبق الترحيل الجديد وإدخال السجل في معاملة واحدة.
8. يطبق seed في التطوير فقط عندما `QARAR_APPLY_SEED=true`.

إعداد الإنتاج يفرض:

```text
QARAR_APPLY_SEED=false
```

## 8. معرفة الترحيلات المطبقة

```bash
docker exec qarar-supabase-db psql -U supabase_admin -d postgres -c "select version, checksum_sha256, applied_at from qarar_internal.applied_migrations order by version;"
```

معرفة آخر ترحيل:

```bash
docker exec qarar-supabase-db psql -U supabase_admin -d postgres -Atc "select version from qarar_internal.applied_migrations where version <> 'seed' order by version desc limit 1;"
```

معرفة عدد عقود API:

```bash
docker exec qarar-supabase-db psql -U supabase_admin -d postgres -c "select count(*) as registry_count from qarar_architecture.api_contract_registry; select api_version,contract_count,contract_hash from qarar_architecture.api_release_registry;"
```

في هذه النسخة يجب أن يكون العدد النهائي `200` ومتطابقًا بين السجل وإصدار API.

## 9. إضافة ترحيل جديد

لا تعدّل ترحيلًا سبق تطبيقه. أنشئ ملفًا جديدًا بطابع زمني أعلى من آخر ملف.

PowerShell:

```powershell
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
New-Item "supabase/migrations/${stamp}_short_description.sql"
```

Bash:

```bash
touch "supabase/migrations/$(date +%Y%m%d%H%M%S)_short_description.sql"
```

قواعد الترحيل:

- اجعله ذرّيًا وقابلًا للفشل المغلق.
- لا تضف `BEGIN` أو `COMMIT`؛ المشغل يضع الملف داخل معاملة.
- استخدم schema مؤهلًا مثل `qarar_topics.topics`.
- استخدم `CREATE OR REPLACE FUNCTION` عند إعادة تعريف دالة.
- اسحب صلاحيات `PUBLIC`, `anon`, `authenticated`, و`service_role` من الدوال الداخلية.
- امنح التنفيذ فقط للدور أو wrapper المطلوب.
- سجل العقد الجديد في `qarar_architecture.api_contract_registry` إذا كان ضمن `api_v1`.
- حدّث `api_release_registry` بطريقة ديناميكية إذا تغيرت العقود.
- أضف اختبار pgTAP جديدًا.
- لا تغيّر checksum لترحيل تاريخي مطبق.

## 10. تطبيق ترحيلات جديدة على البيئة المحلية

الطريقة المفضلة هي إعادة تشغيل خدمة الترحيل:

```bash
docker compose --env-file supabase/docker/.env -f supabase/docker/docker-compose.yml run --rm db-migrate
```

ثم راجع السجل:

```bash
docker compose --env-file supabase/docker/.env -f supabase/docker/docker-compose.yml logs --tail=200 db-migrate
```

لا تطبق ملف SQL يدويًا في الإنتاج؛ التطبيق اليدوي لا يضمن تسجيل checksum بنفس آلية المشغل.

## 11. تشغيل pgTAP

تشغيل اختبار واحد:

```bash
docker exec qarar-supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f /dev/stdin < supabase/tests/database/46_topic_meeting_integrity_closure_test.sql
```

على PowerShell:

```powershell
Get-Content -Raw supabase/tests/database/46_topic_meeting_integrity_closure_test.sql |
  docker exec -i qarar-supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1
```

تشغيل الاختبارات 33 إلى 46 على PowerShell:

```powershell
Get-ChildItem supabase/tests/database/*.sql |
  Where-Object { $_.BaseName -match '^(3[3-9]|4[0-6])_' } |
  Sort-Object Name |
  ForEach-Object {
    Write-Host "Running $($_.Name)"
    Get-Content -Raw $_.FullName |
      docker exec -i qarar-supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) { throw "Failed: $($_.Name)" }
  }
```

## 12. اختبار قاعدة فارغة

نفذ هذا الاختبار في بيئة معزولة فقط؛ لا تستخدم قاعدة تحتوي بيانات مهمة.

المسار المعتاد في CI هو تشغيل Docker volumes جديدة ثم تشغيل `db-migrate`. نجاح هذا الاختبار يعني أن جميع الملفات قابلة للتطبيق بالترتيب دون اعتماد مخفي على قاعدة قديمة.

لا تستخدم `docker compose down -v` على بيئة فيها بيانات مطلوبة؛ الخيار `-v` يحذف volumes.

## 13. اختبار ترقية قاعدة تحتوي بيانات

السكربت:

```text
supabase/tests/migration-upgrade-rehearsal.sh
```

يبني حالة قديمة، يضيف بيانات اختبار، ثم يطبق الترحيلات اللاحقة ويتحقق من بقاء البيانات والعقود. شغله فقط داخل CI أو Compose project معزول لأنه مخصص لاختبار الترقية وليس لقاعدة التطوير اليومية.

قبل ترقية أي بيئة حقيقية:

1. أنشئ نسخة احتياطية مشفرة.
2. تحقق من hash والـmanifest.
3. جرّب الاستعادة في بيئة معزولة.
4. شغّل فحص migration drift.
5. طبّق الترحيلات.
6. تحقق من العقود والـOutbox والـCron.
7. نفذ smoke tests للـlogin والموضوع والاجتماع.

## 14. فحوص ما قبل النشر

```bash
npm run test:docs-encoding
npm run test:compatibility
npm --prefix dashboard run typecheck
npm --prefix dashboard run lint -- --quiet
npm --prefix dashboard run test:run
npm --prefix dashboard run build
```

فحوص الإنتاج تحتاج ملف بيئة إنتاج فعليًا غير ملتزم:

```bash
cp deploy/production/.env.production.example deploy/production/.env.production
npm run prod:validate-env -- deploy/production/.env.production
```

لا تستخدم قيم القالب كما هي.

## 15. تشغيل Compose للإنتاج

بعد تجهيز `deploy/production/.env.production` والتحقق منه:

```bash
docker compose \
  --env-file deploy/production/.env.production \
  -f supabase/docker/docker-compose.yml \
  -f deploy/production/docker-compose.production.yml \
  config
```

ثم، على خادم staging أو production المصرح:

```bash
docker compose \
  --env-file deploy/production/.env.production \
  -f supabase/docker/docker-compose.yml \
  -f deploy/production/docker-compose.production.yml \
  up -d
```

## 16. النسخ والاستعادة

اختبار وحدة التشفير:

```bash
npm run test:backup-crypto
```

إنشاء نسخة وفق إعدادات التشغيل:

```bash
npm run prod:backup
```

اختبار الاستعادة:

```bash
npm run prod:restore-drill
```

فحص Storage:

```bash
npm run prod:storage-backup-drill
```

لا يكفي وجود ملف backup؛ يجب تنفيذ restore drill وقياس RPO/RTO دوريًا.

## 17. إيقاف البيئة

```bash
npm run docker:stop
```

هذا يوقف الحاويات دون طلب حذف volumes في أمر المشروع.

## 18. مشاكل شائعة

### خدمة `db-migrate` فشلت

```bash
docker compose --env-file supabase/docker/.env -f supabase/docker/docker-compose.yml logs --tail=300 db-migrate
```

ابحث عن أول `ERROR`، وليس آخر خدمة توقفت بسبب dependency.

### Checksum mismatch

يعني أن ملف ترحيل مطبق تغير بعد تطبيقه. أعد الملف إلى نسخته الأصلية وأنشئ ترحيلًا تكميليًا جديدًا. لا تعدّل قيمة checksum يدويًا.

### Applied migration is absent

قاعدة البيانات تسجل ترحيلًا غير موجود في checkout. استخدم الفرع أو الإصدار الصحيح، ولا تحذف السجل أو الملف لتجاوز الفحص.

### PostgREST لا يرى عقدًا جديدًا

تأكد من اكتمال الترحيل ووجود:

```sql
notify pgrst, 'reload schema';
```

ثم تحقق من سجل العقود ومن logs خدمة REST.

### المنفذ مستخدم

اعرض الحاويات:

```bash
docker ps
```

لا توقف أو تحذف حاويات مشاريع أخرى دون التأكد من ملكيتها.

## 19. ملفات مرجعية

- `FRIEND_SETUP_AR.md`: تشغيل سريع.
- `docs/OPERATIONS.md`: تشغيل ومراقبة.
- `docs/PRODUCTION_READINESS.md`: بوابة الجاهزية.
- `supabase/docker/qarar/apply-migrations.sh`: مشغل الترحيلات.
- `supabase/tests/database/`: اختبارات pgTAP.
- `supabase/tests/migration-upgrade-rehearsal.sh`: اختبار الترقية.
- `deploy/production/docker-compose.production.yml`: إعداد الإنتاج.
