import { useEffect, useRef, useState } from 'react';
import { PageHeader, Section } from '@/components/layout/PageHeader';
import { Hero3D } from '@/components/three/Hero3D';
import type { SceneStage } from '@/scenes/SieveScene';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

interface Step {
  id: string;
  stage: SceneStage;
  title: string;
  body: string[];
}

const STEPS: Step[] = [
  {
    id: 'open',
    stage: 'idle',
    title: 'Open a tender',
    body: [
      'The funder deposits credit, then opens a tender. The budget is escrowed from that credit, not sent with the transaction.',
      'The tender commits to the requirements document by its URL and SHA-256, and fixes the bond, the number of bid slots (up to 16), and two deadlines. A tender with no bids can be cancelled by its funder. Once any bid is sealed, even one later withdrawn, it cannot.',
    ],
  },
  {
    id: 'bidding',
    stage: 'sealed',
    title: 'Bidding: seal a bid',
    body: [
      'A bidder with enough credit posts the bond and commits a sealed bid. The commitment is a SHA-256 over the funder, tender, bidder, price, proposal URL, proposal hash and a secret salt. It is computed in the bidder’s browser.',
      'Until the commit deadline a bidder can withdraw and get the bond back. The slot stays used. The funder cannot bid on their own tender, and each bidder gets one bid.',
    ],
  },
  {
    id: 'reveal',
    stage: 'reveal',
    title: 'Reveal',
    body: [
      'Once bidding closes, each bidder reveals the price, proposal URL, proposal hash and salt. The contract recomputes the commitment and rejects anything that does not match.',
      'A bidder who misses the reveal window forfeits the bond to the funder. This is why Sieve makes you back up your reveal data before you commit.',
    ],
  },
  {
    id: 'screening',
    stage: 'filter',
    title: 'Screening',
    body: [
      'For three days after the reveal deadline, the funder or the bid’s own bidder can ask validators to screen a revealed bid. Nobody else can, so a rival cannot burn another bid’s screening budget.',
      'Validators fetch the committed requirements and the committed proposal and classify each requirement. Compliant bids pass the sieve. Noncompliant bids do not.',
    ],
  },
  {
    id: 'finalize',
    stage: 'ranking',
    title: 'Finalize',
    body: [
      'Anyone can finalize once every revealed bid has been screened or the review deadline has passed. Deterministic code picks the lowest compliant price. The earliest commitment wins a tie.',
      'Model prose never decides who wins. Only the per-requirement findings and the contract’s fixed rules do.',
    ],
  },
  {
    id: 'withdraw',
    stage: 'payout',
    title: 'Withdraw',
    body: [
      'Finalizing credits an internal ledger and emits no transfers. Each party then withdraws only their own credit, in one transfer.',
      'Sieve pays the winner their price at award. It does not verify delivery.',
    ],
  },
];

const FLOW: Array<[string, string]> = [
  ['A winner is determined', 'The winner is credited their sealed price. The funder is credited the budget minus that price.'],
  ['No compliant bid', 'The funder is credited the whole budget.'],
  ['Bid revealed, then screened or left unscreened', 'The bond is refunded to the bidder.'],
  ['Bid never revealed', 'The bond is forfeited to the funder.'],
  ['Proposal whose committed bytes cannot be reproduced', 'The bond is forfeited to the funder.'],
  ['Withdrawn before the commit deadline', 'The bond is refunded to the bidder.'],
];

const RULES = [
  'Documents are fetched over HTTPS by exact byte hash, with a 30,000 byte limit and strict UTF-8.',
  'For each of the 1 to 8 numbered requirements the model answers met, not_met or unclear. It also flags any attempt by the proposal to instruct the reviewer, and gives an overall confidence.',
  'Below confidence 80 nothing is decisive. A bid is compliant only if every requirement is met, there is no instruction attempt, and confidence is at least 80. It is noncompliant if any requirement is not_met or the proposal tries to instruct the reviewer.',
  'Validators agree on a noncompliant result only if they report the same set of failed requirements and the same instruction-attempt flag. Prose and exact confidence are ignored.',
  'The first decisive consensus verdict for a bid is final. Re-rolling cannot flip it.',
  'A problem with the funder’s document (unreachable, wrong hash, wrong encoding) is only ever a retryable failure and never penalizes a bidder. A bidder’s own committed bytes that do not match, are empty, are oversized or are not UTF-8 disqualify the bid and forfeit the bond. Any trouble reaching the proposal is retryable.',
  'Each bid gets at most 8 screening calls and 3 semantic assessments. The cooldown between attempts doubles from 60 seconds up to one hour. A bid that runs out of budget, or is still unscreened at the review deadline, is excluded and its bond refunded.',
];

