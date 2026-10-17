/** Original replay choreography inspired by FC/FIFA broadcast presentation; no EA engine/capture code. */
export type AnalysisStage = 'intro' | 'strike' | 'flight' | 'finish' | 'overview' | 'done';
export interface AnalysisFrame { stage: AnalysisStage; shotTime: number; progress: number }
export const ANALYSIS_DURATION = 8.2;
export const ANALYSIS_STAGE_LABELS: Record<AnalysisStage, string> = {
  intro: 'SPATIAL SCAN', strike: 'STRIKE POINT', flight: 'BALL FLIGHT',
  finish: 'GOAL ENTRY', overview: 'SHOT ANALYSIS', done: 'SHOT ANALYSIS',
};
const smooth = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
/** Mutates a persistent scratch frame: no per-render allocations and no physics integration. */
export function sampleAnalysis(elapsed: number, goalTime: number, frame: AnalysisFrame): AnalysisFrame {
  const time = Math.max(0, elapsed), duration = Math.max(0, goalTime);
  if (time < .75) { frame.stage = 'intro'; frame.shotTime = 0; frame.progress = smooth(time / .75); }
  else if (time < 1.55) { frame.stage = 'strike'; frame.shotTime = 0; frame.progress = smooth((time - .75) / .8); }
  else if (time < 4.8) { frame.stage = 'flight'; frame.progress = Math.min(1, (time - 1.55) / 3.25); frame.shotTime = duration * frame.progress; }
  else if (time < 6.5) { frame.stage = 'finish'; frame.shotTime = duration; frame.progress = smooth((time - 4.8) / 1.7); }
  else { frame.stage = time >= ANALYSIS_DURATION ? 'done' : 'overview'; frame.shotTime = duration; frame.progress = smooth((time - 6.5) / 1.7); }
  return frame;
}
