import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { UserRoles } from "./user-roles";
afterEach(()=>vi.restoreAllMocks());
const data={user_name_ar:"مستخدم",user_status:"inactive",memberships:[{id:"membership",role_id:"role",role_name_ar:"محرر",unit_id:"unit",unit_name_ar:"إدارة",title:null,status:"active",start_date:"2026-10-09",end_date:null,updated_at:"2026-10-09T00:00:00Z"}],roles:[{id:"role",name_ar:"محرر",code:"editor",role_scope:"governance_unit"}],units:[{id:"unit",name_ar:"إدارة",is_council:false}]};
it("loads multiple roles and keeps invited identity separate",async()=>{
 vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify(data)));
 render(<UserRoles userId="user"/>);
 expect(await screen.findByText("محرر")).toBeVisible();
 expect(screen.getByText(/لا يفعّل الحساب/)).toBeVisible();
 expect(screen.getByRole("button",{name:"تعطيل الدور"})).toBeEnabled();
});
it("shows failure at the action and preserves role list",async()=>{
 vi.spyOn(globalThis,"fetch").mockResolvedValueOnce(new Response(JSON.stringify(data))).mockResolvedValueOnce(new Response(JSON.stringify({message:"تغيّرت الأدوار"}),{status:409}));
 render(<UserRoles userId="user"/>);
 fireEvent.click(await screen.findByRole("button",{name:"تعطيل الدور"}));
 expect(await screen.findByRole("alert")).toHaveTextContent("تغيّرت الأدوار");
 expect(screen.getByText("محرر")).toBeVisible();
});
it("explains why an expired role cannot be enabled",async()=>{
 vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify({...data,memberships:[{...data.memberships[0],status:"inactive",end_date:"2020-01-01"}]})));
 render(<UserRoles userId="user"/>);
 expect(await screen.findByRole("button",{name:"إعادة تفعيل الدور"})).toBeDisabled();
 expect(screen.getByText("عدّل نهاية السريان قبل إعادة التفعيل.")).toBeVisible();
 expect(screen.getByRole("button",{name:"تعديل الدور"})).toBeEnabled();
});
