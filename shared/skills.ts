/** Player skills + how they unlock. Progression is data: completing a stage's boss level grants its reward. */
export type SkillId = 'ice' | 'coffee' | 'camera' | 'patience';
export const SKILL_ORDER: SkillId[] = ['ice', 'coffee', 'camera', 'patience'];

export interface SkillDef {
  id: SkillId;
  name: string;
  desc: string;
  /** null = starter skill; otherwise the stage whose completion unlocks it */
  unlockStage: number | null;
  passive?: boolean;
  /** client asset key for the icon (stage manifest key or legacy image key) */
  icon: string;
}

export const SKILLS: Record<SkillId, SkillDef> = {
  ice: { id: 'ice', name: 'LED', desc: 'STVARA I RAZBIJA LEDENE ZIDOVE', unlockStage: null, icon: 'ice_block' },
  coffee: { id: 'coffee', name: 'KAFA', desc: 'LECI +1 SRCE (BEZ PRELECENJA)', unlockStage: 1, icon: 'coffee' },
  camera: { id: 'camera', name: 'KAMERA', desc: 'OMAMLJUJE NEPRIJATELJE, RANJAVA BOSOVE. BLIZE = JACE', unlockStage: 2, icon: 'camera' },
  patience: { id: 'patience', name: 'STRPLJENJE', desc: 'ZADACI +35% BRZE, PODIZANJE SAIGRACA BRZE', unlockStage: 3, passive: true, icon: 'icon_patience' },
};

/** passive numbers */
export const PATIENCE_TASK_MULT = 1.35;
export const PATIENCE_REVIVE_MULT = 0.65;

/** skills unlocked by a set of completed stage numbers */
export function skillsFor(completedStages: number[]): SkillId[] {
  return SKILL_ORDER.filter((id) => SKILLS[id].unlockStage === null || completedStages.includes(SKILLS[id].unlockStage!));
}
