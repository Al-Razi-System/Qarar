import {render,screen,fireEvent,waitFor} from "@testing-library/react";
import {expect,it,vi} from "vitest";
import {AgendaInstructionsDialog} from "./agenda-instructions-dialog";
vi.mock("@/shared/ui/instruction-editor",()=>({InstructionEditor:({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void})=><textarea aria-label={label} value={value} onChange={e=>onChange(e.target.value)}/>}));
it("retains customized instructions on failed insertion",async()=>{
 const close=vi.fn(),save=vi.fn().mockRejectedValue(new Error("تغير جدول الأعمال"));
 render(<AgendaInstructionsDialog title="الموضوع" initialValue="الأصل" inserting onClose={close} onSave={save}/>);
 fireEvent.change(screen.getByRole("textbox",{name:"تعليمات المناقشة"}),{target:{value:"الخاص"}});
 fireEvent.click(screen.getByRole("button",{name:"حفظ وإدراج في الاجتماع"}));
 await screen.findByText("تغير جدول الأعمال");expect(close).not.toHaveBeenCalled();expect(screen.getByRole("textbox")).toHaveValue("الخاص");
});
it("saves only the topic instructions then closes",async()=>{
 const close=vi.fn(),save=vi.fn().mockResolvedValue(undefined);
 render(<AgendaInstructionsDialog title="الموضوع" initialValue="الأصل" inserting={false} onClose={close} onSave={save}/>);
 fireEvent.click(screen.getByRole("button",{name:"حفظ تعليمات الموضوع"}));
 await waitFor(()=>expect(close).toHaveBeenCalled());expect(save).toHaveBeenCalledWith("الأصل");
});
