export type Prefs = { comp_floor?: number; work_models?: string[]; dealbreakers?: string[] }

// Illinois HB 3773: never use ZIP codes or proxies for protected classes.
// Commute is handled by metro only. Extend this function, not the UI.
export function fit(prefs: Prefs, req: { pay_max: number | null; work_model: string | null }) {
  const reasons: string[] = []
  if (prefs.comp_floor && req.pay_max && req.pay_max < prefs.comp_floor)
    reasons.push(`Below $${prefs.comp_floor / 1000}k floor`)
  if (prefs.work_models?.length && req.work_model && !prefs.work_models.includes(req.work_model))
    reasons.push(`${req.work_model} not acceptable`)
  return { ok: reasons.length === 0, reasons }
}
