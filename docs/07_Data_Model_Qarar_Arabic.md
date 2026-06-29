<div dir="rtl" style="text-align: right;">

# Qarar
## Data Model Document

**اسم المنتج:** Qarar  
**التموضع:** Enterprise Governance & Decision Management Platform  
**نوع الوثيقة:** Data Model Document  
**الإصدار:** 1.0  
**الحالة:** مسودة للمراجعة التأسيسية  
**اللغة:** العربية  
**المرجع الاصطلاحي:** [قاموس المصطلحات المرجعي](00_Glossary_Qarar_Arabic.md)  

---

## 1. مقدمة

تهدف هذه الوثيقة إلى تعريف نموذج البيانات `Data Model` لمنتج `Qarar` على مستوى تحليلي ومنطقي، بما يترجم نموذج المجال `Domain Model` إلى كيانات بيانات مترابطة يمكن لاحقاً تحويلها إلى مخطط قاعدة بيانات فعلي.

هذه الوثيقة لا تمثل بعد التصميم الفيزيائي النهائي لقاعدة البيانات، لكنها تمثل الطبقة المنطقية التي تحدد:

- الجداول أو الكيانات البيانية الأساسية
- الحقول الرئيسية
- العلاقات
- القيود المنطقية
- قواعد المرجعية
- مبادئ التتبع والتدقيق والامتثال

---

## 2. هدف الوثيقة

أهداف هذه الوثيقة هي:

- تعريف الكيانات البيانية الرئيسية للمنصة
- تحديد الخصائص الأساسية لكل كيان
- تحديد العلاقات بين الكيانات
- توضيح القيود المنطقية وقواعد الربط
- تجهيز الأساس الذي ستبنى عليه قاعدة البيانات الفعلية
- دعم وثائق `API`, `Security`, `Permissions`, `Reporting`, و`Workflow`

---

## 3. مبادئ تصميم نموذج البيانات

تم تصميم النموذج وفق المبادئ التالية:

- **الفصل بين المفاهيم الجوهرية:** القرار، المحضر، التكليف، المصادقة، والإشعار كيانات مستقلة.
- **دعم التهيئة:** الأنواع والحالات والقواعد القابلة للتغيير يجب أن تكون قابلة للنمذجة.
- **دعم التتبع والتدقيق:** يجب أن تترك العمليات سجلاً قابلاً للتحليل والمراجعة.
- **الاستعداد للتعدد المؤسسي:** كل كيان أساسي يجب أن يدعم العزل المؤسسي `Tenant Isolation`.
- **القابلية للتوسع:** النموذج يجب أن يتسع للخصائص المستقبلية دون إعادة بناء كاملة.

---

## 4. مستويات النموذج

يعالج هذا المستند البيانات على ثلاثة مستويات:

- **مستوى المؤسسة والحوكمة**
- **مستوى التشغيل والاجتماعات والقرارات**
- **مستوى المتابعة والتقارير والامتثال**

---

## 5. الكيانات البيانية الأساسية

### 5.1 Organization

يمثل المؤسسة المالكة للبيانات.

#### الحقول الأساسية

- `id`
- `code`
- `name_ar`
- `name_en`
- `sector`
- `status`
- `default_language`
- `timezone`
- `created_at`
- `updated_at`

#### ملاحظات

- يستخدم كمرجع رئيسي لمعظم الكيانات الأخرى.
- يمثل المفتاح الأساسي للعزل متعدد المستأجرين.

---

### 5.2 Governance_Unit_Type

يمثل نوع الوحدة الحوكمية.

#### الحقول الأساسية

- `id`
- `organization_id`
- `code`
- `name_ar`
- `name_en`
- `description`
- `is_active`
- `created_at`
- `updated_at`

---

### 5.3 Governance_Unit

يمثل المجلس أو اللجنة أو الإدارة أو أي وحدة حوكمية.

#### الحقول الأساسية

