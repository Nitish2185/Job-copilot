import { create } from "zustand";
import { defaultFilters, type MatchFilters } from "@/lib/matching/matchList";

interface MatchFiltersState {
  /** Undefined until the page knows the score threshold from settings. */
  filters: MatchFilters | undefined;
  init: (minScore: number) => void;
  update: (patch: Partial<MatchFilters>) => void;
  reset: (minScore: number) => void;
}

/** Matches page filters (UI-only state), kept while the user opens a job and comes back. */
export const useMatchFilters = create<MatchFiltersState>((set) => ({
  filters: undefined,
  init: (minScore) => {
    set((state) => (state.filters ? state : { filters: defaultFilters(minScore) }));
  },
  update: (patch) => {
    set((state) => (state.filters ? { filters: { ...state.filters, ...patch } } : state));
  },
  reset: (minScore) => {
    set({ filters: defaultFilters(minScore) });
  },
}));
