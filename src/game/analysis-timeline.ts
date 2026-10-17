/** Original FC/FIFA-inspired choreography, not EA capture/engine technology. */
export type AnalysisStage = 'intro' | 'runup' | 'strike' | 'flight' | 'finish' | 'overview' | 'done';
export interface AnalysisFrame { stage: AnalysisStage; shotTime: number; progress: number }
export const ANALYSIS_DURATION = 8.6;
export const ANALYSIS_STAGE_LABELS: Record<AnalysisStage, string> = {
  intro: 'SPATIAL SCAN', runup: 'RECORDED APPROACH', strike: 'STRIKE POINT', flight: 'BALL FLIGHT',
  finish: 'GOAL ENTRY', overview: 'SHOT ANALYSIS', done: 'SHOT ANALYSIS',
};
const smooth = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
/** Negative shot time denotes recorded run-up. Exact pauses freeze motion AND orientation. */
export function sampleAnalysis(elapsed: number, goalTime: number, frame: AnalysisFrame): AnalysisFrame {
  const time = Math.max(0, elapsed), duration = Math.max(0, goalTime);
  if (time < .45) { frame.stage = 'intro'; frame.shotTime = -1.65; frame.progress = smooth(time / .45); }
  else if (time < 2.1) { frame.stage = 'runup'; frame.progress = (time - .45) / 1.65; frame.shotTime = -1.65 * (1 - frame.progress); }
  else if (time < 2.7) { frame.stage = 'strike'; frame.shotTime = 0; frame.progress = smooth((time - 2.1) / .6); }
  else if (time < 5.6) { frame.stage = 'flight'; frame.progress = Math.min(1, (time - 2.7) / 2.9); frame.shotTime = duration * smooth(frame.progress); }
  else if (time < 7.25) { frame.stage = 'finish'; frame.shotTime = duration; frame.progress = smooth((time - 5.6) / 1.65); }
  else { frame.stage = time >= ANALYSIS_DURATION ? 'done' : 'overview'; frame.shotTime = duration; frame.progress = smooth((time - 7.25) / 1.35); }
  return frame;
}
