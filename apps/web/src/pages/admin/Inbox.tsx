import { useState } from 'react';
import { MessageSquareText, Warehouse } from 'lucide-react';
import { api } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { Badge, Button, EmptyState, ErrorState, Skeleton } from '../../components/ui';
import { AdminHeader } from './AdminLayout';
import { useAdmin, useAdminMutation, type Question, type Wholesale as WholesaleRow } from './adminApi';

export function WholesaleRequests() {
  const q = useAdmin<WholesaleRow[]>('/wholesale');
  return (
    <>
      <AdminHeader title="Bulk & wholesale quotes">Requests from the Bulk & Wholesale page, newest first.</AdminHeader>
      {q.isPending ? <Skeleton className="h-64" /> : q.isError ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : q.data.length === 0 ? <EmptyState icon={Warehouse} title="No quote requests yet" /> : (
          <ul className="space-y-3">
            {q.data.map(w => (
              <li key={w.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><p className="font-bold">{w.name}{w.business ? ` · ${w.business}` : ''}</p><p className="text-sm text-ink-2"><a className="underline" href={`mailto:${w.email}`}>{w.email}</a> · <a className="underline" href={`tel:${w.phone.replace(/[\s-]/g, '')}`}>{w.phone}</a></p></div>
                  <span className="text-sm text-ink-3">{dateTime(w.createdAt)}</span>
                </div>
                <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                  <div><dt className="font-semibold text-ink-3">Products</dt><dd>{w.products}</dd></div>
                  <div><dt className="font-semibold text-ink-3">Quantity</dt><dd>{w.quantity}</dd></div>
                  <div><dt className="font-semibold text-ink-3">Preferred date</dt><dd>{w.preferredDate || '—'}</dd></div>
                </dl>
                {w.notes && <p className="mt-2 text-sm text-ink-2">“{w.notes}”</p>}
              </li>
            ))}
          </ul>
        )}
    </>
  );
}

export function Questions() {
  const q = useAdmin<Question[]>('/questions');
  return (
    <>
      <AdminHeader title="Questions & answers">Answers appear on the product page straight away and help Vallerie answer similar questions.</AdminHeader>
      {q.isPending ? <Skeleton className="h-64" /> : q.isError ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : q.data.length === 0 ? <EmptyState icon={MessageSquareText} title="No questions yet">Customers ask questions on product pages.</EmptyState>
        : <ul className="space-y-3">{q.data.map(item => <QuestionCard key={item.id} item={item} />)}</ul>}
    </>
  );
}

function QuestionCard({ item }: { item: Question }) {
  const [text, setText] = useState('');
  const answer = useAdminMutation(() => api(`/admin/questions/${item.id}/answer`, { method: 'POST', body: { text: text.trim() } }));
  const id = `ans-${item.id}`;
  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-semibold text-ink-3">{item.product.name} · {item.customer?.user.name ?? 'Customer'} · {dateTime(item.createdAt)}</p>
        <Badge tone={item.answers.length ? 'ok' : 'warn'}>{item.answers.length ? 'Answered' : 'Needs answer'}</Badge>
      </div>
      <p className="mt-1 font-bold">Q: {item.text}</p>
      {item.answers.map(a => <p key={a.id} className="mt-1 text-ink-2"><span className="font-semibold text-brand-text">A:</span> {a.text}</p>)}
      <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={e => { e.preventDefault(); if (text.trim()) answer.mutate(undefined, { onSuccess: () => setText('') }); }}>
        <label htmlFor={id} className="sr-only">Answer</label>
        <input id={id} className="field flex-1" maxLength={500} placeholder={item.answers.length ? 'Add another answer' : 'Write an answer'} value={text} onChange={e => setText(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={!text.trim()} busy={answer.isPending}>Post answer</Button>
      </form>
      {answer.isError && <p className="mt-2 text-sm text-danger-text" role="alert">{answer.error.message}</p>}
    </li>
  );
}
