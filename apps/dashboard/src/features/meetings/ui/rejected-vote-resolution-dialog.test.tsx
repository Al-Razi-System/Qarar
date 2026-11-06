import {fireEvent,render,screen} from "@testing-library/react";
import {expect,it,vi} from "vitest";
import {RejectedVoteResolutionDialog} from "./rejected-vote-resolution-dialog";

it("requires the chair to choose and explain a return before submitting",()=>{
 const onSubmit=vi.fn();
 render(<RejectedVoteResolutionDialog item={{voting_round_id:"round",topic_title:"خطة البرنامج",destination_unit_name_ar:"مجلس القسم",expected_version:0}} pending={false} error={null} onSubmit={onSubmit}/>);
 expect(screen.getByRole("dialog",{name:"حسم نتيجة عدم الموافقة"})).toBeInTheDocument();
 expect(screen.getByRole("button",{name:"تأكيد قرار الرئيس"})).toBeDisabled();
 fireEvent.click(screen.getByRole("button",{name:/إعادة الموضوع/}));
 fireEvent.change(screen.getByLabelText("سبب إعادة الموضوع"),{target:{value:"قصير"}});
 expect(screen.getByRole("button",{name:"تأكيد قرار الرئيس"})).toBeDisabled();
 fireEvent.change(screen.getByLabelText("سبب إعادة الموضوع"),{target:{value:"يلزم استكمال البيانات النظامية"}});
 fireEvent.click(screen.getByRole("button",{name:"تأكيد قرار الرئيس"}));
 expect(onSubmit).toHaveBeenCalledWith("return_previous","يلزم استكمال البيانات النظامية");
});
