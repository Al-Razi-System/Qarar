begin;

update public.roles
set name_ar = case code
  when 'council_chair' then U&'\0631\0626\064a\0633 \0627\0644\0645\062c\0644\0633'
  when 'council_rapporteur' then U&'\0645\0642\0631\0631 \0627\0644\0645\062c\0644\0633'
  else name_ar
end
where code in ('council_chair', 'council_rapporteur');

update public.permissions
set name_ar = case code
  when 'governance.memberships.manage' then U&'\0625\062f\0627\0631\0629 \0639\0636\0648\064a\0627\062a \0627\0644\0645\062c\0627\0644\0633'
  when 'governance.memberships.read' then U&'\0642\0631\0627\0621\0629 \0639\0636\0648\064a\0627\062a \0627\0644\0645\062c\0627\0644\0633'
  when 'governance.leadership.assign' then U&'\0625\0633\0646\0627\062f \0642\064a\0627\062f\0629 \0627\0644\0645\062c\0627\0644\0633'
  else name_ar
end
where code in ('governance.memberships.manage', 'governance.memberships.read', 'governance.leadership.assign');

commit;
