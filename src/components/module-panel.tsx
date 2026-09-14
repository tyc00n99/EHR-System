"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Which module panel is open *over* a record. With no record open the panels are simply part of
 * the page and this is null; with a record open, the rail's Clients or Team icon sets it and the
 * panel slides in over the record — the reference's behaviour — so switching person never bounces
 * through the greeting. Picking a row, or the ✕, clears it.
 */
export type ModulePanel = "clients" | "team" | null;

const Ctx = createContext<{ open: ModulePanel; setOpen: (p: ModulePanel) => void }>({ open: null, setOpen: () => {} });

export function ModulePanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<ModulePanel>(null);
  return <Ctx.Provider value={{ open, setOpen }}>{children}</Ctx.Provider>;
}

export function useModulePanel() {
  return useContext(Ctx);
}
