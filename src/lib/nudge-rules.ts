// First nudge at 24h waiting on the client, second at 48h, then stop.
// Counter resets to 0 in the database whenever a submission changes stage.
export function nudgeDue(
  waitsOn: string | null | undefined,
  nudgeCount: number,
  stageEnteredAt: string | number | Date,
  now: number = Date.now()
) {
  if (waitsOn !== 'client') return false
  const hours = (now - new Date(stageEnteredAt).getTime()) / 36e5
  return (nudgeCount === 0 && hours >= 24) || (nudgeCount === 1 && hours >= 48)
}
