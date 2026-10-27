import { useCallback, useEffect, useState } from 'react';
import { publishBalance } from '../lib/balance-events.js';
import { formatCents, parseDollarsToCents } from '../lib/format.js';
import { useSession } from '../lib/session.jsx';

export default function Wallet() {
  const { user, request, updateUser } = useSession();
  const [balance, setBalance] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [limits, setLimits] = useState(null);
  const [amount, setAmount] = useState('50.00');
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    const [wallet, ledger, queue, savedLimits] = await Promise.all([
      request('/api/wallet/balance'),
      request('/api/wallet/transactions?limit=25'),
      request('/api/wallet/withdrawals'),
      request('/api/users/limits'),
    ]);
    setBalance(wallet);
    publishBalance(wallet.balanceCents);
    setTransactions(ledger.transactions);
    setWithdrawals(queue.withdrawals);
    setLimits(savedLimits.limits);
  }, [request]);

  useEffect(() => {
    refresh().catch((requestError) => setError(requestError.message));
  }, [refresh]);

  async function run(action) {
    setError(null);
    setNotice(null);
    try {
      await action();
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const cents = parseDollarsToCents(amount);

  return (
    <section className="panel">
      <h1>Wallet</h1>

      <p className="balance-large">{balance ? formatCents(balance.balanceCents) : '—'}</p>

      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}

      <div className="row">
        <label>
          Amount
          <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>

        <button
          type="button"
          onClick={() =>
            run(async () => {
              await request('/api/wallet/deposit', {
                method: 'POST',
                body: { amountCents: cents, idempotencyKey: crypto.randomUUID() },
              });
              setNotice(`Deposited ${formatCents(cents)}.`);
            })
          }
        >
          Deposit
        </button>

        <button
          type="button"
          className="secondary"
          onClick={() =>
            run(async () => {
              await request('/api/wallet/withdraw', { method: 'POST', body: { amountCents: cents, destination: {} } });
              setNotice('Withdrawal requested — it will show as pending until review.');
            })
          }
        >
          Withdraw
        </button>
      </div>

      {user?.kycStatus !== 'verified' && (
        <div className="callout">
          <h2>Identity verification</h2>
          <p>
            Withdrawals need a verified identity. Your current status is <strong>{user?.kycStatus}</strong>.
          </p>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              run(async () => {
                await request('/api/users/kyc', {
                  method: 'POST',
                  body: { documentType: 'passport', providerRef: `ref-${crypto.randomUUID()}` },
                });
                const me = await request('/api/users/profile');
                updateUser(me.user);
                setNotice('Documents submitted. Verification is usually reviewed within a day.');
              })
            }
          >
            Submit verification
          </button>
        </div>
      )}

      <section className="callout">
        <h2>Play limits</h2>
        <p className="muted">
          Limits apply from the moment you set them. Deposit limits reset at midnight UTC; loss limits
          count stakes minus wins over the same day.
        </p>
        <div className="row">
          <label>
            Daily deposit limit
            <input
              inputMode="decimal"
              defaultValue={limits?.daily_deposit_limit_cents ? limits.daily_deposit_limit_cents / 100 : ''}
              onBlur={(event) =>
                event.target.value &&
                run(async () => {
                  await request('/api/users/limits', {
                    method: 'PUT',
                    body: { dailyDepositLimitCents: parseDollarsToCents(event.target.value) },
                  });
                  setNotice('Deposit limit saved.');
                })
              }
            />
          </label>
          <label>
            Daily loss limit
            <input
              inputMode="decimal"
              defaultValue={limits?.daily_loss_limit_cents ? limits.daily_loss_limit_cents / 100 : ''}
              onBlur={(event) =>
                event.target.value &&
                run(async () => {
                  await request('/api/users/limits', {
                    method: 'PUT',
                    body: { dailyLossLimitCents: parseDollarsToCents(event.target.value) },
                  });
                  setNotice('Loss limit saved.');
                })
              }
            />
          </label>
        </div>

        <button
          type="button"
          className="ghost danger"
          onClick={() => {
            if (!window.confirm('Self-exclude for 30 days? This cannot be shortened from here.')) return;
            run(async () => {
              const result = await request('/api/users/self-exclude', { method: 'POST', body: { days: 30 } });
              updateUser(result.user);
              setNotice('You are self-excluded for 30 days. Withdrawals stay available.');
            });
          }}
        >
          Self-exclude for 30 days
        </button>
      </section>

      <section>
        <h2>Pending withdrawals</h2>
        {withdrawals.length === 0 ? (
          <p className="muted">None.</p>
        ) : (
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">Amount</th>
                <th scope="col">Status</th>
                <th scope="col">Requested</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((item) => (
                <tr key={item.id}>
                  <td>{formatCents(item.amount_cents)}</td>
                  <td>{item.status}</td>
                  <td>{new Date(item.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Transactions</h2>
        <table className="ledger">
          <thead>
            <tr>
              <th scope="col">Type</th>
              <th scope="col">Amount</th>
              <th scope="col">Balance after</th>
              <th scope="col">When</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.type}</td>
                <td className={entry.amount_cents > 0 ? 'win' : 'loss'}>{formatCents(entry.amount_cents)}</td>
                <td>{formatCents(entry.balance_after_cents)}</td>
                <td>{new Date(entry.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  );
}
