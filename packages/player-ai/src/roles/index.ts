import type { PlayerRole } from '../core/AIDecision';
import { CENTRE_BACK_PROFILE, FULLBACK_PROFILE } from './DefenderAI';
import { GOALKEEPER_PROFILE } from './GoalkeeperAI';
import {
  ATTACKING_MIDFIELDER_PROFILE,
  CENTRAL_MIDFIELDER_PROFILE,
  DEFENSIVE_MIDFIELDER_PROFILE,
} from './MidfielderAI';
import type { RoleProfile } from './RoleProfile';
import { STRIKER_PROFILE } from './StrikerAI';
import { WINGER_PROFILE } from './WingerAI';

export const ROLE_PROFILES: Readonly<Record<PlayerRole, RoleProfile>> = Object.freeze({
  GK: GOALKEEPER_PROFILE,
  CB: CENTRE_BACK_PROFILE,
  FB: FULLBACK_PROFILE,
  DM: DEFENSIVE_MIDFIELDER_PROFILE,
  CM: CENTRAL_MIDFIELDER_PROFILE,
  AM: ATTACKING_MIDFIELDER_PROFILE,
  WG: WINGER_PROFILE,
  ST: STRIKER_PROFILE,
});
