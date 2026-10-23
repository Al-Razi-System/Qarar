import {fireEvent,render,screen} from "@testing-library/react";
import {expect,it,vi} from "vitest";
import {MeetingAgendaPanel} from "./meeting-agenda-panel";
it("keeps proposed topics behind one compact counter action inside the agenda header",()=>{
 const open=vi.fn();
 render(<MeetingAgendaPanel meetingId="meeting" items={[]} attachments={[]} editable busy={false} eligibleCount={3} onAdd={open} onMove={()=>{}} onRemove={()=>{}}/>);
 fireEvent.click(screen.getByRole("button",{name:"عرض 3 موضوعات مقترحة"}));
 expect(open).toHaveBeenCalledTimes(1);
 expect(screen.getByText("جدول الأعمال فارغ")).toBeInTheDocument();
});
