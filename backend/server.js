require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json({ limit: '12mb' }));

const documentSessions = new Map();
const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const QR_TTL_SECONDS = 180;
const makeUploadToken = () => crypto.randomBytes(18).toString('hex');
const isActiveUploadSession = (session) => session && Date.now() < session.expiresAt;
const isPrivateIPv4 = (address) => (
  address.startsWith('192.168.') ||
  address.startsWith('10.') ||
  /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)
);
const getLanIp = () => {
  const nets = os.networkInterfaces();
  const preferred = ['Wi-Fi', 'WiFi', 'WLAN'];
  for (const adapter of preferred) {
    for (const n of nets[adapter] || []) {
      if (n.family === 'IPv4' && !n.internal && isPrivateIPv4(n.address)) {
        return n.address;
      }
    }
  }
  const virtual = ['wsl','hyper-v','hyperv','docker','vmware','vbox','virtual','vethernet','loopback'];
  for (const [adapter, list] of Object.entries(nets)) {
    const name = adapter.toLowerCase();
    if (virtual.some(v => name.includes(v))) continue;
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal && isPrivateIPv4(n.address)) return n.address;
    }
  }
  return null;
};

const publicKioskUrl = (token) => {
  const host = getLanIp() || 'localhost';
  const url = `http://${host}:5173/mobile-upload?token=${encodeURIComponent(token)}`;
  console.log(`[QR] Mobile upload URL: ${url}`);
  return url;
};
// QR expiry only stops NEW uploads. Uploaded files are intentionally kept.
// The session remains available to the kiosk so files can still be displayed
// after the 3-minute QR window has ended.
const cleanupUploadSessions = () => {
  // Keep expired sessions in memory for this kiosk run. Persistent Document
  // records are created as files arrive, so the files survive QR expiry.
};
setInterval(cleanupUploadSessions, 30_000).unref();

const makeToken = () => `A-${Math.floor(100 + Math.random() * 900)}`;

const toLegacySessionShape = (session) => ({
  ...session,
  helper_name: session.helperName,
  patient_name: session.patientName,
  chief_complaint: session.chiefComplaint,
  red_flag_triggered: session.redFlagTriggered,
  red_flag_result: session.redFlagResult,
  created_at: session.createdAt,
});


const normalizeAbhaId = (value) => String(value || '').trim().replace(/\s+/g, '').toUpperCase();

