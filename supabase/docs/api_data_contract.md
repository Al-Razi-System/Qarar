<div dir="rtl" style="text-align: right;">

# Qarar API / Data Contract Specification
**النسخة:** 1.1  
**النطاق:** Sprint 00 إلى Sprint 06 (المصادقة، الموضوعات، الاجتماعات، المحاضر، القرارات، التكليفات)

هذا المستند يمثل العقد البياني (Data Contract) المعتمد بين واجهة المستخدم (Flutter) والخلفية (Supabase). يجب الاعتماد على الهياكل الموضحة هنا عند بناء واجهات التطبيق وإجراء الطلبات.

---

## 1. نماذج المصادقة والمستخدمين (Sprint 00)

### تسجيل الدخول / إنشاء حساب `Supabase Auth`
يتم استخدام مكتبة `supabase-flutter` لإدارة جلسات المستخدم وتسجيل الدخول (OTP, Magic Link, أو Email/Password).
```dart
// تسجيل الدخول
final AuthResponse res = await supabase.auth.signInWithPassword(
  email: 'user@example.com',
  password: 'password',
);
```

### تهيئة ملف المستخدم لأول مرة (Profile Bootstrapping)
بعد تسجيل الدخول لأول مرة، يجب استدعاء دالة `RPC` لربط المستخدم بمؤسسته وإنشاء ملفه في جدول `users`.
**الدالة في Supabase:** `bootstrap_current_user_profile`

```json
{
  "p_organization_code": "razisys",
  "p_full_name_ar": "أحمد عبدالله",
  "p_full_name_en": "Ahmed Abdullah",
  "p_employee_no": "EMP-1001",
  "p_mobile": "0500000000",
  "p_job_title": "محلل نظم"
}
```
**استدعاء Flutter:**
```dart
await supabase.rpc('bootstrap_current_user_profile', params: {
  'p_organization_code': 'razisys',
  'p_full_name_ar': 'أحمد عبدالله',
});
```

### الاستعلام عن صلاحيات المستخدم الحالي (RBAC)
يمكن للمطور قراءة ملف المستخدم مع الصلاحيات لمعرفة ما إذا كان الإداري أو لديه أدوار في اللجان.
```dart
final userProfile = await supabase
  .from('users')
  .select('*, memberships(*, roles(*), governance_units(*))')
  .eq('id', supabase.auth.currentUser!.id)
  .single();

// للتحقق هل هو مدير نظام:
bool isAdmin = userProfile['is_system_admin'] == true;
```

---

## 2. نماذج الموضوعات (Topics) - Sprint 01

### إنشاء موضوع جديد `POST /rest/v1/topics`
**الجدول في Supabase:** `topics`

```json
{
  "topic_no": "T-2026-001",
  "title_ar": "مراجعة اللائحة التنفيذية",
  "title_en": "Review Executive Regulation",
  "description": "طلب مناقشة تعديلات اللائحة التنفيذية بناء على توجيهات الوزارة",
  "category_id": "<uuid>",
  "current_unit_id": "<uuid>",
  "submitted_by_user_id": "<uuid>",
  "source_type": "new",
  "priority": "high",
  "status": "new"
}
```
*ملاحظة: الـ `organization_id` يتم تحديده من خلال الـ RLS ولا يلزم تمريره إذا كان الـ Trigger أو הـ Default يعالجه، ولكن يفضل تمريره في واجهات الـ REST المباشرة أو الاعتماد على `current_organization_id()` كقيمة افتراضية.*

### إحالة الموضوع لوحدة أخرى `POST /rest/v1/topic_referrals` (Sprint 02)
**الجدول في Supabase:** `topic_referrals`

```json
{
  "topic_id": "<uuid>",
  "from_unit_id": "<uuid>",
  "to_unit_id": "<uuid>",
  "referred_by_user_id": "<uuid>",
  "referral_reason": "للمناقشة في اللجنة الأكاديمية",
  "status": "pending"
}
```
---

## 3. نماذج الاجتماعات (Meetings & Agenda) - Sprint 02 & 03

### إنشاء اجتماع `POST /rest/v1/meetings`
**الجدول:** `meetings`

```json
{
  "meeting_no": "M-2026-005",
  "governance_unit_id": "<uuid>",
  "meeting_type_id": "<uuid>",
  "title_ar": "الاجتماع الدوري الخامس للجنة الأكاديمية",
  "scheduled_date": "2026-08-15",
  "start_time": "10:00:00",
  "end_time": "12:00:00",
  "location_type": "hybrid",
  "location_details": "قاعة الاجتماعات الرئيسية + رابط Teams",
  "status": "scheduled",
  "created_by_user_id": "<uuid>"
}
```