function useWide(): boolean {
  const query = '(min-width: 1024px)';
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

function Timeline() {
  const seg = 'flex flex-col justify-between gap-2 rounded-lg border border-border p-3';
  return (
    <figure className="surface p-5">
      <div className="grid gap-2 md:grid-cols-[2fr_1.5fr_2.2fr_1.6fr]">
        <div className={`${seg} bg-accent/10`}>
          <p className="font-medium">Bidding</p>
          <p className="text-sm text-muted">Commit and withdraw while now &lt; commit_by</p>
        </div>
        <div className={`${seg} bg-accent-2/10`}>
          <p className="font-medium">Reveal</p>
          <p className="text-sm text-muted">commit_by &le; now &lt; reveal_by</p>
        </div>
        <div className={`${seg} bg-warning/10`}>
          <p className="font-medium">Screening, 3 days</p>
          <p className="text-sm text-muted">reveal_by &le; now &lt; review_by</p>
        </div>
        <div className={`${seg} bg-success/10`}>
          <p className="font-medium">Finalize</p>
          <p className="text-sm text-muted">After reveal_by, when no bid awaits screening, or after review_by</p>
        </div>
      </div>
      <figcaption className="mt-3 text-sm text-muted">
        Boundaries are exact. The minimum length of each window is 2 minutes, and review_by is always reveal_by plus 3 days.
      </figcaption>
    </figure>
  );
}

export default function HowItWorks() {
  useDocumentTitle('How it works');
  const wide = useWide();
  const [stage, setStage] = useState<SceneStage>('idle');
  const refs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const found = STEPS.find((s) => s.id === (e.target as HTMLElement).dataset.step);
            if (found) setStage(found.stage);
          }
        }
      },
      { rootMargin: '-40% 0px -50% 0px' },
    );
    refs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const canvas = (
    <div className="h-48 w-full sm:h-64 lg:h-[62vh]">
      <Hero3D stage={stage} className="h-full w-full" />
    </div>
  );

  return (
    <>
      <PageHeader title="How it works" lead="From an escrowed budget to a lowest compliant price, in six steps. The picture follows along as you scroll." />
      <div className="page">
        {!wide && <div className="sticky top-16 z-10 -mx-4 border-b border-border bg-bg/80 px-4 backdrop-blur">{canvas}</div>}
        <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
          <ol className="space-y-8 py-6 lg:space-y-[18vh] lg:py-16">
            {STEPS.map((s, i) => (
              <li
                key={s.id}
                data-step={s.id}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                className="scroll-mt-40"
              >
                <p className="text-sm text-muted">Step {i + 1} of {STEPS.length}</p>
                <h2 className="mt-1 text-3xl font-bold">{s.title}</h2>
                <div className="prose-sieve mt-4">
                  {s.body.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                </div>
              </li>
            ))}
          </ol>
          {wide && <div className="relative"><div className="sticky top-24 pt-6">{canvas}</div></div>}
        </div>
      </div>

      <Section title="The time windows">
        <Timeline />
      </Section>

      <Section title="Where the money goes">
        <div className="surface overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <caption className="sr-only">Settlement effects</caption>
            <thead>
              <tr className="border-b border-border text-muted">
                <th scope="col" className="p-4 font-normal">
                  Event
                </th>
                <th scope="col" className="p-4 font-normal">
                  Effect
                </th>
              </tr>
            </thead>
            <tbody>
              {FLOW.map(([event, effect]) => (
                <tr key={event} className="border-b border-border last:border-0">
                  <th scope="row" className="p-4 font-medium">
                    {event}
                  </th>
                  <td className="p-4">{effect}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 max-w-[70ch] text-sm leading-6 text-muted">
          The liability invariant: total credits + locked budgets + locked bonds equals every wei ever deposited and not yet withdrawn. The Credit page shows it live.
        </p>
      </Section>

      <Section title="The screening rules">
        <ul className="max-w-[72ch] list-disc space-y-3 pl-5 leading-7">
          {RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </Section>
    </>
  );
}
