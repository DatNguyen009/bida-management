import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US') + 'đ'
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h} giờ ${m} phút`
}

export function calcPlayAmount(durationMinutes: number, hourlyRate: number): number {
  return Math.round((durationMinutes / 60) * hourlyRate)
}

export function elapsedMinutes(startTime: string): number {
  return Math.floor((Date.now() - new Date(startTime).getTime()) / 60000)
}
