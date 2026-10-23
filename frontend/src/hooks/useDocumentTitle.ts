import { useEffect } from 'react';

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} | Sieve` : 'Sieve: sealed-bid reverse auctions on GenLayer';
  }, [title]);
}
