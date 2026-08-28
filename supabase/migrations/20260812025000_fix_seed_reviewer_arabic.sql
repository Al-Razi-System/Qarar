-- Correct legacy placeholder text created for the local reviewer account.
-- The account is used in the development demo and must render Arabic data normally.

begin;

update qarar_iam.users
set
  full_name_ar = 'مراجع الحوكمة الداخلي',
  job_title = 'مراجع الحوكمة الداخلي'
where lower(email) = 'reviewer@qarar.local';

update qarar_iam.memberships
set membership_title = 'مراجع الحوكمة الداخلي'
where user_id = (
  select id
  from qarar_iam.users
  where lower(email) = 'reviewer@qarar.local'
);

commit;
