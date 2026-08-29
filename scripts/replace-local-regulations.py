#!/usr/bin/env python3
"""Replace local Qarar regulations atomically after a governance-schema backup."""

from __future__ import annotations

import argparse
import datetime as dt
import decimal
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

import psycopg2
from psycopg2.extras import Json


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_RUNTIME_ROOT = ROOT.parent / "Qarar-core01"
ORGANIZATION_ID = "00000000-0000-0000-0000-000000000001"
ADMIN_EMAIL = "system.admin@demo.qarar.local"
APPROVER_EMAIL = "governance.admin@demo.qarar.local"


def json_default(value):
    if isinstance(value, (dt.date, dt.datetime, dt.time, decimal.Decimal, uuid.UUID)):
        return str(value)
    if isinstance(value, bytes):
        return {"encoding": "hex", "value": value.hex()}
    raise TypeError(f"Unsupported backup value: {type(value)!r}")


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    return values


def run_generation() -> None:
    commands = [
        ["node", "scripts/build-legal-source-catalog.mjs"],
        ["node", "scripts/build-binary-regulation-bundles.mjs"],
        ["node", "scripts/validate-binary-regulation-bundles.mjs"],
        ["node", "scripts/import-binary-regulation-bundles.mjs", "--export-v4"],
    ]
    for command in commands:
        subprocess.run(command, cwd=ROOT, check=True)


def snapshot_governance(cursor, destination: Path) -> None:
    cursor.execute(
        """
        select table_name
        from information_schema.tables
        where table_schema='qarar_governance' and table_type='BASE TABLE'
        order by table_name
        """
    )
    table_names = [row[0] for row in cursor.fetchall()]
    snapshot = {
        "schema_version": "qarar.governance_backup.v1",
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "database": "postgres",
        "organization_id": ORGANIZATION_ID,
        "tables": {},
    }
    for table_name in table_names:
        cursor.execute(f'SELECT * FROM qarar_governance."{table_name}"')
        columns = [description.name for description in cursor.description]
        snapshot["tables"][table_name] = {
            "columns": columns,
            "rows": [dict(zip(columns, row)) for row in cursor.fetchall()],
        }
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2, default=json_default) + "\n", encoding="utf-8")
    temporary.replace(destination)


def assert_no_runtime_references(cursor) -> None:
    cursor.execute(
        """
        with selected_policies as (
          select id from qarar_governance.policies where organization_id=%s
        ), selected_versions as (
          select id from qarar_governance.policy_versions where policy_id in(select id from selected_policies)
        ), selected_workflows as (
          select distinct workflow_template_version_id id
          from qarar_governance.policy_items
          where policy_version_id in(select id from selected_versions) and workflow_template_version_id is not null
          union
          select distinct b.workflow_template_version_id
          from qarar_governance.rule_workflow_bindings b
          join qarar_governance.policy_rules r on r.id=b.policy_rule_id
          join qarar_governance.policy_items i on i.id=r.policy_item_id
          where i.policy_version_id in(select id from selected_versions)
        )
        select 'topic_regulation_references',count(*) from qarar_governance.topic_regulation_references
        where policy_id in(select id from selected_policies) or policy_version_id in(select id from selected_versions)
        union all
        select 'topic_governance_mappings',count(*) from qarar_governance.topic_governance_mappings
        where policy_id in(select id from selected_policies) or policy_version_id in(select id from selected_versions)
           or workflow_template_version_id in(select id from selected_workflows)
        union all
        select 'workflow_instances',count(*) from qarar_governance.workflow_instances
        where workflow_template_version_id in(select id from selected_workflows)
        union all
        select 'regulation_match_decisions',count(*) from qarar_governance.regulation_match_decisions
        where selected_policy_id in(select id from selected_policies)
           or selected_policy_version_id in(select id from selected_versions)
           or selected_workflow_template_version_id in(select id from selected_workflows)
        """,
        (ORGANIZATION_ID,),
    )
    blockers = [(table, count) for table, count in cursor.fetchall() if count]
    if blockers:
        details = ", ".join(f"{table}={count}" for table, count in blockers)
        raise RuntimeError(f"Replacement blocked by runtime history: {details}")


