import {expect,it,vi} from "vitest";
import {fireEvent,render,screen} from "@testing-library/react";
import {SubmittedAgendaSuggestions} from "./submitted-agenda-suggestions";
it("lets the chair review inherited instructions before insertion",()=>{
 const review=vi.fn(),item={id:"topic",title_ar:"الموضوع",discussion_instructions:"تعليمات التصنيف"};
 render(<SubmittedAgendaSuggestions items={[item]} total={1} busy={false} onAdd={()=>{}} onMore={()=>{}} onReview={review}/>);
 fireEvent.click(screen.getByRole("button",{name:"مراجعة التعليمات والإدراج"}));expect(review).toHaveBeenCalledWith(item);
 expect(screen.queryByRole("button",{name:"إدراج في هذا الاجتماع"})).not.toBeInTheDocument();
});
it("offers meeting insertion, never topic approval",()=>{
 const add=vi.fn();render(<SubmittedAgendaSuggestions items={[{id:"topic",title_ar:"الميزانية المقدمة",current_step:"مجلس الجامعة"}]} total={1} busy={false} onAdd={add} onMore={()=>{}}/>);expect(screen.getByText("الميزانية المقدمة")).toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"إدراج في هذا الاجتماع"}));expect(add).toHaveBeenCalledWith("topic");expect(screen.queryByRole("button",{name:/اعتماد|رفض/})).not.toBeInTheDocument();
});
it("prevents duplicate insertion while saving",()=>{
 render(<SubmittedAgendaSuggestions items={[{id:"topic",title_ar:"الميزانية المقدمة"}]} total={1} busy onAdd={()=>{}} onMore={()=>{}}/>);expect(screen.getByRole("button",{name:/إدراج في هذا الاجتماع/})).toBeDisabled();
});
it("shows insertion failure beside the proposal action",()=>{
 render(<SubmittedAgendaSuggestions items={[{id:"topic",title_ar:"الميزانية المقدمة"}]} total={1} busy={false} onAdd={()=>{}} onMore={()=>{}} notice={{kind:"error",text:"تعذر الإدراج، أعد المحاولة."}}/>);
 expect(screen.getByText("تعذر الإدراج، أعد المحاولة.")).toBeInTheDocument();
 expect(screen.getByRole("button",{name:"إدراج في هذا الاجتماع"})).toBeEnabled();
});
