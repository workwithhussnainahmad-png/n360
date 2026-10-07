"use client";

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ToastProvider, ToastViewport } from '@radix-ui/react-toast';

import { Toaster } from './ui/toaster';
import SessionWatcher from './SessionWatcher';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        retry: 1,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
      <SessionWatcher />
    </QueryClientProvider>
  );
}
