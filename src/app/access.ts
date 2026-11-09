// Who may open what (D115, D125). Since 2026-11-09 guests use Home, new projects and projects on
// this device without an account, and can turn on a few free HushGlance AI questions a day;
// accounts add the encrypted workspace, sharing and plans. `VITE_SIGN_IN_REQUIRED=true` (build
// time) asks for an account first again, as D115 did.

/** Whether Home and projects ask for an account first. */
export const SIGN_IN_REQUIRED = import.meta.env.VITE_SIGN_IN_REQUIRED === 'true'
