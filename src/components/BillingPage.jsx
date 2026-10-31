import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CreditCard,
  Lock,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Smartphone,
  Wallet,
} from 'lucide-react';
import { billingApi } from '../services/api.js';
import Notice from './Notice.jsx';
import './billing.css';

const PAYMENT_METHODS = [
  { id: 'visa', label: 'Visa', hint: 'Card payment', Icon: CreditCard },
  { id: 'mastercard', label: 'Mastercard', hint: 'Card payment', Icon: CreditCard },
  { id: 'airtel', label: 'Airtel Money', hint: 'Mobile money', Icon: Smartphone },
  { id: 'mtn', label: 'MTN Mobile Money', hint: 'Mobile money', Icon: Wallet },
  { id: 'zamtel', label: 'Zamtel Money', hint: 'Mobile money', Icon: Smartphone },
];

const COMING_SOON_MESSAGE = 'Online payments are coming soon. Your subscription has not been activated. Please try again later.';

function money(cents, currency = 'ZMW') {
  const amount = (Number(cents) || 0) / 100;
  const formatted = amount.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === 'ZMW' ? `K${formatted}` : `${currency} ${formatted}`;
}

function billingPeriodLabel(plan) {
  const interval = String(plan?.interval || '').toLowerCase();
  if (interval === 'yearly' || interval === 'year') return 'Billed yearly';
  if (interval === 'monthly' || interval === 'month') return 'Billed monthly';
  return plan?.interval ? `Billed ${plan.interval}` : 'Subscription';
}

