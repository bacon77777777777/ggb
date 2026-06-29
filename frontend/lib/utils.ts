import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatViewCount(input: unknown) {
  const n = Math.max(0, Math.floor(Number(input) || 0))
  if (n <= 999) return String(n)
  if (n <= 9999) return `${Math.floor(n / 1000) * 1000}+`
  return `${Math.floor(n / 10000)}w+`
}
