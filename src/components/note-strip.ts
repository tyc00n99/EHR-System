"use client";

import { useSyncExternalStore } from "react";

/**
 * The notes the viewer can step through (Sept 21, 2026, user's pick "C": a filmstrip along the
 * bottom of the note preview). Whatever notes table is on screen publishes its rows, in the order
 * they are shown, and the preview reads them — so "next" is always the next row in the list the
 * note was opened from. A tiny external store rather than React state: the table and the preview
 * are far apart in the tree, and nothing else needs to re-render when it changes.
 */
export interface StripNote { id: string; day: string; time: string; staff: string; client: string; unsigned: boolean }

let items: StripNote[] = [];
const listeners = new Set<() => void>();

export function setNoteStrip(next: StripNote[]) {
  items = next;
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const get = () => items;
const EMPTY: StripNote[] = [];
const getServer = () => EMPTY;

export function useNoteStrip(): StripNote[] {
  return useSyncExternalStore(subscribe, get, getServer);
}
