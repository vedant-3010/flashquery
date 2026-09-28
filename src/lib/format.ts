import type { LogicalType } from '@/engine/types'

// Every number, date, duration and size shown in the UI goes through this module (Intl, locale-aware).
// Pure: callers pass the locale from the settings store. Missing values (null, undefined, NaN) render
// as EMPTY; grid cells render SQL NULL themselves.

export const EMPTY = '—'

type MaybeNumber = number | null | undefined

const numberFormats = new Map<string, Intl.NumberFormat>()
const dateFormats = new Map<string, Intl.DateTimeFormat>()

function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let format = numberFormats.get(key)
  if (!format) {
    format = new Intl.NumberFormat(locale, options)
    numberFormats.set(key, format)
  }
  return format
}

function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let format = dateFormats.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options)
    dateFormats.set(key, format)
  }
  return format
}

function present(value: MaybeNumber): value is number {
  return typeof value === 'number' && !Number.isNaN(value)
}

export interface NumberOptions {
  maxFractionDigits?: number
}

/** 1234567.891 → "1,234,567.89" (en-US), "12,34,567.89" (en-IN). */
export function formatNumber(
  value: MaybeNumber,
  locale: string,
  { maxFractionDigits = 2 }: NumberOptions = {},
): string {
  if (!present(value)) return EMPTY
  return numberFormat(locale, { maximumFractionDigits: maxFractionDigits }).format(value)
}

/** 1234567 → "1.2M" (en-US), "12.3L" (en-IN). For axes, KPIs and chips. */
export function formatCompact(value: MaybeNumber, locale: string): string {
  if (!present(value)) return EMPTY
  return numberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

export interface CurrencyOptions {
  compact?: boolean
}

/** `currency` is an ISO 4217 code. 1234.5 USD → "$1,234.50"; compact → "$1.2K". */
export function formatCurrency(
  value: MaybeNumber,
  currency: string,
  locale: string,
  { compact = false }: CurrencyOptions = {},
): string {
  if (!present(value)) return EMPTY
  const options: Intl.NumberFormatOptions = compact
    ? { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }
    : { style: 'currency', currency }
  return numberFormat(locale, options).format(value)
}

/** `value` is a fraction: 0.1234 → "12.3%". */
export function formatPercent(
  value: MaybeNumber,
  locale: string,
  { maxFractionDigits = 1 }: NumberOptions = {},
): string {
  if (!present(value)) return EMPTY
  return numberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: maxFractionDigits,
  }).format(value)
}

// DATE/TIMESTAMP values arrive from engine/normalize.ts as ISO-8601 strings. They are wall-clock values,
// so they are read and shown in UTC; converting to the viewer's zone would shift dates by a day.
function parseIsoUtc(value: string): Date | null {
  let iso = value.trim().replace(' ', 'T')
  if (iso.includes('T') && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso)) iso += 'Z'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatIso(
  value: string | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  if (value === null || value === undefined) return EMPTY
  const date = parseIsoUtc(value)
  // Unparseable input is shown as-is rather than hidden.
  return date ? dateFormat(locale, { ...options, timeZone: 'UTC' }).format(date) : value
}

/** "2025-03-01" → "Mar 1, 2025" (en-US). */
export function formatDate(value: string | null | undefined, locale: string): string {
  return formatIso(value, locale, { dateStyle: 'medium' })
}

/** "2025-03-01 14:05:00" → "Mar 1, 2025, 2:05 PM" (en-US). */
export function formatDateTime(value: string | null | undefined, locale: string): string {
  return formatIso(value, locale, { dateStyle: 'medium', timeStyle: 'short' })
}

/** Pipeline timings: 84 → "84 ms", 1830 → "1.8 s", 125000 → "2 min 5 s". */
export function formatDuration(ms: MaybeNumber, locale: string): string {
  if (!present(ms)) return EMPTY
  if (Math.round(ms) < 1000) {
    return `${numberFormat(locale, { maximumFractionDigits: 0 }).format(ms)} ms`
  }
  if (Math.round(ms / 100) < 600) {
    return `${numberFormat(locale, { maximumFractionDigits: 1 }).format(ms / 1000)} s`
  }
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

/** Decimal units, like the OS file browser: 110_400_000 → "110.4 MB". */
export function formatBytes(bytes: MaybeNumber, locale: string): string {
  if (!present(bytes)) return EMPTY
  let value = bytes
  let unit = 0
  while (Math.abs(value) >= 1000 && unit < BYTE_UNITS.length - 1) {
    value /= 1000
    unit += 1
  }
  const digits = unit === 0 ? 0 : 1
  return `${numberFormat(locale, { maximumFractionDigits: digits }).format(value)} ${BYTE_UNITS[unit]}`
}

export type DateDisplay = 'iso' | 'locale'

export interface CellFormat {
  logicalType: LogicalType
  /** Integers such as ids and years: no digit grouping. */
  plainInteger?: boolean
  dates?: DateDisplay
}

/** Text for one grid cell (F-GRID-03). The grid renders SQL NULL itself. */
export function formatCell(
  value: string | number | boolean,
  { logicalType, plainInteger = false, dates = 'iso' }: CellFormat,
  locale: string,
): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (logicalType === 'integer') {
      return plainInteger ? String(value) : formatNumber(value, locale, { maxFractionDigits: 0 })
    }
    return formatNumber(value, locale, { maxFractionDigits: 4 })
  }
  if (logicalType === 'date' && dates === 'locale') return formatDate(value, locale)
  if (logicalType === 'timestamp') {
    return dates === 'locale' ? formatDateTime(value, locale) : value.replace('T', ' ')
  }
  // Integers beyond 2^53 arrive as strings to keep their precision.
  return value
}

/** An app event time (epoch ms) in the viewer's time zone: "2:05:07 PM", or "Mar 1, 2:05 PM" if not today. */
export function formatEventTime(epochMs: number, locale: string, now = Date.now()): string {
  const date = new Date(epochMs)
  const sameDay = new Date(now).toDateString() === date.toDateString()
  return sameDay
    ? dateFormat(locale, { timeStyle: 'medium' }).format(date)
    : dateFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
