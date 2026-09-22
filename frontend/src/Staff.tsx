import { useEffect, useMemo, useState } from 'react'

const API_BASE = (import.meta.env.VITE_NIDAAN_API_BASE || '').replace(/\/$/, '')

async function readJson(response: Response) {
  const raw = await response.text()
  if (!raw.trim()) {
    throw new Error(`API returned an empty response (HTTP ${response.status}). Start PostgreSQL and the Nidaan backend.`)
  }
  try { return JSON.parse(raw) }
  catch { throw new Error(`API returned a non-JSON response (HTTP ${response.status}). Check that the backend is running on port 3000.`) }
}

type Session = {
  token: string
  channel: string
  patientName?: string | null
  patient_name?: string | null
  chiefComplaint?: string | null
  chief_complaint?: string | null
  redFlagTriggered?: boolean
  red_flag_triggered?: boolean
  redFlagResult?: string | null
  createdAt?: string
  created_at?: string
  abhaId?: string | null
  fieldsJson?: Record<string, any>
  ayushFieldsJson?: Record<string, any>
  ayushFlagged?: boolean
  docSummary?: string | null
  documents?: DocumentRecord[]
  abhaPatient?: { abhaId: string; abhaAddress: string; name: string; dob: string; gender: string; mobile: string; address: string; district: string; state: string; pincode: string; bloodGroup?: string | null } | null
}
type DocumentRecord = { id: string; name: string; type: string; size: number; uploadedAt: string; url: string; ocrStatus?: 'pending' | 'processing' | 'completed' | 'failed'; ocrError?: string | null; ocr?: OCRResult | null }
type OCRResult = { engine: string; fileName: string; rawText: string; lines: string[]; fields: Record<string, string | null> }

const display = (s: Session, key: 'patient' | 'complaint') =>
  key === 'patient' ? s.patientName ?? s.patient_name ?? '—' : s.chiefComplaint ?? s.chief_complaint ?? '—'
const flag = (s: Session) => Boolean(s.redFlagTriggered ?? s.red_flag_triggered)
const created = (s: Session) => s.createdAt ?? s.created_at ?? ''
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
const namesMatch = (profile: string, extracted?: string | null) => {
  if (!extracted) return true
  const a = normalize(profile), b = normalize(extracted)
  return a === b || a.includes(b) || b.includes(a)
}

