import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../api/councils-client", () => ({ councilRpc: vi.fn() }));
vi.mock("./organizational-council-tree", () => ({ OrganizationalCouncilTree: ({ onSelect }: { onSelect: (id: string) => void }) => <button onClick={() => onSelect("b")}>المجلس الثاني</button> }));
import { councilRpc } from "../api/councils-client";
import { CouncilsWorkspace } from "./councils-workspace";
import type { CouncilDetail, CouncilHierarchyData, CouncilMembership } from "../model/types";
const council: CouncilDetail = { id: "a", code: "a", name_ar: "مجلس الجامعة", status: "active", level_no: 1, unit_type_id: "type", unit_type: {id:"type",code:"council",name_ar:"مجلس"}, minimum_active_members:1,allow_dual_leadership:false,updated_at:"2026-10-11",scope_unit:{id:"scope",code:"scope",name_ar:"وحدة الجامعة"} };
const hierarchy: CouncilHierarchyData = { units: [], councils: [{...council,scope_unit_id:null},{...council,id:"b",name_ar:"المجلس الآخر",scope_unit_id:null}] };
const member: CouncilMembership = {id:"m",user_id:"u",full_name_ar:"عضو محفوظ",role_id:"r",role_code:"council_member",role_name_ar:"عضو",membership_status:"active",start_date:"2020-01-01",updated_at:"2026-10-11",is_effective:true};
const mount = () => render(<CouncilsWorkspace initialHierarchy={hierarchy} options={{council_types:[],parent_units:[],governance_classes:[],leadership_roles:[]}} roles={[]} users={[]} />);
function succeed() {
  vi.mocked(councilRpc).mockImplementation(async contract => {
    if (contract === "admin_get_council_detail_v2") return council;
    if (contract === "admin_list_council_members") return {items:[member],total:1};
    return {administratively_ready:true,errors:[],warnings:[]};
  });
}
afterEach(() => {cleanup();vi.resetAllMocks();});
it("does not claim zero members or invented detail when loading fails, and retries", async () => {
  vi.mocked(councilRpc).mockRejectedValue(new Error("تعذر تحميل بيانات المجلس"));
  mount();
  expect(await screen.findByRole("button",{name:"إعادة تحميل بيانات المجلس"})).toBeVisible();
  expect(screen.queryByText("الأعضاء (0)")).not.toBeInTheDocument();
  expect(screen.queryByText("نطاق المؤسسة أو ارتباط تاريخي")).not.toBeInTheDocument();
  succeed();
  fireEvent.click(screen.getByRole("button",{name:"إعادة تحميل بيانات المجلس"}));
  expect(await screen.findByRole("button",{name:"الأعضاء (1)"})).toBeVisible();
  fireEvent.click(screen.getByRole("button",{name:"الأعضاء (1)"}));
  expect(screen.getByText("عضو محفوظ")).toBeVisible();
});
it("does not show zero or old council fields while a selected council is loading", async () => {
  succeed();mount();
  expect(await screen.findByRole("button",{name:"الأعضاء (1)"})).toBeVisible();
  vi.mocked(councilRpc).mockImplementation(() => new Promise(() => {}));
  fireEvent.click(screen.getByRole("button",{name:"المجلس الثاني"}));
  expect(screen.queryByText("الأعضاء (0)")).not.toBeInTheDocument();
  expect(screen.queryByText("وحدة الجامعة")).not.toBeInTheDocument();
  expect(screen.getByText("جارٍ تحميل بيانات المجلس وأعضائه…")).toBeVisible();
});
it("ignores a late response belonging to a previous council", async () => {
  let resolveFirst: (value: CouncilDetail) => void = () => {};
  vi.mocked(councilRpc).mockImplementation(async (contract, params) => {
    if (contract === "admin_get_council_detail_v2") {
      if (params?.p_council_id === "a") return new Promise<CouncilDetail>(resolve => { resolveFirst = resolve; });
      return {...council,id:"b",name_ar:"المجلس الآخر",scope_unit:{id:"s2",code:"s2",name_ar:"وحدة المجلس الثاني"}};
    }
    if (contract === "admin_list_council_members") return {items:[{...member,user_id:"u2",full_name_ar:"عضو المجلس الثاني"}],total:1};
    return {administratively_ready:true,errors:[],warnings:[]};
  });
  mount();
  await waitFor(() => expect(councilRpc).toHaveBeenCalledWith("admin_get_council_detail_v2", {p_council_id:"a"}));
  fireEvent.click(screen.getByRole("button",{name:"المجلس الثاني"}));
  expect(await screen.findByText("وحدة المجلس الثاني")).toBeVisible();
  await act(async () => resolveFirst(council));
  expect(screen.getByText("وحدة المجلس الثاني")).toBeVisible();
  expect(screen.queryByText("وحدة الجامعة")).not.toBeInTheDocument();
});
