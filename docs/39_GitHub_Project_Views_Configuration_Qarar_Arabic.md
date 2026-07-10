<div dir="rtl" style="text-align: right;">

# Qarar
## GitHub Project Views Configuration Document

**اسم المنتج:** `Qarar`  
**نوع الوثيقة:** GitHub Project Views Configuration Document  
**إصدار الوثيقة:** `1.0`  
**لغة الوثيقة:** العربية  

---

## 1. مقدمة

تهدف هذه الوثيقة إلى توحيد إعدادات `Views` داخل `GitHub Project` الخاص بمشروع `Qarar` بحيث يرى الفريق نفس اللوحة من زوايا تشغيلية مختلفة دون ارتجال أو اختلاف في التصفية.

المرجع المقصود هنا هو المشروع:

`Qarar MVP Delivery Board`

---

## 2. ملاحظة حاكمة مهمة

في الوضع الحالي، يمكن قراءة `Views` الخاصة بـ `GitHub Projects` عبر `GraphQL`، لكن إنشاءها وتعديلها برمجياً لم يظهر كواجهة عامة قابلة للاستخدام من خلال `gh`/`GraphQL` المتاحين لنا في هذه الجلسة.

بناءً على ذلك:

- هذه الوثيقة تمثل الضبط الرسمي المعتمد
- يطبق إعداد كل `View` مرة واحدة يدوياً من واجهة `GitHub`
- بعد إنشائها، تصبح المرجعية التشغيلية الرسمية للفريق

---

## 3. مبادئ تصميم الـ Views

- لا ننشئ `Views` كثيرة بلا حاجة
- كل `View` يجب أن تخدم قراراً تشغيلياً واضحاً
- نعتمد نفس أسماء الحقول المعتمدة في المشروع
- نستخدم `Status` كالمحور الأساسي للتدفق
- نستخدم `Sprint` كحاوية تخطيطية
- نستخدم `Owner` و`Priority` و`Risk` لتوجيه العمل اليومي

---

## 4. أسماء الحقول المرجعية

هذه الوثيقة تفترض أن الحقول التالية موجودة بالفعل داخل المشروع:

- `Status`
- `Priority`
- `Owner`
- `Area`
- `Sprint`
- `Release`
- `Module`
- `Risk`
- `Work Type`
- `Start Date`
- `End Date`

---

## 5. الـ Views المعتمدة

## View 01

**الاسم:** `Master Table`  
**النوع:** `Table`  
**الغرض:** العرض المرجعي الكامل لكل عناصر المشروع

**Filter:**

لا يوجد

**الأعمدة الموصى بإظهارها:**

- `Title`
- `Status`
- `Priority`
- `Owner`
- `Sprint`
- `Release`
- `Module`
- `Area`
- `Risk`
- `Work Type`
- `Updated`

**متى يستخدم؟**

- عند مراجعة المشروع بالكامل
- عند التدقيق في الحقول
- عند البحث والتحرير الجماعي

---

## View 02

**الاسم:** `Delivery Board`  
**النوع:** `Board`  
**الغرض:** متابعة التدفق التنفيذي اليومي

**Filter:**

```text
status:Backlog,Ready,In Progress,Review,Changes Requested,Testing
```

**Grouping:**

- Group by `Status`

**البيانات الموصى بإظهارها على البطاقة:**

- `Priority`
- `Owner`
- `Sprint`
- `Module`

**متى يستخدم؟**

- في المتابعة اليومية
- في مراجعة الاختناقات
- في إدارة حدود العمل المتوازي

---

## View 03

**الاسم:** `Ready Queue`  
**النوع:** `Table`  
**الغرض:** العناصر الجاهزة للسحب إلى التنفيذ

**Filter:**

```text
status:Ready
```

**Sorting:**

1. `Priority` أعلى أولاً
2. `Updated` الأحدث أولاً

**الأعمدة الموصى بها:**

- `Title`
- `Priority`
- `Owner`
- `Sprint`
- `Module`
- `Risk`

**متى يستخدم؟**

- في `Weekly Replenishment`
- عند سحب عناصر جديدة للفريق

---

## View 04

**الاسم:** `In Progress Board`  
**النوع:** `Board`  
**الغرض:** مراقبة التنفيذ الفعلي فقط دون التشويش بعناصر Backlog

**Filter:**

```text
status:In Progress,Review,Changes Requested,Testing
```

**Grouping:**

- Group by `Status`

**متى يستخدم؟**

- في الاجتماع اليومي
- في معرفة ما هو قيد العمل فعلاً

---

## View 05

**الاسم:** `Sprint Control`  
**النوع:** `Table`  
**الغرض:** مراجعة عناصر سبرنت محدد

**Filter Template:**

```text
sprint:"Sprint 01 - Core Topic Flow" status:Backlog,Ready,In Progress,Review,Changes Requested,Testing
```

**ملاحظة تشغيلية:**

- يكرر هذا الـ `View` حسب السبرنت النشط فقط
- عند الانتقال لسبرنت جديد، ينسخ أو يعاد ضبط الفلتر

**متى يستخدم؟**

