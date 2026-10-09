"""Scoped development import; default validates the complete transaction then rolls back."""
import hashlib
import json
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

SOURCE = Path('/home/partner/.codex/attachments/40dafa32-606c-4a22-ab03-ac56cb00ccaa/مصفوفة_حوكمة_المجالس_الإصدار_الحادي_عشر_مصحح_الربط.xlsx')
ORG = '00000000-0000-0000-0000-000000000001'
ACTOR = 'cbc2ce76-c112-4048-9ede-7d7f219758eb'
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def sheets():
    result = {}
    with zipfile.ZipFile(SOURCE) as archive:
        strings = [''.join(x.itertext()) for x in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('m:si', NS)] if 'xl/sharedStrings.xml' in archive.namelist() else []
        links = {x.attrib['Id']: x.attrib['Target'] for x in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        for sheet in ET.fromstring(archive.read('xl/workbook.xml')).findall('m:sheets/m:sheet', NS):
            if sheet.attrib['name'] not in ('الهيكل التنظيمي', 'المجالس'):
                continue
            target = links[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
            target = target.lstrip('/') if target.startswith('/') else 'xl/' + target
            records = []
            for row in ET.fromstring(archive.read(target)).findall('m:sheetData/m:row', NS)[1:]:
                fields = {}
                for cell in row:
                    value = cell.find('m:v', NS)
                    inline = cell.find('m:is', NS)
                    text = value.text if value is not None else ''.join(inline.itertext()) if inline is not None else ''
                    fields[''.join(c for c in cell.attrib['r'] if c.isalpha())] = strings[int(text)] if cell.attrib.get('t') == 's' else text
                if fields.get('A'):
                    records.append(fields)
            result[sheet.attrib['name']] = records
    return result


def prepare():
    data = sheets()
    units = data['الهيكل التنظيمي']
    councils = data['المجالس']
    assert len(units) == 29 and len(councils) == 34, 'Unexpected source population'
    by_code = {r['A']: r for r in units}
    assert len(by_code) == len(units), 'Duplicate unit code'
    assert len({r['A'] for r in councils}) == len(councils), 'Duplicate council code'
    pending = list(units)
    ordered = []
    while pending:
        ready = [r for r in pending if not r.get('D') or r['D'] in {x['A'] for x in ordered}]
        assert ready, 'Missing parent or organizational cycle'
        ordered.extend(ready)
        pending = [r for r in pending if r not in ready]
    entries = []
    for row in councils:
        matches = [r for r in units if r.get('F') == row['B']]
        assert len(matches) <= 1, 'Ambiguous council scope'
        scope = matches[0]['A'] if matches else row['E']
        assert scope in by_code, 'Missing organizational scope'
        if row['C'] == 'قسم':
            assert len(matches) == 1 and by_code[scope]['B'] == 'قسم' and by_code[scope]['D'] == row['E'], 'Department/faculty mismatch'
        entries.append({'source_code': row['A'], 'name': row['B'], 'scope': scope, 'source': row.get('F', '')})
    return {'units': [{'source_code': r['A'], 'type': r['B'], 'name': r['C'], 'parent': r.get('D') or None} for r in ordered], 'councils': entries}


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def run():
    assert sys.argv[1:] in ([], ['--apply']), 'Only --apply is accepted'
    payload = prepare()
    checksum = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    sql = """
begin;
select set_config('request.jwt.claim.sub', ACTOR, true);
select set_config('request.jwt.claims', jsonb_build_object('sub',ACTOR,'role','authenticated','aal','aal2')::text,true);
select pg_advisory_xact_lock(hashtextextended('excel-councils:'||ORG,0));
create temporary table import_result(kind text,source_code text,id uuid,created boolean);
create temporary table import_baseline as select id,status from qarar_core.governance_units where organization_id=ORG::uuid;
create temporary table identity_baseline as select
 (select count(*) from qarar_iam.users where organization_id=ORG::uuid) users,
 (select count(*) from qarar_iam.memberships where organization_id=ORG::uuid) memberships;
do $import$
declare d jsonb:=PAYLOAD::jsonb; r jsonb; u qarar_core.governance_units%rowtype;
 t uuid; parent_id uuid; scope_id uuid; target_id uuid; reply jsonb; council_type uuid; count_matches integer;
begin
 if qarar_iam.current_organization_id()<>ORG::uuid or not exists(select 1 from qarar_iam.users where id=ACTOR::uuid and is_system_admin) then raise exception 'Wrong import context'; end if;
 select id into strict council_type from qarar_core.governance_unit_types where organization_id=ORG::uuid and name_ar='مجلس' and is_council_type and is_active;
 for r in select * from jsonb_array_elements(d->'units') loop
  reply:=api_v2.admin_create_organizational_unit_type_v2(r->>'type');
  t:=(reply->>'id')::uuid;
  parent_id:=null;
  if r->>'parent' is not null then select id into strict parent_id from import_result where kind='unit' and source_code=r->>'parent'; end if;
  select count(*),min(id::text)::uuid into count_matches,target_id from qarar_core.governance_units where organization_id=ORG::uuid and unit_type_id=t and name_ar=r->>'name' and status<>'archived';
  if count_matches>1 then raise exception 'Ambiguous existing unit: %',r->>'name'; end if;
  if count_matches=1 then
   select * into strict u from qarar_core.governance_units where id=target_id;
   if u.parent_unit_id is distinct from parent_id then raise exception 'Existing unit parent conflict: %',r->>'name'; end if;
  else
   reply:=api_v2.admin_create_organizational_unit_v2(r->>'name',t,parent_id,gen_random_uuid());target_id:=(reply->>'id')::uuid;
  end if;
  insert into import_result values('unit',r->>'source_code',target_id,count_matches=0);
 end loop;
 for r in select * from jsonb_array_elements(d->'councils') loop
  select id into strict scope_id from import_result where kind='unit' and source_code=r->>'scope';
  select count(*),min(g.id::text)::uuid into count_matches,target_id from qarar_core.governance_units g join qarar_core.governance_unit_types typ on typ.id=g.unit_type_id where g.organization_id=ORG::uuid and typ.is_council_type and g.status<>'archived' and translate(g.name_ar,'أإآ','ااا')=translate(r->>'name','أإآ','ااا');
  if count_matches>1 then raise exception 'Ambiguous existing council: %',r->>'name'; end if;
  if count_matches=1 then
   select * into strict u from qarar_core.governance_units where id=target_id for update;
   if u.scope_unit_id is not null and u.scope_unit_id<>scope_id then raise exception 'Existing council scope conflict: %',r->>'name'; end if;
   if u.scope_unit_id is null then
    update qarar_core.governance_units set scope_unit_id=scope_id,updated_at=clock_timestamp() where id=target_id and organization_id=ORG::uuid;
    perform qarar_audit.append_audit_log(ORG::uuid,'council.excel_scope_linked','governance_units',target_id,jsonb_build_object('previous_scope',u.scope_unit_id,'scope_unit_id',scope_id,'source_code',r->>'source_code','source_sha256',CHECKSUM));
   end if;
  else
   reply:=api_v2.admin_create_council_v2(r->>'name',null,'المصدر التنظيمي: '||(r->>'source'),council_type,scope_id,null,null,3,false,null,gen_random_uuid());target_id:=(reply->>'id')::uuid;
  end if;
  insert into import_result values('council',r->>'source_code',target_id,count_matches=0);
 end loop;
 if (select count(*) from import_result where kind='unit')<>29 or (select count(*) from import_result where kind='council')<>34 then raise exception 'Incomplete import'; end if;
 if exists(select 1 from import_result i join qarar_core.governance_units g on g.id=i.id where i.kind='council' and i.created and (g.status<>'inactive' or g.governance_class_id is null)) then raise exception 'Invalid imported council readiness'; end if;
 if exists(select 1 from import_baseline b join qarar_core.governance_units g on g.id=b.id where b.status<>g.status) then raise exception 'Existing lifecycle state changed'; end if;
 if (select users from identity_baseline)<>(select count(*) from qarar_iam.users where organization_id=ORG::uuid) or (select memberships from identity_baseline)<>(select count(*) from qarar_iam.memberships where organization_id=ORG::uuid) then raise exception 'Identity data changed'; end if;
 if (select count(*) from import_result i where i.kind='council' and exists(select 1 from jsonb_array_elements(api_v2.admin_get_council_organizational_tree_v2()->'councils') c where (c->>'id')::uuid=i.id))<>34 then raise exception 'Imported council absent from tree contract'; end if;
 perform qarar_audit.append_audit_log(ORG::uuid,'councils.excel_import_verified','organizations',ORG::uuid,jsonb_build_object('source_sha256',CHECKSUM,'source_file','مصفوفة حوكمة المجالس — الإصدار الحادي عشر مصحح الربط','records',(select jsonb_agg(to_jsonb(x) order by kind,source_code) from import_result x)));
end $import$;
select jsonb_build_object('units',count(*) filter(where kind='unit'),'councils',count(*) filter(where kind='council'),'created_units',count(*) filter(where kind='unit' and created),'created_councils',count(*) filter(where kind='council' and created),'linked_councils',(select count(*) from import_result i join qarar_core.governance_units g on g.id=i.id where i.kind='council' and g.scope_unit_id is not null),'tree_councils',jsonb_array_length(api_v2.admin_get_council_organizational_tree_v2()->'councils')) from import_result;
END_TX;
"""
    for key, value in [('ACTOR', literal(ACTOR)), ('ORG', literal(ORG)), ('PAYLOAD', literal(json.dumps(payload, ensure_ascii=False))), ('CHECKSUM', literal(checksum)), ('END_TX', 'commit' if '--apply' in sys.argv else 'rollback')]:
        sql = sql.replace(key, value)
    result = subprocess.run(['docker', 'exec', '-i', 'qarar-dev-supabase-db', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres'], input=sql, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    print('APPLIED' if '--apply' in sys.argv else 'VALIDATED; ROLLED BACK')
    print(result.stdout)


if __name__ == '__main__':
    run()