def delete_existing_regulations(cursor) -> tuple[int, int]:
    cursor.execute(
        """
        create temporary table selected_policies on commit drop as
          select id from qarar_governance.policies where organization_id=%s;
        create temporary table selected_versions on commit drop as
          select id from qarar_governance.policy_versions where policy_id in(select id from selected_policies);
        create temporary table selected_items on commit drop as
          select id from qarar_governance.policy_items where policy_version_id in(select id from selected_versions);
        create temporary table selected_workflow_versions on commit drop as
          select distinct workflow_template_version_id id
          from qarar_governance.policy_items
          where policy_version_id in(select id from selected_versions) and workflow_template_version_id is not null
          union
          select distinct b.workflow_template_version_id
          from qarar_governance.rule_workflow_bindings b
          join qarar_governance.policy_rules r on r.id=b.policy_rule_id
          join qarar_governance.policy_items i on i.id=r.policy_item_id
          where i.policy_version_id in(select id from selected_versions);
        create temporary table selected_workflow_templates on commit drop as
          select distinct workflow_template_id id
          from qarar_governance.workflow_template_versions
          where id in(select id from selected_workflow_versions);

        -- This command is restricted to an explicitly confirmed local rebuild.
        -- Unlock the selected versions inside the same transaction before deleting descendants.
        update qarar_governance.policy_versions
        set legal_status='draft',automation_status='not_configured',readiness_percent=0,
            submitted_by_user_id=null,submitted_at=null,
            approved_by_user_id=null,approved_at=null,
            activated_by_user_id=null,activated_at=null,
            effective_from=null,effective_to=null
        where id in(select id from selected_versions);

        delete from qarar_governance.policy_references
        where source_policy_item_id in(select id from selected_items)
           or target_policy_id in(select id from selected_policies)
           or target_policy_version_id in(select id from selected_versions)
           or target_policy_item_id in(select id from selected_items);
        delete from qarar_governance.policy_attachments
        where policy_id in(select id from selected_policies)
           or policy_version_id in(select id from selected_versions)
           or policy_item_id in(select id from selected_items);
        delete from qarar_governance.policy_item_scope_overrides where policy_item_id in(select id from selected_items);
        delete from qarar_governance.policy_item_roles where policy_item_id in(select id from selected_items);
        delete from qarar_governance.policy_rules where policy_item_id in(select id from selected_items);
        update qarar_governance.policy_items set supersedes_item_id=null,parent_item_id=null where id in(select id from selected_items);
        delete from qarar_governance.policy_items where id in(select id from selected_items);
        delete from qarar_governance.policy_scope_assignments where policy_version_id in(select id from selected_versions);
        update qarar_governance.policy_versions set supersedes_version_id=null where id in(select id from selected_versions);
        delete from qarar_governance.policy_versions where id in(select id from selected_versions);
        delete from qarar_governance.policies where id in(select id from selected_policies);

        update qarar_governance.workflow_template_versions
        set status='draft',activated_by_user_id=null,activated_at=null
        where id in(select id from selected_workflow_versions);
        delete from qarar_governance.workflow_template_transitions where workflow_template_version_id in(select id from selected_workflow_versions);
        delete from qarar_governance.workflow_template_steps where workflow_template_version_id in(select id from selected_workflow_versions);
        delete from qarar_governance.workflow_template_versions where id in(select id from selected_workflow_versions);
        delete from qarar_governance.workflow_templates where id in(select id from selected_workflow_templates);
        """,
        (ORGANIZATION_ID,),
    )
    cursor.execute("select count(*) from selected_policies")
    policy_count = cursor.fetchone()[0]
    cursor.execute("select count(*) from selected_workflow_templates")
    workflow_count = cursor.fetchone()[0]
    return policy_count, workflow_count


def load_staging() -> tuple[list[dict], dict[str, dict]]:
    staging = sorted((ROOT / "data" / "staging-v4").glob("*.policy-import-v4.json"))
    binary = sorted((ROOT / "data" / "import-ready").glob("*.binary-bundle.json"))
    if len(staging) != 5 or len(binary) != 5:
        raise RuntimeError("Expected exactly five generated regulation bundles")
    binary_by_policy = {}
    for path in binary:
        value = json.loads(path.read_text(encoding="utf-8"))
        binary_by_policy[value["policy"]["code"]] = value
    return [json.loads(path.read_text(encoding="utf-8")) for path in staging], binary_by_policy


