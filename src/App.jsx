import { useState, useEffect } from 'react';

const API_BASE_URL = 'http://localhost:3001/api/quotes';

const COVER_TYPES = ['Single', 'Couple', 'Family'];
const COVER_HISTORY_OPTIONS = ['Yes', 'No', 'Not Sure'];
const HOSPITAL_TIERS = ['None', 'Basic', 'Bronze', 'Silver', 'Gold'];
const EXTRAS_TIERS = ['None', 'Basic', 'Standard', 'Premium'];
const PAYMENT_FREQUENCIES = ['Monthly', 'Yearly'];

const DEFAULT_FORM = {
  customer_name: '',
  cover_type: 'Single',
  applicant1_age: 30,
  applicant1_cover_history: 'Yes',
  applicant2_age: '',
  applicant2_cover_history: 'Yes',
  hospital_cover: 'Bronze',
  extras_cover: 'Standard',
  payment_frequency: 'Monthly',
  annual_discount: 0,
  notes: '',
};

function validateQuoteInput(data) {
  if (!data.customer_name || typeof data.customer_name !== 'string' || data.customer_name.trim() === '') {
    return 'Customer name is required.';
  }
  if (/\d/.test(data.customer_name)) {
    return 'Customer name cannot contain numbers.';
  }
  if (!COVER_TYPES.includes(data.cover_type)) {
    return 'Invalid cover type.';
  }

  const isApplicant1AgeValid =
    typeof data.applicant1_age === 'number' &&
    !isNaN(data.applicant1_age) &&
    data.applicant1_age >= 18 &&
    data.applicant1_age <= 100;
  if (!isApplicant1AgeValid) {
    return 'Applicant 1 age must be a number between 18 and 100.';
  }
  if (!COVER_HISTORY_OPTIONS.includes(data.applicant1_cover_history)) {
    return 'Invalid applicant 1 cover history.';
  }

  if (data.cover_type !== 'Single') {
    const isApplicant2AgeValid =
      typeof data.applicant2_age === 'number' &&
      !isNaN(data.applicant2_age) &&
      data.applicant2_age >= 18 &&
      data.applicant2_age <= 100;
    if (!isApplicant2AgeValid) {
      return 'Applicant 2 age must be a number between 18 and 100 for Couple or Family cover.';
    }
    if (!COVER_HISTORY_OPTIONS.includes(data.applicant2_cover_history)) {
      return 'Invalid applicant 2 cover history for Couple or Family cover.';
    }
  }

  if (!HOSPITAL_TIERS.includes(data.hospital_cover)) {
    return 'Invalid hospital cover level.';
  }
  if (!EXTRAS_TIERS.includes(data.extras_cover)) {
    return 'Invalid extras cover level.';
  }
  if (!PAYMENT_FREQUENCIES.includes(data.payment_frequency)) {
    return 'Invalid payment frequency.';
  }

  if (data.payment_frequency === 'Yearly') {
    const isDiscountValid =
      typeof data.annual_discount === 'number' &&
      !isNaN(data.annual_discount) &&
      data.annual_discount >= 0 &&
      data.annual_discount <= 10;
    if (!isDiscountValid) {
      return 'Annual discount must be a number between 0 and 10 for yearly payment frequency.';
    }
  }

  return null;
}