- `id`
- `organization_id`
- `parent_unit_id`
- `unit_type_id`
- `code`
- `name_ar`
- `name_en`
- `level_no`
- `status`
- `quorum_rule_id`
- `meeting_rule_id`
- `created_at`
- `updated_at`

#### العلاقات

- `organization_id -> Organization.id`
- `parent_unit_id -> Governance_Unit.id`
- `unit_type_id -> Governance_Unit_Type.id`

#### ملاحظات

- `parent_unit_id` اختياري لدعم الوحدات العليا أو المستقلة.

---

### 5.4 User

يمثل المستخدم داخل المؤسسة.

#### الحقول الأساسية

- `id`
- `organization_id`
- `employee_no`
- `full_name_ar`
- `full_name_en`
- `email`
- `mobile`
- `job_title`
- `status`
- `is_system_admin`
- `created_at`
- `updated_at`

#### العلاقات

- `organization_id -> Organization.id`

---

### 5.5 Role

يمثل نوع الدور داخل النظام أو داخل الوحدة.

#### الحقول الأساسية

- `id`
- `organization_id`
- `code`
- `name_ar`
- `name_en`
- `description`
- `role_scope`
- `is_active`
- `created_at`
- `updated_at`

#### أمثلة على `role_scope`

- `governance_unit`
- `organization`
- `system`
- `execution`

---

### 5.6 Membership

يربط المستخدم بوحدة حوكمية ودور محدد.

#### الحقول الأساسية

- `id`
- `organization_id`
- `user_id`
- `governance_unit_id`
- `role_id`
- `membership_title`
- `membership_status`
- `start_date`
- `end_date`
- `created_at`
- `updated_at`

#### العلاقات

- `user_id -> User.id`
- `governance_unit_id -> Governance_Unit.id`
- `role_id -> Role.id`

#### القيود

- يجب منع التكرار غير المنطقي لنفس المستخدم والدور والوحدة في الفترة نفسها.

---

## 6. كيانات السياسات واللوائح

### 6.1 Policy

#### الحقول الأساسية

- `id`
- `organization_id`
- `code`
- `name_ar`
- `name_en`
- `policy_type`
- `version_no`
- `effective_date`
- `expiry_date`
- `status`
- `created_at`
- `updated_at`

---

### 6.2 Policy_Item

#### الحقول الأساسية

- `id`
- `organization_id`
- `policy_id`
- `parent_item_id`
- `item_code`
- `title_ar`
- `title_en`
- `description`
- `item_type`
- `status`
- `created_at`
- `updated_at`

#### العلاقات

- `policy_id -> Policy.id`
- `parent_item_id -> Policy_Item.id`

---

### 6.3 Policy_Item_Workflow_Map

#### الهدف

ربط بند لائحي بمسار افتراضي أو قالب حوكمي.

#### الحقول الأساسية

- `id`
- `organization_id`
- `policy_item_id`
- `workflow_template_id`
- `is_default`
- `created_at`

---

## 7. كيانات الموضوعات

### 7.1 Topic_Category

#### الحقول الأساسية

- `id`
- `organization_id`
- `code`
- `name_ar`
- `name_en`
- `description`
- `is_active`

---

### 7.2 Topic

#### الحقول الأساسية

- `id`
- `organization_id`
- `topic_no`
- `title_ar`
- `title_en`
- `description`
- `category_id`
- `policy_item_id`
- `workflow_id`
- `current_unit_id`
- `submitted_by_user_id`
- `source_type`
- `priority`
- `status`
- `submitted_at`
- `created_at`
- `updated_at`

#### العلاقات

- `category_id -> Topic_Category.id`
- `policy_item_id -> Policy_Item.id`
- `workflow_id -> Workflow.id`
- `current_unit_id -> Governance_Unit.id`
- `submitted_by_user_id -> User.id`

#### أمثلة على `source_type`

- `new`
- `from_lower_unit`
- `from_upper_unit`
- `from_peer_unit`
- `from_admin_entity`