export default function DoctorDashboard() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedToken, setSelectedToken] = useState('')
  const [detail, setDetail] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch(`${API_BASE}/api/sessions`)
      const d = await readJson(r)
      if (!r.ok || !d.ok) throw new Error(d.error || 'Could not load consultations')
      setSessions(d.sessions)
      if (!selectedToken && d.sessions[0]) setSelectedToken(d.sessions[0].token)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load consultations') }
    finally { setLoading(false) }
  }
  const loadDetail = async (token: string) => {
    if (!token) return
    try {
      const r = await fetch(`${API_BASE}/api/sessions/${encodeURIComponent(token)}`)
      const d = await readJson(r)
      if (!r.ok || !d.ok) throw new Error(d.error || 'Could not load patient record')
      setDetail(d.session)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load patient record') }
  }
  useEffect(() => { load() }, [])
  useEffect(() => { loadDetail(selectedToken) }, [selectedToken])
  useEffect(() => {
    if (!selectedToken) return
    const hasPendingOCR = detail?.documents?.some(doc => doc.ocrStatus === 'pending' || doc.ocrStatus === 'processing')
    if (!hasPendingOCR) return
    const timer = window.setInterval(() => loadDetail(selectedToken), 5000)
    return () => window.clearInterval(timer)
  }, [selectedToken, detail?.documents])

  const patientName = detail ? display(detail, 'patient') : ''
  const extractedNames = detail?.documents?.map(d => d.ocr?.fields?.patientName).filter(Boolean) as string[] | undefined
  const mismatches = extractedNames?.filter(name => !namesMatch(patientName, name)) ?? []
  const fields = detail?.fieldsJson || {}
  const ayush = detail?.ayushFieldsJson || {}
  const dashKeys = new Set(['bodyBuild','temperature','digestion','strength','sleepQuality','mentalState','skin','bowel','energy','recovery'])
  const intakeEntries = Object.entries(fields).filter(([k]) => !['documents','consents','uiLanguage','answerMode','hasDocuments'].includes(k) && !dashKeys.has(k))
  const humanizeKey = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  const formatValue = (value: any) => Array.isArray(value) ? (value.length ? value.join(', ') : 'None recorded') : typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '—')
  const abhaPatient = detail?.abhaPatient
  const [diagnosis, setDiagnosis] = useState('')
  const [showDiagnosis, setShowDiagnosis] = useState(false)
  const [prescriptionNotes, setPrescriptionNotes] = useState('')
  const [showPrescription, setShowPrescription] = useState(false)
  const ccHpiKeys = new Set(['chiefComplaint','duration','onset','progression','associatedSymptoms','priorTreatment','priorTreatmentDetails'])
  const historyKeys = new Set(['conditions','hadSurgery','surgeryDetails','allergyMedication','allergyMedicationDetails','familyConditions','familyHereditary','diet','sleep','physicalActivity','addictions'])
  const ccHpiEntries = intakeEntries.filter(([k]) => ccHpiKeys.has(k)).sort(([a], [b]) => { const order = ['chiefComplaint','duration','onset','progression','associatedSymptoms','priorTreatment','priorTreatmentDetails']; return order.indexOf(a) - order.indexOf(b) })
  const historyEntries = intakeEntries.filter(([k]) => historyKeys.has(k))
  const otherEntries = intakeEntries.filter(([k]) => !ccHpiKeys.has(k) && !historyKeys.has(k))
  const renderEntries = (entries: [string, any][]) => entries.length === 0 ? <p className="p-4 text-sm text-gray-500">No answers recorded.</p> : entries.map(([k,v]) => <div key={k} className="grid grid-cols-[minmax(125px,0.7fr)_minmax(0,1.3fr)] gap-4 px-4 py-3 border-b border-gray-100 last:border-b-0 text-sm"><div className="text-xs font-semibold uppercase tracking-wide text-gray-400 break-words">{humanizeKey(k)}</div><div className="font-medium whitespace-pre-wrap break-words">{formatValue(v)}</div></div>)

  return <div className="min-h-screen bg-[#fefff3] text-gray-900">
    <header className="px-5 md:px-8 py-4 border-b border-gray-200 bg-[#fefff3] flex items-center justify-between gap-4">
      <div className="flex items-center gap-3"><div className="w-11 h-11 rounded-2xl bg-[#77DD76] flex items-center justify-center text-2xl">🌿</div><div><div className="text-xl font-bold leading-none">Nidaan</div><div className="text-sm text-gray-500 mt-1">Doctor dashboard · Patient consultations</div></div></div>
      <button onClick={load} className="px-4 py-2 rounded-xl bg-[#77DD76] font-semibold">Refresh</button>
    </header>
    <main className="w-full p-4 md:p-6 lg:p-8">
      {error && <div className="mb-5 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">{error}</div>}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.6fr)] gap-5">
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100"><h2 className="text-lg font-bold">Consultation queue</h2><p className="text-sm text-gray-500 mt-1">Select a patient to open the complete intake.</p></div>
          <div className="divide-y divide-gray-100">
            {loading ? <div className="p-8 text-center text-gray-500">Loading…</div> : sessions.length === 0 ? <div className="p-8 text-center text-gray-500">No completed consultations.</div> : sessions.map(s =>
              <button key={s.token} onClick={() => setSelectedToken(s.token)} className={`w-full text-left p-4 hover:bg-[#f4fbea] ${selectedToken === s.token ? 'bg-[#edf9e5] border-l-4 border-[#58bd57]' : ''}`}>
                <div className="flex justify-between gap-3"><span className="font-bold">{display(s, 'patient')}</span>{flag(s) ? <span className="text-xs rounded-full px-2 py-1 bg-red-100 text-red-700 font-bold">🚨 Emergency alert</span> : <span className="text-xs text-green-700">Clear</span>}</div>
                <div className="text-sm text-gray-600 mt-1">{display(s, 'complaint')}</div><div className="text-xs text-gray-400 mt-2">{s.token} · {created(s) ? new Date(created(s)).toLocaleString() : '—'}</div>
              </button>
            )}
          </div>
        </section>

        <section className="space-y-5">
          {!detail ? <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center text-gray-500">Choose a consultation to view the patient profile.</div> :
          <>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-wider text-gray-500">Patient profile</p><h1 className="text-2xl font-bold mt-1">{patientName}</h1><p className="text-sm text-gray-500 mt-1">{detail.token} · {detail.channel}</p></div><div className="flex flex-wrap items-center gap-2">{flag(detail) && <span className="rounded-full bg-red-100 text-red-700 px-3 py-2 text-sm font-bold">🚨 Emergency alert</span>}<button onClick={() => setShowDiagnosis(v => !v)} className="px-3 py-2 rounded-lg bg-[#77DD76] text-sm font-semibold">Add diagnosis</button><button onClick={() => setShowPrescription(v => !v)} className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold">Print prescription</button></div></div>
              {flag(detail) && <div className="mt-4 rounded-xl border-2 border-red-300 bg-red-50 p-4 text-red-800"><div className="font-bold text-base">🚨 Emergency / red-flag alert</div><p className="text-sm mt-1">This patient selected a symptom requiring immediate clinical attention.</p>{detail.redFlagResult && <p className="text-sm font-semibold mt-2">{detail.redFlagResult}</p>}</div>}
              {showDiagnosis && <div className="mt-4 rounded-xl border border-[#b7ddb1] bg-[#f4fbea] p-4"><label className="block text-sm font-semibold mb-2">Diagnosis / clinical impression</label><textarea value={diagnosis} onChange={e => setDiagnosis(e.target.value)} placeholder="Enter diagnosis or clinical impression…" className="w-full min-h-24 rounded-lg border border-gray-300 bg-white p-3 text-sm"/><p className="text-xs text-gray-500 mt-2">This is a dashboard note and is not saved to the medical record yet.</p></div>}
              {showPrescription && <div className="mt-4 rounded-xl border border-gray-300 bg-gray-50 p-4"><label className="block text-sm font-semibold mb-2">Prescription notes</label><textarea value={prescriptionNotes} onChange={e => setPrescriptionNotes(e.target.value)} placeholder="Medicine, dosage, duration, and instructions…" className="w-full min-h-24 rounded-lg border border-gray-300 bg-white p-3 text-sm"/><button onClick={() => window.print()} className="mt-3 px-4 py-2 rounded-lg bg-[#77DD76] text-sm font-semibold">Print this prescription</button></div>}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
                {Object.entries({ABHA: abhaPatient?.abhaId || detail.abhaId, 'ABHA address': abhaPatient?.abhaAddress, 'Date of birth': abhaPatient?.dob || fields.dob, Gender: abhaPatient?.gender || fields.gender, Language: fields.uiLanguage, 'Answer mode': fields.answerMode, Mobile: abhaPatient?.mobile || fields.mobile, Address: abhaPatient?.address || fields.address, District: abhaPatient?.district || fields.district, State: abhaPatient?.state || fields.state, Pincode: abhaPatient?.pincode || fields.pincode, 'Blood group': abhaPatient?.bloodGroup || fields.bloodGroup}).map(([k,v]) => <div key={k} className="rounded-xl bg-gray-50 p-3"><div className="text-xs text-gray-500">{k}</div><div className="text-sm font-semibold mt-1 break-words">{String(v || '—')}</div></div>)}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">Intake Summary</h2><span className="text-xs text-gray-500">{intakeEntries.length} fields</span></div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
                <div className="rounded-2xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 bg-[#f4fbea] border-b border-gray-200"><h3 className="font-bold">Chief Complaint & HPI</h3></div>
                  <div className="max-h-[360px] overflow-y-auto">{renderEntries(ccHpiEntries)}</div>
                </div>
                <div className="rounded-2xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 bg-[#f4fbea] border-b border-gray-200"><h3 className="font-bold">Medical, Family & Social History</h3></div>
                  <div className="max-h-[360px] overflow-y-auto">{renderEntries(historyEntries)}</div>
                </div>
              </div>
              {otherEntries.length > 0 && <div className="mt-4 rounded-2xl border border-gray-200 overflow-hidden"><div className="px-4 py-3 bg-gray-50 border-b border-gray-200"><h3 className="font-bold">Other Intake Details</h3></div><div className="max-h-[260px] overflow-y-auto">{renderEntries(otherEntries)}</div></div>}
            </div>

            {detail.ayushFlagged && <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5"><h2 className="text-lg font-bold">Dashavidha Pariksha</h2><div className="grid grid-cols-2 gap-3 mt-4">{Object.entries({...ayush, ...Object.fromEntries(Object.entries(fields).filter(([k]) => ['bodyBuild','temperature','digestion','strength','sleepQuality','mentalState','skin','bowel','energy','recovery'].includes(k)))}).map(([k,v]) => <div key={k} className="rounded-xl bg-[#f4fbea] p-3"><div className="text-xs text-gray-500">{humanizeKey(k)}</div><div className="font-semibold text-sm mt-1">{String(v || '—')}</div></div>)}</div></div>}

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">Uploaded Document</h2><span className="text-xs text-gray-500">{detail.documents?.length || 0} file(s)</span></div>
              {mismatches.length > 0 && <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-red-800"><div className="font-bold">Patient-name mismatch warning</div><p className="text-sm mt-1">Profile name: <strong>{patientName}</strong>. OCR extracted: <strong>{mismatches.join(', ')}</strong>. Verify the document before using it.</p></div>}
              {!detail.documents?.length ? <p className="text-sm text-gray-500 mt-4">No documents attached to this consultation.</p> : <div className="mt-4 space-y-4">{detail.documents.map(doc => <div key={doc.id} className="rounded-xl border border-gray-200 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-semibold">{doc.name}</div><div className="text-xs text-gray-500 mt-1">{doc.type} · {Math.round(doc.size / 1024)} KB</div></div><a href={`${API_BASE}${doc.url}`} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-lg border text-sm">View original file</a></div><div className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Document status: {doc.ocrStatus === 'failed' ? 'Uploaded' : (doc.ocrStatus || 'pending')}</div>{doc.ocrStatus === 'processing' || doc.ocrStatus === 'pending' ? <p className="mt-2 text-sm text-gray-500">Document uploaded. Text extraction is optional and may still be processing.</p> : doc.ocrStatus === 'failed' ? null : doc.ocr ? <div className="mt-3 rounded-xl bg-gray-50 p-4"><div className="text-xs uppercase tracking-wide text-gray-500">Extracted information · {doc.ocr.engine}</div><div className="grid grid-cols-2 gap-3 mt-3">{Object.entries(doc.ocr.fields).map(([k,v]) => <div key={k}><div className="text-xs text-gray-500">{humanizeKey(k)}</div><div className="text-sm font-semibold break-words">{v || 'Not detected'}</div></div>)}</div><details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">View raw OCR text</summary><pre className="mt-2 text-xs whitespace-pre-wrap">{doc.ocr.rawText || 'No text detected'}</pre></details></div> : <p className="mt-2 text-sm text-gray-500">No extracted information available yet.</p>}</div>)}</div>}
            </div>
          </>}
        </section>
      </div>
    </main>
  </div>
}
