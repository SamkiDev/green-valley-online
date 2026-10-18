import { lazy, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from './lib/api';
import { CartProvider } from './lib/cart';
import { Layout } from './components/Layout';
import Home from './pages/Home';
import Stores from './pages/Stores';
import StorePage from './pages/StorePage';
import Shop from './pages/Shop';
import ProductPage from './pages/ProductPage';
import Cart from './pages/Cart';
import { About, Deals, NotFound } from './pages/Info';
import { PortalLayout, RequireRole } from './components/Portal';
import './index.css';

// Staff portals load on demand so shoppers don't download them.
const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) => lazy(() => load().then(mod => ({ default: mod[name] })));
// Checkout, account and order pages load when first visited.
const Account = lazy(() => import('./pages/Account'));
const Privacy = named(() => import('./pages/Legal'), 'Privacy');
const Terms = named(() => import('./pages/Legal'), 'Terms');
const Wholesale = lazy(() => import('./pages/Wholesale'));
const TrackOrder = lazy(() => import('./pages/TrackOrder'));
const Checkout = lazy(() => import('./pages/Checkout'));
const Pay = lazy(() => import('./pages/Pay'));
const PaymentReturn = lazy(() => import('./pages/PaymentReturn'));
const OrderConfirmation = named(() => import('./pages/OrderPages'), 'OrderConfirmation');
const TrackingPage = named(() => import('./pages/OrderPages'), 'TrackingPage');
const DriverPortal = lazy(() => import('./pages/driver/DriverPortal'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const Overview = named(() => import('./pages/admin/Orders'), 'Overview');
const Orders = named(() => import('./pages/admin/Orders'), 'Orders');
const Products = named(() => import('./pages/admin/Products'), 'Products');
const Inventory = named(() => import('./pages/admin/Products'), 'Inventory');
const Customers = named(() => import('./pages/admin/People'), 'Customers');
const Drivers = named(() => import('./pages/admin/People'), 'Drivers');
const StaffAccounts = named(() => import('./pages/admin/People'), 'StaffAccounts');
const StoresSettings = named(() => import('./pages/admin/Settings'), 'StoresSettings');
const Analytics = named(() => import('./pages/admin/Analytics'), 'Analytics');
const Questions = named(() => import('./pages/admin/Inbox'), 'Questions');
const ReviewsModeration = named(() => import('./pages/admin/Inbox'), 'ReviewsModeration');
const WholesaleRequests = named(() => import('./pages/admin/Inbox'), 'WholesaleRequests');

const adminOnly = (el: React.ReactNode) => <RequireRole roles={['ADMIN']} title="Admin-only section">{el}</RequireRole>;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retry network blips, not client errors like 404.
      retry: (n, e) => n < 2 && !(e instanceof ApiError && e.status >= 400 && e.status < 500),
    },
  },
});

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/shop', element: <Shop /> },
      { path: '/stores', element: <Stores /> },
      { path: '/stores/:slug', element: <StorePage /> },
      { path: '/product/:id', element: <ProductPage /> },
      { path: '/cart', element: <Cart /> },
      { path: '/checkout', element: <Checkout /> },
      { path: '/checkout/pay/:orderId', element: <Pay /> },
      { path: '/checkout/return', element: <PaymentReturn /> },
      { path: '/orders/:id', element: <OrderConfirmation /> },
      { path: '/track/:id', element: <TrackingPage /> },
      { path: '/deals', element: <Deals /> },
      { path: '/track', element: <TrackOrder /> },
      { path: '/about', element: <About /> },
      { path: '/privacy', element: <Privacy /> },
      { path: '/terms', element: <Terms /> },
      { path: '/account', element: <Account /> },
      { path: '/wholesale', element: <Wholesale /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    path: '/driver', element: <PortalLayout label="Driver" />,
    children: [{ index: true, element: <RequireRole roles={['DRIVER']} title="Driver portal"><DriverPortal /></RequireRole> }],
  },
  {
    path: '/admin', element: <PortalLayout label="Admin" />,
    children: [{
      element: <RequireRole roles={['ADMIN', 'STORE_STAFF']} title="Admin dashboard"><AdminLayout /></RequireRole>,
      children: [
        { index: true, element: <Overview /> },
        { path: 'orders', element: <Orders /> },
        { path: 'products', element: <Products /> },
        { path: 'inventory', element: <Inventory /> },
        { path: 'questions', element: <Questions /> },
        { path: 'reviews', element: <ReviewsModeration /> },
        { path: 'analytics', element: <Analytics /> },
        { path: 'customers', element: adminOnly(<Customers />) },
        { path: 'drivers', element: adminOnly(<Drivers />) },
        { path: 'staff', element: adminOnly(<StaffAccounts />) },
        { path: 'stores', element: adminOnly(<StoresSettings />) },
        { path: 'wholesale', element: adminOnly(<WholesaleRequests />) },
      ],
    }],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <RouterProvider router={router} />
      </CartProvider>
    </QueryClientProvider>
  </StrictMode>,
);
