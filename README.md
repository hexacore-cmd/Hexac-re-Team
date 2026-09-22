# Nidaan Patient Intake Kiosk — ABDM Sandbox + Prisma

## Run

From the project root:

```powershell
npm install
npm run db:up
npm run prisma:generate
npm run db:push
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3000
- Health: http://localhost:3000/api/health

The compose file uses host port `5433` mapped to PostgreSQL container port `5432`. If you intentionally want to reuse another existing PostgreSQL instance, update `backend/.env` and do not recreate a container with a conflicting name.

## Included intake flow

- Synthetic ABHA lookup and patient confirmation
- Chief complaint and duration
- HPI onset, progression, pattern, better/worse factors, associated symptoms, treatment, investigations, and recurrence
- Immediate emergency diversion when breathlessness, chest pain, or fainting/dizziness is selected
- PMH, family history, concise personal/social history
- Optional patient-facing Dashavidha Pariksha questions
- Documents, review, consent, and submission
- Small speaker icon beside each question to read the question aloud; there is no separate read-aloud field


## Doctor dashboard

- Open `http://localhost:5173/doctor` to use the doctor dashboard. `/staff` is retained as a compatibility alias.
- Select a consultation to view the patient profile, intake responses, Dashavidha responses, and attached documents.
- Select **Run OCR** beside a document. The Node backend proxies the document to the separate PaddleOCR service and displays extracted fields separately.
- A patient-name mismatch warning appears when the OCR-extracted name differs from the profile name.

### Start PaddleOCR service

Run the OCR service with Docker:

```powershell
docker compose up --build ocr
```

The backend expects `OCR_SERVICE_URL=http://localhost:8000` by default. If you run the OCR service elsewhere, set `OCR_SERVICE_URL` in `backend/.env`.

The OCR service is optional for the rest of the intake flow; the doctor dashboard reports a clear error if it is not running.


## Troubleshooting: `Unexpected end of JSON input`

Start **PostgreSQL and PaddleOCR**, not only the OCR container:

```powershell
docker compose up -d db ocr
npm install
npm run db:push
npm run dev
```

Keep the OCR service running. The frontend proxies `/api` requests to the Node backend at `http://localhost:3000`. If the backend or database is stopped, the app now displays a clearer API error instead of an unhelpful JSON parsing message.

## Automatic document OCR

Document OCR runs automatically in the Node.js backend after a patient submits the intake form. The backend stores the OCR status and extracted result on each document. The Doctor Dashboard polls pending documents and displays the extracted fields automatically, alongside a **View original file** link.

Start the OCR service before submitting documents:

```powershell
docker compose build --no-cache ocr
docker compose up -d db ocr
npm run db:push
npm run dev
```

The doctor no longer needs to click **Run OCR**. A document can show `pending`, `processing`, `completed`, or `failed` status.


## Latest fixes
- Voice mode now shows exactly one voice capture control per question; the duplicate follow-up voice box is removed.
- OCR backend timeout increased to 10 minutes to accommodate first-run PaddleOCR model loading and slower documents.
- OCR remains automatic after intake submission; the doctor dashboard displays results and the original file link.

## Cleanup old demo consultation

To remove existing consultation records for the synthetic patient **Ramesh Pandurang Kadam** from your local database, run this once from the project root:

```powershell
npm run db:remove-ramesh
```

This removes matching consultation records and their related documents through the Prisma cascade. It does not remove the synthetic ABHA patient record, so the ABHA demo lookup can still be used later.

## OCR and handwritten documents

The OCR service now includes **PyMuPDF** (the package that provides the `fitz` module) to prevent the `Failed importing fitz` error.

PaddleOCR works best with clear printed or typed text. Handwritten text is only **limited/experimental**: handwriting may be missed or misread, so extracted information must be verified against the original document in the Doctor Dashboard.
