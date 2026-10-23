import { Badge, type Tone } from '@/components/ui/Badge';
import { BID_OUTCOME_LABEL, BID_STATUS_LABEL, TENDER_STATUS_LABEL, type Bid, type Tender } from '@/chain/types';

const tenderTone: Record<Tender['status'], Tone> = { open: 'accent', finalized: 'success', cancelled: 'neutral' };
const bidTone: Record<Bid['status'], Tone> = {
  committed: 'neutral',
  revealed: 'accent',
  compliant: 'success',
  noncompliant: 'danger',
  disqualified: 'danger',
  withdrawn: 'neutral',
};

export const TenderStatusBadge = ({ status }: { status: Tender['status'] }) => <Badge tone={tenderTone[status]}>{TENDER_STATUS_LABEL[status]}</Badge>;
export const BidStatusBadge = ({ status }: { status: Bid['status'] }) => <Badge tone={bidTone[status]}>{BID_STATUS_LABEL[status]}</Badge>;
export const outcomeLabel = (o: Bid['outcome']) => (o ? BID_OUTCOME_LABEL[o] : '');