### إدراج بند في جدول الأعمال (Agenda Item) `POST /rest/v1/agenda_items`
**الجدول:** `agenda_items`

```json
{
  "meeting_id": "<uuid>",
  "topic_id": "<uuid>",
  "agenda_order": 1,
  "agenda_status": "pending",
  "is_exception": false,
  "exception_reason": null,
  "voting_status": "not_started",
  "voting_result": "pending"
}
```
*ملاحظة: حقول `voting_status` و `voting_result` تمت إضافتها في Sprint 03 لإدارة التصويت وحفظ نتيجته المجمدة.*
*ملاحظة: إذا كان الموضوع ليس في حالة `approved`، سيتم رفض الإدراج من قاعدة البيانات. لتجاوز ذلك يجب تمرير `is_exception: true` مع ذكر `exception_reason` (صلاحية خاصة لمدير النظام أو مدير الحوكمة).*

### إثبات الحضور `POST /rest/v1/attendance_records` أو `PATCH`
**الجدول:** `attendance_records`

```json
{
  "meeting_id": "<uuid>",
  "user_id": "<uuid>",
  "membership_id": "<uuid>",
  "attendance_status": "present",
  "check_in_at": "2026-08-15T09:55:00Z"
}
```

### تسجيل التصويت `POST /rest/v1/votes`
**الجدول:** `votes`

```json
{
  "meeting_id": "<uuid>",
  "topic_id": "<uuid>",
  "user_id": "<uuid>",
  "membership_id": "<uuid>",
  "vote_value": "approve",
  "vote_note": "موافق مع التحفظ على البند الثاني"
}
```
*القيم المتاحة لـ `vote_value` هي: `approve`, `reject`, `abstain`.*

---

## 4. نماذج القرارات (Decisions) - Sprint 05

### إصدار قرار جديد `POST /rest/v1/decisions`
**الجدول:** `decisions`

```json
{
  "decision_no": "D-2026-010",
  "topic_id": "<uuid>",
  "meeting_id": "<uuid>", 
  "agenda_item_id": "<uuid>",
  "governance_unit_id": "<uuid>",
  "decision_type_id": "<uuid>",
  "decision_text": "يعتمد المجلس تعديل اللائحة بناءً على النسخة المرفقة رقم 3.",
  "decision_status": "draft",
  "issued_by_user_id": "<uuid>",
  "requires_approval": true
}
```

---

## 5. نماذج التنفيذ (Action Items) - Sprint 06

### إنشاء تكليف تنفيذي `POST /rest/v1/action_items`
**الجدول:** `action_items`

```json
{
  "action_no": "ACT-2026-055",
  "decision_id": "<uuid>",
  "topic_id": "<uuid>",
  "assigned_unit_id": "<uuid>", 
  "assigned_user_id": "<uuid>",
  "title_ar": "تعميم اللائحة الجديدة على الكليات",
  "status": "new",
  "priority": "high",
  "due_date": "2026-09-01"
}
```

### تحديث حالة التكليف `PATCH /rest/v1/action_items/{id}`

```json
{
  "status": "in_progress",
  "progress_percent": 45
}
```

---

## 6. نماذج المحاضر (Minutes) - Sprint 04

### حفظ المحضر (أو حفظ المسودة المولدة بالذكاء الاصطناعي) `POST /rest/v1/meeting_minutes`
**الجدول:** `meeting_minutes`

```json
{
  "meeting_id": "<uuid>",
  "draft_text": "عُقد الاجتماع في تمام الساعة 10... (النص المولد بالذكاء الاصطناعي)",
  "final_text": null,
  "minutes_status": "draft_generated",
  "generated_by_ai": true,
  "generated_at": "2026-08-15T12:05:00Z"
}
```

---

## 7. ملاحظات عامة حول الـ API
1. **الاسترجاع (Fetching):**
   - يمكن للواجهات الأمامية استرجاع البيانات باستخدام ميزات `Supabase Client` مثل:
     ```dart
     supabase.from('meetings').select('*, agenda_items(*, topics(*))').eq('status', 'scheduled');
     ```
2. **عزل المؤسسات (Tenant Isolation):**
   - تعمل سياسات الـ RLS تلقائياً بالاعتماد على التوكن (Token). لن يتمكن مستخدم من رؤية اجتماعات أو قرارات تخص مؤسسة أخرى حتى لو حاول ذلك يدوياً.
3. **مراقبة الحالات (Guards):**
   - يرجى من الـ Frontend التأكد من عدم عرض أزرار (مثلاً: التصويت) إلا إذا كانت حالة الاجتماع أو البند تسمح بذلك، علماً بأن الـ Backend محمي بالـ RLS ولن يقبل تعديلات في سياق خاطئ.

</div>
