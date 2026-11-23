"use client";

import type { FilterPlan } from "@/lib/domain/schemas";

/**
 * Saved playbooks: a named set of interpreted rules the user can reuse on new
 * screenshots without re-interpreting the instruction. Stored only in this
 * browser (a per-viewer convenience); every access is guarded because storage
 * can be unavailable (private mode, blocked site data).
 */
export interface Playbook {
  id: string;
  name: string;
  instruction: string;
  plan: FilterPlan;
  savedAt: string;
}

const KEY = "fenafilter.playbooks.v1";
const MAX = 20;

export function loadPlaybooks(): Playbook[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as Playbook[]) : [];
    return Array.isArray(list) ? list.filter((p) => p && typeof p.name === "string" && p.plan && typeof p.instruction === "string") : [];
  } catch {
    return [];
  }
}

function store(list: Playbook[]): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
    return true;
  } catch {
    return false;
  }
}

export function savePlaybook(name: string, instruction: string, plan: FilterPlan): Playbook | null {
  const pb: Playbook = {
    id: Math.random().toString(36).slice(2, 10),
    name: name.trim().slice(0, 60) || "Untitled playbook",
    instruction: instruction.slice(0, 1500),
    plan,
    savedAt: new Date().toISOString(),
  };
  const list = [pb, ...loadPlaybooks().filter((p) => p.name !== pb.name)];
  return store(list) ? pb : null;
}

export function deletePlaybook(id: string): Playbook[] {
  const list = loadPlaybooks().filter((p) => p.id !== id);
  store(list);
  return list;
}
