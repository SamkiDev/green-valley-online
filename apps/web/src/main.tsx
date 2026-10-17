import { StrictMode } from 'react';
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
import Account from './pages/Account';
import Wholesale from './pages/Wholesale';
import { About, Deals, NotFound } from './pages/Info';
import TrackOrder from './pages/TrackOrder';
import Checkout from './pages/Checkout';
import Pay from './pages/Pay';
import { OrderConfirmation, TrackingPage } from './pages/OrderPages';
import { PortalLayout, RequireRole } from './components/Portal';
import DriverPortal from './pages/driver/DriverPortal';
import AdminLayout from './pages/admin/AdminLayout';
import { Orders, Overview } from './pages/admin/Orders';
import { Inventory, Products } from './pages/admin/Products';
import { Customers, Drivers } from './pages/admin/People';
import { StoresSettings } from './pages/admin/Settings';
import { Analytics } from './pages/admin/Analytics';
import { Questions, ReviewsModeration, WholesaleRequests } from './pages/admin/Inbox';
import './index.css';

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
      { path: '/orders/:id', element: <OrderConfirmation /> },
      { path: '/track/:id', element: <TrackingPage /> },
      { path: '/deals', element: <Deals /> },
      { path: '/track', element: <TrackOrder /> },
      { path: '/about', element: <About /> },
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
