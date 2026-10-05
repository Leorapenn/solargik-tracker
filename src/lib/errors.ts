// Expected, user-fixable problems (bad input, name already taken...). Server actions turn these into
// a returned message, because Next.js hides the text of thrown errors in production builds.
// Anything that is NOT a UserError is a real bug and is rethrown.
export class UserError extends Error {}

export type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function run<T extends object>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (error) {
    if (error instanceof UserError) return { ok: false, error: error.message };
    throw error;
  }
}
