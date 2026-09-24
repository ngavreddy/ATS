export type Recommendation = 'advance' | 'another_round' | 'pass'

// What happens to a submission when the client decides. Advancing moves it forward (never past the last stage).
// The other two leave it where it is and put a task on the recruiter's Today queue.
export function decisionEffect(rec: Recommendation, stageIndex: number, stageCount: number) {
  if (rec === 'advance') return { stageIndex: Math.min(stageIndex + 1, stageCount - 1), touchNote: null as string | null }
  if (rec === 'another_round')
    return { stageIndex, touchNote: 'Client wants another conversation. Schedule it and update the candidate.' }
  return { stageIndex, touchNote: 'Client passed. Send the candidate a disposition.' }
}
