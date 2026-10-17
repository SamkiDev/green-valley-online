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
import { About, Deals, NotFound, Track } from './pages/Info';
import Checkout from './pages/Checkout';
import Pay from './pages/Pay';
import { OrderConfirmation, TrackingPage } from './pages/OrderPages';
import './index.css';

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
      { path: '/track', element: <Track /> },
      { path: '/about', element: <About /> },
      { path: '/account', element: <Account /> },
      { path: '/wholesale', element: <Wholesale /> },
      { path: '*', element: <NotFound /> },
    ],
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
