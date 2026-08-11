Markdown# HealthCoverSim

A full-stack private health insurance quote simulator built for CSE3CWA / CSE5006, Semester 2 2026. Users can create, view, edit and delete quote records; each quote calculates an estimated monthly and yearly premium from cover type, hospital and extras tiers, applicant ages, Lifetime Health Cover (LHC) loading, the family upgrade fee, and the annual-payment discount.

This is a learning simulator only — it is not financial advice and does not reflect any real insurer's pricing.

## Tech stack

| Component | Technology |
|---|---|
| Frontend | React + Vite |
| Backend | Node.js + Express |
| Database | SQLite (`healthcoversim.db` / `database.sql`) |
| Styling | CSS (`src/style.css`) |

## Project structure

```text
HealthCoverSim/
├── src/
│   ├── App.jsx            # React components (form, quote list, explanation sheet, edit)
│   ├── main.jsx           # Vite/React entry point
│   └── style.css          # Application styles
├── .gitignore
├── database.sql           # SQLite schema script
├── healthcoversim.db      # SQLite database file
├── index.html             # HTML template entry point
├── main.jsx               # Root entry file
├── package.json           # Dependencies and project scripts
├── package-lock.json      # Locked dependency tree
├── server.js              # Express API server, validation, database integration, and pricing engine
├── vite.config.js         # Vite configuration settings
└── README.md              # Project documentation



   ## 2. Database setup

The SQLite database (`healthcoversim.db`) is created automatically the first time `server.js` runs — it executes a `CREATE TABLE IF NOT EXISTS` statement on startup, so no manual setup step is required. The exact same schema is also provided separately in `backend/init.sql` so it can be inspected or run independently:
```bash
sqlite3 healthcoversim.db < database.sql
```
The `quotes` table stores the raw inputs only (customer name, cover type, applicant ages/history, cover tiers, payment frequency, discount, notes, and a `created_at` timestamp). The premium itself is **not** stored — it's recalculated from the stored inputs every time a quote is viewed. This keeps the pricing logic in exactly one place (`calculateQuote()` in `server.js`) instead of duplicating it between "calculate on create" and "calculate on view."

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
