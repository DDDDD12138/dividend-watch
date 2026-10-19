/** Phase-one request allowlist, not a company-facts database. */
export const supportedSymbols = ['sh601939', 'sh601398', 'sh601988'] as const
export const supportedCodes: string[] = supportedSymbols.map((symbol) =>
  symbol.slice(2),
)
export const isSupported = (code: string) => supportedCodes.includes(code)
