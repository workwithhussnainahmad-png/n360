"use client";

import { toast } from '@/components/ui/toaster';
import { apiErrorMessage } from './validation-errors';

export function showError(error: unknown) {
  toast({ title: 'Could not complete action', description: apiErrorMessage(typeof error === 'string' ? { error } : error), variant: 'destructive' });
}
