import { useId } from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCompact, formatValue } from '@/lib/format'
import { useSettingsStore } from '@/stores/settings'

const AUTO = 'auto'
const NONE = 'none'

const LOCALES = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'en-IN', label: 'English (India): lakh and crore' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'fr-FR', label: 'Français' },
  { value: 'es-ES', label: 'Español' },
  { value: 'ja-JP', label: '日本語' },
]

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CNY', 'AUD', 'CAD', 'CHF']

/** Number format and currency for charts, KPIs, summaries and grids (F-VIZ-04). */
export function FormatSettings() {
  const { numberLocale, currency, locale } = useSettingsStore()
  const { setNumberLocale, setCurrency } = useSettingsStore()
  const localeId = useId()
  const currencyId = useId()
  const sample = 12_345_678.9
  const preview = [
    formatValue(sample, { y: currency ? 'currency' : 'number', currency }, locale),
    formatCompact(sample, locale),
  ].join(' · ')

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor={localeId}>Number format</Label>
        <Select
          value={numberLocale ?? AUTO}
          onValueChange={(value) => setNumberLocale(value === AUTO ? null : value)}
        >
          <SelectTrigger id={localeId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={AUTO}>Browser default ({navigator.language})</SelectItem>
            {LOCALES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={currencyId}>Currency for money columns</Label>
        <Select
          value={currency ?? NONE}
          onValueChange={(value) => setCurrency(value === NONE ? null : value)}
        >
          <SelectTrigger id={currencyId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>None (plain numbers)</SelectItem>
            {CURRENCIES.map((code) => (
              <SelectItem key={code} value={code}>
                {code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Applies to columns like revenue, price or cost in charts and KPIs. Preview: {preview}
        </p>
      </div>
    </div>
  )
}
