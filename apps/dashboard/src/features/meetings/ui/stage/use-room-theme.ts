"use client";

import { useState } from "react";

const THEME_KEY = "qarar.meeting-room.theme";

function readStoredTheme() {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(THEME_KEY) === "dark"; } catch { return false; }
}

/** The viewer's light or night choice for the meeting room, remembered on this device. */
export function useRoomTheme() {
  const [dark, setDark] = useState(readStoredTheme);

  function toggle() {
    const next = !dark;
    setDark(next);
    try { window.localStorage.setItem(THEME_KEY, next ? "dark" : "light"); } catch { /* The choice still applies for this visit. */ }
  }

  return { dark, toggle };
}
