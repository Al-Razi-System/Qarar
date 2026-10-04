import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dockerEnv, fixturePath } from "./fixture";

type Fixture = { userId: string; organizationId: string; email: string; password: string };
type Lifecycle = Fixture & {
  meetingId: string;
  unitId: string;
  rapporteur: { id: string; email: string; password: string; name: string };
  member: { id: string; email: string; password: string; name: string };
};

let lifecycle: Lifecycle;
let serviceBase = "";
let serviceHeaders: Record<string, string>;
const createdAuthUserIds: string[] = [];

async function service(path: string, init: RequestInit = {}) {
  const response = await fetch(`${serviceBase}${path}`, { ...init, headers: { ...serviceHeaders, ...(init.headers ?? {}) } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path}: ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function createIdentity(label: string, password: string) {
  const email = `meeting-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  const user = await service("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  createdAuthUserIds.push(user.id as string);
  return { id: user.id as string, email, password };
}

test.beforeAll(async ({}, testInfo) => {
  const base = JSON.parse(await readFile(fixturePath, "utf8")) as Fixture;
  const env = await dockerEnv();
  serviceBase = env.SUPABASE_PUBLIC_URL || "http://127.0.0.1:54321";
  serviceHeaders = {
    apikey: env.SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
  const password = `Qarar-Lifecycle-${Date.now()}!Aa1`;
  const rapporteurIdentity = await createIdentity(`rapporteur-${testInfo.project.name}`, password);
  const memberIdentity = await createIdentity(`member-${testInfo.project.name}`, password);
  const ids = {
    unitType: randomUUID(), unit: randomUUID(),
    chairMembership: randomUUID(), rapporteurMembership: randomUUID(), memberMembership: randomUUID(),
    topic: randomUUID(), meeting: randomUUID(), agenda: randomUUID(),
    workflowVersion: randomUUID(), templateStep: randomUUID(), workflowMapping: randomUUID(),
    workflowInstance: randomUUID(), instanceStep: randomUUID(),
  };
  const suffix = `${Date.now()}-${testInfo.project.name.replace(/[^a-z0-9]+/gi, "-")}`;
  const unitCode = `e2e_${Date.now().toString().slice(-8)}`;
  const sql = `
    insert into qarar_iam.users (id,organization_id,email,full_name_ar) values
      ('${rapporteurIdentity.id}','${base.organizationId}','${rapporteurIdentity.email}','مقرر اختبار الاجتماع'),
      ('${memberIdentity.id}','${base.organizationId}','${memberIdentity.email}','عضو اختبار الاجتماع');
    insert into qarar_core.governance_unit_types (id,organization_id,code,name_ar,is_council_type)
      values ('${ids.unitType}','${base.organizationId}','${unitCode}','مجلس دورة الاجتماع',true);
    insert into qarar_core.governance_units
      (id,organization_id,unit_type_id,code,name_ar,quorum_percentage,minute_approval_rule)
      values ('${ids.unit}','${base.organizationId}','${ids.unitType}','${unitCode}','مجلس دورة الاجتماع',50,'all_present_members');
    insert into qarar_iam.permissions
      (organization_id,code,module,action,context_scope,name_ar,name_en,is_system_permission,is_active)
      select '${base.organizationId}',v.code,v.module,v.action,'governance_unit',v.code,v.code,true,true
      from (values
        ('attendance.read','attendance','read'),('attendance.manage','attendance','manage'),
        ('attendance.check_in','attendance','check_in'),('attendance.verify','attendance','verify'),
        ('attendance.override','attendance','override'),('attendance.lock','attendance','lock'),
        ('quorum.read','quorum','read'),('quorum.manage','quorum','manage'),
        ('voting.read','voting','read'),('voting.manage','voting','manage'),
        ('voting.cast','voting','cast'),('meetings.read','meetings','read'),
        ('meetings.manage','meetings','manage'),('agenda.manage','agenda','manage'),
        ('decisions.create','decisions','create'),('decisions.read','decisions','read'),
        ('decisions.manage','decisions','manage')
      ) as v(code,module,action)
      on conflict (organization_id,code) do update set is_active=true;
    insert into qarar_iam.roles
      (organization_id,code,name_ar,name_en,description,role_scope,is_active)
      values ('${base.organizationId}','council_member','عضو المجلس','Council member',
        'عضو مجلس ضمن نطاق وحدة حوكمة محددة','governance_unit',true)
      on conflict (organization_id,code) do update set
        name_ar=excluded.name_ar,name_en=excluded.name_en,description=excluded.description,
        role_scope=excluded.role_scope,is_active=true;
    insert into qarar_iam.role_permissions (organization_id,role_id,permission_id,is_active)
      select '${base.organizationId}',r.id,p.id,true
      from qarar_iam.roles r
      join qarar_iam.permissions p on p.organization_id=r.organization_id
      where p.organization_id='${base.organizationId}' and p.code in (
        'attendance.read','attendance.check_in','quorum.read','voting.read','voting.cast',
        'meetings.read','topics.read'
      ) and r.code='council_member'
      on conflict (organization_id,role_id,permission_id) do update set is_active=true;
    insert into qarar_iam.role_permissions (organization_id,role_id,permission_id,is_active)
      select '${base.organizationId}',r.id,p.id,true
      from qarar_iam.roles r
      join qarar_iam.permissions p on p.organization_id=r.organization_id
      where r.organization_id='${base.organizationId}'
        and r.code in ('council_chair','council_rapporteur')
        and p.code in (
          'attendance.read','attendance.manage','attendance.check_in','attendance.verify',
          'attendance.override','attendance.lock','quorum.read','quorum.manage',
          'voting.read','voting.manage','voting.cast','meetings.read','meetings.manage',
          'agenda.manage','topics.read','decisions.create','decisions.read','decisions.manage'
        )
      on conflict (organization_id,role_id,permission_id) do update set is_active=true;
    insert into qarar_iam.memberships (id,organization_id,user_id,governance_unit_id,role_id) values
      ('${ids.chairMembership}','${base.organizationId}','${base.userId}','${ids.unit}',
        (select id from qarar_iam.roles where organization_id='${base.organizationId}' and code='council_chair')),
      ('${ids.rapporteurMembership}','${base.organizationId}','${rapporteurIdentity.id}','${ids.unit}',
        (select id from qarar_iam.roles where organization_id='${base.organizationId}' and code='council_rapporteur')),
      ('${ids.memberMembership}','${base.organizationId}','${memberIdentity.id}','${ids.unit}',
        (select id from qarar_iam.roles where organization_id='${base.organizationId}' and code='council_member'));
    insert into qarar_topics.topics
      (id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status)
      values ('${ids.topic}','${base.organizationId}','TOP-E2E-${suffix}','موضوع دورة الاجتماع الشاملة','${ids.unit}','${base.userId}','approved');
    set session_replication_role=replica;
    insert into qarar_governance.workflow_template_steps
      (id,organization_id,workflow_template_version_id,step_code,name_ar,sequence_no,step_type,
       responsibility,governance_unit_id,is_initial,is_terminal,allowed_outcomes)
      values ('${ids.templateStep}','${base.organizationId}','${ids.workflowVersion}','vote','تصويت المجلس',1,
        'voting','final_approve','${ids.unit}',true,true,array['approved','rejected']);
    insert into qarar_governance.workflow_instances
      (id,organization_id,topic_id,topic_governance_mapping_id,workflow_template_version_id,status,
       started_by_user_id,snapshot)
      values ('${ids.workflowInstance}','${base.organizationId}','${ids.topic}','${ids.workflowMapping}',
        '${ids.workflowVersion}','active','${base.userId}','{}');
    insert into qarar_governance.workflow_instance_steps
      (id,organization_id,workflow_instance_id,template_step_id,sequence_no,status,assigned_unit_id,
       opened_at,snapshot)
      values ('${ids.instanceStep}','${base.organizationId}','${ids.workflowInstance}','${ids.templateStep}',1,
        'active','${ids.unit}',now(),'{}');
    update qarar_governance.workflow_instances set current_step_id='${ids.instanceStep}' where id='${ids.workflowInstance}';
    update qarar_topics.topics set workflow_instance_id='${ids.workflowInstance}',
      current_workflow_step_id='${ids.instanceStep}',workflow_template_version_id='${ids.workflowVersion}'
      where id='${ids.topic}';
    set session_replication_role=origin;
    insert into qarar_meetings.meetings
      (id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status)
      values ('${ids.meeting}','${base.organizationId}','MTG-E2E-${suffix}','${ids.unit}','اجتماع Playwright الشامل',current_date,'${base.userId}','ready_to_start');
    insert into qarar_meetings.agenda_items
      (id,organization_id,meeting_id,topic_id,agenda_order)
      values ('${ids.agenda}','${base.organizationId}','${ids.meeting}','${ids.topic}',1);
  `;
  execFileSync("docker", ["exec", "qarar-supabase-db", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", "postgres", "-c", sql]);
  lifecycle = {
    ...base, meetingId: ids.meeting, unitId: ids.unit,
    rapporteur: { ...rapporteurIdentity, name: "مقرر اختبار الاجتماع" },
    member: { ...memberIdentity, name: "عضو اختبار الاجتماع" },
  };
});

test.afterAll(async () => {
  for (const id of createdAuthUserIds) {
    await fetch(`${serviceBase}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: serviceHeaders });
  }
});