function durationLabel(plan) {
  const interval = String(plan?.interval || '').toLowerCase();
  if (interval === 'yearly' || interval === 'year') return '12 months';
  if (interval === 'monthly' || interval === 'month') return '1 month';
  return plan?.interval || '—';
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('260')) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+260${digits.slice(1)}`;
  if (digits.length === 9) return `+260${digits}`;
  if (String(value || '').trim().startsWith('+')) return `+${digits}`;
  return String(value || '').trim();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isValidZambiaPhone(value) {
  return /^\+260(9|7)\d{8}$/.test(normalizePhone(value));
}

export default function BillingPage({ mode = 'plans', checkoutToken = '', user, onNavigate }) {
  const [plans, setPlans] = useState([]);
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [paymentNoticeOpen, setPaymentNoticeOpen] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [billingDetails, setBillingDetails] = useState({
    fullName: '',
    email: '',
    phone: '+260',
    address: '',
  });

  const usage = summary?.usage;
  const subscription = summary?.subscription;
  const plan = preview?.plan;
  const pendingCheckout = preview?.status === 'pending';

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      billingApi.plans(),
      billingApi.subscription().catch(() => null),
      billingApi.history().catch(() => []),
      mode === 'checkout' && checkoutToken
        ? billingApi.preview(checkoutToken).catch((err) => { throw err; })
        : Promise.resolve(null),
    ])
      .then(([planRows, sub, tx, checkout]) => {
        if (!active) return;
        setPlans(planRows);
        setSummary(sub);
        setHistory(tx);
        setPreview(checkout);
        setError('');
      })
      .catch((err) => {
        if (active) setError(err.message || 'Could not load billing information.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mode, checkoutToken]);

  useEffect(() => {
    setBillingDetails((current) => ({
      ...current,
      fullName: current.fullName || user?.name || user?.fullName || '',
      email: current.email || user?.email || '',
      phone: current.phone && current.phone !== '+260' ? current.phone : (user?.phone ? normalizePhone(user.phone) : '+260'),
    }));
  }, [user?.name, user?.fullName, user?.email, user?.phone]);

  const paidPlans = useMemo(() => plans.filter((item) => item.priceCents > 0), [plans]);

  function updateBilling(field, value) {
    setBillingDetails((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: '' }));
    setNotice('');
  }

  function validateBilling() {
    const next = {};
    if (!String(billingDetails.fullName || '').trim()) next.fullName = 'Full name is required.';
    if (!isValidEmail(billingDetails.email)) next.email = 'Enter a valid email address.';
    if (!isValidZambiaPhone(billingDetails.phone)) {
      next.phone = 'Enter a valid Zambian mobile number (+260 followed by 9 digits).';
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function startCheckout(planCode) {
    setBusy(true);
    setError('');
    setNotice('');
    setPaymentNoticeOpen(false);
    try {
      const session = await billingApi.checkout(planCode);
      onNavigate?.('billing-checkout', { token: session.checkoutToken });
    } catch (err) {
      setError(err.message || 'Could not start checkout.');
    } finally {
      setBusy(false);
    }
  }

  function proceedToPayment(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!pendingCheckout) {
      setError('This checkout session is no longer available.');
      return;
    }
    if (!validateBilling()) return;
    if (!selectedMethod) {
      setFieldErrors((current) => ({ ...current, method: 'Select a payment method to continue.' }));
      return;
    }
    // Gateway is not integrated yet — never call confirm / activate Pro.
    setPaymentNoticeOpen(true);
    setNotice(COMING_SOON_MESSAGE);
  }

  async function cancelPlan() {
    if (!window.confirm('Cancel your paid subscription?')) return;
    setBusy(true);
    setError('');
    try {
      const next = await billingApi.cancel();
      setSummary(next);
      setNotice('Subscription cancellation saved.');
    } catch (err) {
      setError(err.message || 'Could not cancel subscription.');
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'checkout') {
    return (
      <section className="account-page billing-page">
        <div className="account-heading">
          <div>
            <span className="section-kicker">CHECKOUT</span>
            <h1>Complete your subscription</h1>
            <p>Review your plan, enter billing details, and choose a payment method. Pro is only activated after a verified payment.</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => onNavigate?.('billing')}>
            <ArrowLeft size={15} /> Back to plans
          </button>
        </div>

        {error ? <Notice tone="error" message={error} onDismiss={() => setError('')} /> : null}
        {notice && !paymentNoticeOpen ? <Notice message={notice} onDismiss={() => setNotice('')} /> : null}
        {loading ? <p className="muted-text">Loading checkout…</p> : null}

        {!loading && preview ? (
          <form className="billing-checkout-layout" onSubmit={proceedToPayment}>
            <div className="billing-checkout-main">
              <div className="panel-card billing-section">
                <div className="billing-section-head">
                  <h2>Selected plan</h2>
                  <span className={`billing-status-pill ${pendingCheckout ? 'is-pending' : ''}`}>
                    {pendingCheckout ? 'Checkout pending payment' : `Session ${preview.status}`}
                  </span>
                </div>
                <div className="billing-plan-selected">
                  <div>
                    <strong>{plan?.name || 'Paid plan'}</strong>
                    <p>{plan?.description || billingPeriodLabel(plan)}</p>
                    <small>{billingPeriodLabel(plan)} · {durationLabel(plan)}</small>
                  </div>
                  <div className="billing-plan-price">
                    <strong>{money(preview.amountCents, preview.currency || plan?.currency)}</strong>
                    <span>Total due now</span>
                  </div>
                </div>
              </div>

              <div className="panel-card billing-section">
                <div className="billing-section-head">
                  <h2>Billing details</h2>
                  <span className="billing-secure-note"><Lock size={13} /> Secured for checkout</span>
                </div>
                <div className="billing-fields">
                  <label className="field">
                    <span>Full name</span>
                    <input
                      value={billingDetails.fullName}
                      onChange={(event) => updateBilling('fullName', event.target.value)}
                      placeholder="As it appears on your account"
                      autoComplete="name"
                      required
                    />
                    {fieldErrors.fullName ? <small className="billing-field-error">{fieldErrors.fullName}</small> : null}
                  </label>
                  <label className="field">
                    <span>Email address</span>
                    <div className="billing-input-with-icon">
                      <Mail size={15} />
                      <input
                        type="email"
                        value={billingDetails.email}
                        onChange={(event) => updateBilling('email', event.target.value)}
                        placeholder="you@example.com"
                        autoComplete="email"
                        required
                      />
                    </div>
                    {fieldErrors.email ? <small className="billing-field-error">{fieldErrors.email}</small> : null}
                  </label>
                  <label className="field">
                    <span>Phone number</span>
                    <div className="billing-input-with-icon">
                      <Phone size={15} />
                      <input
                        value={billingDetails.phone}
                        onChange={(event) => updateBilling('phone', event.target.value)}
                        onBlur={() => updateBilling('phone', normalizePhone(billingDetails.phone))}
                        placeholder="+2609XXXXXXXX"
                        autoComplete="tel"
                        required
                      />
                    </div>
                    {fieldErrors.phone ? <small className="billing-field-error">{fieldErrors.phone}</small> : null}
                  </label>
                  <label className="field">
                    <span>Billing address <em>(optional)</em></span>
                    <div className="billing-input-with-icon">
                      <MapPin size={15} />
                      <input
                        value={billingDetails.address}
                        onChange={(event) => updateBilling('address', event.target.value)}
                        placeholder="Street, city, province"
                        autoComplete="street-address"
                      />
                    </div>
                  </label>
                </div>
              </div>

              <div className="panel-card billing-section">
                <div className="billing-section-head">
                  <h2>Payment method</h2>
                  <span className="billing-coming-soon-tag">Gateway coming soon</span>
                </div>
                <p className="muted-text billing-method-intro">
                  Choose how you would like to pay. These options will process payments once Flutterwave is connected.
                </p>
                <div className="billing-methods" role="radiogroup" aria-label="Payment methods">
                  {PAYMENT_METHODS.map((method) => {
                    const Icon = method.Icon;
                    const selected = selectedMethod === method.id;
                    return (
                      <button
                        key={method.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`billing-method-card ${selected ? 'is-selected' : ''}`}
                        onClick={() => {
                          setSelectedMethod(method.id);
                          setFieldErrors((current) => ({ ...current, method: '' }));
                        }}
                      >
                        <span className="billing-method-icon" aria-hidden="true"><Icon size={20} /></span>
                        <span className="billing-method-copy">
                          <strong>{method.label}</strong>
                          <small>{method.hint}</small>
                        </span>
                        <span className="billing-method-badge">Coming soon</span>
                      </button>
                    );
                  })}
                </div>
                {fieldErrors.method ? <small className="billing-field-error">{fieldErrors.method}</small> : null}
              </div>
            </div>

            <aside className="panel-card billing-summary-card">
              <h2>Order summary</h2>
              <dl className="billing-summary-list">
                <div>
                  <dt>Plan</dt>
                  <dd>{plan?.name || '—'}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{durationLabel(plan)}</dd>
                </div>
                <div>
                  <dt>Billing period</dt>
                  <dd>{billingPeriodLabel(plan)}</dd>
                </div>
                <div>
                  <dt>Plan price</dt>
                  <dd>{money(preview.amountCents, preview.currency || plan?.currency)}</dd>
                </div>
                <div>
                  <dt>Fees</dt>
                  <dd>None</dd>
                </div>
              </dl>
              <div className="billing-summary-total">
                <span>Total payable</span>
                <strong>{money(preview.amountCents, preview.currency || plan?.currency)} ZMW</strong>
              </div>
              <p className="billing-summary-note">
                <ShieldCheck size={14} /> Your account stays on Free until a real payment is verified.
              </p>
              <button type="submit" className="primary-button billing-pay-button" disabled={busy || !pendingCheckout}>
                Proceed to Payment
              </button>
              <button type="button" className="secondary-button" onClick={() => onNavigate?.('billing')}>
                Back
              </button>
              {!pendingCheckout ? (
                <p className="muted-text">This checkout session is already {preview.status}. Start again from Plans.</p>
              ) : null}
            </aside>
          </form>
        ) : null}

        {paymentNoticeOpen ? (
          <div className="dialog-backdrop" role="presentation" onClick={() => setPaymentNoticeOpen(false)}>
            <div
              className="confirm-dialog billing-payment-notice"
              role="dialog"
              aria-modal="true"
              aria-labelledby="billing-payment-notice-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="dialog-icon"><Wallet size={19} /></div>
              <h2 id="billing-payment-notice-title">Payment unavailable</h2>
              <p>{COMING_SOON_MESSAGE}</p>
              <p className="muted-text">Selected method: {PAYMENT_METHODS.find((item) => item.id === selectedMethod)?.label || '—'}</p>
              <div className="dialog-actions">
                <button type="button" className="primary-button" onClick={() => setPaymentNoticeOpen(false)}>
                  Understood
                </button>
                <button type="button" className="secondary-button" onClick={() => onNavigate?.('billing')}>
                  Return to plans
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="account-page billing-page">
      <div className="account-heading">
        <div>
          <span className="section-kicker">BILLING</span>
          <h1>Plans & Billing</h1>
          <p>Choose a PlanWise AI plan. Paid upgrades only activate after a verified online payment.</p>
        </div>
      </div>
      {error ? <Notice tone="error" message={error} onDismiss={() => setError('')} /> : null}
      {notice ? <Notice message={notice} onDismiss={() => setNotice('')} /> : null}
      {loading ? <p className="muted-text">Loading plans…</p> : null}

      {subscription && usage ? (
        <div className="panel-card billing-current-plan">
          <div>
            <span className="section-kicker">CURRENT SUBSCRIPTION</span>
            <h2>{subscription.plan?.name || 'Free'}</h2>
            <p className="billing-current-status">
              Status: <strong>{subscription.status || 'free'}</strong>
              {subscription.plan?.code === 'free' || subscription.status === 'free'
                ? ' · Remains Free until payment is verified'
                : null}
            </p>
            <p>
              AI prompts this month: <strong>{usage.aiPromptCount}</strong>
              {usage.aiPromptLimit < 0 ? ' / unlimited' : ` / ${usage.aiPromptLimit}`}
            </p>
            <p>
              Uploads this month: <strong>{usage.uploadCount}</strong>
              {usage.uploadLimit < 0 ? ' / unlimited' : ` / ${usage.uploadLimit}`}
            </p>
          </div>
          {subscription.plan?.code !== 'free' && subscription.status !== 'free' ? (
            <button type="button" className="secondary-button" disabled={busy} onClick={cancelPlan}>Cancel subscription</button>
          ) : null}
        </div>
      ) : null}

      <div className="plans-grid">
        {plans.map((item) => {
          const isCurrent = subscription?.plan?.code === item.code;
          return (
            <article key={item.code} className={`panel-card plan-card ${isCurrent ? 'is-current' : ''}`}>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <strong className="plan-card-price">{item.priceCents ? money(item.priceCents, item.currency) : 'Free'}</strong>
              <small className="plan-card-period">{item.priceCents ? billingPeriodLabel(item) : 'Always included'}</small>
              <ul>
                <li>{item.aiPromptLimit < 0 ? 'Unlimited AI prompts' : `${item.aiPromptLimit} AI prompts / month`}</li>
                <li>{item.uploadLimit < 0 ? 'Unlimited uploads' : `${item.uploadLimit} uploads / month`}</li>
              </ul>
              {item.priceCents > 0 ? (
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy || isCurrent}
                  onClick={() => startCheckout(item.code)}
                >
                  {isCurrent ? 'Current plan' : 'Select plan'}
                </button>
              ) : (
                <span className="admin-muted">{isCurrent ? 'Your current plan' : 'Default plan'}</span>
              )}
            </article>
          );
        })}
      </div>

      {paidPlans.length && history.length ? (
        <div className="panel-card billing-history-card">
          <h2>Billing history</h2>
          <div className="billing-history-table-wrap">
            <table>
              <thead>
                <tr><th>Date</th><th>Plan</th><th>Amount</th><th>Status</th></tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.createdAt).toLocaleString()}</td>
                    <td>{row.planName || row.planCode || '—'}</td>
                    <td>{money(row.amountCents, row.currency)}</td>
                    <td>
                      <span className={`billing-history-status is-${String(row.status || '').toLowerCase()}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
