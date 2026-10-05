/**
 * Deployment switches, read on the server only. Both default to "on" so local development just works.
 *
 *  SIGNUPS_ENABLED=false  hide/refuse the sign-up form (also disable sign-ups in the Supabase project:
 *                         the Supabase API is public, so that setting is the real control, this is UX).
 *  DEMO_ENABLED=false     hide the "Try the demo" button.
 */
export const signupsEnabled = () => process.env.SIGNUPS_ENABLED !== "false";
export const demoEnabled = () => process.env.DEMO_ENABLED !== "false";
