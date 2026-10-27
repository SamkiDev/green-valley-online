// Privacy policy (POPIA) and terms of sale. DRAFTS: they describe what this app actually does with data,
// but must be reviewed by the owners' legal adviser, and the [bracketed] details filled in, before launch.
import { Link } from 'react-router';
import type { ReactNode } from 'react';
import { PageHeader } from '../components/ui';

function DraftNotice() {
  return (
    <div className="card mb-8 border-warn-text/40 bg-warn-bg p-4 text-warn-text" role="note">
      <p className="font-bold">Draft for legal review</p>
      <p className="mt-1 text-sm">This text describes how the demo handles information. It is not yet legal advice and must be checked, and the details in [brackets] completed, before Green Valley Online takes real orders.</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-extrabold tracking-tight text-ink">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

export function Privacy() {
  return (
    <div className="container-page max-w-3xl">
      <PageHeader title="Privacy policy">How Green Valley Online collects, uses and protects your personal information under the Protection of Personal Information Act (POPIA).</PageHeader>
      <DraftNotice />
      <div className="text-ink-2 [&_li]:ml-5 [&_li]:list-disc">
        <Section title="Who we are">
          <p>Green Valley Online is operated by [legal name of the operating company], [registered address], Johannesburg. Our Information Officer is [name], reachable at [email] and [phone].</p>
        </Section>
        <Section title="What we collect">
          <ul>
            <li>Account details: your name, email address, phone number and a scrambled (hashed) version of your password. We never store your password itself.</li>
            <li>Order details: what you bought, delivery or collection choice, delivery address and the contact details you give at checkout.</li>
            <li>Payment status: whether an order was paid, and the payment provider's reference. Card details are entered on the payment provider's page and never reach our servers.</li>
            <li>Driver location: while a driver is delivering your order, their phone's location is used to show the map on your tracking page.</li>
            <li>Things you post: product reviews and questions.</li>
            <li>Messages to Vallerie, our shopping assistant, to answer your question.</li>
          </ul>
        </Section>
        <Section title="Why we use it">
          <ul>
            <li>To prepare, deliver and support your orders, and to contact you about them.</li>
            <li>To keep your account, saved addresses, favourites and cart.</li>
            <li>To prevent fraud and misuse, and to meet legal duties such as tax records and liquor age checks.</li>
          </ul>
          <p>We do not sell your personal information and we do not send marketing without your separate consent.</p>
        </Section>
        <Section title="Who we share it with">
          <ul>
            <li>The store that fulfils your order, and the driver delivering it (name, phone and address only).</li>
            <li>Our payment provider [Paystack], to process your payment.</li>
            <li>Our hosting provider [name], which stores the data on our behalf.</li>
            <li>If an AI service is switched on for Vallerie, [provider] processes the text of your chat to write the reply. Your name, email and address are not sent.</li>
          </ul>
        </Section>
        <Section title="How long we keep it">
          <p>Order and payment records are kept for [5] years for tax purposes. Driver locations are kept for [30] days after delivery. You can ask us to delete your account at any time; we then remove what we are not legally required to keep.</p>
        </Section>
        <Section title="Your rights">
          <p>You may ask to see the information we hold about you, have it corrected or deleted, or object to how we use it. Contact our Information Officer at [email]. You can also complain to the Information Regulator (South Africa) at <span className="font-semibold">inforeg.org.za</span>.</p>
        </Section>
        <Section title="Security">
          <p>Passwords are hashed, sessions use secure cookies, staff only see the orders of their own store, and payment card details never touch our systems.</p>
        </Section>
        <p className="mt-8 text-sm text-ink-3">Last updated: [date]. See also our <Link to="/terms" className="font-semibold text-brand-text underline">terms of sale</Link>.</p>
      </div>
    </div>
  );
}

export function Terms() {
  return (
    <div className="container-page max-w-3xl">
      <PageHeader title="Terms of sale">The rules for ordering from stores on Green Valley Online.</PageHeader>
      <DraftNotice />
      <div className="text-ink-2 [&_li]:ml-5 [&_li]:list-disc">
        <Section title="Orders and prices">
          <ul>
            <li>Prices include VAT and are shown in rand. Products sold per kilogram are weighed when packed; the amount charged is for the weight you ordered, and small differences are [refunded / not charged].</li>
            <li>An order is confirmed once it is paid. Unpaid orders are cancelled automatically after [30] minutes so the stock can go back on sale.</li>
            <li>If an item turns out to be unavailable, the store will contact you and refund that item.</li>
          </ul>
        </Section>
        <Section title="Delivery and collection">
          <ul>
            <li>We deliver to the suburbs listed for each delivery zone. The delivery fee depends on the zone and is shown before you pay.</li>
            <li>Delivery times are estimates. Someone must be available to receive the order; fresh and frozen goods cannot be left unattended.</li>
            <li>Collection orders can be picked up at the store once they are marked ready. Bring your order number.</li>
          </ul>
        </Section>
        <Section title="Liquor">
          <p>Liquor is sold only to persons 18 years or older. Proof of age may be requested on delivery or collection, and the order will not be handed over without it. Liquor sales follow the store's licence conditions and trading hours.</p>
        </Section>
        <Section title="Returns and refunds">
          <p>If something is wrong with your order, contact the store within [24 hours] of delivery or collection. Perishable goods that were delivered in good condition cannot be returned. Approved refunds are paid back to the original payment method within [7] working days. This does not limit your rights under the Consumer Protection Act.</p>
        </Section>
        <Section title="Your account">
          <p>Keep your password private. You can sign out of all devices from your account page. We may disable accounts that are used for fraud or abuse.</p>
        </Section>
        <Section title="Contact">
          <p>[Operating company], [address]. Email [email], phone or WhatsApp [number].</p>
        </Section>
        <p className="mt-8 text-sm text-ink-3">Last updated: [date]. See also our <Link to="/privacy" className="font-semibold text-brand-text underline">privacy policy</Link>.</p>
      </div>
    </div>
  );
}

/** "I accept the privacy policy and terms" tick-box used at registration and guest checkout. */
export function ConsentCheckbox({ id, checked, onChange, error }: { id: string; checked: boolean; onChange: (v: boolean) => void; error?: string }) {
  return (
    <div>
      <label htmlFor={id} className="flex items-start gap-3 text-sm">
        <input id={id} type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--color-brand)]" checked={checked} onChange={e => onChange(e.target.checked)} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} />
        <span>I have read and accept the <Link to="/privacy" target="_blank" className="font-semibold text-brand-text underline">privacy policy</Link> and <Link to="/terms" target="_blank" className="font-semibold text-brand-text underline">terms of sale</Link>, and agree that my details are used to process my orders.</span>
      </label>
      {error && <p id={`${id}-error`} className="mt-1 text-sm text-danger-text">{error}</p>}
    </div>
  );
}
