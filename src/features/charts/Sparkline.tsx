/** A tiny trend line (F-VIZ-10): every value, scaled to fit; null values break the line. */
export function Sparkline({
  values,
  className,
}: {
  values: (number | null)[]
  className?: string
}) {
  // At most ~120 points: plenty for a line this small.
  const step = Math.max(1, Math.ceil(values.length / 120))
  const points = values.filter((_, i) => i % step === 0 || i === values.length - 1)
  const present = points.filter((value): value is number => value !== null)
  if (present.length < 2) return null
  const min = Math.min(...present)
  const span = Math.max(...present) - min || 1
  const width = 100
  const height = 28
  const x = (i: number) => (i / Math.max(1, points.length - 1)) * width
  const y = (value: number) => height - 2 - ((value - min) / span) * (height - 4)
  let path = ''
  points.forEach((value, i) => {
    if (value === null) return
    path += `${path === '' || points[i - 1] === null ? 'M' : 'L'}${x(i).toFixed(1)},${y(value).toFixed(1)}`
  })
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
