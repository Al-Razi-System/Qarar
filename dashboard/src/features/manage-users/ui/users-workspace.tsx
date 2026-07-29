"use client";

import { useEffect, useState } from "react";
import { Plus, Users, X } from "lucide-react";
import { CreateUserForm, type RoleOption, type UnitOption } from "./create-user-form";
import { UsersTable, type ManagedUser } from "./users-table";

export function UsersWorkspace({
  users,
  total,
  roles,
  units,
}: {
  users: ManagedUser[];
  total: number;
  roles: RoleOption[];
  units: UnitOption[];
}) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-1.5 text-[11px] font-bold text-[#ff7a00]">
            إدارة الهوية والوصول
          </p>
          <h1 className="text-2xl font-black text-[#0a1330]">المستخدمون</h1>
          <p className="mt-2 text-xs leading-6 text-[#718196]">
            إدارة الحسابات والعضويات وحالات الوصول ضمن نطاق المنظمة.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0066cc] px-5 text-xs font-bold text-white shadow-[0_8px_20px_rgba(0,102,204,.18)] transition hover:bg-[#005bb7] sm:mr-auto"
        >
          <Plus size={17} />
          إنشاء حساب جديد
        </button>
      </div>

      <UsersTable users={users} total={total} />

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#081630]/55 p-3 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-user-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false);
          }}
        >
          <div className="thin-scrollbar relative max-h-[calc(100vh-1.5rem)] w-full max-w-6xl overflow-y-auto rounded-3xl bg-[#f5f8fc] p-5 shadow-2xl sm:max-h-[calc(100vh-3rem)] sm:p-7">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-[#ff7a00]">
                  <Users size={16} />
                  <span className="text-[11px] font-bold">إدارة الهوية والوصول</span>
                </div>
                <h2 id="create-user-title" className="text-xl font-black text-[#0a1330]">
                  إنشاء حساب جديد
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-xl border border-[#dfe7ef] bg-white text-[#65768b] transition hover:bg-[#edf4fb] hover:text-[#0066cc]"
                aria-label="إغلاق نافذة إنشاء الحساب"
              >
                <X size={19} />
              </button>
            </div>
            <CreateUserForm roles={roles} units={units} />
          </div>
        </div>
      )}
    </>
  );
}