---

### 7.3 Topic_Attachment

#### الحقول الأساسية

- `id`
- `organization_id`
- `topic_id`
- `file_name`
- `file_type`
- `file_size`
- `storage_path`
- `uploaded_by_user_id`
- `uploaded_at`

#### العلاقات

- `topic_id -> Topic.id`
- `uploaded_by_user_id -> User.id`

---

### 7.4 Topic_Status_History

#### الهدف

تتبع تغيرات حالة الموضوع عبر الزمن.

#### الحقول الأساسية

- `id`
- `organization_id`
- `topic_id`
- `from_status`
- `to_status`
- `changed_by_user_id`
- `changed_at`
- `change_reason`

---

## 8. كيانات المسارات

### 8.1 Workflow

#### الحقول الأساسية

- `id`
- `organization_id`
- `workflow_code`
- `name_ar`
- `name_en`
- `workflow_type`
- `source_mode`
- `status`
- `is_template`
- `policy_item_id`
- `created_at`
- `updated_at`

#### أمثلة على `source_mode`

- `policy_based`
- `custom`
- `exception`

---

### 8.2 Workflow_Step

#### الحقول الأساسية

- `id`
- `organization_id`
- `workflow_id`
- `step_order`
- `governance_unit_id`
- `step_role_type`
- `step_action_type`
- `entry_condition`
- `exit_condition`
- `expected_outcome`
- `is_required`
- `created_at`
- `updated_at`

#### العلاقات

- `workflow_id -> Workflow.id`
- `governance_unit_id -> Governance_Unit.id`

#### أمثلة على `step_action_type`

- `review`
- `discussion`
- `recommendation`
- `approval`
- `rejection`
- `referral`
- `postponement`

---

### 8.3 Workflow_Transition_Log

#### الهدف

تسجيل انتقال الموضوع بين المراحل.

#### الحقول الأساسية

- `id`
- `organization_id`
- `workflow_id`
- `topic_id`
- `from_step_id`
- `to_step_id`
- `transition_type`
- `transition_reason`
- `performed_by_user_id`
- `performed_at`

---

## 9. كيانات الاجتماعات

### 9.1 Meeting_Type

#### الحقول الأساسية

- `id`
- `organization_id`
- `code`
- `name_ar`
- `name_en`
- `description`
- `is_active`

---

### 9.2 Meeting

#### الحقول الأساسية

- `id`
- `organization_id`
- `meeting_no`
- `governance_unit_id`
- `meeting_type_id`
- `title_ar`
- `title_en`
- `scheduled_date`
- `start_time`
- `end_time`
- `location_type`
- `location_details`
- `status`
- `quorum_status`
- `created_by_user_id`
- `created_at`
- `updated_at`

#### العلاقات

- `governance_unit_id -> Governance_Unit.id`
- `meeting_type_id -> Meeting_Type.id`
- `created_by_user_id -> User.id`

#### أمثلة على `location_type`

- `onsite`
- `online`
- `hybrid`

---

### 9.3 Agenda_Item

#### الحقول الأساسية

- `id`
- `organization_id`
- `meeting_id`
- `topic_id`
- `agenda_order`
- `agenda_status`
- `discussion_notes`
- `created_at`
- `updated_at`

#### العلاقات

- `meeting_id -> Meeting.id`
- `topic_id -> Topic.id`

#### القيود

- يجب منع إدراج الموضوع نفسه مرتين في الاجتماع نفسه إلا بقيد واضح مقصود.

---

### 9.4 Attendance_Record

#### الحقول الأساسية

- `id`
- `organization_id`
- `meeting_id`
- `user_id`
- `membership_id`
- `attendance_status`
- `check_in_at`
- `check_out_at`
- `remarks`
- `created_at`

#### العلاقات

- `meeting_id -> Meeting.id`
- `user_id -> User.id`
- `membership_id -> Membership.id`