def set_actor(cursor, user_id: str) -> None:
    cursor.execute(
        "select set_config('request.jwt.claims',%s,true)",
        (json.dumps({"sub": user_id, "role": "authenticated"}),),
    )


def ensure_local_policy_approver(cursor, granted_by_user_id: str) -> str:
    cursor.execute(
        """
        select u.id
        from qarar_iam.users u
        join auth.users a on a.id=u.id
        where u.organization_id=%s and lower(a.email)=lower(%s) and u.status='active'
        """,
        (ORGANIZATION_ID, APPROVER_EMAIL),
    )
    row = cursor.fetchone()
    if not row:
        raise RuntimeError(f"Local policy approver is missing: {APPROVER_EMAIL}")
    approver_id = str(row[0])

    cursor.execute(
        """
        insert into qarar_iam.role_permissions(
          organization_id,role_id,permission_id,granted_by_user_id,is_active
        )
        select r.organization_id,r.id,p.id,%s,true
        from qarar_iam.roles r
        join qarar_iam.permissions p on p.organization_id=r.organization_id
        where r.organization_id=%s and r.code='governance_admin'
          and p.code='governance.policies.approve'
        on conflict(organization_id,role_id,permission_id) do update
        set is_active=true,granted_by_user_id=excluded.granted_by_user_id,updated_at=now()
        """,
        (granted_by_user_id, ORGANIZATION_ID),
    )
    if cursor.rowcount != 1:
        raise RuntimeError("Could not grant the local governance administrator policy approval permission")
    return approver_id