export default function App() {
  const [quotes, setQuotes] = useState([]);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editingId, setEditingId] = useState(null);
  const [selectedQuoteDetail, setSelectedQuoteDetail] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchQuotes = async () => {
    try {
      const res = await fetch(API_BASE_URL);
      const data = await res.json();
      setQuotes(data);
    } catch (err) {
      console.error('Error fetching quotes:', err);
    }
  };

  useEffect(() => {
    fetchQuotes();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === 'payment_frequency') {
      setForm({
        ...form,
        payment_frequency: value,
        annual_discount: value === 'Monthly' ? 0 : form.annual_discount,
      });
      return;
    }

    const isNumericField = name.endsWith('_age') || name === 'annual_discount';
    setForm({
      ...form,
      [name]: isNumericField ? (value === '' ? '' : Number(value)) : value,
    });
  };

  const resetForm = () => {
    setForm(DEFAULT_FORM);
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const validationError = validateQuoteInput(form);
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    const url = editingId ? `${API_BASE_URL}/${editingId}` : API_BASE_URL;
    const method = editingId ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Something went wrong.');
        return;
      }

      resetForm();
      fetchQuotes();
    } catch (err) {
      setErrorMsg('Server connection error.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this quote?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchQuotes();
        if (selectedQuoteDetail?.id === id) setSelectedQuoteDetail(null);
      }
    } catch (err) {
      console.error('Error deleting quote:', err);
    }
  };

  const handleEditClick = (quote) => {
    setEditingId(quote.id);
    setSelectedQuoteDetail(null);
    setForm({
      customer_name: quote.customer_name,
      cover_type: quote.cover_type,
      applicant1_age: quote.applicant1_age,
      applicant1_cover_history: quote.applicant1_cover_history,
      applicant2_age: quote.applicant2_age ?? '',
      applicant2_cover_history: quote.applicant2_cover_history ?? 'Yes',
      hospital_cover: quote.hospital_cover,
      extras_cover: quote.extras_cover,
      payment_frequency: quote.payment_frequency,
      annual_discount: quote.annual_discount ?? 0,
      notes: quote.notes ?? '',
    });
  };

  const handleViewDetail = async (id) => {
    try {
      const res = await fetch(`${API_BASE_URL}/${id}`);
      const data = await res.json();
      setSelectedQuoteDetail(data);
    } catch (err) {
      console.error('Error fetching detail:', err);
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <p className="eyebrow">HealthCoverSim</p>
        <h1>Quote workbench</h1>
        <p className="subtitle">Build, review and adjust private health cover estimates.</p>
      </header>

      {errorMsg && <div className="alert">{errorMsg}</div>}

      <section className="card">
        <h2>{editingId ? `Editing quote #${editingId}` : 'New quote'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="field-grid">
            <label className="field">
              <span>Customer name</span>
              <input type="text" name="customer_name" value={form.customer_name} onChange={handleChange} />
            </label>

            <label className="field">
              <span>Cover type</span>
              <select name="cover_type" value={form.cover_type} onChange={handleChange}>
                {COVER_TYPES.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Applicant 1 age</span>
              <input type="number" name="applicant1_age" value={form.applicant1_age} onChange={handleChange} />
            </label>

            <label className="field">
              <span>Applicant 1 cover history</span>
              <select name="applicant1_cover_history" value={form.applicant1_cover_history} onChange={handleChange}>
                {COVER_HISTORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            {form.cover_type !== 'Single' && (
              <>
                <label className="field">
                  <span>Applicant 2 age</span>
                  <input type="number" name="applicant2_age" value={form.applicant2_age} onChange={handleChange} />
                </label>

                <label className="field">
                  <span>Applicant 2 cover history</span>
                  <select name="applicant2_cover_history" value={form.applicant2_cover_history} onChange={handleChange}>
                    {COVER_HISTORY_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <label className="field">
              <span>Hospital cover</span>
              <select name="hospital_cover" value={form.hospital_cover} onChange={handleChange}>
                {HOSPITAL_TIERS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Extras cover</span>
              <select name="extras_cover" value={form.extras_cover} onChange={handleChange}>
                {EXTRAS_TIERS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Payment frequency</span>
              <select name="payment_frequency" value={form.payment_frequency} onChange={handleChange}>
                {PAYMENT_FREQUENCIES.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            {form.payment_frequency === 'Yearly' && (
              <label className="field">
                <span>Annual discount (%)</span>
                <input
                  type="number"
                  name="annual_discount"
                  value={form.annual_discount}
                  onChange={handleChange}
                  min="0"
                  max="10"
                  step="0.1"
                />
              </label>
            )}
          </div>

          <label className="field field-full">
            <span>Notes</span>
            <textarea name="notes" value={form.notes} onChange={handleChange} rows={3} />
          </label>

          <div className="actions">
            <button type="submit" className="btn btn-primary">
              {editingId ? 'Save changes' : 'Create quote'}
            </button>
            {editingId && (
              <button type="button" className="btn btn-ghost" onClick={resetForm}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="card">
        <h2>Saved quotes</h2>
        {quotes.length === 0 ? (
          <p className="empty-state">No quotes yet — create one above.</p>
        ) : (
          <table className="quote-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Customer</th>
                <th>Cover</th>
                <th>Payment</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {quotes.map((quote) => (
                <tr key={quote.id}>
                  <td>{quote.id}</td>
                  <td>{quote.customer_name}</td>
                  <td>{quote.cover_type}</td>
                  <td>{quote.payment_frequency}</td>
                  <td className="row-actions">
                    <button className="link-btn" onClick={() => handleViewDetail(quote.id)}>View</button>
                    <button className="link-btn" onClick={() => handleEditClick(quote)}>Edit</button>
                    <button className="link-btn link-btn-danger" onClick={() => handleDelete(quote.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {selectedQuoteDetail && (
        <section className="card statement">
          <div className="statement-header">
            <div>
              <p className="eyebrow">Quote #{selectedQuoteDetail.id}</p>
              <h2>{selectedQuoteDetail.customer_name}</h2>
              <p className="subtitle">
                {selectedQuoteDetail.cover_type} cover · {selectedQuoteDetail.payment_frequency} payment
              </p>
            </div>
            <button className="link-btn" onClick={() => setSelectedQuoteDetail(null)}>Close</button>
          </div>

          <div className="statement-divider" />

          <dl className="statement-grid">
            <div className="statement-row">
              <dt>Hospital premium</dt>
              <dd className="statement-figure">${selectedQuoteDetail.breakdown.hospitalPremium}</dd>
            </div>
            <div className="statement-row">
              <dt>Extras premium</dt>
              <dd className="statement-figure">${selectedQuoteDetail.breakdown.extrasPremium}</dd>
            </div>
            {selectedQuoteDetail.breakdown.familyUpgradeFee && (
              <div className="statement-row">
                <dt>Family upgrade fee</dt>
                <dd className="statement-figure">${selectedQuoteDetail.breakdown.familyUpgradeFee}</dd>
              </div>
            )}
            <div className="statement-row statement-row-total">
              <dt>Monthly premium</dt>
              <dd className="statement-figure">${selectedQuoteDetail.breakdown.monthlyPremium}</dd>
            </div>
            <div className="statement-row">
              <dt>Yearly premium (before discount)</dt>
              <dd className="statement-figure">${selectedQuoteDetail.breakdown.yearlyBeforeDiscount}</dd>
            </div>
            {selectedQuoteDetail.breakdown.yearlyAfterDiscount && (
              <div className="statement-row statement-row-total">
                <dt>Yearly premium (after discount)</dt>
                <dd className="statement-figure">${selectedQuoteDetail.breakdown.yearlyAfterDiscount}</dd>
              </div>
            )}
          </dl>

          <div className="statement-divider" />

          <div className="statement-grid">
            <div className="statement-row">
              <dt>Applicant 1 LHC loading</dt>
              <dd className="statement-figure">{selectedQuoteDetail.breakdown.applicant1LhcLoadingPercent}</dd>
            </div>
            {selectedQuoteDetail.breakdown.applicant2LhcLoadingPercent && (
              <div className="statement-row">
                <dt>Applicant 2 LHC loading</dt>
                <dd className="statement-figure">{selectedQuoteDetail.breakdown.applicant2LhcLoadingPercent}</dd>
              </div>
            )}
          </div>

          <p className="lhc-note">{selectedQuoteDetail.breakdown.lhcStatement}</p>

          {selectedQuoteDetail.breakdown.warnings.length > 0 && (
            <div className="warning-box">
              {selectedQuoteDetail.breakdown.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          )}

          <p className="explanation">{selectedQuoteDetail.breakdown.explanation}</p>
        </section>
      )}
    </div>
  );
}
