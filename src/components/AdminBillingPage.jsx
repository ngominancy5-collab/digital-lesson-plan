import { useEffect, useState } from 'react';
import { billingApi } from '../services/api.js';

function money(cents) {
  const amount = (Number(cents) || 0) / 100;
  return `K${amount.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AdminBillingPage() {
  const [data, setData] = useState({ transactions: [], subscriptions: [] });
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([billingApi.admin(), billingApi.plans()])
      .then(([billing, planRows]) => {
        if (!active) return;
        setData({
          transactions: billing.transactions || [],
          subscriptions: billing.subscriptions || [],
        });
        setPlans(planRows || []);
        setError('');
      })
      .catch((err) => {
        if (active) setError(err.message || 'Could not load billing records.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const paid = data.transactions.filter((row) => row.status === 'paid');

  return (
    <section className="account-page">
      <div className="account-heading">
        <div>
          <span className="section-kicker">ADMINISTRATION</span>
          <h1>Billing & payments</h1>
          <p>See who paid, which plan they bought, and current paid subscriptions. Amounts come from the database, not the browser.</p>
        </div>
      </div>

      {error ? <p className="admin-error">{error}</p> : null}
      {loading ? <p>Loading payments...</p> : null}

      <div className="panel-card" style={{ marginBottom: 14 }}>
        <h2>Plan catalogue</h2>
        <div className="plans-grid">
          {plans.map((plan) => (
            <article key={plan.code} className="plan-card">
              <h3>{plan.name}</h3>
              <p>{plan.description}</p>
              <strong>{plan.priceCents ? money(plan.priceCents) : 'Free'}</strong>
              <small className="admin-muted">
                {plan.aiPromptLimit < 0 ? 'Unlimited AI' : `${plan.aiPromptLimit} AI / month`}
                {' · '}
                {plan.uploadLimit < 0 ? 'Unlimited uploads' : `${plan.uploadLimit} uploads / month`}
              </small>
            </article>
          ))}
        </div>
      </div>

      <div className="panel-card accounts-table" style={{ marginBottom: 14 }}>
        <h2>Who paid ({paid.length})</h2>
        {!paid.length && !loading ? <p className="admin-muted">No successful payments yet.</p> : null}
        {paid.length ? (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Plan</th>
                <th>Amount</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {paid.map((row) => (
                <tr key={row.id}>
                  <td data-label="Name">{row.user?.name || '—'}</td>
                  <td data-label="Email">{row.user?.email || '—'}</td>
                  <td data-label="Plan">{row.planName || row.planCode || '—'}</td>
                  <td data-label="Amount">{money(row.amountCents)}</td>
                  <td data-label="Date">{new Date(row.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      <div className="panel-card accounts-table" style={{ marginBottom: 14 }}>
        <h2>Active / past paid subscriptions</h2>
        {!data.subscriptions.length && !loading ? <p className="admin-muted">No paid subscriptions on record.</p> : null}
        {data.subscriptions.length ? (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Period end</th>
              </tr>
            </thead>
            <tbody>
              {data.subscriptions.map((row) => (
                <tr key={row.id}>
                  <td data-label="Name">{row.user?.name || '—'}</td>
                  <td data-label="Email">{row.user?.email || '—'}</td>
                  <td data-label="Plan">{row.planName || row.planCode || '—'}</td>
                  <td data-label="Status">{row.status}{row.cancelAtPeriodEnd ? ' (cancels at period end)' : ''}</td>
                  <td data-label="Period end">{row.currentPeriodEnd ? new Date(row.currentPeriodEnd).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      <div className="panel-card accounts-table">
        <h2>All billing transactions</h2>
        {!data.transactions.length && !loading ? <p className="admin-muted">No billing transactions yet.</p> : null}
        {data.transactions.length ? (
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Plan</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.map((row) => (
                <tr key={row.id}>
                  <td data-label="User">{row.user ? `${row.user.name} (${row.user.email})` : '—'}</td>
                  <td data-label="Plan">{row.planName || row.planCode || '—'}</td>
                  <td data-label="Amount">{money(row.amountCents)}</td>
                  <td data-label="Status">{row.status}</td>
                  <td data-label="Date">{new Date(row.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </section>
  );
}
