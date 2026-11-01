begin;
-- Domain conflicts are HTTP 409, not a retryable transaction rollback.
create or replace function qarar_iam.set_my_avatar_v2(p_content_base64 text,p_expected_revision integer,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); a qarar_iam.user_avatars_v2%rowtype; bytes bytea;
begin
 if auth.uid() is null or o is null then raise exception using errcode='42501',message='سجّل الدخول لتحديث صورتك'; end if;
 perform 1 from qarar_iam.users where id=auth.uid() and organization_id=o and status='active' and not must_change_password for update;
 if not found then raise exception using errcode='42501',message='تحديث الصورة متاح لحساب نشط فقط'; end if;
 if p_request_id is null or p_expected_revision is null or p_expected_revision<0 then raise exception using errcode='22023',message='طلب تحديث الصورة غير صالح'; end if;
 if p_content_base64 is not null then
  if length(p_content_base64)>720000 then raise exception using errcode='22023',message='الصورة أكبر من الحد المسموح'; end if;
  begin bytes:=decode(p_content_base64,'base64'); exception when others then raise exception using errcode='22023',message='بيانات الصورة غير صالحة'; end;
  if octet_length(bytes) not between 4 and 524288 or substring(bytes from 1 for 3)<>decode('ffd8ff','hex') then raise exception using errcode='22023',message='بيانات الصورة غير صالحة'; end if;
 end if;
 insert into qarar_iam.user_avatars_v2(user_id,organization_id) values(auth.uid(),o) on conflict(user_id) do nothing;
 select * into a from qarar_iam.user_avatars_v2 where user_id=auth.uid() and organization_id=o for update;
 if a.last_request_id=p_request_id then
  if a.content is distinct from bytes or a.revision<>p_expected_revision+1 then raise exception using errcode='PT409',message='استُخدم الطلب لبيانات مختلفة؛ أعد تحميل صورتك'; end if;
  return jsonb_build_object('saved',true,'revision',a.revision,'has_image',a.content is not null);
 end if;
 if a.revision<>p_expected_revision then raise exception using errcode='PT409',message='تغيرت صورتك في صفحة أخرى؛ أعد تحميلها قبل التعديل'; end if;
 update qarar_iam.user_avatars_v2 set content=bytes,revision=revision+1,last_request_id=p_request_id,updated_at=clock_timestamp() where user_id=auth.uid() and organization_id=o returning * into a;
 perform qarar_audit.append_audit_log(o,case when bytes is null then 'iam.self.avatar_remove' else 'iam.self.avatar_update' end,'users',auth.uid(),jsonb_build_object('revision',a.revision,'request_id',p_request_id));
 return jsonb_build_object('saved',true,'revision',a.revision,'has_image',a.content is not null);
end $$;
notify pgrst,'reload schema';
commit;
