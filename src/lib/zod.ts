import { z } from 'zod'

// Zod compiles object parsers with `new Function` unless it runs jitless, and the production CSP
// forbids eval (PRD D66). App code imports `z` from here, never from 'zod', so this runs before any
// schema exists, whatever order the bundler evaluates chunks in.
z.config({ jitless: true })

export { z }