app.get('/api/sandbox/abha/:abhaId', async (req, res) => {
  const abhaId = normalizeAbhaId(req.params.abhaId);
  if (!/^\d{2}-\d{4}-\d{4}-\d{4}$/.test(abhaId)) {
    return res.status(400).json({ ok: false, exists: false, error: 'Enter a demo ABHA number in the format 12-3456-7890-1234' });
  }

  try {
    let patient = await prisma.syntheticPatient.findUnique({ where: { abhaId } });
    if (!patient) {
      const demoPatients = {
        '12-3456-7890-1234': {
          abhaId,
          abhaAddress: 'ramesh.kadam@abdm',
          name: 'Ramesh Pandurang Kadam',
          dob: new Date('1974-08-19T00:00:00.000Z'),
          gender: 'Male', mobile: '+91 90000 10001',
          address: '12 Shanti Nagar, Thane West', district: 'Thane', state: 'Maharashtra', pincode: '400601', bloodGroup: 'B+'
        },
        '23-4567-8901-2345': {
          abhaId,
          abhaAddress: 'sneha.patil@abdm',
          name: 'Sneha Anil Patil',
          dob: new Date('1991-02-11T00:00:00.000Z'),
          gender: 'Female', mobile: '+91 90000 10002',
          address: '18 Shree Colony, Pune', district: 'Pune', state: 'Maharashtra', pincode: '411001', bloodGroup: 'O+'
        },
        '34-5678-9012-3456': {
          abhaId, abhaAddress: 'rahul.verma@abdm', name: 'Rahul Suresh Verma',
          dob: new Date('1986-06-24T00:00:00.000Z'), gender: 'Male', mobile: '+91 90000 10003',
          address: '44 Green Park, Nashik', district: 'Nashik', state: 'Maharashtra', pincode: '422001', bloodGroup: 'A+'
        },
        '45-6789-0123-4567': {
          abhaId, abhaAddress: 'meera.sharma@abdm', name: 'Meera Rajesh Sharma',
          dob: new Date('1996-10-03T00:00:00.000Z'), gender: 'Female', mobile: '+91 90000 10004',
          address: '9 Lake View Road, Nagpur', district: 'Nagpur', state: 'Maharashtra', pincode: '440001', bloodGroup: 'AB+'
        },
        '56-7890-1234-5678': {
          abhaId, abhaAddress: 'arjun.joshi@abdm', name: 'Arjun Mahesh Joshi',
          dob: new Date('1979-01-17T00:00:00.000Z'), gender: 'Male', mobile: '+91 90000 10005',
          address: '27 Station Road, Kolhapur', district: 'Kolhapur', state: 'Maharashtra', pincode: '416001', bloodGroup: 'O-'
        },
        '67-8901-2345-6789': {
          abhaId, abhaAddress: 'kavita.deshmukh@abdm', name: 'Kavita Sunil Deshmukh',
          dob: new Date('1988-12-09T00:00:00.000Z'), gender: 'Female', mobile: '+91 90000 10006',
          address: '6 River Lane, Aurangabad', district: 'Aurangabad', state: 'Maharashtra', pincode: '431001', bloodGroup: 'B-'
        }
      };
      const seed = demoPatients[abhaId];
      if (seed) {
        patient = await prisma.syntheticPatient.upsert({ where: { abhaId }, update: seed, create: seed });
      }
    }
    if (!patient) return res.status(404).json({ ok: true, exists: false, error: 'No synthetic patient found for this demo ABHA number' });

    return res.json({ ok: true, exists: true, patient: { ...patient, dob: patient.dob.toISOString().slice(0, 10) } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, exists: false, error: err.message });
  }
});

app.post('/api/document-sessions', (req, res) => {
  const token = makeUploadToken();
  const expiresAt = Date.now() + QR_TTL_SECONDS * 1000;
  const session = { token, expiresAt, files: [] };
  documentSessions.set(token, session);
  console.log(`[QR] Created token ${token}; expires at ${new Date(expiresAt).toISOString()}`);
  res.status(201).json({ ok: true, session: { token, expiresAt: new Date(expiresAt).toISOString(), uploadUrl: publicKioskUrl(token), lanIp: getLanIp() } });
});

app.get('/api/document-sessions/:token', (req, res) => {
  cleanupUploadSessions();
  const session = documentSessions.get(req.params.token);
  if (!session) return res.status(404).json({ ok: false, active: false, error: 'Upload session expired or not found' });
  res.json({ ok: true, active: isActiveUploadSession(session), expiresAt: new Date(session.expiresAt).toISOString(), uploadUrl: publicKioskUrl(session.token), documents: session.files.map(({ path: _path, ...file }) => file) });
});

