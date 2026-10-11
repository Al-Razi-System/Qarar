import {render,screen} from "@testing-library/react";
import {expect,it} from "vitest";
import {MeetingAgendaPanel} from "./meeting-agenda-panel";
it("does not repeat the proposal insertion entry in an empty agenda",()=>{
 render(<MeetingAgendaPanel meetingId="meeting" items={[]} attachments={[]} editable busy={false} eligibleCount={1} onAdd={()=>{}} onMove={()=>{}} onRemove={()=>{}}/>);
 expect(screen.queryByRole("button",{name:"عرض الموضوعات وإضافتها"})).not.toBeInTheDocument();
 expect(screen.getByText("جدول الأعمال فارغ")).toBeInTheDocument();
});
