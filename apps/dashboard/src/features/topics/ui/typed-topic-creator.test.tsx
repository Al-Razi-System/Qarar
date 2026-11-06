import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TypedTopicCreator } from "./typed-topic-creator";
afterEach(() => vi.unstubAllGlobals());
it("explains an empty submission scope after loading", async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json({data:{governance_units:[]}})));
  render(<TypedTopicCreator/>);
  expect(await screen.findByText("لا توجد مجالس نشطة متاحة للتقديم. تحقق من تفعيل المجلس واكتمال متطلباته، أو اطلب من مسؤول النظام مراجعة نطاق تقديمك.")).toBeVisible();
});
it("freezes an uncertain creation and retries the same request without duplicate identity",async()=>{
  const fetchMock=vi.fn(async(url:string,options?:RequestInit)=>{
    if(options?.method==="POST"){const body=JSON.parse(String(options.body));return Response.json({data:body.action==="prepare"?{request_id:body.requestId,files:[]}:{} });}
    return Response.json({data:url.includes("versionId")?{steps:[{name_ar:"مجلس القسم"}]}:url.includes("unitId")?[{topic_type_version_id:"v1",topic_type_name_ar:"خطة الاختبارات"}]:{governance_units:[{id:"u1",name_ar:"مجلس القسم"}]}});
  });vi.stubGlobal("fetch",fetchMock);render(<TypedTopicCreator/>);
  await screen.findByRole("option",{name:"مجلس القسم"});await userEvent.selectOptions(screen.getByLabelText("المجلس"),"u1");
  await screen.findByRole("option",{name:"خطة الاختبارات"});await userEvent.selectOptions(screen.getByLabelText("تصنيف الموضوع"),"v1");
  await screen.findByText("مسار الموضوع");await userEvent.type(screen.getByLabelText("تفاصيل الموضوع"),"تفاصيل طلب واضحة للمجلس");
  await userEvent.click(screen.getByRole("button",{name:"تقديم الموضوع"}));
  await waitFor(()=>expect(screen.getByLabelText("عنوان الموضوع")).toBeDisabled());
  await userEvent.click(screen.getByRole("button",{name:"التحقق من التقديم"}));
  const posts=fetchMock.mock.calls.filter(([,options])=>options?.method==="POST");expect(posts).toHaveLength(4);expect(posts[0][1]?.body).toBe(posts[2][1]?.body);expect(posts[1][1]?.body).toBe(posts[3][1]?.body);
});
it("uploads required files before final submission and exposes prior completion only with a valid route",async()=>{
  const sequence:string[]=[];
  vi.stubGlobal("fetch",vi.fn(async(url:string,options?:RequestInit)=>{
    if(options?.method==="POST"){
      if(options.body instanceof FormData){sequence.push("upload");return Response.json({data:{id:options.body.get("fileId")}});}
      const body=JSON.parse(String(options.body));sequence.push(body.action);return Response.json({data:body.action==="prepare"?{request_id:body.requestId,files:[]}:{topic_id:"t1",topic_no:"TOP-2026-000001"}});
    }
    return Response.json({data:url.includes("versionId")?{steps:[{name_ar:"مجلس القسم"},{name_ar:"مجلس الكلية"}],can_resume:true,prior_steps:[{template_step_id:"s1",name_ar:"مجلس القسم"},{template_step_id:"s2",name_ar:"مجلس الكلية"}],authoring:{required_attachment_count:2}}:url.includes("unitId")?[{topic_type_version_id:"v1",topic_type_name_ar:"خطة الاختبارات"}]:{governance_units:[{id:"u1",name_ar:"مجلس القسم"}]}});
  }));render(<TypedTopicCreator/>);
  await screen.findByRole("option",{name:"مجلس القسم"});await userEvent.selectOptions(screen.getByLabelText("المجلس"),"u1");await screen.findByRole("option",{name:"خطة الاختبارات"});await userEvent.selectOptions(screen.getByLabelText("تصنيف الموضوع"),"v1");
  await screen.findByText("مسار الموضوع");expect(screen.getByLabelText("استكمال مسار سابق")).toBeEnabled();
  await userEvent.type(screen.getByLabelText("تفاصيل الموضوع"),"تفاصيل واضحة للموضوع والمرفقات");
  expect(screen.getByRole("button",{name:"تقديم الموضوع"})).toBeDisabled();
  await userEvent.upload(screen.getByLabelText("مرفقات الموضوع"),[new File(["first"],"first.pdf",{type:"application/pdf"}),new File(["second"],"second.pdf",{type:"application/pdf"})]);
  await userEvent.click(screen.getByRole("button",{name:"تقديم الموضوع"}));await screen.findByRole("heading",{name:"تم تقديم الموضوع"});expect(sequence).toEqual(["prepare","upload","upload","submit"]);
  expect(screen.queryByLabelText("اختيار مرفق")).not.toBeInTheDocument();
});
it("selects the council first and requires successful route preparation before submitting", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => ({ data: url.includes("versionId") ? { steps: [{ name_ar: "مجلس القسم" }], authoring: { required_attachment_count: 2, submission_instructions: "أرفق خطة الاختبارات", discussion_instructions: "تعليمات خاصة بالمناقشة" } } : url.includes("unitId") ? [{ topic_type_version_id: "v1", topic_type_name_ar: "خطة الاختبارات" }] : { governance_units: [{ id: "u1", name_ar: "مجلس القسم" }] } }) })));
  render(<TypedTopicCreator/>);
  expect(screen.getByRole("button", { name: "تقديم الموضوع" })).toBeDisabled();
  await screen.findByRole("option", { name: "مجلس القسم" });
  await userEvent.selectOptions(screen.getByLabelText("المجلس"), "u1");
  await screen.findByRole("option", { name: "خطة الاختبارات" });
  await userEvent.selectOptions(screen.getByLabelText("تصنيف الموضوع"), "v1");
  expect(await screen.findByText("المرفقات المطلوبة: 2 على الأقل، تُرفع قبل تقديم الموضوع.")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "تعليمات التقديم" })).toHaveTextContent("أرفق خطة الاختبارات");
  expect(screen.queryByText("تعليمات خاصة بالمناقشة")).not.toBeInTheDocument();
  const instructions = screen.getByText("تعليمات التقديم").closest("details");
  expect(instructions).toHaveAttribute("open");
  await userEvent.click(screen.getByText("تعليمات التقديم"));
  expect(instructions).not.toHaveAttribute("open");
  expect(screen.getByRole("button", { name: "تقديم الموضوع" })).toBeDisabled();
});
