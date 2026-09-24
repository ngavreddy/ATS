import type { SupabaseClient } from '@supabase/supabase-js'
import { decisionEffect, type Recommendation } from './decision'

export async function applyRecommendation(
  sb: SupabaseClient,
  sub: { id: string; stage_index: number },
  workflow: { name: string }[],
  rec: Recommendation
) {
  const e = decisionEffect(rec, sub.stage_index, workflow.length)
  if (e.stageIndex !== sub.stage_index)
    await sb.from('submissions').update({ stage_index: e.stageIndex, stage_name: workflow[e.stageIndex].name }).eq('id', sub.id)
  if (e.touchNote)
    await sb.from('submissions').update({ next_touch_at: new Date().toISOString(), next_touch_note: e.touchNote }).eq('id', sub.id)
}
