"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { PageHeader } from "@/shared/ui/page-header";
import { CreateUserForm, type RoleOption, type UnitOption } from "./create-user-form";
import { UsersTable, type ManagedUser } from "./users-table";
const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function UsersWorkspace({
  users,
  total,
  roles,
  units,
  canManageSubmissionScopes,
}: {
  users: ManagedUser[];
  total: number;
  roles: RoleOption[];
  units: UnitOption[];
  canManageSubmissionScopes: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ready = useSyncExternalStore(subscribeToHydration, clientReady, serverReady);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <PageHeader title="المستخدمون" description="إدارة الحسابات والعضويات وحالات الوصول ضمن نطاق المنظمة." meta="إدارة الهوية والوصول" actions={<Button disabled={!ready} title={!ready ? "جارٍ تجهيز إنشاء الحساب…" : undefined} onClick={() => setIsOpen(true)}><Plus size={17} /> إنشاء حساب جديد</Button>} />

      <UsersTable users={users} total={total} canManageSubmissionScopes={canManageSubmissionScopes} />

      {isOpen && <Dialog title="إنشاء حساب جديد" description="إدارة الهوية والوصول" onClose={() => setIsOpen(false)} size="xl" scrollContent><CreateUserForm roles={roles} units={units} canManageSubmissionScopes={canManageSubmissionScopes} onComplete={() => setIsOpen(false)} /></Dialog>}
    </>
  );
}
