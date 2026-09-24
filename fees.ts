import { addDays } from './dates'

// Fee in dollars, rounded to the cent. feePct is a percentage, e.g. 20 for 20%.
export const computeFee = (salary: number, feePct: number) => Math.round(salary * feePct) / 100

// Invoice is issued on the start date and due after the MSA's net terms
export const invoiceDates = (start: string, termsDays: number) => ({
  issue: start,
  due: addDays(start, termsDays),
})

export const guaranteeMilestones = (start: string, guaranteeEnd: string): [string, string][] => [
  ['Start', start],
  ['30-day check-in', addDays(start, 30)],
  ['60-day check-in', addDays(start, 60)],
  ['Reminder', addDays(guaranteeEnd, -14)],
  ['Ends', guaranteeEnd],
]
