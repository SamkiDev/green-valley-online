import { useState } from 'react';
import { MessageSquareText, Star, Warehouse } from 'lucide-react';
import { Stars } from '../../components/Reviews';
import { api } from '../../lib/api';
import { useMe } from '../../lib/auth';
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
  const { data: me } = useMe();
  const waiting = q.data?.reduce((n, x) => n + x.answers.filter(a => !a.approved).length, 0) ?? 0;
  return (
    <>
      <AdminHeader title="Questions & answers">
        {me?.role === 'ADMIN' ? 'Your answers appear on the product page straight away. Staff answers wait for your approval.' : 'Your answers appear on the product page once an admin approves them.'} Approved answers also help Vallerie.
      </AdminHeader>
      {waiting > 0 && me?.role === 'ADMIN' && <p className="mb-3 rounded-xl bg-warn-bg p-3 text-sm font-semibold text-warn-text" role="status">{waiting} staff answer{waiting === 1 ? '' : 's'} waiting for approval.</p>}
      {q.isPending ? <Skeleton className="h-64" /> : q.isError ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : q.data.length === 0 ? <EmptyState icon={MessageSquareText} title="No questions yet">Customers ask questions on product pages.</EmptyState>
        : <ul className="space-y-3">{q.data.map(item => <QuestionCard key={item.id} item={item} isAdmin={me?.role === 'ADMIN'} />)}</ul>}
    </>
  );
}

function QuestionCard({ item, isAdmin }: { item: Question; isAdmin: boolean }) {
  const [text, setText] = useState('');
  const answer = useAdminMutation(() => api(`/admin/questions/${item.id}/answer`, { method: 'POST', body: { text: text.trim() } }));
  const approve = useAdminMutation((id: string) => api(`/admin/answers/${id}`, { method: 'PATCH', body: { approved: true } }));
  const removeAnswer = useAdminMutation((id: string) => api(`/admin/answers/${id}`, { method: 'DELETE' }));
  const removeQuestion = useAdminMutation(() => api(`/admin/questions/${item.id}`, { method: 'DELETE' }));
  const live = item.answers.filter(a => a.approved).length;
  const err = [approve, removeAnswer, removeQuestion].find(m => m.isError)?.error;
  const id = `ans-${item.id}`;
  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-semibold text-ink-3">{item.product.name} · {item.customer?.user.name ?? 'Customer'} · {dateTime(item.createdAt)}</p>
        <span className="flex items-center gap-2">
          <Badge tone={live ? 'ok' : 'warn'}>{live ? 'Answered' : item.answers.length ? 'Awaiting approval' : 'Needs answer'}</Badge>
          {isAdmin && <Button size="sm" variant="ghost" className="text-danger-text" busy={removeQuestion.isPending} onClick={() => window.confirm('Remove this question and its answers?') && removeQuestion.mutate(undefined)}>Remove</Button>}
        </span>
      </div>
      <p className="mt-1 font-bold">Q: {item.text}</p>
      {item.answers.map(a => (
        <div key={a.id} className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-ink-2"><span className="font-semibold text-brand-text">A:</span> {a.text} {!a.approved && <Badge tone="warn" className="ml-1">Not shown yet</Badge>}</p>
          {isAdmin && (
            <span className="flex gap-1">
              {!a.approved && <Button size="sm" variant="secondary" busy={approve.isPending && approve.variables === a.id} onClick={() => approve.mutate(a.id)}>Approve</Button>}
              <Button size="sm" variant="ghost" className="text-danger-text" busy={removeAnswer.isPending && removeAnswer.variables === a.id} onClick={() => window.confirm('Remove this answer?') && removeAnswer.mutate(a.id)}>Remove answer</Button>
            </span>
          )}
        </div>
      ))}
      <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={e => { e.preventDefault(); if (text.trim()) answer.mutate(undefined, { onSuccess: () => setText('') }); }}>
        <label htmlFor={id} className="sr-only">Answer</label>
        <input id={id} className="field flex-1" maxLength={500} placeholder={item.answers.length ? 'Add another answer' : 'Write an answer'} value={text} onChange={e => setText(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={!text.trim()} busy={answer.isPending}>Post answer</Button>
      </form>
      {answer.isError && <p className="mt-2 text-sm text-danger-text" role="alert">{answer.error.message}</p>}
      {err && <p className="mt-2 text-sm text-danger-text" role="alert">{err.message}</p>}
    </li>
  );
}

type AdminReview = { id: string; rating: number; comment: string; createdAt: string; product: { name: string } | null; store: { name: string }; customer: { user: { name: string } } };

export function ReviewsModeration() {
  const q = useAdmin<AdminReview[]>('/reviews');
  const remove = useAdminMutation((id: string) => api(`/admin/reviews/${id}`, { method: 'DELETE' }));
  return (
    <>
      <AdminHeader title="Reviews">Only customers with a delivered or collected order can review. Remove reviews that break your rules.</AdminHeader>
      {remove.isError && <p className="mb-3 rounded-xl bg-danger-bg p-3 text-sm font-semibold text-danger-text" role="alert">{remove.error.message}</p>}
      {q.isPending ? <Skeleton className="h-64" /> : q.isError ? <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        : q.data.length === 0 ? <EmptyState icon={Star} title="No reviews yet" /> : (
          <ul className="space-y-3">
            {q.data.map(r => (
              <li key={r.id} className="card flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-3">{r.product ? r.product.name : `${r.store.name} (store)`} · {r.customer.user.name} · {dateTime(r.createdAt)}</p>
                  <p className="mt-1"><Stars value={r.rating} /></p>
                  <p className="mt-1 text-ink-2">{r.comment}</p>
                </div>
                <Button size="sm" variant="ghost" className="text-danger-text" busy={remove.isPending && remove.variables === r.id}
                  onClick={() => window.confirm('Remove this review? This cannot be undone.') && remove.mutate(r.id)}>Remove</Button>
              </li>
            ))}
          </ul>
        )}
    </>
  );
}
