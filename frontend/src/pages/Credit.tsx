import { useState } from 'react';
import { getAccounting, getAvailableCredit } from '@/chain/sieveClient';
import { PageHeader, Section } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { Gen } from '@/components/ui/Gen';
import { ErrorState, Notice } from '@/components/ui/Notice';
import { Skeleton } from '@/components/ui/Skeleton';
import { TxPanel } from '@/components/wallet/TxPanel';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useLoad } from '@/hooks/useLoad';
import { VALUE_TRANSFER_DOCS_URL } from '@/lib/constants';
import { formatGenSymbol, parseGen } from '@/lib/units';
import { useWallet } from '@/wallet/walletContext';

export default function Credit() {
  useDocumentTitle('Credit');
  const { account, openModal } = useWallet();
  const credit = useLoad(() => getAvailableCredit(account ?? ''), [account], { enabled: Boolean(account), pollMs: 30000 });
  const accounting = useLoad(getAccounting, [], { pollMs: 30000 });
  const [amount, setAmount] = useState('');
  const wei = parseGen(amount);
  const amountError = amount.trim() && (wei === null || wei === 0n) ? 'Enter a positive amount with at most 18 decimals.' : null;
  const refresh = () => {
    credit.reload();
    accounting.reload();
  };
  const a = accounting.data;

  return (
    <>
      <PageHeader
        title="Credit"
        lead="Sieve keeps a pull-payment ledger. You deposit GEN as credit, tenders and bonds lock part of it, and settlement returns it to your credit. You withdraw credit yourself."
      />
      <Section title="Your credit">
        {!account ? (
          <div className="surface space-y-3 p-6">
            <p>Connect a wallet to see and use your credit. The contract totals below work without one.</p>
            <Button onClick={openModal}>Connect wallet</Button>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="surface space-y-4 p-6">
              <p className="text-sm text-muted">Available credit</p>
              {credit.loading ? (
                <Skeleton className="h-10 w-48" label="Loading credit" />
              ) : credit.error ? (
                <ErrorState error={credit.error} onRetry={credit.reload} title="Could not read your credit" />
              ) : credit.data !== null ? (
                <p className="font-display text-4xl font-bold">
                  <Gen wei={credit.data} />
                </p>
              ) : null}
              <p className="text-sm text-muted">
                Available credit is what you can lock into a tender budget, lock as a bond, or withdraw.
              </p>
            </div>

            <div className="surface space-y-4 p-6">
              <h2 className="text-xl font-semibold">Deposit</h2>
              <TextField
                label="Amount in GEN"
                inputMode="decimal"
                placeholder="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                error={amountError}
                hint="Sent with the transaction as value. Your wallet also charges network fees."
              />
              <TxPanel
                action="Deposit credit"
                summary={[
                  { label: 'Method', value: <code>deposit_credit()</code> },
                  { label: 'GEN sent', value: wei ? formatGenSymbol(wei) : 'Enter an amount' },
                  { label: 'Result', value: 'The amount is added to your available credit.' },
                ]}
                blockedReason={wei && wei > 0n && !amountError ? null : 'Enter an amount first.'}
                run={(w, p) => w.depositCredit(wei ?? 0n, p)}
                onSuccess={() => {
                  setAmount('');
                  refresh();
                }}
              />
            </div>

            <div className="surface space-y-4 p-6 lg:col-span-2">
              <h2 className="text-xl font-semibold">Withdraw</h2>
              <p className="max-w-[70ch] text-sm leading-6 text-muted">
                Withdrawing pays all of your available credit to your address in a single transfer. The contract cannot confirm
                that the transfer was credited downstream, so check the finalized transaction, its child receipt and your balance.
                See the official <ExternalLink href={VALUE_TRANSFER_DOCS_URL}>GenLayer value-transfer documentation</ExternalLink>.
              </p>
              <TxPanel
                action="Withdraw all credit"
                variant="secondary"
                summary={[
                  { label: 'Method', value: <code>withdraw_credit()</code> },
                  { label: 'GEN paid out', value: credit.data !== null ? formatGenSymbol(credit.data) : 'Loading' },
                ]}
                blockedReason={credit.data === 0n ? 'You have no available credit.' : credit.data === null ? 'Loading your credit.' : null}
                run={(w, p) => w.withdrawCredit(p)}
                onSuccess={refresh}
              />
            </div>
          </div>
        )}
      </Section>

      <Section title="Contract accounting">
        {accounting.loading ? (
          <Skeleton className="h-40 w-full" label="Loading accounting" />
        ) : accounting.error ? (
          <ErrorState error={accounting.error} onRetry={accounting.reload} title="Could not read the contract totals" />
        ) : a ? (
          <div className="surface space-y-5 p-6">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={a.solvent ? 'success' : 'danger'}>{a.solvent ? 'Solvent' : 'Shortfall'}</Badge>
              <p className="text-sm text-muted">
                The invariant: every wei in credits, locked budgets and locked bonds must be covered by the contract balance.
              </p>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-4 border-b border-border pb-2">
                <dt className="text-muted">Total credits</dt>
                <dd>
                  <Gen wei={a.total_credits} />
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-border pb-2">
                <dt className="text-muted">Locked budgets</dt>
                <dd>
                  <Gen wei={a.total_locked_budgets} />
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-border pb-2">
                <dt className="text-muted">Locked bonds</dt>
                <dd>
                  <Gen wei={a.total_locked_bonds} />
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-border pb-2 font-medium">
                <dt>Credits + budgets + bonds</dt>
                <dd>
                  <Gen wei={a.accounted_liabilities} />
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-border pb-2 font-medium">
                <dt>Contract balance</dt>
                <dd>
                  <Gen wei={a.contract_balance} />
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-border pb-2">
                <dt className="text-muted">{a.balance_shortfall > 0n ? 'Shortfall' : 'Unallocated balance'}</dt>
                <dd>
                  <Gen wei={a.balance_shortfall > 0n ? a.balance_shortfall : a.unallocated_balance} />
                </dd>
              </div>
            </dl>
            {a.balance_shortfall > 0n && (
              <Notice kind="danger" title="The contract holds less than it owes">
                Do not deposit until this is explained.
              </Notice>
            )}
          </div>
        ) : null}
      </Section>
    </>
  );
}
