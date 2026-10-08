// Colour-vision checks for chart palettes (F-VIZ-12, ui rules: colour-blind-safe). Simulates the
// three kinds of dichromacy (Machado, Oliveira & Fernandes 2009, severity 1) and measures how far
// apart two colours look (CIE76 ΔE in CIELAB). Pure; used by tests to keep palettes honest.

export type Vision = 'normal' | 'protan' | 'deutan' | 'tritan'

type Matrix = [number, number, number][]

const MACHADO: Record<Exclude<Vision, 'normal'>, Matrix> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
}

type Rgb = [number, number, number]

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** '#RRGGBB' → linear-light sRGB. */
export function linearRgb(hex: string): Rgb {
  const channel = (i: number) => toLinear(Number.parseInt(hex.slice(i, i + 2), 16) / 255)
  return [channel(1), channel(3), channel(5)]
}

const clamp = (v: number) => Math.min(1, Math.max(0, v))

/** How a colour looks with the given kind of colour vision (linear sRGB in and out). */
export function simulate(rgb: Rgb, vision: Vision): Rgb {
  if (vision === 'normal') return rgb
  const m = MACHADO[vision]
  const row = (i: number) => {
    const [a = 0, b = 0, c = 0] = m[i] ?? []
    return clamp(a * rgb[0] + b * rgb[1] + c * rgb[2])
  }
  return [row(0), row(1), row(2)]
}

/** Linear sRGB → CIELAB (D65). */
export function toLab([r, g, b]: Rgb): Rgb {
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

/** How different two colours look (CIE76 ΔE): about 2 is just noticeable, 10+ clearly distinct. */
export function deltaE(a: string, b: string, vision: Vision = 'normal'): number {
  const [l1, a1, b1] = toLab(simulate(linearRgb(a), vision))
  const [l2, a2, b2] = toLab(simulate(linearRgb(b), vision))
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

/** The closest pair in a palette under one kind of vision. */
export function closestPair(
  colors: string[],
  vision: Vision,
): { a: string; b: string; deltaE: number } {
  let closest = { a: '', b: '', deltaE: Number.POSITIVE_INFINITY }
  colors.forEach((a, i) => {
    for (const b of colors.slice(i + 1)) {
      const d = deltaE(a, b, vision)
      if (d < closest.deltaE) closest = { a, b, deltaE: d }
    }
  })
  return closest
}