#### أمثلة على `attendance_status`

- `present`
- `absent`
- `excused`
- `late`

---

### 9.5 Vote

#### الحقول الأساسية

- `id`
- `organization_id`
- `meeting_id`
- `topic_id`
- `decision_id`
- `user_id`
- `membership_id`
- `vote_value`
- `vote_note`
- `voted_at`

#### العلاقات

- `meeting_id -> Meeting.id`
- `topic_id -> Topic.id`
- `decision_id -> Decision.id`
- `user_id -> User.id`
- `membership_id -> Membership.id`

#### أمثلة على `vote_value`

- `approve`
- `reject`
- `abstain`

---

## 10. كيانات القرارات

### 10.1 Decision_Type

#### الحقول الأساسية

- `id`
- `organization_id`
- `code`
- `name_ar`
- `name_en`
- `description`
- `produces_action_item`
- `is_active`

---

### 10.2 Decision

#### الحقول الأساسية

- `id`
- `organization_id`
- `decision_no`
- `topic_id`
- `meeting_id`
- `agenda_item_id`
- `governance_unit_id`
- `decision_type_id`
- `decision_text`
- `decision_status`
- `issued_at`
- `issued_by_user_id`
- `requires_approval`
- `created_at`
- `updated_at`

#### العلاقات

- `topic_id -> Topic.id`
- `meeting_id -> Meeting.id`
- `agenda_item_id -> Agenda_Item.id`
- `governance_unit_id -> Governance_Unit.id`
- `decision_type_id -> Decision_Type.id`
- `issued_by_user_id -> User.id`

---

### 10.3 Decision_Note

#### الحقول الأساسية

- `id`
- `organization_id`
- `decision_id`
- `note_type`
- `note_text`
- `created_by_user_id`
- `created_at`

---

### 10.4 Decision_Status_History

#### الحقول الأساسية

- `id`
- `organization_id`
- `decision_id`
- `from_status`
- `to_status`
- `changed_by_user_id`
- `changed_at`
- `reason`

---

## 11. كيانات التنفيذ والمتابعة

### 11.1 Action_Item

#### الحقول الأساسية

- `id`
- `organization_id`
- `action_no`
- `decision_id`
- `topic_id`
- `assigned_unit_id`
- `assigned_user_id`
- `follow_up_user_id`
- `title_ar`
- `title_en`
- `description`
- `status`
- `progress_percent`
- `priority`
- `due_date`
- `started_at`
- `completed_at`
- `created_at`
- `updated_at`

#### العلاقات

- `decision_id -> Decision.id`
- `topic_id -> Topic.id`
- `assigned_unit_id -> Governance_Unit.id`
- `assigned_user_id -> User.id`
- `follow_up_user_id -> User.id`

#### القيود

- إذا كان `Decision_Type.produces_action_item = true` فيجب أن ينشأ تكليف أو أكثر وفق قواعد العمل.

---

### 11.2 Action_Evidence

#### الحقول الأساسية

- `id`
- `organization_id`
- `action_item_id`
- `evidence_type`
- `description`
- `file_name`
- `storage_path`
- `uploaded_by_user_id`
- `uploaded_at`

---

### 11.3 Follow_Up_Record

#### الحقول الأساسية

- `id`
- `organization_id`
- `action_item_id`
- `follow_up_type`
- `follow_up_note`
- `status_snapshot`
- `progress_snapshot`
- `recorded_by_user_id`
- `recorded_at`

---

### 11.4 Escalation

#### الحقول الأساسية

- `id`
- `organization_id`
- `action_item_id`
- `escalation_level`
- `escalation_reason`
- `escalated_to_user_id`
- `escalated_to_unit_id`
- `status`
- `escalated_at`
- `closed_at`

---

## 12. كيانات المحاضر

### 12.1 Meeting_Minutes

#### الحقول الأساسية

