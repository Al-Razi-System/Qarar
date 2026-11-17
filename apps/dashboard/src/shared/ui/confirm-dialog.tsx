"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./button";
import { Dialog } from "./dialog";

type Request = { message: string; confirmLabel: string; danger: boolean };

/**
 * An in-page replacement for window.confirm. `confirm(message)` opens the dialog and resolves to true
 * only when the person confirms; closing it any other way resolves to false. Render `dialog` once.
 */
export function useConfirm(): [(message: string, options?: { confirmLabel?: string; danger?: boolean }) => Promise<boolean>, ReactNode] {
  const [request, setRequest] = useState<Request | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const finish = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setRequest(null);
  }, []);
  // A dialog left open when the screen goes away counts as cancelled, so no action waits forever.
  useEffect(() => () => { resolver.current?.(false); }, []);

  const confirm = useCallback((message: string, options?: { confirmLabel?: string; danger?: boolean }) => {
    resolver.current?.(false);
    setRequest({ message, confirmLabel: options?.confirmLabel ?? "متابعة", danger: options?.danger ?? false });
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const dialog = request && (
    <Dialog title="تأكيد الإجراء" onClose={() => finish(false)} footer={<>
      <Button variant="secondary" onClick={() => finish(false)}>إلغاء</Button>
      <Button variant={request.danger ? "danger" : "primary"} onClick={() => finish(true)}>{request.confirmLabel}</Button>
    </>}>
      <p className="m-0 text-q-body text-q-text">{request.message}</p>
    </Dialog>
  );
  return [confirm, dialog];
}
