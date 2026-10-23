import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, Section } from '@/components/layout/PageHeader';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { Notice } from '@/components/ui/Notice';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { VALUE_TRANSFER_DOCS_URL } from '@/lib/constants';

const LIMITS: Array<{ title: string; body: ReactNode }> = [
  {
    title: 'A hash proves identical bytes, not truth',
    body: 'SHA-256 shows that the document validators read is the document that was committed. It does not show the document is true, or who wrote it. URL admission cannot pin DNS or prohibit every redirect.',
  },
  {
    title: 'Judging a proposal is probabilistic, and the first decisive verdict is final',
    body: 'Validators use a language model to read two documents. A wrong decisive verdict stands for that bid and cannot be re-rolled. Bidders should write unambiguous proposals. Funders should write unambiguous requirements.',
  },
  {
    title: 'Sealed bids hide the price until reveal',
    body: 'The commitment binds the funder, the tender, the bidder, the price, the proposal URL, the proposal hash and a salt of at least 16 characters. It cannot be copied, replayed or shifted across fields. A bidder who never reveals forfeits their bond to the funder.',
  },
  {
    title: 'A funder can crowd out honest bidders',
    body: 'The funder collects forfeited bonds, so a funder can fill bid slots with their own throwaway accounts for the price of time. Slots are capped at 16 and a funder cannot bid on their own tender, but a determined funder can still crowd others out. Choose tenders by the funder’s reputation.',
  },
  {
    title: 'A bidder can hold slots for free',
    body: 'Withdrawing before bidding closes frees the bond but not the slot, so holding a slot costs only gas. A proposal that stays unreachable is excluded, not forfeited, so a throwaway bidder can occupy a slot until the review deadline.',
  },
  {
    title: 'A funder with an unreachable document can delay, not punish',
    body: 'If the funder’s own requirements document is unreachable, screening fails in a way that never counts against a bidder. The funder can delay finalization until the review deadline (3 days after the reveal deadline), never longer.',
  },
  {
    title: 'Withdrawals are one transfer you should verify',
    body: (
      <>
        <code>withdraw_credit</code> emits one value transfer. The contract cannot confirm that the recipient was credited
        downstream. Compare the finalized parent transaction with the child receipt and the recipient balance. See the
        official <ExternalLink href={VALUE_TRANSFER_DOCS_URL}>GenLayer value-transfer documentation</ExternalLink>.
      </>
    ),
  },
  {
    title: 'Sieve pays at award and does not verify delivery',
    body: 'The winner is credited their sealed price when the tender is finalized. Anyone who needs delivery assurance has to layer it on top.',
  },
  {
    title: 'The contract certifies nothing about legal validity, identity or ability to perform',
    body: 'It records which sealed bids a bounded validator assessment found compliant with a committed document. It is a reusable primitive, not a procurement system and not a legal service.',
  },
];

export default function Security() {
  useDocumentTitle('Security and limits');
  return (
    <>
      <PageHeader
        title="Security and known limits"
        lead="What Sieve guarantees, what it does not, and where it can be gamed. This list follows the project README and is not softened."
      />
      <Section>
        <Notice kind="warning" title="Studionet is a test network">
          Contract v0.1.0 is deployed on GenLayer Studionet. Test GEN has no value. Treat everything here as an
          experiment.
        </Notice>
      </Section>
      <Section title="Limits">
        <ul className="space-y-4">
          {LIMITS.map((l) => (
            <li key={l.title} className="surface p-5">
              <h3 className="text-lg font-semibold">{l.title}</h3>
              <p className="mt-2 max-w-[70ch] leading-7 text-muted">{l.body}</p>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="How this site protects your sealed price">
        <ul className="max-w-[70ch] list-disc space-y-2 pl-5 leading-7">
          <li>
            The commitment is computed in your browser. The price, URL, hash and salt are never sent anywhere before the
            reveal.
          </li>
          <li>
            If you lose the salt or any reveal input you cannot reveal, and you forfeit your bond. Sieve saves a copy in
            this browser and makes you confirm a downloaded backup before it lets you commit. Restore one in{' '}
            <Link className="text-accent underline underline-offset-4" to="/tools">
              Tools
            </Link>
            .
          </li>
          <li>
            Every string read from the chain (titles, summaries, URLs, rationale) is untrusted. Sieve renders it as plain
            text and never opens a link unless you ask.
          </li>
        </ul>
      </Section>
    </>
  );
}