- `id`
- `organization_id`
- `meeting_id`
- `draft_text`
- `final_text`
- `minutes_status`
- `generated_by_ai`
- `generated_at`
- `reviewed_by_user_id`
- `reviewed_at`
- `approved_at`
- `created_at`
- `updated_at`

#### العلاقات

- `meeting_id -> Meeting.id`
- `reviewed_by_user_id -> User.id`

#### أمثلة على `minutes_status`

- `draft_generated`
- `under_review`
- `ready_for_approval`
- `approved`
- `closed`

---

### 12.2 Minutes_Approval

#### الحقول الأساسية

- `id`
- `organization_id`
- `meeting_minutes_id`
- `approver_user_id`
- `approval_status`
- `approval_note`
- `approved_at`

#### العلاقات

- `meeting_minutes_id -> Meeting_Minutes.id`
- `approver_user_id -> User.id`

---

## 13. كيانات الاعتماد العامة

### 13.1 Approval_Type

#### الحقول الأساسية

- `id`
- `organization_id`
- `code`
- `name_ar`
- `name_en`
- `target_entity`
- `is_active`

---

### 13.2 Approval

#### الحقول الأساسية

- `id`
- `organization_id`
- `approval_type_id`
- `target_entity_type`
- `target_entity_id`
- `approver_user_id`
- `approval_status`
- `approval_note`
- `approved_at`
- `created_at`

#### الملاحظات

- `target_entity_type` قد يكون:
  - `topic`
  - `decision`
  - `meeting_minutes`
  - `action_item_closure`

---

### 13.3 Approval_Rule

#### الحقول الأساسية

- `id`
- `organization_id`
- `approval_type_id`
- `scope_type`
- `scope_ref_id`
- `rule_mode`
- `minimum_approvers`
- `is_sequential`
- `status`
- `created_at`
- `updated_at`

---

## 14. كيانات الإشعارات

### 14.1 Notification_Type

#### الحقول الأساسية

- `id`
- `organization_id`
- `code`
- `name_ar`
- `name_en`
- `channel_type`
- `is_active`

---

### 14.2 Notification

#### الحقول الأساسية

- `id`
- `organization_id`
- `notification_type_id`
- `target_user_id`
- `target_unit_id`
- `related_entity_type`
- `related_entity_id`
- `subject`
- `message_body`
- `delivery_status`
- `sent_at`
- `read_at`
- `created_at`

---

### 14.3 Notification_Rule

#### الحقول الأساسية

- `id`
- `organization_id`
- `notification_type_id`
- `trigger_event`
- `offset_value`
- `offset_unit`
- `recipient_mode`
- `status`
- `created_at`
- `updated_at`

---

## 15. كيانات التقارير والامتثال

### 15.1 KPI_Definition

#### الحقول الأساسية

- `id`
- `organization_id`
- `code`
- `name_ar`
- `name_en`
- `description`
- `formula_expression`
- `target_value`
- `is_active`

---

### 15.2 Compliance_Record

#### الحقول الأساسية

- `id`
- `organization_id`
- `compliance_type`
- `related_entity_type`
- `related_entity_id`
- `compliance_status`
- `compliance_score`
- `evaluated_at`
- `evaluated_by`
- `remarks`

---

### 15.3 Report_Definition

#### الحقول الأساسية

- `id`
- `organization_id`
- `code`
- `name_ar`
- `name_en`
- `report_scope`
- `report_type`
- `is_active`

---

## 16. الجداول المرجعية والحالات

يفضل أن تدار بعض القيم من خلال جداول مرجعية مستقلة أو قوائم قابلة للتهيئة، مثل:

- حالات الموضوع
- حالات الاجتماع
- حالات القرار
- حالات التكليف
- حالات المحضر
- أنواع الاجتماعات
- أنواع القرارات
- أنواع الإشعارات
- أنواع الاعتماد
- أنواع التصويت

هذا يضمن:

- مرونة أعلى
- تقارير أكثر انتظاماً
- تقليل المنطق الثابت داخل التطبيق

