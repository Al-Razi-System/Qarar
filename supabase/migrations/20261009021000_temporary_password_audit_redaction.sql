begin;
-- Forward correction: password baselines and claim capabilities are internal
-- credentials, not audit payloads. Keep all existing non-user behavior intact.
create or replace function qarar_audit.audit_row_change()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_org uuid; v_entity_id uuid; v_action text; v_old jsonb; v_new jsonb;
begin
 v_org:=coalesce(NEW.organization_id,OLD.organization_id);
 v_entity_id:=coalesce(NEW.id,OLD.id);
 v_action:=lower(TG_TABLE_NAME||'.'||TG_OP);
 if TG_OP in ('UPDATE','DELETE') then v_old:=to_jsonb(OLD); end if;
 if TG_OP in ('INSERT','UPDATE') then v_new:=to_jsonb(NEW); end if;
 if TG_TABLE_NAME='user_invitations' then
  v_old:=v_old-'token_hash'; v_new:=v_new-'token_hash';
 elsif TG_TABLE_SCHEMA='qarar_iam' and TG_TABLE_NAME='users' then
  v_old:=v_old-array['temporary_password_hash','password_change_claim','password_change_claim_until','password_change_receipt'];
  v_new:=v_new-array['temporary_password_hash','password_change_claim','password_change_claim_until','password_change_receipt'];
 end if;
 perform qarar_audit.append_audit_log(v_org,v_action,TG_TABLE_NAME,v_entity_id,
  jsonb_build_object('table',TG_TABLE_NAME,'operation',TG_OP,'old',v_old,'new',v_new));
 return coalesce(NEW,OLD);
end $$;
notify pgrst,'reload schema';
commit;
