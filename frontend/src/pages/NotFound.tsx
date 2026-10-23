import { LinkButton } from '@/components/ui/Button';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function NotFound() {
  useDocumentTitle('Page not found');
  return (
    <div className="page py-24">
      <h1 className="text-5xl font-bold">There is no page here</h1>
      <p className="mt-4 max-w-prose text-lg text-muted">
        The address may be mistyped, or the link may be from an older version of Sieve.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <LinkButton to="/">Go to the home page</LinkButton>
        <LinkButton to="/explore" variant="secondary">
          Find a tender
        </LinkButton>
      </div>
    </div>
  );
}
