import { execFileSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { dockerEnv, fixturePath } from "./fixture";

export default async function globalTeardown() {
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  execFileSync("docker", [
    "exec", "qarar-supabase-db", "psql", "-X", "-v", "ON_ERROR_STOP=1",
    "-U", "supabase_admin", "-d", "postgres", "-Atqc", `
      set session_replication_role=replica;
      do $cleanup$
      declare r record;
      begin
        for r in select n.nspname s,c.relname t from pg_class c
          join pg_namespace n on n.oid=c.relnamespace
          join pg_attribute a on a.attrelid=c.oid
          where c.relkind in ('r','p') and a.attname='organization_id'
            and n.nspname like 'qarar\\_%' escape '\\'
        loop execute format('delete from %I.%I where organization_id=$1',r.s,r.t)
          using '${fixture.organizationId}'::uuid; end loop;
        delete from qarar_core.organizations where id='${fixture.organizationId}';
      end $cleanup$;
      set session_replication_role=origin;`,
  ]);
  const env = await dockerEnv();
  const base = env.SUPABASE_PUBLIC_URL || "http://127.0.0.1:54321";
  await fetch(`${base}/auth/v1/admin/users/${fixture.userId}`, {
    method: "DELETE",
    headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SERVICE_ROLE_KEY}` },
  });
  await rm(fixturePath, { force: true });
}
