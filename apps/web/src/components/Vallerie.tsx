// Vallerie, the shopping assistant. She only recommends and explains: every action (add to cart, checkout)
// is a normal button the customer presses. Product cards come from the API's database lookup, not the model.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { ArrowUp, Check, Plus, Sparkles, X } from 'lucide-react';
import { api, stockState, type ChatMsg, type ChatProduct, type ChatResponse } from '../lib/api';
import { useCart } from '../lib/cart';
import { rand, unitLabel } from '../lib/format';

type Entry = { role: 'user' | 'assistant'; content: string; products?: ChatProduct[]; failed?: boolean };
const KEY = 'gv-vallerie-v1';
const UNAVAILABLE = 'Vallerie is temporarily unavailable. You can continue shopping normally.';
const PROMPTS = ['What can I buy for a braai?', 'Show me chicken products', 'What is available for under R300?', 'How does delivery work?', 'Where is my order?'];

function loadChat(): Entry[] { try { return JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch { return []; } }

export function Vallerie() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>(loadChat);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const loc = useLocation();
  const cart = useCart();
  const lastFailed = entries.at(-1)?.failed;

  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(entries.slice(-30))); } catch { /* ignore */ } }, [entries]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [entries, open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const chat = useMutation({
    mutationFn: (message: string) => {
      const history: ChatMsg[] = entries.filter(e => !e.failed).slice(-6).map(e => ({ role: e.role, content: e.content }));
      return api<ChatResponse>('/ai/chat', { method: 'POST', body: { message, history } });
    },
    onSuccess: r => setEntries(es => [...es, { role: 'assistant', content: r.reply, products: r.products }]),
    onError: (e: Error) => setEntries(es => [...es, { role: 'assistant', content: e.message === UNAVAILABLE || !e.message ? UNAVAILABLE : `${UNAVAILABLE} (${e.message})`, failed: true }]),
  });

  const send = (message: string) => {
    const m = message.trim(); if (!m || chat.isPending) return;
    setEntries(es => [...es, { role: 'user', content: m }]); setText(''); chat.mutate(m);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); send(text); };

  // Keep clear of the mobile bottom nav and the product page's sticky buy bar.
  const lift = loc.pathname.startsWith('/product/') ? 'bottom-[calc(8.5rem+env(safe-area-inset-bottom))]' : 'bottom-[calc(4.5rem+env(safe-area-inset-bottom))]';

  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} aria-label="Ask Vallerie, the shopping assistant" aria-haspopup="dialog"
          className={`fixed right-3 z-40 flex items-center gap-2 rounded-full bg-panel p-1.5 font-bold text-on-panel shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] ring-1 ring-white/10 transition hover:-translate-y-0.5 sm:right-4 sm:py-2.5 sm:pl-2.5 sm:pr-4 lg:bottom-6 ${lift}`}>
          <span className="grid size-11 place-items-center rounded-full bg-brand text-on-brand sm:size-9"><Sparkles className="size-5" aria-hidden /></span>
          <span className="hidden sm:inline">Vallerie</span>
        </button>
      )}

      {open && (
        <div role="dialog" aria-modal="false" aria-labelledby="vallerie-title"
          className="animate-rise fixed inset-x-0 bottom-0 z-50 flex h-[min(42rem,88dvh)] flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-2xl sm:inset-x-auto sm:bottom-4 sm:right-4 sm:h-[min(40rem,calc(100dvh-6rem))] sm:w-[24rem] sm:rounded-3xl">
          <header className="flex items-center gap-3 bg-panel px-4 py-3 text-on-panel">
            <span className="grid size-10 place-items-center rounded-full bg-brand text-on-brand"><Sparkles className="size-5" aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <h2 id="vallerie-title" className="font-extrabold leading-tight">Vallerie</h2>
              <p className="text-xs text-on-panel-2">Green Valley Online Assistant</p>
              <p className={`text-xs font-semibold ${lastFailed ? 'text-amber-300' : 'text-emerald-300'}`}>● {lastFailed ? 'Unavailable' : 'Online'}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded-xl hover:bg-white/10" aria-label="Close Vallerie"><X className="size-5" aria-hidden /></button>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
            <Bubble role="assistant">Hi! I'm Vallerie. I can help you find products, plan a braai, or explain delivery and your order. I use the shop's live catalogue, so prices and stock are up to date.</Bubble>
            {entries.map((e, i) => (
              <div key={i} className="space-y-2">
                <Bubble role={e.role} failed={e.failed}>{e.role === 'assistant' ? <RichText text={e.content} /> : e.content}</Bubble>
                {!!e.products?.length && <ProductStrip products={e.products} />}
              </div>
            ))}
            {chat.isPending && <Bubble role="assistant"><span className="inline-flex gap-1" aria-label="Vallerie is typing"><Dot /><Dot d="150ms" /><Dot d="300ms" /></span></Bubble>}
            {entries.length === 0 && (
              <div className="flex flex-wrap gap-2 pt-1" aria-label="Suggested questions">
                {PROMPTS.map(p => <button key={p} type="button" onClick={() => send(p)} className="min-h-10 rounded-full border border-line bg-surface px-3 text-left text-sm font-semibold text-ink-2 transition hover:border-brand hover:text-brand-text">{p}</button>)}
              </div>
            )}
            {cart.count > 0 && entries.length > 0 && !chat.isPending && (
              <Link to="/cart" onClick={() => setOpen(false)} className="block rounded-xl bg-brand-soft px-3 py-2 text-center text-sm font-bold text-brand-text hover:underline">View cart ({cart.count}) and check out</Link>
            )}
          </div>

          <form onSubmit={submit} className="flex items-end gap-2 border-t border-line p-3">
            <label htmlFor="vallerie-input" className="sr-only">Message Vallerie</label>
            <textarea id="vallerie-input" ref={inputRef} rows={1} maxLength={500} value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }}
              placeholder="Ask Vallerie…" className="field max-h-28 min-h-11 flex-1 resize-none py-2.5" />
            <button type="submit" disabled={!text.trim() || chat.isPending} className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-on-brand disabled:opacity-40" aria-label="Send"><ArrowUp className="size-5" aria-hidden /></button>
          </form>
          <p className="px-4 pb-3 text-[0.7rem] text-ink-3">Vallerie can make mistakes. Prices and stock shown on product cards come from the store. She can't place orders or take payments.</p>
        </div>
      )}
    </>
  );
}

