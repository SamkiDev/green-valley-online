import { RotateCcw } from 'lucide-react';
import { useReorder } from '../lib/reorder';
import { Button } from './ui';

export function ReorderButton({ orderId, size = 'sm' }: { orderId: string; size?: 'sm' | 'md' }) {
  const reorder = useReorder();
  const none = reorder.isSuccess && reorder.data.items.every(i => !i.available);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button size={size} onClick={() => reorder.mutate(orderId)} busy={reorder.isPending}><RotateCcw className="size-4" aria-hidden /> ORDER AGAIN</Button>
      {reorder.isError && <p className="text-sm text-danger-text" role="alert">{reorder.error.message}</p>}
      {none && <p className="max-w-xs text-right text-sm text-warn-text" role="status">None of these items can be ordered right now: {reorder.data.items.map(i => `${i.name} (${i.reason})`).join(', ')}.</p>}
    </div>
  );
}
