import { NavLink, Outlet } from 'react-router';
import { BarChart3, Boxes, ClipboardList, LayoutDashboard, MessageSquareText, Package, Star, Store, Truck, Users, Warehouse } from 'lucide-react';
import { useMe } from '../../lib/auth';

const SECTIONS = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/orders', label: 'Orders', icon: ClipboardList },
  { to: '/admin/products', label: 'Products', icon: Package },
  { to: '/admin/inventory', label: 'Inventory', icon: Boxes },
  { to: '/admin/questions', label: 'Q&A', icon: MessageSquareText },
  { to: '/admin/reviews', label: 'Reviews', icon: Star },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/admin/customers', label: 'Customers', icon: Users, adminOnly: true },
  { to: '/admin/drivers', label: 'Drivers', icon: Truck, adminOnly: true },
  { to: '/admin/stores', label: 'Stores & settings', icon: Store, adminOnly: true },
  { to: '/admin/wholesale', label: 'Bulk quotes', icon: Warehouse, adminOnly: true },
];

export default function AdminLayout() {
  const { data: me } = useMe();
  const sections = SECTIONS.filter(s => !s.adminOnly || me?.role === 'ADMIN');
  return (
    <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-4 py-6 md:px-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <nav aria-label="Admin sections" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:overflow-visible lg:px-0">
        <ul className="flex gap-1 lg:sticky lg:top-24 lg:flex-col">
          {sections.map(({ to, label, icon: Icon, end }) => (
            <li key={to} className="shrink-0">
              <NavLink to={to} end={end} className={({ isActive }) => `flex min-h-11 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 text-[0.95rem] font-semibold transition ${isActive ? 'bg-brand-soft text-brand-text' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'}`}>
                <Icon className="size-5" aria-hidden />{label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0"><Outlet /></div>
    </div>
  );
}

export function AdminHeader({ title, children, actions }: { title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{title}</h1>
        {children && <p className="mt-1 text-ink-2">{children}</p>}
      </div>
      {actions}
    </header>
  );
}