function Dot({ d = '0ms' }: { d?: string }) { return <span className="size-2 animate-bounce rounded-full bg-ink-3" style={{ animationDelay: d }} />; }

function Bubble({ role, failed, children }: { role: 'user' | 'assistant'; failed?: boolean; children: ReactNode }) {
  const mine = role === 'user';
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[0.95rem] leading-relaxed ${mine ? 'rounded-br-md bg-brand text-on-brand' : failed ? 'rounded-bl-md bg-warn-bg text-warn-text' : 'rounded-bl-md bg-surface-2 text-ink'}`}>{children}</div>
    </div>
  );
}

// Minimal, safe formatting for model text: paragraphs, "- " bullets and **bold**. No HTML is ever injected.
function RichText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part);
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        if (lines.every(l => /^\s*([-*•]|\d+\.)\s+/.test(l)))
          return <ul key={i} className="list-disc space-y-1 pl-5">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ''))}</li>)}</ul>;
        return <p key={i}>{lines.map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l)}</span>)}</p>;
      })}
    </div>
  );
}

function ProductStrip({ products }: { products: ChatProduct[] }) {
  const cart = useCart();
  const [added, setAdded] = useState<string | null>(null);
  return (
    <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Suggested products">
      {products.map(p => {
        const out = stockState(p) === 'OUT_OF_STOCK';
        return (
          <li key={p.id} className="w-40 shrink-0 rounded-2xl border border-line bg-surface p-3">
            <Link to={`/product/${p.id}`} className="line-clamp-2 min-h-10 text-sm font-bold leading-tight hover:underline">{p.name}</Link>
            <p className="mt-1 text-sm"><span className="font-extrabold">{rand(p.price)}</span><span className="text-ink-3">{unitLabel(p.soldByWeight)}</span></p>
            {out ? <p className="mt-2 text-xs font-bold text-danger-text">Out of stock</p> : (
              <button type="button" onClick={() => { cart.add(p.id, 1); setAdded(p.id); setTimeout(() => setAdded(null), 1500); }}
                className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-1 rounded-lg bg-brand text-sm font-bold text-on-brand">
                {added === p.id ? <><Check className="size-4" aria-hidden /> Added</> : <><Plus className="size-4" aria-hidden /> Add {p.soldByWeight ? '1 kg' : ''}</>}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
