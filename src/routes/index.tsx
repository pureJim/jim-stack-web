import { lazy } from 'react';
import { createBrowserRouter } from 'react-router';

import ErrorPge from '@/components/ErrorPge';
import MainLayout from '@/layouts/Main';
import PlainLayout from '@/layouts/Plain';

import LazyLoad from './lazy-load';
import MainRoutes from './main';
import PlainRoutes from './Plain';

const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    errorElement: <ErrorPge />,
    children: [...MainRoutes],
  },
  {
    path: '/plain',
    element: <PlainLayout />,
    children: [...PlainRoutes],
  },
  {
    path: '/login',
    element: LazyLoad(lazy(() => import('@/views/login'))),
  },

  {
    path: '401',
    element: LazyLoad(lazy(() => import('@/components/RedirectPage/AuthPage'))),
  },
  {
    path: '404',
    element: LazyLoad(lazy(() => import('@/components/RedirectPage/NotFoundPage'))),
  },
]);

export default router;
