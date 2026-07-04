// src/utils/date.ts
import { formatDistanceToNow as dateFnsFormatDistanceToNow, format, parseISO } from 'date-fns';

export function formatDistanceToNow(date: Date | string | number): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : new Date(date);
  return dateFnsFormatDistanceToNow(dateObj, { addSuffix: true });
}

export function formatDate(date: Date | string, formatStr: string = 'MMM dd, yyyy'): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, formatStr);
}

export function formatDateTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, 'MMM dd, yyyy HH:mm');
}