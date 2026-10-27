export function overviewReturnPath(
  state: unknown,
  code: string,
): string | null {
  if (!state || typeof state !== 'object' || !('returnToOverview' in state))
    return null
  const path = state.returnToOverview
  if (typeof path !== 'string' || !path.startsWith('/?')) return null
  return new URLSearchParams(path.slice(2)).get('company') === code
    ? path
    : null
}
