/**
 * Run one section of a parallel fan-out, logging and swallowing failures so a single dead tool
 * cannot fail a whole page (spec 14.3). Kept free of Next.js imports so scripts can use it too.
 */
export async function settle<T>(
  label: string,
  work: Promise<T>,
  fallback: T,
): Promise<{ value: T; error?: string }> {
  try {
    return { value: await work };
  } catch (err) {
    console.error(`[settle] ${label} failed`, err);
    return { value: fallback, error: label };
  }
}
