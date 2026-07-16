<div dir="rtl" style="text-align: right;">

# Qarar API / Data Contract Specification
**النسخة:** 1.0  
**النطاق:** Sprint 01 إلى Sprint 05 (الموضوعات، الاجتماعات، المحاضر، القرارات، التكليفات)

هذا المستند يمثل العقد البياني (Data Contract) المعتمد بين واجهة المستخدم (Flutter) والخلفية (Supabase). يجب الاعتماد على الهياكل الموضحة هنا عند بناء واجهات التطبيق وإجراء الطلبات.

---

## 1. نماذج 주제 (Topics) - Sprint 01

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

---

## 2. نماذج الاجتماعات (Meetings & Agenda) - Sprint 02 & 03

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
  "agenda_status": "pending"
}
```

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

## 3. نماذج القرارات (Decisions) - Sprint 05

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

## 4. نماذج التنفيذ (Action Items) - Sprint 06

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

## 5. نماذج المحاضر (Minutes) - Sprint 04

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

## 6. ملاحظات عامة حول الـ API
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
