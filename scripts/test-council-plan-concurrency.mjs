import fs from "node:fs";
import crypto from "node:crypto";
import {execFile,execFileSync} from "node:child_process";
import {promisify} from "node:util";
const container=process.env.DB_CONTAINER;
if(!/^qarar-council-test-db-[a-z0-9-]+$/.test(container??""))throw Error("An isolated test database is required");
const args=["exec",container,"psql","-X","-U","supabase_admin","-d","postgres","-At","-v","ON_ERROR_STOP=1","-c"];
const query=sql=>execFileSync("docker",[...args,sql],{encoding:"utf8"}).trim();
const prefix=crypto.randomBytes(4).toString("hex");
const id=end=>`${prefix}-0000-0000-0000-0000000000${end}`;
// Reuse the same explicitly scoped fixture as the transactional regression.
let fixture=fs.readFileSync(new URL("../supabase/tests/database/95_existing_council_meeting_plan_test.sql",import.meta.url),"utf8").split("create function pg_temp.save_plan")[0];
fixture=fixture.replaceAll("93000000",prefix).replaceAll("permission-matrix-test",`plan-race-${prefix}`).replaceAll("@example.test",`+${prefix}@example.test`).replace("select no_plan();","");
query(fixture+"\ncommit;");
const revision=query(`select updated_at from qarar_core.governance_units where id='${id("21")}'`);
const save=`begin;select set_config('request.jwt.claims','{"sub":"${id("10")}","role":"authenticated","aal":"aal2"}',true);
select api_v2.admin_update_council_v2('${id("21")}',
'{"name_ar":"مجلس اختبار التزامن","unit_type_id":"${id("20")}","minimum_active_members":3,"allow_dual_leadership":false}',
'${revision}','{"meeting_type_id":"${id("80")}","recurrence":"monthly","monthly_week":2,"first_meeting_date":"2026-11-01"}');commit;`;
const execute=promisify(execFile);
const outcomes=await Promise.allSettled([execute("docker",[...args,save]),execute("docker",[...args,save])]);
if(outcomes.filter(o=>o.status==="fulfilled").length!==1)throw Error("Concurrent saves did not produce exactly one winner");
const failure=outcomes.find(o=>o.status==="rejected");
if(!/للمجلس خطة اجتماعات محفوظة|تم تعديل المجلس/.test(failure.reason.stderr))throw Error("Second save failed for an unexpected reason");
if(query(`select count(*) from qarar_meetings.council_meeting_plans_v2 where governance_unit_id='${id("21")}'`)!=="1")throw Error("Duplicate plan");
if(query(`select count(*) from qarar_meetings.meetings where governance_unit_id='${id("21")}' and status='draft' and schedule_date_confirmed=false`)!=="1")throw Error("Duplicate or prematurely scheduled meeting");
console.log(JSON.stringify({passed:true,parallel_sessions:2,winners:1,plans:1,unconfirmed_drafts:1}));
