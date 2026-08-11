import express from "express";
import path from "node:path";
import cors from "cors";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3001;

const app = express();
app.use(express.json());
app.use(cors());

const db = new DatabaseSync(path.join(__dirname, "healthcoversim.db"));

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT NOT NULL,
  cover_type TEXT NOT NULL CHECK (cover_type IN ('Single', 'Couple', 'Family')),
  applicant1_age INTEGER NOT NULL CHECK (applicant1_age BETWEEN 18 AND 100),
  applicant1_cover_history TEXT NOT NULL CHECK (applicant1_cover_history IN ('Yes', 'No', 'Not Sure')),
  applicant2_age INTEGER CHECK (applicant2_age BETWEEN 18 AND 100),
  applicant2_cover_history TEXT CHECK (applicant2_cover_history IN ('Yes', 'No', 'Not Sure')),
  hospital_cover TEXT NOT NULL CHECK (hospital_cover IN ('None', 'Basic', 'Bronze', 'Silver', 'Gold')),
  extras_cover TEXT NOT NULL CHECK (extras_cover IN ('None', 'Basic', 'Standard', 'Premium')),
  payment_frequency TEXT NOT NULL CHECK (payment_frequency IN ('Monthly', 'Yearly')),
  annual_discount REAL NOT NULL DEFAULT 0 CHECK (annual_discount >= 0 AND annual_discount <= 10),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;
db.exec(CREATE_TABLE_SQL);

// ---------------------------------------------------------------------------
// Pricing tables & constants
// ---------------------------------------------------------------------------
const HOSPITAL_PRICES = { None: 0, Basic: 90, Bronze: 120, Silver: 160, Gold: 220 };
const EXTRAS_PRICES = { None: 0, Basic: 25, Standard: 45, Premium: 70 };
const FAMILY_UPGRADE_FEE = 30;
const LHC_STATEMENT =
  "Lifetime Health Cover loading applies only to hospital cover. It does not apply to extras cover.";

