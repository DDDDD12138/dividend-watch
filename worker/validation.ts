import { MAX_WATCHLIST_SIZE, type ApiErrorCode } from '../shared/api'

const codePattern = /^\d{6}$/
type InputErrorCode = Extract<
  ApiErrorCode,
  'INVALID_QUERY' | 'INVALID_CODES' | 'INVALID_CODE'
>
export class InvalidInput extends Error {
  override name = 'InvalidInput'
  code: InputErrorCode
  constructor(code: InputErrorCode) {
    super(code)
    this.code = code
  }
}

export function searchQuery(values: string[] = []): string {
  const query = (values[0] ?? '').trim()
  if (values.length !== 1 || !query || query.length > 50)
    throw new InvalidInput('INVALID_QUERY')
  return query
}

export function stockCode(code: string): string {
  if (!codePattern.test(code)) throw new InvalidInput('INVALID_CODE')
  return code
}

export function stockCodes(values: string[] = []): string[] {
  const codes = [
    ...new Set((values[0] ?? '').split(',').map((code) => code.trim())),
  ]
  if (
    values.length !== 1 ||
    codes.length > MAX_WATCHLIST_SIZE ||
    codes.some((code) => !codePattern.test(code))
  )
    throw new InvalidInput('INVALID_CODES')
  return codes
}
