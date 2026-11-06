"use client";
import { AdministrativeInput } from '@/shared/ui/administrative-field';

export function MeetingQuorumField({defaultValue,disabled=false}:{defaultValue?:number;disabled?:boolean}) {
 return <AdministrativeInput
  name="quorum_percentage" type="number" min={1} max={100} step={1}
  label="نسبة النصاب لهذا الاجتماع (%) — اختياري"
  hint="اتركها فارغة لاستخدام 51٪. تُحفظ النسبة لهذا الاجتماع وحده، ويمكن تعديلها قبل بدء الجلسة فقط."
  placeholder="51" defaultValue={defaultValue} disabled={disabled}
 />;
}