app.post('/api/document-sessions/:token/files', async (req, res) => {
  const session = documentSessions.get(req.params.token);
  if (!session) return res.status(404).json({ ok: false, error: 'Upload session not found' });
  if (!isActiveUploadSession(session)) {
    return res.status(410).json({ ok: false, error: 'This QR upload session has expired. Please scan a new QR.' });
  }
  const { name, type, size, data } = req.body || {};
  if (!name || !data || typeof data !== 'string' || !data.startsWith('data:')) return res.status(400).json({ ok: false, error: 'File data is required' });
  if (Number(size) > 7 * 1024 * 1024) return res.status(413).json({ ok: false, error: 'Maximum document size is 7 MB' });
  const match = data.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) return res.status(400).json({ ok: false, error: 'Invalid document encoding' });

  try {
    const id = crypto.randomUUID();
    const safeName = String(name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    const filePath = path.join(uploadsDir, `${id}-${safeName}`);
    fs.writeFileSync(filePath, Buffer.from(match[1], 'base64'));
    const file = { id, name: safeName, type: type || 'application/octet-stream', size: Number(size) || 0, uploadedAt: new Date().toISOString(), url: `/api/document-sessions/${encodeURIComponent(session.token)}/files/${encodeURIComponent(id)}`, path: filePath };
    session.files.push(file);
    await prisma.document.create({ data: { id, uploadToken: session.token, name: file.name, type: file.type, size: file.size, storagePath: filePath } });
    console.log(`[UPLOAD] Saved ${file.name} for QR token ${session.token}`);
    return res.status(201).json({ ok: true, document: (({ path: _path, ...publicFile }) => publicFile)(file) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/document-sessions/:token/files/:id', async (req, res) => {
  try {
    const file = await prisma.document.findFirst({ where: { id: req.params.id, uploadToken: req.params.token } });
    if (!file || !fs.existsSync(file.storagePath)) return res.status(404).send('File unavailable');
    res.type(file.type || 'application/octet-stream').sendFile(path.resolve(file.storagePath));
  } catch (err) {
    res.status(500).send('Unable to open file');
  }
});

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: 'connected', orm: 'prisma' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

const processDocumentOCR = async (documentId) => {
  const file = await prisma.document.findUnique({ where: { id: documentId } });
  if (!file || !fs.existsSync(file.storagePath)) return;
  await prisma.document.update({ where: { id: documentId }, data: { ocrStatus: 'processing', ocrError: null } });
  const serviceUrl = process.env.OCR_SERVICE_URL || 'http://localhost:8000';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 600000);
  try {
    const response = await fetch(`${serviceUrl.replace(/\/$/, '')}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_name: file.name, file_base64: fs.readFileSync(file.storagePath).toString('base64') }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || `OCR service returned HTTP ${response.status}`);
    await prisma.document.update({ where: { id: documentId }, data: { ocrStatus: 'completed', ocrJson: data.ocr, ocrError: null } });
    console.log(`[OCR] Completed ${file.name}`);
  } catch (err) {
    const message = err.name === 'AbortError' ? 'OCR service timed out after 10 minutes' : err.message;
    await prisma.document.update({ where: { id: documentId }, data: { ocrStatus: 'failed', ocrError: message, ocrJson: null } }).catch(() => {});
    console.error(`[OCR] Failed for ${file.name}: ${message}`);
  } finally { clearTimeout(timeout); }
};

app.post('/api/sessions', async (req, res) => {
  const {
    token: requestedToken, channel, helperName, helperId, patientName, abhaId,
    abhaLinkConsent, shareConsent, chiefComplaint, fields,
    ayushFlagged, ayushFields, docSummary, documents,
    redFlagTriggered, redFlagResult, fhirBundle,
  } = req.body || {};

  // Keep emergency status reliable even if an older kiosk client omits the
  // top-level flag but includes red-flag symptoms inside the intake fields.
  const fieldRedFlags = Array.isArray(fields?.redFlagSymptoms)
    ? fields.redFlagSymptoms.filter((item) => item && item !== 'none')
    : [];
  const emergencyTriggered = Boolean(redFlagTriggered) || fieldRedFlags.length > 0;
  const emergencyResult = emergencyTriggered
    ? (redFlagResult && redFlagResult !== 'Clear'
        ? redFlagResult
        : `Emergency alert: ${fieldRedFlags.join(', ') || 'Patient-selected red flag'}`)
    : 'Clear';

  if (!channel || !['self', 'kiosk'].includes(channel)) {
    return res.status(400).json({ ok: false, error: 'channel must be self or kiosk' });
  }
  if (typeof shareConsent !== 'boolean') {
    return res.status(400).json({ ok: false, error: 'shareConsent must be boolean' });
  }

  try {
    let token = requestedToken || makeToken();
    let session;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        session = await prisma.session.create({
          data: {
            token,
            channel,
            helperName: helperName || null,
            helperId: helperId || null,
            patientName: patientName || null,
            abhaId: abhaId || null,
            abhaLinkConsent: !!abhaLinkConsent,
            shareConsent,
            chiefComplaint: chiefComplaint || null,
            fieldsJson: fields || {},
            ayushFlagged: !!ayushFlagged,
            ayushFieldsJson: ayushFields || {},
            docSummary: docSummary || null,
            redFlagTriggered: emergencyTriggered,
            redFlagResult: emergencyResult,
            fhirBundleJson: fhirBundle || undefined,
          },
          select: { id: true, token: true, createdAt: true },
        });
        break;
      } catch (err) {
        if (err.code !== 'P2002' || attempt === 4) throw err;
        token = makeToken();
      }
    }

    const documentIds = Array.isArray(documents) ? documents.map(d => d?.id).filter(Boolean) : [];
    if (documentIds.length) {
      await prisma.document.updateMany({
        where: { id: { in: documentIds }, sessionToken: null },
        data: { sessionToken: token, ocrStatus: 'pending', ocrError: null },
      });
      for (const documentId of documentIds) {
        processDocumentOCR(documentId).catch(err => console.error('[OCR] Background job error:', err.message));
      }
    }

    if (redFlagTriggered !== undefined || fieldRedFlags.length > 0) {
      await prisma.redFlagEvent.create({
        data: {
          sessionToken: token,
          triggered: emergencyTriggered,
          confirmed: emergencyResult ? /^Confirmed/i.test(emergencyResult) : null,
        },
      });
    }

    res.status(201).json({ ok: true, session });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/documents/:id/ocr', async (req, res) => {
  try {
    const file = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!file || !fs.existsSync(file.storagePath)) {
      return res.status(404).json({ ok: false, error: 'Document file not found' });
    }
    const serviceUrl = process.env.OCR_SERVICE_URL || 'http://localhost:8000';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 600000);
    let response;
    try {
      response = await fetch(`${serviceUrl.replace(/\/$/, '')}/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_name: file.name, file_base64: fs.readFileSync(file.storagePath).toString('base64') }),
        signal: controller.signal,
      });
    } finally { clearTimeout(timeout); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      return res.status(502).json({ ok: false, error: data.error || 'OCR service failed', service: data });
    }
    res.json({ ok: true, document: { id: file.id, name: file.name }, ocr: data.ocr });
  } catch (err) {
    const message = err.name === 'AbortError' ? 'OCR service timed out after 10 minutes' : err.message;
    res.status(502).json({ ok: false, error: `OCR unavailable: ${message}` });
  }
});

