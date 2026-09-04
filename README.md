# FM Condition Survey Portal

Mobile-first Facilities Management condition survey and snagging app. Runs fully
offline in the browser, captures defects with photos and touch signatures, and
exports an audit-ready **PDF** and multi-sheet **Excel (.xlsx)** report.

## Features

- Facility & site details with 23 pre-configured facilities and GPS coordinates
- Asset / defect register with department, priority (P1–P4), quantity and cost
- Photo evidence per defect, compressed on-device before storage
- Scorecard with CapEx totals by department and priority
- Touch signature sign-off for surveyor and client
- PDF report (cover, CapEx allocation, defect schedule, photo evidence log)
- Excel report (Executive Summary, Department CapEx, Snag Register, Photo Log)
- JSON backup / restore
- Offline-first: all data is stored in the browser's IndexedDB

## Requirements

- Node.js 18 or newer

## Local development

```bash
npm install
npm run dev
```

The dev server listens on port 3000 (override with `PORT`) and is exposed on the
local network so it can be opened from a phone or tablet on the same Wi-Fi.

## Production build

```bash
npm run build     # outputs to dist/
npm run preview   # serve the built app locally
```

## Deploying to Vercel

The repo already contains `vercel.json`. Import the GitHub repository at
[vercel.com/new](https://vercel.com/new) and deploy — Vercel detects Vite and
uses the settings below:

| Setting          | Value           |
| ---------------- | --------------- |
| Framework Preset | Vite            |
| Build Command    | `npm run build` |
| Output Directory | `dist`          |
| Install Command  | `npm install`   |

No environment variables are required.

## Where the data lives

Surveys are saved to **IndexedDB in the browser on the device that created
them**. Nothing is uploaded to a server. That means:

- The app works with no internet connection.
- Data is **not** shared between devices or users.
- Clearing the browser's site data deletes the surveys.

Use **More Actions → Backup Survey (JSON)** to export a survey, and
**Restore Survey (JSON)** to load it on another device.

If surveys need to be shared across devices or surveyors, a hosted database is
required. See `DATABASE.md`.
