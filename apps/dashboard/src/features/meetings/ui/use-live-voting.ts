"use client";
import { useEffect, useRef, useState } from "react";
import type { VotingSnapshot } from "../server/voting-stream";

export function useLiveVoting(meetingId: string, active: boolean) {
  const [state, setState] = useState<{ meetingId: string; snapshot: VotingSnapshot | null; error: string | null; connected: boolean }>({ meetingId, snapshot: null, error: null, connected: false });
  const accepted = useRef(new Set<string>());
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active || typeof EventSource === "undefined") return;
    let stopped = false;
    const source = new EventSource(`/api/admin/meetings/${encodeURIComponent(meetingId)}/voting/live`);
    source.addEventListener("voting", event => {
      if (stopped) return;
      try {
        const snapshot = JSON.parse((event as MessageEvent).data) as VotingSnapshot;
        if (!Array.isArray(snapshot.rounds) || !Array.isArray(snapshot.votes)) throw new Error("invalid snapshot");
        snapshot.votes = snapshot.votes.map(vote => accepted.current.has(`${meetingId}:${vote.voting_round_id}`) ? { ...vote, has_voted: true } : vote);
        setState({ meetingId, snapshot, error: null, connected: true });
      } catch {
        setState(current => ({ meetingId, snapshot: current.meetingId === meetingId ? current.snapshot : null, error: "تعذر قراءة تحديث التصويت؛ أعد الاتصال قبل المتابعة.", connected: false }));
        source.close();
      }
    });
    source.addEventListener("voting-error", event => {
      if (stopped) return;
      let terminal = true;
      try { terminal = JSON.parse((event as MessageEvent).data).terminal !== false; } catch { /* Invalid messages must stop the channel, never grant continued access. */ }
      setState(current => ({ meetingId, snapshot: current.meetingId === meetingId ? current.snapshot : null, error: terminal ? "انتهت صلاحية الاطلاع على التصويت؛ حدّث الصفحة أو سجّل الدخول مجددًا." : "انقطع تحديث التصويت؛ جارٍ إعادة الاتصال.", connected: false }));
      if (terminal) source.close();
    });
    source.onerror = () => { if (!stopped) setState(current => ({ meetingId, snapshot: current.meetingId === meetingId ? current.snapshot : null, error: "انقطع تحديث التصويت؛ جارٍ إعادة الاتصال. لا تعتمد الأعداد القديمة حتى عودة الاتصال.", connected: false })); };
    return () => { stopped = true; source.close(); };
  }, [meetingId, active, attempt]);
  function acknowledge(roundId: string) {
    accepted.current.add(`${meetingId}:${roundId}`);
    setState(current => ({ ...current, snapshot: current.snapshot ? { ...current.snapshot, votes: current.snapshot.votes.map(vote => vote.voting_round_id === roundId ? { ...vote, has_voted: true } : vote) } : null }));
  }
  return { snapshot: active && state.meetingId === meetingId ? state.snapshot : null, error: active && state.meetingId === meetingId ? state.error : null, connected: active && state.meetingId === meetingId && state.connected, acknowledge, reconnect: () => setAttempt(current => current + 1) };
}
