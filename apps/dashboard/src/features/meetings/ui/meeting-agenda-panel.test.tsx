import {fireEvent,render,screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {expect,it,vi} from "vitest";
import {MeetingAgendaPanel} from "./meeting-agenda-panel";
it("keeps proposed topics behind one compact counter action inside the agenda header",()=>{
 const open=vi.fn();
 render(<MeetingAgendaPanel meetingId="meeting" items={[]} attachments={[]} editable busy={false} eligibleCount={3} onAddProposals={open} onMove={()=>{}} onRemove={()=>{}}/>);
 fireEvent.click(screen.getByRole("button",{name:"عرض 3 موضوعات مقترحة"}));
 expect(open).toHaveBeenCalledTimes(1);
 expect(screen.getByText("جدول الأعمال فارغ")).toBeInTheDocument();
});

it("keeps the proposal browser available at zero and the direct-topic action independent",()=>{
 const open=vi.fn();
 const direct=vi.fn();
 render(<MeetingAgendaPanel meetingId="meeting" items={[]} attachments={[]} editable busy={false} eligibleCount={0} canAddDirect onAddProposals={open} onAddDirect={direct} onMove={()=>{}} onRemove={()=>{}}/>);
 fireEvent.click(screen.getByRole("button",{name:"عرض 0 موضوعات مقترحة"}));
 fireEvent.click(screen.getByRole("button",{name:"موضوع مباشر"}));
 expect(open).toHaveBeenCalledTimes(1);
 expect(direct).toHaveBeenCalledTimes(1);
});

it("does not expose agenda actions when the meeting is not editable for the viewer",()=>{
 render(<MeetingAgendaPanel meetingId="meeting" items={[]} attachments={[]} editable={false} busy={false} eligibleCount={4} canAddDirect onAddProposals={()=>{}} onAddDirect={()=>{}} onMove={()=>{}} onRemove={()=>{}}/>);
 expect(screen.queryByRole("button",{name:"عرض 4 موضوعات مقترحة"})).not.toBeInTheDocument();
 expect(screen.queryByRole("button",{name:"موضوع مباشر"})).not.toBeInTheDocument();
});

it("opens the topic context and previous decisions inside the agenda",()=>{
 render(<MeetingAgendaPanel meetingId="meeting" items={[{
  id:"item-1",agenda_order:1,topic:{id:"topic-1",title_ar:"الخطة",context:{
   description:"تفاصيل الخطة.",route:[],previous_decisions:[{id:"decision-1",decision_no:"DEC-1",decision_text:"اعتماد مبدئي.",meeting_title_ar:"اجتماع سابق",meeting_no:"MTG-1",meeting_date:"2026-10-01",unit_name_ar:"مجلس الكلية"}],
  }},
 }]} attachments={[]} editable={false} busy={false} eligibleCount={null} onAddProposals={()=>{}} onMove={()=>{}} onRemove={()=>{}}/>);
 fireEvent.click(screen.getByRole("button",{name:"عرض تفاصيل الموضوع وقراراته السابقة"}));
 expect(screen.getByText("تفاصيل الخطة.")).toBeVisible();
 expect(screen.getByText("اعتماد مبدئي.")).toBeVisible();
 expect(screen.queryByRole("link",{name:"عرض تفاصيل الموضوع ومرفقاته"})).not.toBeInTheDocument();
});

it("lets contextual council leadership explicitly open member downloads per agenda item",async()=>{
 const user=userEvent.setup();
 const onChange=vi.fn();
 render(<MeetingAgendaPanel meetingId="meeting" items={[{
  id:"item-1",agenda_order:1,topic:{id:"topic-1",title_ar:"الخطة"},
 }]} attachments={[{
  id:"file-1",topic_id:"topic-1",agenda_item_id:"item-1",file_name:"الخطة.pdf",file_url:"/api/file",mime_type:"application/pdf",
  download_allowed:false,viewer_download_allowed:true,viewer_can_manage_downloads:true,download_revision:4,
 }]} editable busy={false} eligibleCount={0} onAddProposals={()=>{}} onMove={()=>{}} onRemove={()=>{}}
 downloadState={{pendingItemId:null,errorItemId:null,error:null,onChange}}/>);

 expect(screen.getByText("عرض فقط")).toBeInTheDocument();
 await user.click(screen.getByRole("button",{name:"فتح تنزيل المرفقات للأعضاء"}));
 expect(screen.getByRole("dialog",{name:"فتح تنزيل المرفقات للأعضاء؟"})).toBeInTheDocument();
 await user.click(screen.getByRole("button",{name:"تأكيد فتح التنزيل"}));
 expect(onChange).toHaveBeenCalledWith("item-1",true,4);
});
