# تشغيل منصة قرار على جهاز جديد

## المتطلبات

- Git
- Docker Desktop مع Docker Compose
- Node.js 22 أو أحدث
- PowerShell 7 على Windows، أو Bash على Linux/macOS

## الاستنساخ

```bash
git clone https://github.com/Al-Razi-System/Qarar.git
cd Qarar
git checkout codex/production-ready-v1
```

## إعداد البيئة المحلية

انسخ قالب البيئة ولا ترفع الملف الناتج إلى Git:

```bash
cp supabase/docker/.env.example supabase/docker/.env
```

على PowerShell:

```powershell
Copy-Item supabase/docker/.env.example supabase/docker/.env
```

راجع القيم المعلّمة للتغيير داخل `supabase/docker/.env`، خصوصًا كلمات المرور ومفاتيح JWT وعناوين الخدمات.

## تثبيت التبعيات

```bash
npm ci
npm --prefix dashboard ci
```

## تشغيل الخدمات

```bash
npm run docker:config
npm run docker:start
npm run docker:status
```

بعد اكتمال صحة الخدمات، شغّل لوحة الإدارة للتطوير:

```bash
npm --prefix dashboard run dev
```

## فحص سريع

```bash
npm --prefix dashboard run typecheck
npm --prefix dashboard run test:run
npm --prefix dashboard run build
```

## ملاحظات مهمة

- لا تستخدم ملفات أو أسرار الإنتاج على جهاز تطوير.
- بيانات seed المحلية اختيارية، بينما إعداد الإنتاج يفرض تعطيلها.
- SSO يبقى متوقفًا احترازيًا حتى إكمال تحقق النطاق والـIdP.
- راجع `docs/PRODUCTION_READINESS.md` و`docs/OPERATIONS.md` قبل أي نشر حقيقي.