def validate_and_activate_versions(cursor, imported: list[dict], admin_id: str, approver_id: str) -> list[dict]:
    lifecycle = []
    set_actor(cursor, admin_id)
    for result in imported:
        version_id = result["version_id"]
        cursor.execute(
            "select qarar_governance.admin_validate_policy_version_readiness(%s::uuid)",
            (version_id,),
        )
        readiness = cursor.fetchone()[0]
        if not readiness["ready"] or readiness["score"] != 100:
            raise RuntimeError(
                f"Policy version is not ready: version={version_id}, errors={readiness['errors']}"
            )
        cursor.execute(
            "select qarar_governance.admin_submit_policy_for_review(%s::uuid)",
            (version_id,),
        )
        cursor.fetchone()
        lifecycle.append({"version_id": version_id, "readiness": readiness})

    set_actor(cursor, approver_id)
    for result in lifecycle:
        cursor.execute(
            "select qarar_governance.admin_approve_policy_version(%s::uuid)",
            (result["version_id"],),
        )
        cursor.fetchone()
        cursor.execute(
            "select qarar_governance.admin_activate_policy_version(%s::uuid,%s::date,null)",
            (result["version_id"], dt.date.today()),
        )
        result["activation"] = cursor.fetchone()[0]
    return lifecycle


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--confirm-local-replace", action="store_true")
    parser.add_argument("--runtime-root", type=Path, default=DEFAULT_RUNTIME_ROOT)
    args = parser.parse_args()
    if not args.confirm_local_replace:
        raise RuntimeError("Pass --confirm-local-replace to delete and replace local regulations")

    env_path = args.runtime_root / "supabase" / "docker" / ".env"
    env = load_env(env_path)
    if env.get("SUPABASE_PUBLIC_URL", "").split("://")[-1].split(":")[0] not in {"localhost", "127.0.0.1", "::1"}:
        raise RuntimeError("Refusing to modify a non-local Supabase instance")

    run_generation()
    staged_bundles, binary_by_policy = load_staging()
    connection = psycopg2.connect(
        host="127.0.0.1",
        port=int(env.get("QARAR_DB_DIRECT_PORT", "54328")),
        dbname="postgres",
        user="supabase_admin",
        password=env["POSTGRES_PASSWORD"],
    )
    try:
        cursor = connection.cursor()
        cursor.execute("select id from auth.users where email=%s", (ADMIN_EMAIL,))
        row = cursor.fetchone()
        if not row:
            raise RuntimeError(f"Import administrator is missing: {ADMIN_EMAIL}")
        admin_id = str(row[0])
        cursor.execute(
            "select code,id from qarar_governance.governance_unit_classes where organization_id=%s and is_active",
            (ORGANIZATION_ID,),
        )
        class_ids = {code: str(identifier) for code, identifier in cursor.fetchall()}

        timestamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = ROOT / "backups" / f"qarar-governance-pre-regulation-replace-{timestamp}.json"
        snapshot_governance(cursor, backup)
        connection.rollback()

        cursor = connection.cursor()
        set_actor(cursor, admin_id)
        approver_id = ensure_local_policy_approver(cursor, admin_id)
        assert_no_runtime_references(cursor)
        deleted_policies, deleted_workflows = delete_existing_regulations(cursor)

        imported = []
        for staged in staged_bundles:
            source = binary_by_policy[staged["policy"]["code"]]
            staged["policy"]["owner_user_id"] = admin_id
            scope_code = source["scopes"][0]["governance_class_code"]
            if staged["version"]["scopes"][0]["scope_type"] == "governance_class":
                if scope_code not in class_ids:
                    raise RuntimeError(f"Missing governance class: {scope_code}")
                staged["version"]["scopes"][0]["target_id"] = class_ids[scope_code]
            request_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"qarar:{source['content_sha256']}"))
            cursor.execute(
                "select qarar_governance.admin_import_policy_bundle_v4(%s::jsonb,%s::uuid)",
                (Json(staged), request_id),
            )
            imported.append(cursor.fetchone()[0])

        lifecycle = validate_and_activate_versions(cursor, imported, admin_id, approver_id)

        expected_items = sum(bundle["validation_summary"]["item_count"] for bundle in binary_by_policy.values())
        cursor.execute("select count(*) from qarar_governance.policies where organization_id=%s", (ORGANIZATION_ID,))
        policy_count = cursor.fetchone()[0]
        cursor.execute(
            """select count(*) from qarar_governance.policy_items i join qarar_governance.policy_versions v on v.id=i.policy_version_id join qarar_governance.policies p on p.id=v.policy_id where p.organization_id=%s""",
            (ORGANIZATION_ID,),
        )
        item_count = cursor.fetchone()[0]
        if policy_count != 5 or item_count != expected_items:
            raise RuntimeError(f"Post-import verification failed: policies={policy_count}, items={item_count}, expected_items={expected_items}")
        cursor.execute(
            """
            select
              count(*) filter(where v.legal_status='effective' and v.automation_status='ready' and v.readiness_percent=100),
              count(*) filter(where i.workflow_template_version_id is not null),
              count(*) filter(where exists(
                select 1 from qarar_governance.policy_rules r
                join qarar_governance.rule_workflow_bindings b on b.policy_rule_id=r.id
                where r.policy_item_id=i.id
              ))
            from qarar_governance.policy_versions v
            join qarar_governance.policies p on p.id=v.policy_id
            join qarar_governance.policy_items i on i.policy_version_id=v.id
            where p.organization_id=%s
            """,
            (ORGANIZATION_ID,),
        )
        effective_item_rows, directly_linked_items, rule_linked_items = cursor.fetchone()
        if effective_item_rows != item_count or directly_linked_items != item_count or rule_linked_items != item_count:
            raise RuntimeError(
                "Post-activation verification failed: "
                f"effective={effective_item_rows}, direct_workflows={directly_linked_items}, "
                f"rule_workflows={rule_linked_items}, items={item_count}"
            )
        connection.commit()
        print(json.dumps({
            "status": "REGULATIONS_REPLACED",
            "backup": str(backup),
            "deleted_policies": deleted_policies,
            "deleted_workflows": deleted_workflows,
            "imported_policies": len(imported),
            "items": item_count,
            "imports": imported,
            "lifecycle": lifecycle,
        }, ensure_ascii=False, indent=2))
        return 0
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"REGULATION_REPLACEMENT_FAILED: {error}", file=sys.stderr)
        raise
