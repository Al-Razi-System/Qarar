import {afterEach,expect,it,vi} from "vitest";
import {fireEvent,render,screen} from "@testing-library/react";
import {TopicDetailsWorkspace} from "./topic-details-workspace";
afterEach(()=>vi.unstubAllGlobals());
function mockTopic(failWorkflow=false, deniedContract=""){
 vi.stubGlobal("fetch",vi.fn(async(_url,options)=>{
  const {contract}=JSON.parse(options.body);
  const data=contract==="get_topic_detail"?{id:"topic",title_ar:"اختبار الميزانية",status:"new",priority:"medium",routing_status:"routing_ready",topic_type_version_id:"type",governance_unit:{name_ar:"مجلس الجامعة"},typed_creation_request:{snapshot:{topic_type_name_ar:"اعتماد الميزانية",authoring:{required_attachment_count:1},authorities:[{source_document_name:"اللائحة المالية",article_number:"المادة الخامسة",authority_text:"نص بند الميزانية المحفوظ"}]}}}:
   contract==="get_topic_workflow"?{status:"active",steps:[{id:"step",status:"active",sequence_no:1,snapshot:{name_ar:"مجلس الجامعة",allowed_outcomes:["approved","rejected"]}}]}:
   contract==="get_topic_route_history"?[{id:"referral",from_unit_name_ar:"مجلس الجامعة",to_unit_name_ar:"مجلس الأمناء",status:"pending",referral_reason:"طلب رأي الجهة المختصة"}]:
   contract==="get_topic_meeting_history"?[{agenda_item_id:"agenda",meeting:{id:"meeting",title:"اجتماع الميزانية",status:"closed"},voting_rounds:[{id:"closed",round_number:1,status:"closed",result:"approved",approve_count:7,reject_count:2,abstain_count:1},{id:"open",round_number:2,status:"open",approve_count:999}],decisions:[{id:"decision",decision_no:"DEC-1",decision_text:"القرار المحفوظ في الاجتماع",decision_status:"approved"}]}]:
   contract==="get_topic_prior_route_request"?null:[];
  const enriched=contract==="get_topic_detail"?{...data,history:[{id:"activity",to_status:"new",change_reason:"topic created",changed_by_name_ar:"مقدم الموضوع"}]}:data;
  const failed=contract===deniedContract||(contract==="get_topic_workflow"&&failWorkflow);
  return new Response(JSON.stringify(failed?{error:{message:"تعذر قراءة القسم"}}:{data:enriched}),{status:failed?403:200});
 }));
}
it("reads frozen classification authorities without legacy policy fields",async()=>{
 mockTopic();render(<TopicDetailsWorkspace topicId="topic"/>);await screen.findByRole("heading",{name:"اختبار الميزانية"});fireEvent.click(screen.getByRole("button",{name:/اللائحة/}));expect(await screen.findByText("اللائحة المالية")).toBeInTheDocument();expect(screen.getByText("المادة الخامسة")).toBeInTheDocument();expect(screen.getByText("نص بند الميزانية المحفوظ")).toBeInTheDocument();expect(screen.queryByText("لا توجد لائحة حاكمة بعد")).not.toBeInTheDocument();
});
it("keeps the topic workflow read-only even for an active approval step",async()=>{
 mockTopic();render(<TopicDetailsWorkspace topicId="topic"/>);await screen.findByRole("heading",{name:"اختبار الميزانية"});fireEvent.click(screen.getByRole("button",{name:/مسار/}));expect(screen.queryByRole("button",{name:"اعتماد وانتقال"})).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:"رفض الموضوع"})).not.toBeInTheDocument();expect(await screen.findByText(/تُتخذ قرارات الموضوع داخل الاجتماع/)).toBeInTheDocument();
});
it("does not hide a workflow read failure as an empty route",async()=>{
 mockTopic(true);render(<TopicDetailsWorkspace topicId="topic"/>);expect(await screen.findByText(/تعذر تحميل مسار الموضوع/)).toBeInTheDocument();
});
it("preserves referral, voting and activity tabs for typed topics",async()=>{
 mockTopic();render(<TopicDetailsWorkspace topicId="topic"/>);await screen.findByRole("heading",{name:"اختبار الميزانية"});
 fireEvent.click(screen.getByRole("button",{name:"الإحالات"}));
 expect(screen.getByRole("heading",{name:"الإحالات"})).toBeInTheDocument();
 expect(screen.getByText("طلب رأي الجهة المختصة")).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"القرارات والتصويت"}));
 expect(screen.getByRole("heading",{name:"القرارات والتصويت"})).toBeInTheDocument();
 expect(screen.getByText("القرار المحفوظ في الاجتماع")).toBeInTheDocument();
 expect(screen.getByText(/موافق: 7/)).toBeInTheDocument();
 expect(screen.queryByText(/999/)).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"سجل النشاط والتدقيق"}));
 expect(screen.getByRole("heading",{name:"سجل النشاط والتدقيق"})).toBeInTheDocument();
 expect(screen.getByText("تم إنشاء الموضوع")).toBeInTheDocument();
 expect(screen.getByText("تم تقديم الموضوع")).toBeInTheDocument();
 const calls=vi.mocked(fetch).mock.calls.map(([,options])=>JSON.parse(options?.body as string));
 expect(calls.every(call=>/^(get_|list_)/.test(call.contract))).toBe(true);
});
it("surfaces denied referral reading without treating it as successful empty history",async()=>{
 mockTopic(false,"get_topic_route_history");render(<TopicDetailsWorkspace topicId="topic"/>);
 expect(await screen.findByText(/تعذر تحميل إحالات الموضوع/)).toBeInTheDocument();
 expect(screen.getByRole("button",{name:"إعادة تحميل التفاصيل"})).toBeEnabled();
});
