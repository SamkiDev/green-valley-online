// Product or store reviews: average, count, comments, and a form for customers whose order was completed.
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { api } from '../lib/api';
import { Button, EmptyState, ErrorState, Skeleton } from './ui';

type ReviewData = {
  average: number | null; count: number; canReview: boolean; reviewed: boolean; reason: string | null;
  reviews: { id: string; rating: number; comment: string; createdAt: string; name: string }[];
};

export function Stars({ value, size = 'size-4' }: { value: number; size?: string }) {
  return (
    <span className="inline-flex text-amber-500 dark:text-amber-300" aria-label={`${value} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map(i => <Star key={i} className={size} fill={i <= Math.round(value) ? 'currentColor' : 'none'} aria-hidden />)}
    </span>
  );
}

export function Reviews({ productId, storeSlug, title = 'Reviews' }: { productId?: string; storeSlug?: string; title?: string }) {
  const qs = productId ? `productId=${productId}` : `storeSlug=${storeSlug}`;
  const q = useQuery({ queryKey: ['reviews', qs], queryFn: () => api<ReviewData>(`/reviews?${qs}`) });
  const id = `reviews-${productId ?? storeSlug}`;
  return (
    <section aria-labelledby={id}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 id={id} className="text-xl font-extrabold">{title}</h2>
        {q.data?.average != null && <span className="flex items-center gap-2 text-sm font-semibold"><Stars value={q.data.average} /> {q.data.average.toFixed(1)} · {q.data.count} {q.data.count === 1 ? 'review' : 'reviews'}</span>}
      </div>
      {q.isPending ? <Skeleton className="h-24" /> : q.isError ? <ErrorState compact message={q.error.message} onRetry={() => q.refetch()} /> : (
        <>
          {q.data.reviews.length === 0
            ? <EmptyState icon={Star} title="No reviews yet">Customers who have received an order can leave a review.</EmptyState>
            : (
              <ul className="space-y-3">
                {q.data.reviews.map(r => (
                  <li key={r.id} className="card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2"><Stars value={r.rating} /><span className="text-sm text-ink-3">{r.name} · {new Date(r.createdAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
                    <p className="mt-2 text-ink-2">{r.comment}</p>
                  </li>
                ))}
              </ul>
            )}
          {q.data.canReview ? <ReviewForm productId={productId} storeSlug={storeSlug} qs={qs} />
            : q.data.reason === 'Sign in to review' ? <p className="mt-3 text-sm text-ink-2"><Link to="/account" className="font-semibold text-brand-text underline">Sign in</Link> to leave a review after your order arrives.</p>
            : q.data.reason ? <p className="mt-3 text-sm text-ink-3">{q.data.reason}.</p> : null}
        </>
      )}
    </section>
  );
}

function ReviewForm({ productId, storeSlug, qs }: { productId?: string; storeSlug?: string; qs: string }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [touched, setTouched] = useState(false);
  const post = useMutation({
    mutationFn: () => api('/reviews', { method: 'POST', body: { ...(productId ? { productId } : { storeSlug }), rating, comment: comment.trim() } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reviews', qs] }),
  });
  const ratingErr = touched && !rating ? 'Choose a star rating' : undefined;
  const commentErr = touched && comment.trim().length < 3 ? 'Write at least a few words' : undefined;
  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (rating && comment.trim().length >= 3) post.mutate(); };
  const fid = `rf-${productId ?? storeSlug}`;
  return (
    <form onSubmit={submit} noValidate className="card mt-4 space-y-3 p-4" aria-label="Write a review">
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Your rating</legend>
        <div className="flex gap-1" role="radiogroup">
          {[1, 2, 3, 4, 5].map(i => (
            <label key={i} className="cursor-pointer">
              <input type="radio" name={`${fid}-rating`} value={i} checked={rating === i} onChange={() => setRating(i)} className="peer sr-only" />
              <Star className={`size-8 rounded peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--focus)] ${i <= rating ? 'text-amber-500 dark:text-amber-300' : 'text-ink-3'}`} fill={i <= rating ? 'currentColor' : 'none'} aria-hidden />
              <span className="sr-only">{i} star{i > 1 ? 's' : ''}</span>
            </label>
          ))}
        </div>
        {ratingErr && <p className="mt-1 text-sm text-danger-text">{ratingErr}</p>}
      </fieldset>
      <div>
        <label htmlFor={`${fid}-comment`} className="mb-1 block text-sm font-semibold">Your review</label>
        <textarea id={`${fid}-comment`} className="field min-h-24" maxLength={500} value={comment} onChange={e => setComment(e.target.value)} aria-invalid={!!commentErr} />
        {commentErr && <p className="mt-1 text-sm text-danger-text">{commentErr}</p>}
      </div>
      {post.isError && <p className="text-sm font-semibold text-danger-text" role="alert">{post.error.message}</p>}
      <Button type="submit" busy={post.isPending}>Post review</Button>
    </form>
  );
}
