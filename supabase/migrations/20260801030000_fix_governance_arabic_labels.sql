begin;

update qarar_core.governance_unit_types
set name_ar = U&'\0645\062c\0644\0633 \0639\0627\0645'
where code = 'general_council' and name_ar like '%?%';

update qarar_governance.governance_unit_classes
set name_ar = U&'\0645\062c\0627\0644\0633 \0627\0644\0623\0642\0633\0627\0645'
where code = 'department_councils' and name_ar like '%?%';

update qarar_governance.policies
set name_ar = U&'\0644\0627\0626\062d\0629 \0627\0639\062a\0645\0627\062f \0627\0644\0628\0631\0627\0645\062c \0648\0627\0644\0645\0642\0631\0631\0627\062a \0627\0644\0623\0643\0627\062f\064a\0645\064a\0629'
where code = 'department-councils-regulation' and name_ar like '%?%';

update qarar_governance.policies
set description = U&'\0645\0631\062c\0639 \062a\0646\0638\064a\0645\064a \0644\0627\0639\062a\0645\0627\062f \0627\0644\0628\0631\0627\0645\062c \0648\0627\0644\0645\0642\0631\0631\0627\062a \0627\0644\0623\0643\0627\062f\064a\0645\064a\0629 \0648\062a\0646\0638\064a\0645 \0645\0631\0627\062d\0644 \0645\0631\0627\062c\0639\062a\0647\0627 \0648\0627\0639\062a\0645\0627\062f\0647\0627.'
where code = 'department-councils-regulation' and description like '%?%';

update qarar_governance.policy_versions v
set change_summary = U&'\0625\0635\062f\0627\0631 \062a\0645\0647\064a\062f\064a \0644\062a\0646\0638\064a\0645 \0645\062d\062a\0648\0649 \0627\0644\0644\0627\0626\062d\0629 \0648\0645\0633\0627\0631 \0627\0639\062a\0645\0627\062f\0647\0627.'
from qarar_governance.policies p
where p.id = v.policy_id and p.code = 'department-councils-regulation' and v.change_summary like '%?%';

update qarar_governance.policy_items i
set title_ar = U&'\0627\0644\0628\0646\062f ' || i.item_code || U&' - \0645\062a\0637\0644\0628\0627\062a \0627\0639\062a\0645\0627\062f \0627\0644\0628\0631\0627\0645\062c \0648\0627\0644\0645\0642\0631\0631\0627\062a',
    body_text = U&'\062a\0641\0627\0635\064a\0644 \0627\0644\0628\0646\062f ' || i.item_code || U&' \0644\0627\0626\062d\0629 \0627\0639\062a\0645\0627\062f \0627\0644\0628\0631\0627\0645\062c \0648\0627\0644\0645\0642\0631\0631\0627\062a \0627\0644\0623\0643\0627\062f\064a\0645\064a\0629.'
from qarar_governance.policy_versions v
join qarar_governance.policies p on p.id = v.policy_id
where i.policy_version_id = v.id
  and p.code = 'department-councils-regulation'
  and (i.title_ar like '%?%' or i.body_text like '%?%');

commit;