async function login(browser: Browser, email: string, password: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const response = await page.request.post("/api/auth/login", {
    data: { email, password }, headers: { "x-qarar-client-ip": `127.0.0.${Math.floor(Math.random() * 200) + 1}` },
  });
  expect(response.status(), await response.text()).toBe(200);
  return { context, page };
}

async function rpc<T>(page: Page, contract: string, params: Record<string, unknown> = {}) {
  const response = await page.request.post("/api/admin/meetings", { data: { contract, params } });
  const body = await response.json();
  expect(response.status(), body.error?.message ?? contract).toBe(200);
  return body.data as T;
}

async function openAgenda(page: Page) {
  await page.getByRole("button", { name: /جدول الأعمال والتصويت/ }).click();
}

async function vote(page: Page) {
  await page.reload();
  await openAgenda(page);
  await expect(page.getByText("تصويت مفتوح لك الآن")).toBeVisible();
  await page.getByRole("button", { name: "موافق", exact: true }).click();
  await expect(page.getByText("تم تسجيل صوتك وملاحظتك بسرية.")).toBeVisible();
}

async function sign(page: Page) {
  await page.reload();
  await expect(page.getByRole("button", { name: "مراجعة المحضر والتوقيع" })).toBeVisible();
  await page.getByRole("button", { name: "مراجعة المحضر والتوقيع" }).click();
  const canvas = page.getByLabel("مربع رسم التوقيع");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 20, box!.y + 40);
  await page.mouse.down();
  await page.mouse.move(box!.x + 120, box!.y + 100, { steps: 6 });
  await page.mouse.move(box!.x + 220, box!.y + 50, { steps: 6 });
  await page.mouse.up();
  await page.getByRole("button", { name: "توقيع ومصادقة" }).click();
  await expect(page.getByText("حُفظ توقيعك وربط ببصمة النسخة النهائية.")).toBeVisible();
}

