import type { FormData } from './App'

type Lang = 'en' | 'mr' | 'hi'
type Mode = 'touch' | 'voice'

const configuredBase = import.meta.env.VITE_NIDAAN_API_BASE as string | undefined
// Use the same origin in the browser. Vite proxies /api to the Node backend,
// so the phone never tries to call its own localhost:3000.
const API_BASE = (configuredBase || '').replace(/\/$/, '')

async function readJson(response: Response) {
  const raw = await response.text()
  if (!raw.trim()) {
    throw new Error(`API returned an empty response (HTTP ${response.status}). Make sure the backend is running on port 3000 and PostgreSQL is running.`)
  }
  try { return JSON.parse(raw) }
  catch { throw new Error(`API returned a non-JSON response (HTTP ${response.status}). Make sure the backend is running on port 3000.`) }
}

export interface SubmitResult { ok: boolean; token: string; error: string }

function buildDocSummary(form: FormData) {
  return [
    `Chief complaint: ${form.chiefComplaint} (${form.duration})`,
    `HPI: onset=${form.onset}; progression=${form.progression}; associated=${form.associatedSymptoms.join(', ')}; treatment=${form.priorTreatment.join(', ')}; treatment details=${form.priorTreatmentDetails}`,
    `PMH: conditions=${form.conditions.join(', ')}; surgery=${form.hadSurgery}; surgery details=${form.surgeryDetails}; allergy/medication details=${form.allergyMedicationDetails}`,
    `Family: ${form.familyConditions.join(', ')}; hereditary=${form.familyHereditary}`,
    `Personal/social: diet=${form.diet}; sleep=${form.sleep}; activity=${form.physicalActivity}; addictions=${form.addictions.join(', ')}`,
    form.wantsDashavidha ? `Dashavidha: body=${form.bodyBuild}; temperature=${form.temperature}; digestion=${form.digestion}; strength=${form.strength}; sleep=${form.sleepQuality}; mental=${form.mentalState}; skin=${form.skin}; bowel=${form.bowel}; energy=${form.energy}; recovery=${form.recovery}` : 'Dashavidha: skipped',
    `Documents: ${form.documents.map(d => d.name || d.type).join(', ') || 'none'}`,
  ].join('\n')
}

function buildFhirBundle(form: FormData, patientName: string, patientId: string, abhaLinked: boolean) {
  return {
    resourceType: 'Bundle', type: 'collection', meta: { profile: ['Nidaan prototype mock FHIR'] },
    entry: [
      { resource: { resourceType: 'Patient', id: patientId, name: [{ text: patientName }] } },
      { resource: { resourceType: 'Condition', id: 'chief-complaint', code: { text: form.chiefComplaint }, onsetString: form.duration } },
      { resource: { resourceType: 'Observation', id: 'intake-summary', status: 'preliminary', code: { text: 'Patient intake questionnaire' }, valueString: buildDocSummary(form) } },
      ...(abhaLinked ? [{ resource: { resourceType: 'Identifier', id: 'abha-link', system: 'https://healthid.ndhm.gov.in', value: 'demo-linked-abha' } }] : []),
    ],
  }
}

export async function submitIntake({ form, mode, lang, patientName, patientId, abhaId }: {
  form: FormData; mode: Mode; lang: Lang; patientName: string; patientId: string; abhaId: string
}): Promise<SubmitResult> {
  const fallbackToken = `A-${Math.floor(100 + Math.random() * 900)}`
  const redFlagSymptoms = form.redFlagSymptoms.filter(s => s && s !== 'none')
  const redFlagTriggered = redFlagSymptoms.length > 0
  const payload = {
    channel: 'kiosk', patientName, helperName: mode === 'touch' ? 'Kiosk helper' : null,
    helperId: mode === 'touch' ? 'DEMO-HELPER' : null, abhaId,
    abhaLinkConsent: form.consents.abha, shareConsent: form.consents.referral,
    chiefComplaint: form.chiefComplaint, fields: { ...form, uiLanguage: lang, answerMode: mode },
    ayushFlagged: form.wantsDashavidha,
    ayushFields: form.wantsDashavidha ? { bodyBuild: form.bodyBuild, temperature: form.temperature, digestion: form.digestion, strength: form.strength, sleepQuality: form.sleepQuality, mentalState: form.mentalState, skin: form.skin, bowel: form.bowel, energy: form.energy, recovery: form.recovery } : {},
    docSummary: buildDocSummary(form), documents: form.documents, redFlagTriggered,
    redFlagResult: redFlagTriggered ? `Emergency alert: ${redFlagSymptoms.join(', ')}` : 'Clear',
    fhirBundle: buildFhirBundle(form, patientName, patientId, form.consents.abha),
  }
  try {
    const response = await fetch(`${API_BASE}/api/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await readJson(response)
    if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`)
    return { ok: true, token: data.session.token, error: '' }
  } catch (err) {
    return { ok: false, token: fallbackToken, error: err instanceof Error ? err.message : 'Unknown API error' }
  }
}

export interface SyntheticPatient {
  abhaId: string; abhaAddress: string; name: string; dob: string; gender: string; mobile: string;
  address: string; district: string; state: string; pincode: string; bloodGroup?: string | null;
}

export async function lookupSyntheticAbha(abhaId: string): Promise<{ ok: boolean; exists: boolean; patient?: SyntheticPatient; error?: string }> {
  const response = await fetch(`${API_BASE}/api/sandbox/abha/${encodeURIComponent(abhaId)}`)
  const data = await readJson(response)
  if (!response.ok && response.status !== 404) throw new Error(data.error || `HTTP ${response.status}`)
  return data
}

export interface DocumentUploadSession { token: string; expiresAt: string; uploadUrl: string; lanIp?: string }
export interface UploadedDocument { id: string; name: string; type: string; size: number; uploadedAt: string; url: string }

export async function createDocumentUploadSession(): Promise<DocumentUploadSession> {
  const response = await fetch(`${API_BASE}/api/document-sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ttlSeconds: 180 }) })
  const data = await readJson(response)
  if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`)
  return data.session
}

export async function getDocumentUploadSession(token: string): Promise<{ ok: boolean; active: boolean; expiresAt: string; documents: UploadedDocument[]; uploadUrl?: string }> {
  const response = await fetch(`${API_BASE}/api/document-sessions/${encodeURIComponent(token)}`)
  const data = await readJson(response)
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
  return data
}

export async function uploadDocumentFromPhone(token: string, file: File) {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error || new Error('Unable to read file'))
    reader.readAsDataURL(file)
  })
  const response = await fetch(`${API_BASE}/api/document-sessions/${encodeURIComponent(token)}/files`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, type: file.type || 'application/octet-stream', size: file.size, data }),
  })
  const result = await readJson(response)
  if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`)
  return result
}

export function apiBase() { return API_BASE }
