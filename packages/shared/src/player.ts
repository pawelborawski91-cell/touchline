import type { Vector2 } from './math';

export interface PlayerState {
  id: string;
  teamId: string;
  position: Vector2;
  velocity: Vector2;
  facing: number;
  role: string;
  staminaCurrent: number;
  activeCommandId: string | null;
}
