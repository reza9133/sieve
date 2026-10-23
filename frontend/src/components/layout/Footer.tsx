import { Link } from 'react-router-dom';
import { explorerAddressUrl, SIEVE_ADDRESS } from '@/chain/config';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { GENLAYER_DOCS_URL, GITHUB_URL, X_URL } from '@/lib/constants';
import { GenLayerLogo, SieveWordmark } from './Logos';

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border">
      <div className="perforated" aria-hidden />
      <div className="page grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-4">
          <SieveWordmark />
          <p className="max-w-sm text-sm text-muted">
            Sieve is a primitive, not a legal service. It records which sealed bids a bounded validator assessment found compliant. It does not verify
            delivery, identity or truth.
          </p>
          <div className="flex items-center gap-3 text-sm text-muted">
            <span>Built on</span>
            <GenLayerLogo />
          </div>
        </div>
        <nav aria-label="Project links" className="space-y-2 text-sm">
          <p className="font-medium">Project</p>
          <ul className="space-y-2">
            <li>
              <ExternalLink href={GITHUB_URL}>GitHub</ExternalLink>
            </li>
            <li>
              <ExternalLink href={X_URL}>X (Twitter)</ExternalLink>
            </li>
            <li>
              <ExternalLink href={explorerAddressUrl(SIEVE_ADDRESS)}>Contract on the explorer</ExternalLink>
            </li>
            <li>
              <ExternalLink href={GENLAYER_DOCS_URL}>GenLayer docs</ExternalLink>
            </li>
          </ul>
        </nav>
        <nav aria-label="Footer" className="space-y-2 text-sm">
          <p className="font-medium">Read first</p>
          <ul className="space-y-2">
            <li>
              <Link className="text-accent underline decoration-accent/40 underline-offset-4" to="/security">
                Security and limits
              </Link>
            </li>
            <li>
              <Link className="text-accent underline decoration-accent/40 underline-offset-4" to="/how-it-works">
                How it works
              </Link>
            </li>
            <li>
              <Link className="text-accent underline decoration-accent/40 underline-offset-4" to="/contract">
                Contract details
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
