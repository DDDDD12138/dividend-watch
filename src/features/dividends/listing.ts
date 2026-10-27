export function isPreListing(
  year: number,
  listingDate?: string | null,
): boolean {
  return Boolean(listingDate && year < Number(listingDate.slice(0, 4)))
}
