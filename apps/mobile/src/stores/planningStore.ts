import {
  INITIAL_PLANNING_STATE,
  reducePlanning,
  type PlanningEvent,
  type PlanningUiState,
} from '@touchline/planning';
import { create } from 'zustand';

export interface PlanningStore extends PlanningUiState {
  dispatch: (event: PlanningEvent) => void;
  reset: () => void;
}

/**
 * Planning UI state only (selection, mode, draft path, preview). Transitions come from the pure
 * `reducePlanning`; the command book and any simulation state live elsewhere.
 */
export const usePlanningStore = create<PlanningStore>()((set) => ({
  ...INITIAL_PLANNING_STATE,
  dispatch: (event) => set((state) => reducePlanning(state, event)),
  reset: () => set(INITIAL_PLANNING_STATE),
}));
