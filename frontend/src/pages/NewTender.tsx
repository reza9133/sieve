import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getAvailableCredit, getInfo } from '@/chain/sieveClient';
import type { TxOutcome } from '@/chain/sieveClient';
import { PageHeader, Section } from '@/components/layout/PageHeader';
import { FileHasher } from '@/components/tender/FileHasher';
import { Button, LinkButton } from '@/components/ui/Button';
import { TextArea, TextField } from '@/components/ui/Field';
import { Gen } from '@/components/ui/Gen';
import { Notice } from '@/components/ui/Notice';
import { TxPanel } from '@/components/wallet/TxPanel';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useLoad } from '@/hooks/useLoad';
import { useNow } from '@/hooks/useNow';
import {
  MAX_BIDS_LIMIT,
  MAX_COMMIT_HORIZON_SECONDS,
  MAX_REQUIREMENTS,
  MAX_REVEAL_WINDOW_SECONDS,
  MAX_SUMMARY,
  MAX_TITLE,
  MIN_BOND_WEI,
  MIN_BUDGET_WEI,
  MIN_WINDOW_SECONDS,
  TX_LATENCY_MARGIN_SECONDS,
} from '@/lib/constants';
import { formatDuration, formatUnix, nowSeconds } from '@/lib/time';
import { formatGenSymbol, parseGen } from '@/lib/units';
import { recordActivity } from '@/lib/storage';
import {
  cleanText,
  deadlinesFromDurations,
  normalizeHash,
  validateBond,
  validateBudget,
  validateDeadlines,
  validateHash,
  validateHttpsUrl,
  validateMaxBids,
  validateRequirementCount,
  validateSummary,
  validateTenderId,
  validateTitle,
} from '@/lib/validation';
import { useWallet } from '@/wallet/walletContext';

const STEPS = ['Details', 'Requirements', 'Economics', 'Timing', 'Review and sign'];

const PRESETS: Array<[string, number]> = [
  ['10 minutes', 600],
  ['30 minutes', 1800],
  ['1 hour', 3600],
  ['6 hours', 21600],
  ['1 day', 86400],
  ['3 days', 259200],
  ['7 days', 604800],
];
const CUSTOM = -1;

