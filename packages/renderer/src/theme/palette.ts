import type { TeamSide } from '@touchline/shared';

export interface MarkerKit {
  fill: string;
  goalkeeperFill: string;
  outline: string;
  number: string;
  indicator: string;
}

export const palette = {
  background: '#0A0E12',
  surround: '#173323',
  grassDark: '#1C3D2A',
  grassLight: '#20442F',
  line: 'rgba(236, 242, 238, 0.82)',
  goalFrame: '#F1F4F2',
  goalNet: 'rgba(236, 242, 238, 0.28)',
  shadow: 'rgba(0, 0, 0, 0.45)',
  ball: '#F7F7F2',
  ballOutline: 'rgba(10, 14, 18, 0.75)',
} as const;

export const TEAM_KITS: Readonly<Record<TeamSide, MarkerKit>> = {
  home: {
    fill: '#2F6BE0',
    goalkeeperFill: '#5FA0FF',
    outline: 'rgba(255, 255, 255, 0.9)',
    number: '#FFFFFF',
    indicator: '#FFFFFF',
  },
  away: {
    fill: '#D9413A',
    goalkeeperFill: '#FF7F63',
    outline: 'rgba(255, 255, 255, 0.9)',
    number: '#FFFFFF',
    indicator: '#FFFFFF',
  },
};
