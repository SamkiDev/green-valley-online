// Shows the product photo when one is uploaded; until then a clean category tile (no stock photos pretending to be the shop's).
import { Beef, Drumstick, Flame, Ham, Utensils, type LucideIcon } from 'lucide-react';

const looks: Record<string, { icon: LucideIcon; tint: string }> = {
  Beef: { icon: Beef, tint: 'from-red-100 to-orange-50 text-red-800 dark:from-red-950 dark:to-stone-900 dark:text-red-200' },
  Chicken: { icon: Drumstick, tint: 'from-amber-100 to-yellow-50 text-amber-800 dark:from-amber-950 dark:to-stone-900 dark:text-amber-200' },
  Pork: { icon: Ham, tint: 'from-rose-100 to-pink-50 text-rose-800 dark:from-rose-950 dark:to-stone-900 dark:text-rose-200' },
  Lamb: { icon: Utensils, tint: 'from-stone-200 to-stone-50 text-stone-700 dark:from-stone-800 dark:to-stone-900 dark:text-stone-200' },
  Braai: { icon: Flame, tint: 'from-orange-100 to-amber-50 text-orange-800 dark:from-orange-950 dark:to-stone-900 dark:text-orange-200' },
};

export function ProductImage({ name, category, imageUrl, className = '', size = 'md' }: { name: string; category: string; imageUrl?: string | null; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  if (imageUrl) return <img src={imageUrl} alt={name} loading="lazy" className={`aspect-[4/3] w-full rounded-xl object-cover ${className}`} />;
  const look = looks[category] ?? looks.Lamb;
  const Icon = look.icon;
  return (
    <div role="img" aria-label={`${name} (photo coming soon)`} className={`relative grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-xl bg-gradient-to-br ${look.tint} ${className}`}>
      <Icon className={size === 'lg' ? 'size-20 opacity-80' : size === 'sm' ? 'size-7 opacity-80' : 'size-10 opacity-80'} strokeWidth={1.5} aria-hidden />
      {size !== 'sm' && <span className="absolute bottom-2 left-2 rounded-md bg-white/70 px-1.5 py-0.5 text-[0.65rem] font-semibold text-stone-700 dark:bg-black/40 dark:text-stone-200">Photo coming soon</span>}
    </div>
  );
}
