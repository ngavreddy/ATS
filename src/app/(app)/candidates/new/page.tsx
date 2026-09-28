import Link from 'next/link'
import { supabaseServer } from '@/lib/supabase/server'
import { parsedToFormValues } from '@/lib/resume'
import { attachResumeOnly, readResumeAndFill, saveCandidate } from '../actions'
import CandidateForm from '../CandidateForm'

export default async function NewCandidate({ searchParams }: { searchParams: Promise<{ resume?: string; error?: string; note?: string }> }) {
  const { resume: resumeId, error, note } = await searchParams
  const sb = await supabaseServer()
  let upload: any = null
  if (resumeId) upload = (await sb.from('resume_uploads').select('id, filename, parsed, parsed_by, candidate_id').eq('id', resumeId).maybeSingle()).data
  if (upload?.candidate_id) upload = null                    // already used by a saved candidate
  const initial = upload?.parsed ? parsedToFormValues(upload.parsed) : {}

  return (
    <div className="max-w-4xl space-y-6">
      <div><Link href="/candidates" className="text-sm text-muted">Candidates /</Link><h1>Add candidate</h1></div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-bad">{error}</p>}

      {upload ? (
        <div className="card flex items-start justify-between gap-4 border-green-200 bg-green-50 p-4 text-sm">
          <div>
            <div className="font-medium">Resume attached: {upload.filename}</div>
            <div className="text-muted">
              {upload.parsed_by === 'claude' ? 'Claude read it and filled in what it could. Check every field before you save. Claude can get things wrong.'
                : 'The file is attached. Only email and phone were picked up automatically, so fill in the rest.'}
              {note === 'ai' && <span className="text-warn"> Claude could not read this one, so only simple details were picked up.</span>}
            </div>
          </div>
          <Link href="/candidates/new" className="btn shrink-0">Remove</Link>
        </div>
      ) : (
        <form className="card space-y-3 p-5">
          <div><div className="font-medium">Start from a resume <span className="font-normal text-muted">(optional)</span></div>
            <p className="text-sm text-muted">PDF, Word or text, up to 4 MB. Claude reads it to fill in the form, and you check it before saving. The resume text is sent to Anthropic&apos;s API to do this, so tell candidates their resume may be processed by AI.</p></div>
          <input type="file" name="resume" accept=".pdf,.docx,.txt" className="block text-sm" />
          <div className="flex gap-2">
            <button formAction={readResumeAndFill} className="btn-dark">Read resume and fill the form</button>
            <button formAction={attachResumeOnly} className="btn">Attach without reading</button>
          </div>
        </form>
      )}

      <CandidateForm key={upload?.id ?? 'blank'} action={saveCandidate} initial={initial} resume={upload ? { id: upload.id, filename: upload.filename } : null} />
    </div>
  )
}