test("دورة اجتماع حقيقية متعددة الحسابات حتى اعتماد المحضر", async ({ browser }) => {
  test.setTimeout(240_000);
  const chair = await login(browser, lifecycle.email, lifecycle.password);
  const rapporteur = await login(browser, lifecycle.rapporteur.email, lifecycle.rapporteur.password);
  const member = await login(browser, lifecycle.member.email, lifecycle.member.password);
  const contexts: BrowserContext[] = [chair.context, rapporteur.context, member.context];
  try {
    const opened = await rpc<{ meeting: { updated_at: string } }>(chair.page, "open_meeting_session", {
      p_meeting_id: lifecycle.meetingId,
      p_expected_updated_at: (await rpc<{ updated_at: string }>(chair.page, "get_meeting_detail", { p_meeting_id: lifecycle.meetingId })).updated_at,
    });
    const session = await rpc<{ attendance: Array<{ id: string; updated_at: string }>; meeting: { updated_at: string } }>(chair.page, "get_meeting_session_detail", { p_meeting_id: lifecycle.meetingId });
    for (const record of session.attendance) {
      await rpc(chair.page, "verify_attendance", {
        p_attendance_record_id: record.id, p_status: "present", p_note: "تحقق آلي لاختبار الواجهة الشامل", p_expected_updated_at: record.updated_at,
      });
    }
    const verified = await rpc<{ meeting: { updated_at: string } }>(chair.page, "get_meeting_session_detail", { p_meeting_id: lifecycle.meetingId });
    await rpc(chair.page, "lock_attendance_roster", { p_meeting_id: lifecycle.meetingId, p_expected_updated_at: verified.meeting.updated_at });

    for (const page of [chair.page, rapporteur.page, member.page]) {
      await page.goto(`/admin/meetings/${lifecycle.meetingId}/live`);
      await expect(page.getByRole("heading", { name: "اجتماع Playwright الشامل" })).toBeVisible({ timeout: 30_000 });
    }
    await expect(chair.page.getByText("لوحة رئيس المجلس")).toBeVisible();
    await expect(rapporteur.page.getByText("لوحة مقرر المجلس")).toBeVisible();
    await expect(member.page.getByText("بوابة عضو المجلس")).toBeVisible();

    await openAgenda(chair.page);
    await chair.page.getByRole("button", { name: "بدء المناقشة" }).click();
    await expect(chair.page.getByText("بدأت مناقشة البند.")).toBeVisible();
    await chair.page.getByRole("button", { name: "إنهاء المناقشة والانتقال للتصويت" }).click();
    await expect(chair.page.getByText("تم حفظ الملخص النهائي للبند بنجاح.")).toBeVisible();
    await chair.page.getByRole("button", { name: "فتح التصويت للأعضاء" }).click();
    const closeVote = chair.page.getByRole("button", { name: "إغلاق التصويت واحتساب النتيجة" });
    await expect(closeVote).toBeDisabled();
    await expect(chair.page.getByLabel("متابعة المشاركة في التصويت")).toContainText("0 من 3 صوّتوا");
    await expect(chair.page.getByLabel("متابعة المشاركة في التصويت")).not.toContainText("النتيجة النهائية");

    await vote(member.page);
    await vote(rapporteur.page);
    await vote(chair.page);
    await member.page.goto("about:blank");
    await chair.page.reload();
    await openAgenda(chair.page);
    await expect(chair.page.getByLabel("متابعة المشاركة في التصويت")).toContainText("3 من 3 صوّتوا");
    await expect(closeVote).toBeEnabled();
    await closeVote.click();
    await expect(chair.page.getByText("أُغلقت الجولة وحُسبت النتيجة.")).toBeVisible({ timeout: 15_000 });
    await expect(chair.page.getByLabel("النتيجة النهائية للتصويت")).toContainText("100%", { timeout: 30_000 });

    await rapporteur.page.reload();
    await openAgenda(rapporteur.page);
    const summary = rapporteur.page.getByPlaceholder("اكتب خلاصة المناقشة ونتيجة التصويت والتوصية النهائية...");
    await summary.fill("وافق المجلس على الموضوع وأوصى باستكمال التنفيذ وفق القرار المعتمد.");
    await rapporteur.page.getByRole("button", { name: "حفظ الملخص النهائي" }).click();
    await expect(rapporteur.page.getByText("تم الحفظ بنجاح")).toBeVisible();
    await rapporteur.page.goto("about:blank");

    await chair.page.reload();
    await openAgenda(chair.page);
    await chair.page.getByRole("button", { name: "صياغة القرار المعتمد" }).click();
    await chair.page.getByLabel("نص القرار").fill("اعتماد موضوع دورة الاجتماع الشاملة والبدء في تنفيذه.");
    await chair.page.getByRole("button", { name: "إنشاء القرار وإرساله للاعتماد" }).click();
    await expect(chair.page.getByText("تم حفظ صياغة القرار وإحالته للاعتماد.")).toBeVisible();
    await chair.page.getByRole("button", { name: "إنهاء الجلسة والانتقال إلى إعداد المحضر" }).click();
    await chair.page.getByRole("button", { name: "إنهاء الجلسة والانتقال", exact: true }).click();
    await expect(chair.page).toHaveURL(new RegExp(`/admin/meetings/${lifecycle.meetingId}/minutes`), { timeout: 30_000 });

    await expect(chair.page.getByRole("button", { name: "تثبيت النسخة وإرسالها لجميع الحاضرين" })).toBeVisible({ timeout: 20_000 });
    await chair.page.getByRole("button", { name: "تثبيت النسخة وإرسالها لجميع الحاضرين" }).click();
    await expect(chair.page.getByText("ثُبتت النسخة النهائية وأُرسلت إلى جميع الحاضرين للمصادقة.")).toBeVisible();
    await rapporteur.page.goto(`/admin/meetings/${lifecycle.meetingId}/minutes`);
    await member.page.goto(`/admin/meetings/${lifecycle.meetingId}/minutes`);
    await sign(member.page);
    await sign(rapporteur.page);
    await sign(chair.page);
    await expect(chair.page.getByText("اعتمد المحضر وأُغلق الاجتماع")).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