app.get('/api/sessions', async (_req, res) => {
  try {
    const sessions = await prisma.session.findMany({
      select: {
        token: true,
        channel: true,
        helperName: true,
        patientName: true,
        chiefComplaint: true,
        redFlagTriggered: true,
        redFlagResult: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ ok: true, sessions: sessions.map(toLegacySessionShape) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/sessions/:token', async (req, res) => {
  try {
    const session = await prisma.session.findUnique({
      where: { token: req.params.token },
      include: { redFlagEvents: true, documents: true },
    });
    if (!session) return res.status(404).json({ ok: false, error: 'not found' });
    let abhaPatient = null;
    if (session.abhaId) {
      const linked = await prisma.syntheticPatient.findUnique({ where: { abhaId: session.abhaId } });
      if (linked) abhaPatient = { ...linked, dob: linked.dob.toISOString().slice(0, 10) };
    }
    res.json({ ok: true, session: { ...toLegacySessionShape(session), abhaPatient, documents: session.documents.map(d => ({
      id: d.id, name: d.name, type: d.type, size: d.size, uploadedAt: d.uploadedAt,
      ocrStatus: d.ocrStatus, ocrError: d.ocrError, ocr: d.ocrJson,
      url: `/api/document-sessions/${encodeURIComponent(d.uploadToken || req.params.token)}/files/${encodeURIComponent(d.id)}`
    })) } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

const processPendingOCRJobs = async () => {
  try {
    const pending = await prisma.document.findMany({
      where: { sessionToken: { not: null }, ocrStatus: 'pending' },
      select: { id: true },
      take: 50,
    });
    for (const document of pending) {
      processDocumentOCR(document.id).catch(err => console.error('[OCR] Pending job error:', err.message));
    }
  } catch (err) {
    console.error('[OCR] Could not restore pending jobs:', err.message);
  }
};

const PORT = Number(process.env.PORT || 3000);
const server = app.listen(PORT, () => {
  console.log(`Nidaan API listening on http://localhost:${PORT}`);
  processPendingOCRJobs();
});

const shutdown = async () => {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
