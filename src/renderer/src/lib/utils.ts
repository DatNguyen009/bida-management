import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US') + 'đ'
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function calcPlayAmount(durationMinutes: number, hourlyRate: number): number {
  return Math.round((durationMinutes / 60) * hourlyRate)
}

export function elapsedSeconds(startTime: string): number {
  return Math.floor((Date.now() - new Date(startTime).getTime()) / 1000)
}

export function elapsedMinutes(startTime: string): number {
  return Math.floor((Date.now() - new Date(startTime).getTime()) / 60000)
}