---

## 17. العلاقات الأساسية

### 17.1 علاقات `1:N`

- `Organization -> Governance_Unit`
- `Organization -> User`
- `Organization -> Policy`
- `Organization -> Topic`
- `Organization -> Meeting`
- `Organization -> Decision`
- `Organization -> Action_Item`
- `Organization -> Notification`

### 17.2 علاقات `N:N` عبر جداول وسيطة

- `User <-> Governance_Unit` عبر `Membership`
- `Meeting <-> Topic` عبر `Agenda_Item`
- `User <-> Meeting_Minutes` عبر `Minutes_Approval`

### 17.3 علاقات ذاتية

- `Governance_Unit.parent_unit_id -> Governance_Unit.id`
- `Policy_Item.parent_item_id -> Policy_Item.id`

---

## 18. القيود المنطقية الأساسية

- لا يجوز أن ينتمي أي كيان تشغيلي إلى أكثر من مؤسسة.
- يجب أن يتبع كل `Topic` مؤسسة واحدة ومساراً معروفاً أو قابلاً للتوليد.
- يجب أن يرتبط كل `Decision` بموضوع واحد على الأقل.
- يجب ألا يوجد `Action_Item` دون `Decision` مرجعي.
- يجب ألا تعتمد النسخة النهائية للمحضر دون وجود سجل مراجعة أو اعتماد حسب القاعدة.
- يجب أن تكون جميع الحقول المرجعية بين الكيانات من نفس `organization_id`.

---

## 19. اعتبارات التدقيق والأثر الزمني

ينبغي أن يدعم النموذج على الأقل:

- `created_at`
- `updated_at`
- `created_by`
- `updated_by`
- سجلات تغيّر الحالة
- سجلات الموافقات
- سجلات التصعيد
- سجلات الإشعارات

وذلك لضمان:

- التتبع الكامل
- القدرة على التحقيق
- الامتثال
- دقة التقارير الزمنية

---

## 20. اعتبارات مستقبلية

النموذج الحالي يجب أن يسمح لاحقاً بدعم:

- تعدد اللغات
- White Label
- تكاملات API
- محرك نماذج
- محرك تقارير ديناميكي
- ذكاء اصطناعي أوسع
- أرشفة متقدمة

---

## 21. أثر نموذج البيانات على المراحل التالية

هذا المستند سيغذي مباشرة:

- `08_Workflow_Framework_Qarar_Arabic`
- `09_Functional_Requirements_Qarar_Arabic`
- `12_Notification_Framework_Qarar_Arabic`
- `15_Security_Framework_Qarar_Arabic`
- `16_Permission_Framework_Qarar_Arabic`
- `17_SaaS_Architecture_Qarar_Arabic`
- `19_API_Specification_Qarar_Arabic`

---

## 22. التوصيات التحليلية

- يجب اعتماد هذا النموذج كمرجع منطقي قبل تصميم قاعدة البيانات الفعلية.
- يجب عدم دمج `Decision`, `Action_Item`, `Meeting_Minutes`, و`Approval` في كيان واحد.
- يجب تصميم الجداول المرجعية والحالات بطريقة قابلة للتهيئة.
- يجب فرض العزل المؤسسي على كل علاقة أساسية.
- يجب أن يقاد تصميم التقارير من هذا النموذج، لا من استعلامات لاحقة فقط.

---

## 23. خاتمة

يوفر هذا النموذج البياني الأساس المنطقي الذي يمكن البناء عليه تقنياً دون فقدان الاتساق المفاهيمي الذي ثبت في `Governance Framework` و`Domain Model`. وكلما تم الالتزام بهذا النموذج في المراحل القادمة، كانت البنية التقنية أكثر اتزاناً، وكانت التقارير والامتثال والتتبع أكثر موثوقية، وكان `Qarar` أقرب إلى منصة مؤسسية ناضجة لا إلى تطبيق تشغيلي محدود.

</div>