const VALID_COVER_TYPES = ["Single", "Couple", "Family"];
const VALID_COVER_HISTORY = ["Yes", "No", "Not Sure"];
const VALID_HOSPITAL_TIERS = ["None", "Basic", "Bronze", "Silver", "Gold"];
const VALID_EXTRAS_TIERS = ["None", "Basic", "Standard", "Premium"];
const VALID_PAYMENT_FREQUENCIES = ["Monthly", "Yearly"];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
function validateQuoteInput(data) {
  if (!data.customer_name || typeof data.customer_name !== "string" || data.customer_name.trim() === "") {
    return "Customer name is required.";
  }
  if (!VALID_COVER_TYPES.includes(data.cover_type)) {
    return "Invalid cover type.";
  }
  const isApplicant1AgeValid =
    typeof data.applicant1_age === "number" && data.applicant1_age >= 18 && data.applicant1_age <= 100;
  if (!isApplicant1AgeValid) {
    return "Applicant 1 age must be a number between 18 and 100.";
  }
  if (!VALID_COVER_HISTORY.includes(data.applicant1_cover_history)) {
    return "Invalid applicant 1 cover history.";
  }
  if (data.cover_type !== "Single") {
    const isApplicant2AgeValid =
      typeof data.applicant2_age === "number" && data.applicant2_age >= 18 && data.applicant2_age <= 100;
    if (!isApplicant2AgeValid) {
      return "Applicant 2 age must be a number between 18 and 100 for Couple or Family cover.";
    }
    if (!VALID_COVER_HISTORY.includes(data.applicant2_cover_history)) {
      return "Invalid applicant 2 cover history for Couple or Family cover.";
    }
  }
  if (!VALID_HOSPITAL_TIERS.includes(data.hospital_cover)) {
    return "Invalid hospital cover level.";
  }
  if (!VALID_EXTRAS_TIERS.includes(data.extras_cover)) {
    return "Invalid extras cover level.";
  }
  if (!VALID_PAYMENT_FREQUENCIES.includes(data.payment_frequency)) {
    return "Invalid payment frequency.";
  }
  // Always validate discount range, regardless of frequency, so an
  // out-of-range or missing value never reaches the database as a raw
  // constraint violation (which would otherwise surface as an opaque 500/400).
  if (data.annual_discount !== undefined && data.annual_discount !== null) {
    const isDiscountValid =
      typeof data.annual_discount === "number" && data.annual_discount >= 0 && data.annual_discount <= 10;
    if (!isDiscountValid) {
      return "Annual discount must be a number between 0 and 10.";
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pricing / LHC loading logic
// ---------------------------------------------------------------------------
function calculateLhcLoading(age, coverHistory, hospitalCover) {
  if (hospitalCover === "None") return 0; // nothing to load
  if (coverHistory !== "No") return 0; // "Yes" or "Not Sure" -> no loading
  if (age <= 30) return 0;
  return (age - 30) * 0.02;
}

function calculateQuote(data) {
  const isMultiApplicant = data.cover_type === "Couple" || data.cover_type === "Family";
  const adultCount = isMultiApplicant ? 2 : 1;
  const warnings = [];

  const applicant1Loading = calculateLhcLoading(
    data.applicant1_age,
    data.applicant1_cover_history,
    data.hospital_cover
  );
  if (data.applicant1_cover_history === "Not Sure") {
    warnings.push(
      "Applicant 1: Cover history is unknown — LHC loading has not been applied. This quote may be inaccurate."
    );
  }

  let applicant2Loading = 0;
  if (isMultiApplicant) {
    applicant2Loading = calculateLhcLoading(
      data.applicant2_age,
      data.applicant2_cover_history,
      data.hospital_cover
    );
    if (data.applicant2_cover_history === "Not Sure") {
      warnings.push(
        "Applicant 2: Cover history is unknown — LHC loading has not been applied. This quote may be inaccurate."
      );
    }
  }

  const hospitalBase = HOSPITAL_PRICES[data.hospital_cover];
  const hospitalPremium = isMultiApplicant
    ? hospitalBase * (1 + applicant1Loading) + hospitalBase * (1 + applicant2Loading)
    : hospitalBase * (1 + applicant1Loading);

  const extrasPremium = EXTRAS_PRICES[data.extras_cover] * adultCount;
  const familyUpgradeFee = data.cover_type === "Family" ? FAMILY_UPGRADE_FEE : 0;

  const monthlyPremium = hospitalPremium + extrasPremium + familyUpgradeFee;
  const yearlyBeforeDiscount = monthlyPremium * 12;
  const isYearly = data.payment_frequency === "Yearly";
  const yearlyAfterDiscount = isYearly
    ? yearlyBeforeDiscount * (1 - data.annual_discount / 100)
    : null;

  const explanationLines = [
    `Quote calculated for a ${data.cover_type} policy with ${data.payment_frequency} payment.`,
    `Hospital cover totals $${hospitalPremium.toFixed(2)}/month for ${adultCount} adult(s).`,
    `Extras cover totals $${extrasPremium.toFixed(2)}/month.`,
  ];
  if (familyUpgradeFee > 0) {
    explanationLines.push(`A $${familyUpgradeFee.toFixed(2)}/month family upgrade fee is included.`);
  }
  explanationLines.push(`Monthly premium is $${monthlyPremium.toFixed(2)}.`);
  const yearlyExplanation = isYearly
    ? `Yearly total before discount is $${yearlyBeforeDiscount.toFixed(2)}, discounted to ` +
      `$${yearlyAfterDiscount.toFixed(2)} after a ${data.annual_discount}% annual discount.`
    : `Yearly total (before any discount, since Monthly does not receive the annual discount) ` +
      `is $${yearlyBeforeDiscount.toFixed(2)}.`;
  explanationLines.push(yearlyExplanation);

  return {
    monthlyPremium: monthlyPremium.toFixed(2),
    hospitalPremium: hospitalPremium.toFixed(2),
    extrasPremium: extrasPremium.toFixed(2),
    yearlyBeforeDiscount: yearlyBeforeDiscount.toFixed(2),
    yearlyAfterDiscount: isYearly ? yearlyAfterDiscount.toFixed(2) : null,
    familyUpgradeFee: familyUpgradeFee > 0 ? familyUpgradeFee.toFixed(2) : null,
    applicant1LhcLoadingPercent: (applicant1Loading * 100).toFixed(0) + "%",
    applicant2LhcLoadingPercent: isMultiApplicant ? (applicant2Loading * 100).toFixed(0) + "%" : null,
    lhcStatement: LHC_STATEMENT,
    warnings,
    explanation: explanationLines.join(" "),
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// CREATE
app.post("/api/quotes", (req, res) => {
  const validationError = validateQuoteInput(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const input = req.body;
  const isSingle = input.cover_type === "Single";
  // Default the discount to 0 when absent (e.g. Monthly quotes that never
  // send one) so we never bind `undefined` into the database.
  const annualDiscount = typeof input.annual_discount === "number" ? input.annual_discount : 0;

  try {
    const result = db
      .prepare(
        `INSERT INTO quotes (
          customer_name, cover_type, applicant1_age, applicant1_cover_history,
          applicant2_age, applicant2_cover_history, hospital_cover, extras_cover,
          payment_frequency, annual_discount, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.customer_name,
        input.cover_type,
        input.applicant1_age,
        input.applicant1_cover_history,
        isSingle ? null : input.applicant2_age,
        isSingle ? null : input.applicant2_cover_history,
        input.hospital_cover,
        input.extras_cover,
        input.payment_frequency,
        annualDiscount,
        input.notes || null
      );
    res.status(201).json({ id: result.lastInsertRowid, ...input, annual_discount: annualDiscount });
  } catch (error) {
    console.error("Failed to create quote:", error);
    res.status(400).json({ error: "Could not save quote. Please check your input values." });
  }
});

// LIST
app.get("/api/quotes", (_req, res) => {
  const rows = db.prepare("SELECT * FROM quotes ORDER BY id DESC").all();
  res.json(rows);
});

// DETAIL (includes computed breakdown)
app.get("/api/quotes/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM quotes WHERE id = ?").get(req.params.id);
  if (!row) {
    return res.status(404).json({ error: "Quote not found." });
  }
  const breakdown = calculateQuote(row);
  res.json({ ...row, breakdown });
});

// UPDATE
app.put("/api/quotes/:id", (req, res) => {
  const validationError = validateQuoteInput(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const input = req.body;
  const isSingle = input.cover_type === "Single";
  const annualDiscount = typeof input.annual_discount === "number" ? input.annual_discount : 0;

  try {
    const result = db
      .prepare(
        `UPDATE quotes SET
          customer_name = ?, cover_type = ?, applicant1_age = ?, applicant1_cover_history = ?,
          applicant2_age = ?, applicant2_cover_history = ?, hospital_cover = ?, extras_cover = ?,
          payment_frequency = ?, annual_discount = ?, notes = ?
        WHERE id = ?`
      )
      .run(
        input.customer_name,
        input.cover_type,
        input.applicant1_age,
        input.applicant1_cover_history,
        isSingle ? null : input.applicant2_age,
        isSingle ? null : input.applicant2_cover_history,
        input.hospital_cover,
        input.extras_cover,
        input.payment_frequency,
        annualDiscount,
        input.notes || null,
        req.params.id
      );
    if (result.changes === 0) {
      return res.status(404).json({ error: "Quote not found." });
    }
    res.json({ id: Number(req.params.id), ...input, annual_discount: annualDiscount });
  } catch (error) {
    console.error("Failed to update quote:", error);
    res.status(400).json({ error: "Could not update quote. Please check your input values." });
  }
});

// DELETE
app.delete("/api/quotes/:id", (req, res) => {
  const result = db.prepare("DELETE FROM quotes WHERE id = ?").run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Quote not found." });
  }
  res.status(200).json({ message: "Quote deleted." });
});

// ---------------------------------------------------------------------------
// 
// ---------------------------------------------------------------------------
const distPath = path.join(__dirname, "dist");
app.use(express.static(distPath));
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`HealthCoverSim API listening on http://localhost:${PORT}`);
});