- في مراجعة تنفيذ سبرنت أو دفعة محددة
- في تقييم التقدم مقابل نطاق السبرنت

---

## View 06

**الاسم:** `Flutter Work`  
**النوع:** `Table`  
**الغرض:** متابعة العمل المخصص لمسار الواجهة

**Filter:**

```text
owner:"Flutter" status:Backlog,Ready,In Progress,Review,Changes Requested,Testing
```

**الأعمدة الموصى بها:**

- `Title`
- `Status`
- `Priority`
- `Sprint`
- `Module`
- `Risk`

---

## View 07

**الاسم:** `Supabase and Integration Work`  
**النوع:** `Table`  
**الغرض:** متابعة العمل المخصص لمسار الخلفية والتكامل

**Filter:**

```text
owner:"Supabase / Integration" status:Backlog,Ready,In Progress,Review,Changes Requested,Testing
```

---

## View 08

**الاسم:** `Project Lead Work`  
**النوع:** `Table`  
**الغرض:** متابعة عناصر الحوكمة والتشغيل والقيادة

**Filter:**

```text
owner:"Project Lead" status:Backlog,Ready,In Progress,Review,Changes Requested,Testing
```

---

## View 09

**الاسم:** `High Risk and Security`  
**النوع:** `Table`  
**الغرض:** مراقبة العناصر الحساسة

**Filter Option A:**

```text
risk:High
```

**Filter Option B:**

```text
area:Security
```

**ملاحظة مهمة:**

- لأن منطق `OR` بين الحقول غير مدعوم في `Projects`، يفضل إنشاء `View` منفصل لكل منظور عند الحاجة:
- `High Risk`
- `Security`

---

## View 10

**الاسم:** `Testing and Acceptance`  
**النوع:** `Table`  
**الغرض:** مراجعة العناصر الجاهزة للتحقق والقبول

**Filter:**

```text
status:Testing
```

**الأعمدة الموصى بها:**

- `Title`
- `Priority`
- `Owner`
- `Sprint`
- `Module`
- `Risk`
- `Updated`

---

## View 11

**الاسم:** `Done by Release`  
**النوع:** `Table`  
**الغرض:** متابعة ما تم إنجازه لكل إصدار

**Filter Template:**

```text
status:Done release:"Release 1"
```

**متى يستخدم؟**

- عند مراجعة ما تم تسليمه
- عند توثيق تقدم الإصدار

---

## 6. المجموعة الدنيا التي يجب إنشاؤها فوراً

إذا أردنا أقل حزمة مفيدة الآن، فالمطلوب فوراً هو:

1. `Master Table`
2. `Delivery Board`
3. `Ready Queue`
4. `In Progress Board`
5. `Sprint Control`
6. `Flutter Work`
7. `Supabase and Integration Work`
8. `Project Lead Work`
9. `Testing and Acceptance`

---

## 7. خطوات التطبيق اليدوي

بحسب توثيق GitHub الرسمي لإدارة الـ `Views`:

1. افتح المشروع `Qarar MVP Delivery Board`
2. من يمين تبويبات الـ `Views` اختر `New view`
3. اختر نوع العرض:
   - `Table`
   - `Board`
   - `Roadmap` عند الحاجة فقط
4. سمِّ الـ `View` بالاسم المعتمد في هذه الوثيقة
5. أضف الفلتر المعتمد
6. اضبط التجميع أو الترتيب أو الأعمدة
7. كرر ذلك لبقية العروض المطلوبة

---

## 8. ملاحظات حاكمة على الفلاتر

بحسب توثيق GitHub الرسمي:

- استخدام أكثر من فلتر مختلف يعني `AND`
- استخدام أكثر من قيمة لنفس الحقل يعني `OR`
- لا يوجد `OR` عبر حقول مختلفة

لذلك:

- `status:Ready,In Progress` صالح
- `owner:"Flutter" status:In Progress` صالح
- `risk:High area:Security` يعني أن الشرطين معاً مطلوبان

---

## 9. التوصية العملية للفريق الحالي

لأن الفريق الحالي مكون من `3` فقط، يوصى بالتالي:

- استخدام `Delivery Board` كلوحة يومية رئيسية
- استخدام `Ready Queue` في اجتماع السحب الأسبوعي
- استخدام `Flutter Work` و`Supabase and Integration Work` و`Project Lead Work` لتوزيع المسؤولية
- استخدام `Testing and Acceptance` كقائمة تحقق قبل الإغلاق
- عدم الإكثار من `Views` إلا إذا ظهر احتياج تشغيلي حقيقي

---

## 10. الخلاصة

هذه الوثيقة هي الضبط المرجعي الرسمي لـ `Views` داخل `GitHub Project` الخاص بـ `Qarar`.

وأي تعديل لاحق على أسماء الـ `Views` أو فلاترها أو غرضها يجب أن يبقى متسقاً مع:

- [وثيقة GitHub Project and Scrumban Operating Model](30_GitHub_Project_And_Scrumban_Operating_Model_Qarar_Arabic.md)
- [إعدادات GitHub Project التنفيذية](github-project-config-qarar.md)
- [دليل GitFlow المبسط](gitflow-qarar.md)

</div>
