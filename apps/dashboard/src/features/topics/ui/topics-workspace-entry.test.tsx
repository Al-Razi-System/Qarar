import {render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
vi.mock("../api/topics-client",()=>({topicsRpc:vi.fn(async()=>({items:[],total:0}))}));
import {TopicsWorkspace} from "./topics-workspace";
afterEach(()=>vi.unstubAllGlobals());
it("uses only the typed topic page for new submissions",()=>{
  render(<TopicsWorkspace canCreate/>);
  expect(screen.getByRole("link",{name:"إنشاء موضوع"})).toHaveAttribute("href","/admin/topics/new");
  expect(screen.queryByRole("button",{name:"إنشاء موضوع"})).not.toBeInTheDocument();
  expect(screen.queryByText("بيانات مختصرة، ثم اختيار المسار")).not.toBeInTheDocument();
});
it("does not show a creation entry without create permission",()=>{
  render(<TopicsWorkspace canCreate={false}/>);
  expect(screen.queryByRole("link",{name:"إنشاء موضوع"})).not.toBeInTheDocument();
});
