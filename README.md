# HealthCoverSim

A full-stack private health insurance quote simulator built for CSE3CWA / CSE5006, Semester 2 2026. Users can create, view, edit and delete quote records; each quote calculates an estimated monthly and yearly premium from cover type, hospital and extras tiers, applicant ages, Lifetime Health Cover (LHC) loading, the family upgrade fee, and the annual-payment discount.

This is a learning simulator only — it is not financial advice and does not reflect any real insurer's pricing.

## Tech stack

| Component | Technology |
|---|---|
| Frontend | React (Vite) |
| Backend | Node.js + Express |
| Database | SQLite (via Node's built-in `node:sqlite` module) |
| Styling | Plain CSS |

## Project structure

This project uses a single, flat folder rather than separate `backend/`/`frontend/` folders — one shared `package.json` covers both the Express server's dependencies and the React/Vite frontend's dependencies.

```
HealthCoverSim/
├── src/
│   ├── main.jsx        # Vite/React entry point
│   ├── App.jsx           # All pages/components (form, list, detail, edit)
│   └── style.css
├── index.html
├── server.js              # Express app, routes, validation, pricing logic, DB schema
├── database.sql            # Standalone copy of the schema server.js creates on startup
├── vite.config.js
├── package.json
├── package-lock.json
├── .gitignore
└── README.md
```

## 1. Installation and running the project

Requires **Node.js 22.5+** (the backend uses Node's built-in `node:sqlite` module, stable from Node 24). Check with:
```bash
node -v
```

Install all dependencies once, from the project root (this installs both the Express/backend packages and the React/Vite packages, since they share one `package.json`):
```bash
npm install
```

Then run the backend and frontend in **two separate terminals**:

### Terminal 1 — backend
```bash
node server.js
```
The API starts on `http://localhost:3001`.

### Terminal 2 — frontend
```bash
npm run dev
```
Vite starts the app on `http://localhost:5173` (default). Open that URL in a browser — it talks to the backend at `http://localhost:3001/api/quotes`, so the backend must already be running.

## 2. Database setup

The SQLite database (`healthcoversim.db`) is created automatically the first time `server.js` runs — it executes a `CREATE TABLE IF NOT EXISTS` statement on startup, so no manual setup step is required. The exact same schema is also provided separately in `database.sql` so it can be inspected or run independently:
```bash
sqlite3 healthcoversim.db < database.sql
```
The `quotes` table stores the raw inputs only (customer name, cover type, applicant ages/history, cover tiers, payment frequency, discount, notes, and a `created_at` timestamp). The premium itself is **not** stored — it's recalculated from the stored inputs every time a quote is viewed. This keeps the pricing logic in exactly one place (`calculateQuote()` in `server.js`) instead of duplicating it between "calculate on create" and "calculate on view."

`healthcoversim.db` is excluded from the repository via `.gitignore` since it's a local runtime file, not source code — it will be regenerated automatically the first time you run `node server.js`.

## 3. How the quote calculation works

Hospital cover and extras cover are priced completely separately and then added together:

1. **Hospital premium** — each adult's hospital tier price is multiplied by `(1 + their individual LHC loading)`, then summed across adults.
2. **Extras premium** — the extras tier price × number of adults. Extras is never affected by LHC loading.
3. **Family upgrade fee** — a flat $30/month, added only for `Family` cover.
4. **Monthly premium** = hospital premium + extras premium + family upgrade fee.
5. **Yearly premium (before discount)** = monthly premium × 12.
6. **Yearly premium (after discount)** = yearly before discount × `(1 − annual discount / 100)`, applied **only** when payment frequency is Yearly. Monthly payers never receive the discount.

**LHC loading** is calculated per applicant, independently:
- If hospital cover is `None`, loading is always 0% (nothing to load).
- If cover history is `Yes`, loading is 0%.
- If cover history is `Not Sure`, loading is 0%, and a warning is attached to the quote flagging it may be inaccurate.
- If cover history is `No` and age > 30, loading = `(age − 30) × 2%`. If age ≤ 30, loading is 0%.

The required statement — *"Lifetime Health Cover loading applies only to hospital cover. It does not apply to extras cover."* — is included in every quote's breakdown.

This logic was verified against the assignment's Section 7 worked example (Family, age 40/No history + age 35/Yes history, Silver hospital, Standard extras, Yearly at 5% discount) and reproduces the expected output exactly: **$472 monthly, $5,664 yearly before discount, $5,380.80 yearly after discount.**

## 4. How Family cover is calculated

`Family` cover is priced as **two adults**, exactly like `Couple` cover — each with their own hospital and extras premiums and their own individually calculated LHC loading — plus one flat **$30/month family upgrade fee** added once. Dependent children are not counted or priced individually; the flat fee is the only adjustment for family size, applied automatically without any additional user input.

## 5. Validation

Both frontend and backend validate:
- Customer name required
- Cover type, hospital tier, extras tier, and payment frequency must be one of the allowed options
- Applicant 1 age between 18–100; Applicant 2 age/history required (and validated the same way) only for Couple/Family
- Annual discount between 0–10, required when paying Yearly
- "Not sure" cover history never triggers loading automatically — it's flagged as a warning instead

Backend validation exists independently of the frontend's, because the assignment explicitly requires the API to reject bad data even when it bypasses the UI (e.g. requests sent directly via curl/Postman) — this is called out in Section 9 and tested as an edge case in Section 14.

## 6. AI use statement

> **Tool used:** ChatGPT / Claude / Gemini
>
> **What it helped with:** I used AI as an assistant throughout the project — mainly to brainstorm edge cases for form validation, to help structure the Express backend routes, and to help lay out the CSS for the explanation sheet. It also helped me organize the installation steps and project structure into this README.
>
> **What I personally checked or implemented:** I wrote the core premium engine and the Lifetime Health Cover (LHC) loading logic myself. I manually worked through the assignment's Section 7 example to confirm the formulas produced the exact expected monthly and yearly totals. I also built the React conditional logic that shows/hides Applicant 2's fields, and personally tested every CRUD endpoint to confirm the app handles missing or invalid data correctly rather than crashing.
>
> **One decision I made myself:** I chose to store only the raw user input in the SQLite database and recompute the quote breakdown on demand each time a detail view is loaded, rather than storing the calculated premium. This keeps every pricing rule in a single backend module, so there's no risk of a stored premium going stale or drifting out of sync with the calculation logic.

## 7. Limitations

The Lifetime Health Cover loading in this simulator is uncapped and does not reduce or reset after years of continuous cover, unlike the real Australian LHC scheme (which caps the loading and removes it after 10 years of continuous hospital cover). This is a deliberate simplification per the assignment brief, not an oversight.

## 8. API reference

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/quotes` | Create a quote |
| GET | `/api/quotes` | List all quotes |
| GET | `/api/quotes/:id` | Get one quote plus its calculated breakdown |
| PUT | `/api/quotes/:id` | Update a quote |
| DELETE | `/api/quotes/:id` | Delete a quote |
