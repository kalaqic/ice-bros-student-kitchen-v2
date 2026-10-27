import type { SkillId } from './skills.ts';

/**
 * Stage configuration (4 stages, each ends with a boss). Levels reference a stage by number;
 * enemy digits 1-6 in level maps index the stage roster, so the same map syntax works everywhere.
 */
export interface StageSkin {
  floors: string[];          // stage asset keys (opaque tiles)
  walls: string[];
  /** prop images per map letter (drawn over clusters of that letter) */
  props: Partial<Record<string, string[]>>;
  tint?: string;             // colour wash over procedural tiles when a prop is missing
  backdrop: string;          // full-screen art behind the level frame
}
export interface StageDef {
  n: number;
  name: string;
  subtitle: string;
  roster: [string, string, string, string, string, string];
  reward: SkillId | null;
  music: 'stage1' | 'stage2' | 'stage3' | 'stage4';
  skin: StageSkin;
  color: string;
}

export const STAGES: StageDef[] = [
  {
    n: 1, name: 'STUDENTSKA KUHINJA', subtitle: 'NAUCI LED', reward: 'coffee', music: 'stage1', color: '#7fd06a',
    roster: ['slop_blob', 'slop_noodle', 'slop_burger', 'slop_blob', 'slop_noodle', 'slop_burger'],
    skin: {
      floors: ['s1_floor_0', 's1_floor_1', 's1_floor_2', 's1_floor_3'], walls: ['s1_wall_0', 's1_wall_1', 's1_wall_2'],
      props: { C: ['s1_counter_0', 's1_counter_2', 's1_counter_1', 's1_counter_3'], F: ['s1_fridge'], S: ['s1_stove'], K: ['s1_sink'],
        T: ['s1_table'], H: ['s1_shelf'], W: ['s1_prep_0', 's1_prep_1'] },
      backdrop: 'bg_s1',
    },
  },
  {
    n: 2, name: 'EKONOMSKA SKOLA', subtitle: 'PAZI NA BLICEVE', reward: 'camera', music: 'stage2', color: '#ffd34d',
    roster: ['prefect', 'runner', 'monitor', 'runner', 'prefect', 'elite'],
    skin: {
      floors: ['s2_floor_0'], walls: ['s2_wall_0'],
      props: { C: ['s2_teacher'], T: ['s2_desk'], H: ['s2_shelf', 's2_shelf2', 's2_shelf3'], W: ['s2_lockers'], K: ['s2_sink'], S: ['s2_board'], F: ['s2_lockers'] },
      backdrop: 'bg_s2',
    },
  },
  {
    n: 3, name: 'DRPD', subtitle: 'UCI DECU. NE DIRAJ DECU.', reward: 'patience', music: 'stage3', color: '#ff9fd0',
    roster: ['staff', 'super', 'kid1', 'kid2', 'kid1', 'kid2'],
    skin: {
      floors: ['s3_floor_0'], walls: ['s3_wall_0'], // one clean tile each (the DRPD logo wall gets cut in a 48px cell)
      props: { T: ['s3_kiddesk', 's3_kiddesk2'], C: ['s3_helper'], H: ['s3_bookshelf'], W: ['s3_toyshelf'], F: ['s3_lockers'], K: ['s3_toyshelf'], S: ['s3_bookshelf'] },
      backdrop: 'bg_s3',
    },
  },
  {
    n: 4, name: 'ZIVOT.EXE', subtitle: 'SKOLA JE BILA SAMO TUTORIJAL', reward: null, music: 'stage4', color: '#ff6a5a',
    roster: ['taxman', 'bureau', 'banker', 'landlord', 'recruiter', 'official'],
    skin: {
      floors: ['s4_floor_0'], walls: ['s4_wall_0'], // one clean tile each, like the other stages
      props: { C: ['s4_desk', 's4_desk2'], T: ['s4_chairs'], H: ['s4_bookcase'], W: ['s4_cabinet'], F: ['s4_atm'], K: ['s4_cabinet'], S: ['s4_barrier'] },
      backdrop: 'bg_s4',
    },
  },
];
export const stageDef = (n: number) => STAGES[Math.max(0, Math.min(STAGES.length - 1, n - 1))];
