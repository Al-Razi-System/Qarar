<div dir="rtl" style="text-align: right;">

# تشغيل اختبارات قاعدة البيانات دون Docker

هذا المجلد لمن لا يملك Docker (بيئة سحابية مؤقتة مثلاً). يبني قاعدة مؤقتة من
`supabase/migrations` على PostgreSQL 16 عادي ويشغّل ملفات pgTAP.

**ليس بديلاً عن حزمة Supabase.** `bootstrap.sql` يضع بدائل مصغّرة للأدوار ومخططات
`auth` و`storage` و`extensions`، و`pg_cron` بديل يسجّل المهام ولا ينفذها. لا يوجد
PostgREST ولا Auth ولا Storage ولا Realtime، فلا تُختبر هنا طبقة HTTP ولا المتصفح.
النتيجة النهائية لأي تغيير تبقى على بيئة التطوير المعزولة بحسب `AGENTS.md`.

## الإعداد مرة واحدة

1. PostgreSQL 16 مع `pgcrypto` و`btree_gist` و`uuid-ossp` (حزمة contrib).
2. pgTAP: `git clone https://github.com/theory/pgtap && cd pgtap && make && make install`.
3. بديل pg_cron: انسخ `pg_cron.control` و`pg_cron--1.0.sql` إلى مجلد الإضافات
   (`pg_config --sharedir`/extension).
4. خادم بمستخدم أعلى اسمه `supabase_admin` ومصادقة `trust` محلية، مثلاً:
   `initdb -U supabase_admin --auth=trust` ثم `pg_ctl -o '-p 54329' start`.

## التشغيل

```bash
PGHOST=127.0.0.1 PGPORT=54329 supabase/tests/local-postgres/run.sh
PGHOST=127.0.0.1 PGPORT=54329 supabase/tests/local-postgres/run.sh supabase/tests/database/86_*.sql
```

## خط الأساس في 2026-10-10

كل الترحيلات تُطبَّق. تفشل هنا ثمانية ملفات قبل أي تغيير، فلا تُحسب على تغييرك:
`04` و`05` و`14` و`15` و`19` و`28` و`41` و`42`. الملف `15` يعتمد على سجل ترحيلات
يكتبه مشغّل Supabase. أسباب البقية لم تُفحص: قد تكون فرق بيئة أو اختبارات قديمة،
والحكم فيها لبيئة التطوير.

</div>
