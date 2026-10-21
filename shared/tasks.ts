import type { Role } from './types.ts';

/**
 * Task / interaction system. A task is a map tile (station) players work on with INTERACT.
 * speed = 1 / baseMs  x  character affinity  x  patience (if unlocked)
 */
export type TaskType = 'coding' | 'gaming' | 'math' | 'history' | 'slovenian' | 'chemistry' | 'exam';
/** which character animation plays while working (assets: task_<anim>_*), see client TASK_ANIM */
export type TaskAnim = 'coding' | 'gaming' | 'studying';

export interface TaskDef {
  type: TaskType;
  label: string;
  anim: TaskAnim;
  baseMs: number;
  /** restricts the task to one character (old terminal/arcade stations); undefined = both */
  role?: Role;
  /** stage asset key drawn on the tile */
  sprite?: string;
}

export const TASKS: Record<TaskType, TaskDef> = {
  coding: { type: 'coding', label: 'KOD', anim: 'coding', baseMs: 1800, role: 'david' },
  gaming: { type: 'gaming', label: 'ARKADA', anim: 'gaming', baseMs: 1800, role: 'nemanja' },
  math: { type: 'math', label: 'MATEMATIKA', anim: 'studying', baseMs: 3600, sprite: 'st_math' },
  history: { type: 'history', label: 'ISTORIJA', anim: 'studying', baseMs: 3600, sprite: 'st_history' },
  slovenian: { type: 'slovenian', label: 'SLOVENSKI', anim: 'studying', baseMs: 3600, sprite: 'st_slovenian' },
  chemistry: { type: 'chemistry', label: 'HEMIJA', anim: 'studying', baseMs: 3600, sprite: 'st_chemistry' },
  exam: { type: 'exam', label: 'ISPIT', anim: 'studying', baseMs: 2600, sprite: 's2_desk' },
};

/** map letter -> task */
export const TASK_BY_CODE: Record<string, TaskType> = { L: 'coding', A: 'gaming', M: 'math', Y: 'history', V: 'slovenian', Q: 'chemistry', U: 'exam' };

/** Character task affinities (1 = normal). Both characters can still do every shared task. */
export const AFFINITY: Record<Role, Partial<Record<TaskType, number>>> = {
  david: { math: 1.5, history: 1.4, slovenian: 0.8, coding: 1.0, exam: 1.2 },
  nemanja: { slovenian: 1.5, math: 0.85, gaming: 1.0, chemistry: 1.15, exam: 0.95 },
};

export function taskSpeed(task: TaskType, role: Role, patience: boolean, patienceMult: number): number {
  return (1 / TASKS[task].baseMs) * (AFFINITY[role][task] ?? 1) * (patience ? patienceMult : 1);
}
