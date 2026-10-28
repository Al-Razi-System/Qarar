import {afterEach,expect,it,vi} from "vitest";
import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {TopicDetailsWorkspace} from "./topic-details-workspace";
afterEach(()=>vi.unstubAllGlobals());
function mockTopic(failWorkflow=false, deniedContract=""){
 vi.stubGlobal("fetch",vi.fn(async(_url,options)=>{
  const {contract}=JSON.parse(options.body);
  const data=contract==="get_topic_detail"?{id:"topic",title_ar:"اختبار الميزانية",status:"new",priority:"medium",routing_status:"routing_ready",topic_type_version_id:"type",governance_unit:{name_ar:"مجلس الجامعة"},typed_creation_request:{snapshot:{topic_type_name_ar:"اعتماد الميزانية",authoring:{required_attachment_count:1},authorities:[{source_document_name:"اللائحة المالية",article_number:"المادة الخامسة",authority_text:"نص بند الميزانية المحفوظ"}]}}}:
   contract==="get_topic_workflow"?{status:"active",steps:[{id:"step",status:"active",sequence_no:1,snapshot:{name_ar:"مجلس الجامعة",allowed_outcomes:["approved","rejected"]}}]}:
   contract==="get_topic_route_history"?[{id:"referral",from_unit_name_ar:"مجلس الجامعة",to_unit_name_ar:"مجلس الأمناء",status:"pending",referral_reason:"طلب رأي الجهة المختصة"}]:
   contract==="get_topic_meeting_history"?[{agenda_item_id:"agenda",meeting:{id:"meeting",meeting_no:"MTG-1",title:"اجتماع الميزانية",status:"closed",unit_name:"مجلس القسم"},minutes:{id:"minute",status:"approved",content:"النص الرسمي لمحضر مجلس القسم",approved_at:"2026-10-20T11:00:00Z"},voting_rounds:[{id:"closed",round_number:1,status:"closed",result:"approved",approve_count:7,reject_count:2,abstain_count:1},{id:"open",round_number:2,status:"open",approve_count:999}],decisions:[{id:"decision",decision_no:"DEC-1",decision_text:"القرار المحفوظ في الاجتماع",decision_status:"approved"}]}]:
   contract==="get_topic_activity_timeline"?[{id:"status",source:"status_history",action:"topic.status.changed",entity_type:"topics",occurred_at:"2026-10-20T08:00:00Z",actor_name_ar:"مقدم الموضوع",to_status:"new",summary:"تقديم موضوع بتصنيف معتمد"},{id:"audit",source:"audit",action:"meetings.agenda.discussion.complete",entity_type:"agenda_items",occurred_at:"2026-10-20T10:00:00Z",actor_name_ar:"رئيس المجلس"}]:
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
 expect(screen.getByText("تم تقديم الموضوع")).toBeInTheDocument();
 expect(screen.getByText("اكتمال مناقشة البند")).toBeInTheDocument();
 const calls=vi.mocked(fetch).mock.calls.map(([,options])=>JSON.parse(options?.body as string));
 expect(calls.every(call=>/^(get_|list_)/.test(call.contract))).toBe(true);
});
it("surfaces denied referral reading without treating it as successful empty history",async()=>{
 mockTopic(false,"get_topic_route_history");render(<TopicDetailsWorkspace topicId="topic"/>);
 expect(await screen.findByText(/تعذر تحميل إحالات الموضوع/)).toBeInTheDocument();
 expect(screen.getByRole("button",{name:"إعادة تحميل التفاصيل"})).toBeEnabled();
});
it("shows the approved prior council minute and persisted cross-module audit timeline",async()=>{
 mockTopic();render(<TopicDetailsWorkspace topicId="topic"/>);await screen.findByRole("heading",{name:"اختبار الميزانية"});
 fireEvent.click(screen.getByRole("button",{name:"القرارات والتصويت"}));
 expect(screen.getByText("محضر المجلس السابق")).toBeInTheDocument();
 expect(screen.getByText("النص الرسمي لمحضر مجلس القسم")).toBeInTheDocument();
 expect(screen.getByText("محضر معتمد")).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"سجل النشاط والتدقيق"}));
 expect(screen.getByText("اكتمال مناقشة البند")).toBeInTheDocument();
 expect(screen.getByText(/رئيس المجلس/)).toBeInTheDocument();
 expect(screen.getAllByText("تم تقديم الموضوع")).toHaveLength(1);
});
it("lets only the returned topic submitter resubmit from the action location",async()=>{
 let resubmitted=false;
 vi.stubGlobal("fetch",vi.fn(async(_url,options)=>{
  const {contract}=JSON.parse(options.body);
  if(contract==="resubmit_returned_topic"){resubmitted=true;return new Response(JSON.stringify({data:{topic_id:"topic"}}));}
  const data=contract==="get_topic_detail"?{id:"topic",title_ar:"موضوع معاد للاستكمال",status:resubmitted?"approved":"returned",priority:"medium",routing_status:resubmitted?"routing_ready":"routing_blocked",history:[{id:"return",to_status:"returned",change_reason:"استكمال المرفقات النظامية"}]}:
   contract==="get_topic_resubmission_option"?{available:!resubmitted,expected_version:3,destination_unit_name_ar:"مجلس القسم"}:
   contract==="get_topic_workflow"?{status:resubmitted?"active":"blocked",steps:[]}:
   contract==="get_topic_requirements_status"?{items:[],missing_mandatory:0,ready_for_review:true}:[];
  return new Response(JSON.stringify({data}));
 }));
 render(<TopicDetailsWorkspace topicId="topic"/>);
 const action=await screen.findByRole("button",{name:"إعادة إرسال الموضوع"});
 fireEvent.click(action);
 await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(([,options])=>JSON.parse(options?.body as string).contract==="resubmit_returned_topic")).toBe(true));
 expect(await screen.findByText("أُعيد إرسال الموضوع إلى مجلس القسم بنجاح.")).toBeInTheDocument();
 expect(screen.queryByRole("button",{name:"إعادة إرسال الموضوع"})).not.toBeInTheDocument();
});
