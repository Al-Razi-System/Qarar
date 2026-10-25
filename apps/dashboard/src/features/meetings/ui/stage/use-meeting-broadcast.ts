"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { liveMeetingRpc } from "../../api/live-meeting-client";
import type { MeetingBroadcast } from "../../model/live-meeting";
import type { ReferenceTab } from "./topic-card";

/** How often a screen asks for the broadcast when the room's channel is down. */
export const BROADCAST_REFRESH_MS = 2_000;
/** How often it still asks while the channel tells it of every change. */
export const BROADCAST_FALLBACK_MS = 10_000;

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * The broadcast of the council's screens. A screen reads it again as soon as
 * the room's channel says it changed (`signal.tick`), and periodically as a
 * fallback: every two seconds without the channel, every ten with it. The
 * controller's choices are shown at once and sent in order, each against the
 * revision the server last confirmed, so two quick clicks never overwrite each
 * other. A refused change restores the server's state and says why.
 */
export function useMeetingBroadcast(meetingId: string, enabled: boolean, signal?: { tick: number; connected: boolean }) {
  const [broadcast, setBroadcast] = useState<MeetingBroadcast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const shown = useRef<MeetingBroadcast | null>(null);
  const confirmedRevision = useRef(0);
  const writing = useRef(false);
  const queued = useRef<BroadcastChange | null>(null);

  function show(next: MeetingBroadcast, confirmed = true) {
    shown.current = next;
    if (confirmed) confirmedRevision.current = next.revision;
    setBroadcast(next);
  }

  const tick = signal?.tick ?? 0;
  const interval = signal?.connected ? BROADCAST_FALLBACK_MS : BROADCAST_REFRESH_MS;
  const room = { meetingId };

  async function reload() {
    const fresh = await liveMeetingRpc<MeetingBroadcast>("get_meeting_broadcast_v2", { p_meeting_id: meetingId }, room);
    if (!writing.current) show(fresh);
    return fresh;
  }

  const refresh = useEffectEvent(async () => {
    if (writing.current) return;
    try {
      const fresh = await liveMeetingRpc<MeetingBroadcast>("get_meeting_broadcast_v2", { p_meeting_id: meetingId }, room);
      if (writing.current) return;
      if (JSON.stringify(fresh) !== JSON.stringify(shown.current)) show(fresh);
      setError((current) => (current === READ_FAILED ? null : current));
    } catch {
      // The screen keeps the last state it knows; the viewer is told it may be behind.
      setError(READ_FAILED);
    }
  });

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: number | undefined;
    async function next() {
      await refresh();
      if (!stopped) timer = window.setTimeout(() => void next(), interval);
    }
    void next();
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [meetingId, enabled, interval, tick]);

  async function flush() {
    writing.current = true;
    try {
      while (queued.current) {
        const next = queued.current;
        queued.current = null;
        try {
          const saved = next.kind === "view"
            ? await liveMeetingRpc<MeetingBroadcast>("set_meeting_broadcast_v2", {
              p_meeting_id: meetingId,
              p_agenda_item_id: next.agendaItemId,
              p_panel: next.panel,
              p_expected_revision: confirmedRevision.current,
            }, room)
            : await liveMeetingRpc<MeetingBroadcast>("set_meeting_broadcast_document_v2", {
              p_meeting_id: meetingId,
              p_attachment_id: next.attachmentId,
              p_page: next.page,
              p_expected_revision: confirmedRevision.current,
            }, room);
          confirmedRevision.current = saved.revision;
          if (!queued.current) show(saved);
          setError(null);
        } catch (failure) {
          queued.current = null;
          setError(messageOf(failure, "تعذر تغيير البث."));
          writing.current = false;
          await reload().catch(() => undefined);
          return;
        }
      }
    } finally {
      writing.current = false;
    }
  }

  function send(change: BroadcastChange, optimistic: (current: MeetingBroadcast) => MeetingBroadcast) {
    const current = shown.current;
    if (!current?.viewer_controls) return;
    show(optimistic(current), false);
    queued.current = change;
    if (!writing.current) void flush();
  }

  /** The controller chose an item or a panel: show it now, send it in order. */
  function choose(agendaItemId: string, panel: ReferenceTab) {
    send({ kind: "view", agendaItemId, panel }, (current) => {
      const keep = panel === "attachments" && current.agenda_item_id === agendaItemId;
      return { ...current, agenda_item_id: agendaItemId, panel, attachment_id: keep ? current.attachment_id : null, page: keep ? current.page : null };
    });
  }

  /** The controller opened a file (on a page) of an item, or closed it with null. */
  function openDocument(attachmentId: string | null, page: number | null, agendaItemId?: string) {
    send({ kind: "document", attachmentId, page: attachmentId ? page ?? 1 : null }, (current) => attachmentId
      ? { ...current, attachment_id: attachmentId, page: page ?? 1, panel: "attachments", agenda_item_id: agendaItemId ?? current.agenda_item_id }
      : { ...current, attachment_id: null, page: null });
  }

  async function handOver(toRole: "chair" | "rapporteur") {
    setPending(true);
    try {
      const saved = await liveMeetingRpc<MeetingBroadcast>("hand_over_meeting_broadcast_v2", {
        p_meeting_id: meetingId,
        p_to_role: toRole,
        p_expected_revision: confirmedRevision.current,
      }, room);
      show(saved);
      setError(null);
    } catch (failure) {
      setError(messageOf(failure, "تعذر تسليم التحكم في البث."));
      await reload().catch(() => undefined);
    } finally {
      setPending(false);
    }
  }

  return { broadcast: enabled ? broadcast : null, error: enabled ? error : null, pending, choose, openDocument, handOver };
}

const READ_FAILED = "تعذر تحديث البث، وتُعرض آخر حالة معروفة.";

type BroadcastChange =
  | { kind: "view"; agendaItemId: string; panel: ReferenceTab }
  | { kind: "document"; attachmentId: string | null; page: number | null };
