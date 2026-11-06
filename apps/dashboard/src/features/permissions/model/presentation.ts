export const scopeLabels: Record<string, string> = {
  system: "إدارة النظام",
  organization: "على مستوى المؤسسة",
  governance_unit: "داخل المجالس المحددة",
  execution: "داخل الأعمال المكلّف بها",
  self: "الحساب الشخصي",
};
const moduleLabels: Record<string, string> = {
  iam: "المستخدمون والوصول",
  governance: "المجالس والحوكمة",
  topics: "الموضوعات",
  meetings: "الاجتماعات",
  agenda: "جدول الأعمال",
  attendance: "الحضور",
  quorum: "النصاب",
  voting: "التصويت",
  decisions: "القرارات",
  minutes: "المحاضر",
  execution: "تنفيذ القرارات",
  regulations: "اللوائح والبنود",
  audit: "سجل التدقيق",
  notifications: "الإشعارات",
  workflows: "المسارات",
  core: "إعدادات المؤسسة",
  files: "الملفات",
  storage: "الملفات",
};
export const moduleLabel = (module: string) =>
  moduleLabels[module] ?? "صلاحيات أخرى";
export const arabicName = (name: string) =>
  /[\u0600-\u06ff]/.test(name) ? name : "صلاحية متاحة";
