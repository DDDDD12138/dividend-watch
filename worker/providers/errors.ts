import type { DataSource } from '../../shared/api'

/** Failure at a source I/O boundary, or an explicitly rejected source response. */
export class SourceError extends Error {
  override name = 'SourceError'
  source: DataSource

  constructor(source: DataSource, message: string, options?: ErrorOptions) {
    super(message, options)
    this.source = source
  }
}

/** A malformed source field or record, eligible for partial-data handling. */
export class SourceDataError extends SourceError {
  override name = 'SourceDataError'
}
