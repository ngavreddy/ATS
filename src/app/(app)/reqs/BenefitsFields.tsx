'use client'
import { useState } from 'react'
import { BENEFIT_CHECKBOXES, benefitsSummary, normalizeBenefits, type Benefits } from '@/lib/benefits'

type PtoMode = 'none' | 'unlimited' | 'days'
const GROUPS = ['Insurance', 'Money', 'Time and family', 'Growth and wellbeing']

export default function BenefitsFields({ initial, initialOther }: { initial?: Benefits; initialOther?: string }) {
  const [checks, setChecks] = useState<Record<string, boolean>>(() => Object.fromEntries(BENEFIT_CHECKBOXES.filter((b) => initial?.[b.key]).map((b) => [b.key, true])))
  const [ptoMode, setPtoMode] = useState<PtoMode>(initial?.pto?.type === 'unlimited' ? 'unlimited' : initial?.pto?.type === 'days' ? 'days' : 'none')
  const [ptoDays, setPtoDays] = useState(initial?.pto?.type === 'days' ? String(initial.pto.days) : '')
  const [holidays, setHolidays] = useState(initial?.holidays ? String(initial.holidays) : '')
  const [match, setMatch] = useState(initial?.retirement_match_pct ? String(initial.retirement_match_pct) : '')
  const [other, setOther] = useState(initialOther ?? '')

  // This is what is sent to the server. The server cleans it again and writes the final wording itself.
  const raw = {
    ...checks,
    retirement_match_pct: checks.retirement ? match : undefined,
    pto: ptoMode === 'unlimited' ? { type: 'unlimited' } : ptoMode === 'days' ? { type: 'days', days: ptoDays } : undefined,
    holidays,
  }
  const { benefits, errors } = normalizeBenefits(raw)
  const summary = benefitsSummary(benefits, other)

  return (
    <div className="col-span-full space-y-4">
      <input type="hidden" name="benefits_json" value={JSON.stringify(raw)} />
      <div className="grid gap-4 md:grid-cols-2">
        {GROUPS.map((g) => (
          <fieldset key={g} className="space-y-1.5">
            <legend className="label">{g}</legend>
            {BENEFIT_CHECKBOXES.filter((b) => b.group === g).map((b) => (
              <label key={b.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!checks[b.key]} onChange={(e) => setChecks({ ...checks, [b.key]: e.target.checked })} /> {b.label}
                {b.key === 'retirement' && checks.retirement && (
                  <span className="ml-1 flex items-center gap-1 text-muted">match <input aria-label="401(k) match percent" value={match} onChange={(e) => setMatch(e.target.value)} inputMode="decimal" placeholder="6" className="input !w-16 !py-1" />%</span>
                )}
              </label>
            ))}
            {g === 'Time and family' && (
              <div className="space-y-1.5 pt-1">
                <div className="text-sm font-medium">Paid time off</div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <label className="flex items-center gap-1"><input type="radio" name="pto_mode" checked={ptoMode === 'none'} onChange={() => setPtoMode('none')} /> Not listed</label>
                  <label className="flex items-center gap-1"><input type="radio" name="pto_mode" checked={ptoMode === 'unlimited'} onChange={() => setPtoMode('unlimited')} /> Unlimited</label>
                  <label className="flex items-center gap-1"><input type="radio" name="pto_mode" checked={ptoMode === 'days'} onChange={() => setPtoMode('days')} /> Set number of days</label>
                  {ptoMode === 'days' && <input aria-label="PTO days" value={ptoDays} onChange={(e) => setPtoDays(e.target.value)} inputMode="numeric" placeholder="20" className="input !w-20 !py-1" />}
                </div>
                <label className="flex items-center gap-2 text-sm">Paid holidays <input aria-label="Paid holidays" value={holidays} onChange={(e) => setHolidays(e.target.value)} inputMode="numeric" placeholder="10" className="input !w-20 !py-1" /></label>
              </div>
            )}
          </fieldset>
        ))}
      </div>
      {errors.length > 0 && <p className="text-sm text-bad">{errors.join(' ')}</p>}

      <div>
        <label className="label">Additional benefits <span className="normal-case">(only things that are not in the lists above)</span></label>
        <textarea name="benefits_other" value={other} onChange={(e) => setOther(e.target.value)} rows={2} className="input" placeholder="Gym stipend, four-day summer weeks" />
      </div>
      <div className="rounded-lg bg-stone-50 p-3 text-sm">
        <div className="label">How it will read on the posting</div>
        {summary || <span className="text-muted">Nothing selected yet. A req needs at least one benefit to be published.</span>}
      </div>
    </div>
  )
}
