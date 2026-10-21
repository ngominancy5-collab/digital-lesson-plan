import { useEffect, useMemo, useState } from 'react';
import { billingApi } from '../services/api.js';

function money(cents) {
  const amount = (Number(cents) || 0) / 100;
  return `K${amount.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function BillingPage({ mode = 'plans', checkoutToken = '', onNavigate }) {
  const [plans, setPlans] = useState([]);
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const usage = summary?.usage;
  const subscription = summary?.subscription;

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

  const paidPlans = useMemo(() => plans.filter((plan) => plan.priceCents > 0), [plans]);

  async function startCheckout(planCode) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const session = await billingApi.checkout(planCode);
      onNavigate?.('billing-checkout', { token: session.checkoutToken });
    } catch (err) {
      setError(err.message || 'Could not start checkout.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmPayment() {
    if (!checkoutToken) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const next = await billingApi.confirm(checkoutToken);
      setSummary(next);
      setNotice('Payment verified on the server. Your subscription is active.');
      onNavigate?.('billing');
    } catch (err) {
      setError(err.message || 'Payment could not be confirmed.');
    } finally {
      setBusy(false);
    }
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
      <section className="account-page">
        <div className="account-heading">
          <div>
            <span className="section-kicker">BILLING</span>
            <h1>Checkout</h1>
            <p>Prices and activation are controlled by the backend. Confirming payment verifies the session server-side before the plan is upgraded.</p>
          </div>
        </div>
        {error ? <p className="admin-error">{error}</p> : null}
        {loading ? <p>Loading checkout...</p> : null}
        {preview ? (
          <div className="panel-card">
            <h2>{preview.plan?.name}</h2>
            <p>{preview.plan?.description}</p>
            <p><strong>{money(preview.amountCents)}</strong> · Status: {preview.status}</p>
            {preview.status === 'pending' ? (
              <button type="button" className="primary-button" disabled={busy} onClick={confirmPayment}>
                {busy ? 'Confirming…' : 'Confirm secure payment'}
              </button>
            ) : (
              <p className="admin-muted">This checkout session is already {preview.status}.</p>
            )}
            <button type="button" className="text-button" onClick={() => onNavigate?.('billing')}>Back to plans</button>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="account-page">
      <div className="account-heading">
        <div>
          <span className="section-kicker">BILLING</span>
          <h1>Plans & usage</h1>
          <p>Subscription prices, limits, and payment confirmation are enforced by the application server and database — not the browser.</p>
        </div>
      </div>
      {error ? <p className="admin-error">{error}</p> : null}
      {notice ? <p className="admin-muted">{notice}</p> : null}
      {loading ? <p>Loading plans...</p> : null}

      {subscription && usage ? (
        <div className="panel-card">
          <h2>Current plan: {subscription.plan?.name}</h2>
          <p className="admin-muted">Status: {subscription.status}</p>
          <p>
            AI prompts this month: <strong>{usage.aiPromptCount}</strong>
            {usage.aiPromptLimit < 0 ? ' / unlimited' : ` / ${usage.aiPromptLimit}`}
          </p>
          <p>
            Uploads this month: <strong>{usage.uploadCount}</strong>
            {usage.uploadLimit < 0 ? ' / unlimited' : ` / ${usage.uploadLimit}`}
          </p>
          {subscription.plan?.code !== 'free' ? (
            <button type="button" className="secondary-button" disabled={busy} onClick={cancelPlan}>Cancel subscription</button>
          ) : null}
        </div>
      ) : null}

      <div className="plans-grid">
        {plans.map((plan) => (
          <article key={plan.code} className="panel-card plan-card">
            <h3>{plan.name}</h3>
            <p>{plan.description}</p>
            <strong>{plan.priceCents ? money(plan.priceCents) : 'Free'}</strong>
            <ul>
              <li>{plan.aiPromptLimit < 0 ? 'Unlimited AI prompts' : `${plan.aiPromptLimit} AI prompts / month`}</li>
              <li>{plan.uploadLimit < 0 ? 'Unlimited uploads' : `${plan.uploadLimit} uploads / month`}</li>
            </ul>
            {plan.priceCents > 0 ? (
              <button
                type="button"
                className="primary-button"
                disabled={busy || subscription?.plan?.code === plan.code}
                onClick={() => startCheckout(plan.code)}
              >
                {subscription?.plan?.code === plan.code ? 'Current plan' : 'Upgrade'}
              </button>
            ) : (
              <span className="admin-muted">Default plan</span>
            )}
          </article>
        ))}
      </div>

      {paidPlans.length && history.length ? (
        <div className="panel-card" style={{ marginTop: 16 }}>
          <h2>Billing history</h2>
          <table>
            <thead>
              <tr><th>Date</th><th>Plan</th><th>Amount</th><th>Status</th></tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.createdAt).toLocaleString()}</td>
                  <td>{row.planName || row.planCode || '—'}</td>
                  <td>{money(row.amountCents)}</td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
