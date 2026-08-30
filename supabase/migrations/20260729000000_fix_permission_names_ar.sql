-- إصلاح أسماء صلاحيات القرار والتنفيذ التي فُقدت أحرفها العربية سابقاً.
begin;

update public.permissions
set name_ar = case code
  when 'decisions.create' then U&'\0625\0646\0634\0627\0621 \0627\0644\0642\0631\0627\0631\0627\062A'
  when 'decisions.manage' then U&'\0625\062F\0627\0631\0629 \0627\0644\0642\0631\0627\0631\0627\062A'
  when 'decisions.read' then U&'\0642\0631\0627\0621\0629 \0627\0644\0642\0631\0627\0631\0627\062A'
  when 'execution.create' then U&'\0625\0646\0634\0627\0621 \0628\0646\0648\062F \0627\0644\062A\0646\0641\064A\0630'
  when 'execution.manage' then U&'\0625\062F\0627\0631\0629 \0628\0646\0648\062F \0627\0644\062A\0646\0641\064A\0630'
  when 'execution.read' then U&'\0642\0631\0627\0621\0629 \0628\0646\0648\062F \0627\0644\062A\0646\0641\064A\0630'
end
where code in (
  'decisions.create', 'decisions.manage', 'decisions.read',
  'execution.create', 'execution.manage', 'execution.read'
);

commit;
