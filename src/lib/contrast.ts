// WCAG 2 contrast (F-A11Y-02) for the theme's colors: oklch() tokens from index.css and the hex
// chart colors. Pure.

type Rgb = [number, number, number]

/** oklch(L C H) → linear sRGB (0–1, clamped). */
export function oklchToLinearRgb(l: number, c: number, h: number): Rgb {
  const hr = (h * Math.PI) / 180
  const a = c * Math.cos(hr)
  const b = c * Math.sin(hr)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const rgb: Rgb = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
  return rgb.map((v) => Math.min(1, Math.max(0, v))) as Rgb
}

export function hexToLinearRgb(hex: string): Rgb {
  const value = hex.replace('#', '')
  return [0, 2, 4].map((i) => {
    const channel = parseInt(value.slice(i, i + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }) as Rgb
}

/** Parses "oklch(0.556 0 0)" or "#4477aa" (no alpha). */
export function toLinearRgb(color: string): Rgb {
  const trimmed = color.trim()
  if (trimmed.startsWith('#')) return hexToLinearRgb(trimmed)
  const match = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(trimmed)
  if (!match) throw new Error(`Unsupported color: ${color}`)
  return oklchToLinearRgb(Number(match[1]), Number(match[2]), Number(match[3]))
}

const luminance = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b

export function contrast(foreground: string, background: string): number {
  const a = luminance(toLinearRgb(foreground))
  const b = luminance(toLinearRgb(background))
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