function DurationPicker({ label, seconds, onChange, min, max }: { label: string; seconds: number; onChange: (n: number) => void; min: number; max: number }) {
  const preset = PRESETS.some(([, s]) => s === seconds);
  const [custom, setCustom] = useState(!preset);
  const error = seconds < min ? `At least ${Math.ceil(min / 60)} minutes.` : seconds > max ? `At most ${Math.floor(max / 86400)} days.` : null;
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="field-label">{label}</span>
        <select
          className="input"
          value={custom ? CUSTOM : seconds}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v === CUSTOM) setCustom(true);
            else {
              setCustom(false);
              onChange(v);
            }
          }}
        >
          {PRESETS.map(([text, s]) => (
            <option key={s} value={s}>
              {text}
            </option>
          ))}
          <option value={CUSTOM}>Custom (minutes)</option>
        </select>
      </label>
      {custom && (
        <TextField
          label="Minutes"
          inputMode="numeric"
          value={String(Math.round(seconds / 60))}
          onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)) * 60)}
          error={error}
        />
      )}
      {!custom && error && <p className="field-error">{error}</p>}
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s} aria-current={i === step ? 'step' : undefined} className={`flex items-center gap-2 text-sm ${i === step ? 'font-medium text-text' : i < step ? 'text-text' : 'text-muted'}`}>
          <span
            aria-hidden
            className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs ${i === step ? 'border-accent bg-accent text-on-accent' : i < step ? 'border-accent text-accent' : 'border-border'}`}
          >
            {i < step ? '✓' : i + 1}
          </span>
          {s}
        </li>
      ))}
    </ol>
  );
}

export default function NewTender() {
  useDocumentTitle('Open a tender');
  const { account, chainReady, openModal } = useWallet();
  const info = useLoad(getInfo, []);
  const credit = useLoad(() => getAvailableCredit(account ?? ''), [account], { enabled: Boolean(account) });
  const now = useNow(15000);

  const [step, setStep] = useState(0);
  const [tenderId, setTenderId] = useState('');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [reqUrl, setReqUrl] = useState('');
  const [reqHash, setReqHash] = useState('');
  const [reqCount, setReqCount] = useState('3');
  const [budget, setBudget] = useState('');
  const [bond, setBond] = useState('');
  const [maxBids, setMaxBids] = useState('5');
  const [bidding, setBidding] = useState(3600);
  const [revealLen, setRevealLen] = useState(3600);
  const [opened, setOpened] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const minBudget = info.data?.min_budget_wei ?? MIN_BUDGET_WEI;
  const minBond = info.data?.min_bond_wei ?? MIN_BOND_WEI;
  const minWindow = Number(info.data?.min_window_seconds ?? MIN_WINDOW_SECONDS) + Number(TX_LATENCY_MARGIN_SECONDS);
  const maxReq = info.data?.max_requirements ?? MAX_REQUIREMENTS;
  const maxBidsLimit = info.data?.max_bids_limit ?? MAX_BIDS_LIMIT;

  const budgetWei = parseGen(budget);
  const bondWei = parseGen(bond);
  const reqCountN = Number(reqCount);
  const maxBidsN = Number(maxBids);

  const errors = useMemo(
    () => [
      {
        tenderId: validateTenderId(tenderId),
        title: validateTitle(title),
        summary: validateSummary(summary),
      },
      {
        reqUrl: validateHttpsUrl(reqUrl),
        reqHash: validateHash(reqHash),
        reqCount: validateRequirementCount(reqCountN) ?? (reqCountN > maxReq ? `Use 1 to ${maxReq}.` : null),
      },
      {
        budget: validateBudget(budgetWei, minBudget),
        bond: validateBond(bondWei, budgetWei, minBond),
        maxBids: validateMaxBids(maxBidsN) ?? (maxBidsN > maxBidsLimit ? `Use 1 to ${maxBidsLimit}.` : null),
      },
      {
        bidding: bidding < minWindow ? 'Too short.' : bidding > Number(MAX_COMMIT_HORIZON_SECONDS) ? 'Too long.' : null,
        reveal: revealLen < minWindow ? 'Too short.' : revealLen > Number(MAX_REVEAL_WINDOW_SECONDS) ? 'Too long.' : null,
      },
      {},
    ],
    [tenderId, title, summary, reqUrl, reqHash, reqCountN, budgetWei, bondWei, maxBidsN, bidding, revealLen, minBudget, minBond, minWindow, maxReq, maxBidsLimit],
  );
  const stepValid = (i: number) => Object.values(errors[i] ?? {}).every((e) => e === null);
  const show = (i: number, key: string): string | null => {
    const e = (errors[i] as Record<string, string | null>)[key] ?? null;
    return showErrors ? e : null;
  };

  const next = () => {
    if (!stepValid(step)) return setShowErrors(true);
    setShowErrors(false);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => {
    setShowErrors(false);
    setStep((s) => Math.max(0, s - 1));
  };

  const preview = deadlinesFromDurations(now, BigInt(bidding), BigInt(revealLen));
  const cleanTitle = cleanText(title);
  const cleanSummary = cleanText(summary);
  const hasCredit = credit.data !== null && budgetWei !== null && credit.data >= budgetWei;
  const blocked = !stepValid(0) || !stepValid(1) || !stepValid(2) || !stepValid(3) ? 'Fix the earlier steps first.' : credit.data !== null && !hasCredit ? 'Your available credit is below the budget. Deposit more on the Credit page.' : credit.loading ? 'Checking your credit.' : null;

  const submit = async (writer: NonNullable<ReturnType<typeof useWallet>['writer']>, onProgress: Parameters<typeof writer.openTender>[1]): Promise<TxOutcome> => {
    // Deadlines are fixed at the moment of signing, from a fresh clock.
    const t = nowSeconds();
    const d = deadlinesFromDurations(t, BigInt(bidding), BigInt(revealLen));
    const problem = validateDeadlines(t, d);
    if (problem || budgetWei === null || bondWei === null) {
      return { hash: '', ok: false, error: { kind: 'unknown', message: problem ?? 'Check the amounts.', details: '' } };
    }
    return writer.openTender(
      {
        tenderId: tenderId.trim(),
        title: cleanTitle,
        summary: cleanSummary,
        requirementsUrl: reqUrl.trim(),
        requirementsHash: normalizeHash(reqHash),
        requirementCount: reqCountN,
        budgetWei,
        bondWei,
        maxBids: maxBidsN,
        commitBy: d.commitBy,
        revealBy: d.revealBy,
      },
      onProgress,
    );
  };

  let body: ReactNode = null;
  if (step === 0) {
    body = (
      <div className="space-y-5">
        <TextField label="Tender id" mono value={tenderId} onChange={(e) => setTenderId(e.target.value)} error={show(0, 'tenderId')} hint="Unique among your tenders. Letters, digits, _ . - up to 64 characters." />
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={MAX_TITLE + 40} error={show(0, 'title')} hint={`${cleanTitle.length} of ${MAX_TITLE} characters.`} />
        <TextArea label="Summary" value={summary} onChange={(e) => setSummary(e.target.value)} error={show(0, 'summary')} hint={`${cleanSummary.length} of ${MAX_SUMMARY} characters. Validators see this summary as untrusted data.`} />
      </div>
    );
  } else if (step === 1) {
    body = (
      <div className="space-y-6">
        <Notice kind="info" title="Number your requirements R1 to R8 in the document">
          Validators classify each numbered requirement. The count you enter must match the document.
        </Notice>
        <TextField label="Requirements document URL" mono value={reqUrl} onChange={(e) => setReqUrl(e.target.value)} error={show(1, 'reqUrl')} hint="Public HTTPS, port 443, no login, no fragment, no IP address." placeholder="https://example.com/requirements.md" />
        <div>
          <TextField label="Requirements SHA-256" mono value={reqHash} onChange={(e) => setReqHash(e.target.value)} error={show(1, 'reqHash')} placeholder="0x…" />
          <div className="mt-4">
            <FileHasher onHash={setReqHash} label="Hash the file instead" />
          </div>
        </div>
        <TextField label={`Number of requirements (1 to ${maxReq})`} inputMode="numeric" value={reqCount} onChange={(e) => setReqCount(e.target.value)} error={show(1, 'reqCount')} />
      </div>
    );
  } else if (step === 2) {
    body = (
      <div className="space-y-6">
        <div className="surface p-4 text-sm">
          <p className="text-muted">Your available credit</p>
          {!account ? (
            <Button size="sm" className="mt-2" onClick={openModal}>
              Connect wallet
            </Button>
          ) : credit.data !== null ? (
            <p className="mt-1 text-lg font-semibold">
              <Gen wei={credit.data} />
            </p>
          ) : (
            <p className="mt-1">Loading…</p>
          )}
          <p className="mt-2 text-muted">The budget is escrowed from this credit when you open the tender. Unspent budget comes back to your credit at settlement.</p>
          <Link to="/wallet" className="mt-2 inline-block text-accent underline underline-offset-4">
            Top up on the Credit page
          </Link>
        </div>
        <TextField label="Budget in GEN" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} error={show(2, 'budget')} hint={`The most you will pay. Minimum ${formatGenSymbol(minBudget)}.`} />
        <TextField label="Bond in GEN" inputMode="decimal" value={bond} onChange={(e) => setBond(e.target.value)} error={show(2, 'bond')} hint={`Each bidder locks this. Minimum ${formatGenSymbol(minBond)}, and not above the budget.`} />
        <TextField label={`Bid slots (1 to ${maxBidsLimit})`} inputMode="numeric" value={maxBids} onChange={(e) => setMaxBids(e.target.value)} error={show(2, 'maxBids')} />
        {credit.data !== null && budgetWei !== null && !hasCredit && (
          <Notice kind="warning" title="Not enough credit">
            You need at least <Gen wei={budgetWei} /> of available credit.
          </Notice>
        )}
      </div>
    );
  } else if (step === 3) {
    const shortBidding = bidding < 600;
    const shortReveal = revealLen < 600;
    body = (
      <div className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <DurationPicker label="Bidding closes in" seconds={bidding} onChange={setBidding} min={minWindow} max={Number(MAX_COMMIT_HORIZON_SECONDS)} />
          <DurationPicker label="Reveal window lasts" seconds={revealLen} onChange={setRevealLen} min={minWindow} max={Number(MAX_REVEAL_WINDOW_SECONDS)} />
        </div>
        <Notice kind="info" title="Deadlines start when you sign">
          The network takes about 40 seconds to finalize a transaction, so your real bidding window is about that much shorter than the number you pick. The shortest allowed window is {Math.ceil(minWindow / 60)} minutes: the contract's 2 minutes plus a safety margin.
        </Notice>
        {(shortBidding || shortReveal) && (
          <Notice kind="warning" title="A short window is hard on bidders">
            Bidders need time to deposit credit and wait about 40 seconds per transaction. A bidder who misses the reveal window forfeits the bond.
          </Notice>
        )}
        <dl className="surface divide-y divide-border text-sm">
          {[
            ['Bidding closes (commit_by)', preview.commitBy],
            ['Reveal closes (reveal_by)', preview.revealBy],
            ['Screening ends (review_by)', preview.revealBy + 259200n],
          ].map(([label, at]) => (
            <div key={String(label)} className="grid gap-1 px-4 py-3 sm:grid-cols-[14rem_1fr]">
              <dt className="text-muted">{String(label)}</dt>
              <dd>
                {formatUnix(at as bigint).local} <span className="text-muted">/ {formatUnix(at as bigint).utc}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted">Approximate: based on your device clock, which may differ from chain time.</p>
      </div>
    );
  } else {
    body = opened ? (
      <div className="space-y-4">
        <Notice kind="success" title="Your tender is open">
          Share the link so bidders can find it.
        </Notice>
        <LinkButton to={`/tender/${account}/${encodeURIComponent(opened)}`}>View the tender</LinkButton>
      </div>
    ) : (
      <TxPanel
        action="Open tender"
        size="lg"
        blockedReason={blocked}
        warnings={[
          'The budget is escrowed from your credit as soon as the transaction finalizes. If nobody bids you can cancel; once any bid is sealed you cannot.',
          'Sieve does not verify delivery. The winner is credited their price at award.',
        ]}
        summary={[
          { label: 'Tender', value: `${tenderId.trim()}: ${cleanTitle}` },
          { label: 'Requirements', value: `${reqCountN} at ${reqUrl.trim()}` },
          { label: 'Requirements hash', value: <span className="mono break-all">{normalizeHash(reqHash)}</span> },
          { label: 'Budget escrowed', value: budgetWei !== null ? formatGenSymbol(budgetWei) : '' },
          { label: 'Bond per bidder', value: bondWei !== null ? formatGenSymbol(bondWei) : '' },
          { label: 'Bid slots', value: String(maxBidsN) },
          { label: 'Bidding window', value: `closes in about ${formatDuration(BigInt(bidding))}` },
          { label: 'Reveal window', value: `lasts ${formatDuration(BigInt(revealLen))}, then 3 days of screening` },
        ]}
        run={submit}
        onSuccess={() => {
          if (account) recordActivity(account, tenderId.trim(), 'opened', cleanTitle);
          setOpened(tenderId.trim());
        }}
      />
    );
  }

  return (
    <>
      <PageHeader title="Open a tender" lead="Escrow a budget, commit to a requirements document by its hash, and let bidders compete on price. Five short steps." />
      <Section>
        {!account && (
          <div className="mb-6">
            <Notice kind="info" title="You can fill this in without a wallet">
              You will need one to sign on the last step. <button type="button" onClick={openModal} className="text-accent underline underline-offset-4">Connect wallet</button>
            </Notice>
          </div>
        )}
        {account && !chainReady && (
          <div className="mb-6">
            <Notice kind="warning">Switch your wallet to Studionet before signing.</Notice>
          </div>
        )}
        <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
          <Stepper step={step} />
          <div className="surface max-w-3xl space-y-6 p-6">
            <h2 className="text-2xl font-semibold">{STEPS[step]}</h2>
            {body}
            {!opened && (
              <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-5">
                <Button variant="ghost" onClick={back} disabled={step === 0}>
                  Back
                </Button>
                {step < STEPS.length - 1 && <Button onClick={next}>Continue</Button>}
              </div>
            )}
          </div>
        </div>
      </Section>
    </>
  );
}
