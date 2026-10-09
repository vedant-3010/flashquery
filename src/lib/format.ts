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

/** AI usage estimates in US dollars: 0.0042 → "$0.0042", 1.234 → "$1.23", tiny → "<$0.0001". */
export function formatUsd(value: MaybeNumber, locale: string): string {
  if (!present(value)) return EMPTY
  if (value > 0 && value < 0.0001) return `<${formatUsd(0.0001, locale)}`
  const options: Intl.NumberFormatOptions =
    value < 1
      ? { style: 'currency', currency: 'USD', maximumSignificantDigits: 2 }
      : { style: 'currency', currency: 'USD' }
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
export function parseIsoUtc(value: string): Date | null {
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

const MINUTE: [Intl.RelativeTimeFormatUnit, number] = ['minute', 60_000]
const AGO_STEPS = [MINUTE, ['hour', 3_600_000], ['day', 86_400_000]] satisfies [
  Intl.RelativeTimeFormatUnit,
  number,
][]

/** How long ago, for lists: "just now", "5 minutes ago", "yesterday"; a date after a month. */
export function formatAgo(epochMs: number, locale: string, now = Date.now()): string {
  const elapsed = Math.max(0, now - epochMs)
  if (elapsed < 60_000) return 'just now'
  if (elapsed >= 30 * 86_400_000) return dateFormat(locale, { dateStyle: 'medium' }).format(epochMs)
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const [unit, size] = AGO_STEPS.findLast(([, step]) => elapsed >= step) ?? MINUTE
  return relative.format(-Math.floor(elapsed / size), unit)
}

/** A moment in the reader's time zone, with the date: "Oct 6, 2026, 1:39 AM". */
export function formatMoment(epochMs: number, locale: string): string {
  return dateFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(epochMs))
}

/** How chart values and KPIs are shown (ChartSpec.format). */
export interface ValueStyle {
  y: 'number' | 'percent' | 'currency'
  currency: string | null
}

/**
 * A value in its chart format: percent for fractions, currency when known, else a number.
 * `compact` for axes and KPIs ("1.2M"); full precision otherwise.
 */
export function formatValue(
  value: MaybeNumber,
  style: ValueStyle,
  locale: string,
  { compact = false }: { compact?: boolean } = {},
): string {
  if (!present(value)) return EMPTY
  if (style.y === 'percent') {
    return formatPercent(value, locale, { maxFractionDigits: Math.abs(value) < 0.1 ? 1 : 0 })
  }
  if (style.y === 'currency' && style.currency) {
    return formatCurrency(value, style.currency, locale, {
      compact: compact && Math.abs(value) >= 10_000,
    })
  }
  if (compact && Math.abs(value) >= 10_000) return formatCompact(value, locale)
  return formatNumber(value, locale, { maxFractionDigits: Math.abs(value) < 1 ? 3 : 2 })
}

/**
 * Time-axis tick (epoch ms, UTC wall clock), by where it falls: a year start → "2025", a month start
 * → "Jul" ("Jul 2025" on long axes), a day → "Jul 14", else a time.
 */
export function formatDateTick(epochMs: number, locale: string, spanMs: number): string {
  const date = new Date(epochMs)
  const midnight = date.getUTCHours() === 0 && date.getUTCMinutes() === 0
  const firstOfMonth = midnight && date.getUTCDate() === 1
  const options: Intl.DateTimeFormatOptions =
    firstOfMonth && date.getUTCMonth() === 0
      ? { year: 'numeric' }
      : firstOfMonth
        ? spanMs > 2 * 365 * 86_400_000
          ? { month: 'short', year: 'numeric' }
          : { month: 'short' }
        : midnight
          ? { month: 'short', day: 'numeric' }
          : { hour: '2-digit', minute: '2-digit' }
  return dateFormat(locale, { ...options, timeZone: 'UTC' }).format(date)
}

/** Column name → axis title: "total_revenue" → "Total revenue", "growth_pct" → "Growth". */
export function humanizeName(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_(pct|percent)$/i, '')
    .replace(/[_\s]+/g, ' ')
    .trim()
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Naive English plural for column-name nouns: region → regions, country → countries. */
export function pluralize(noun: string): string {
  if (/s$/i.test(noun)) return noun
  if (/[^aeiou]y$/i.test(noun)) return `${noun.slice(0, -1)}ies`
  return `${noun}s`
}

/** A point in time (epoch ms, UTC wall clock) at the data's granularity: "2025", "Mar 2025", "Mar 1, 2025". */
export function formatTimePoint(epochMs: number, locale: string, stepMs: number): string {
  const day = 86_400_000
  const options: Intl.DateTimeFormatOptions =
    stepMs >= 360 * day
      ? { year: 'numeric' }
      : stepMs >= 28 * day
        ? { month: 'short', year: 'numeric' }
        : stepMs >= day
          ? { dateStyle: 'medium' }
          : { dateStyle: 'medium', timeStyle: 'short' }
  return dateFormat(locale, { ...options, timeZone: 'UTC' }).format(new Date(epochMs))
}
