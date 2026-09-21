export interface AddressSuggestion {
  label: string;
}

interface NominatimResult {
  display_name: string;
}

/** Free, keyless address search via OpenStreetMap's public Nominatim API. Callers should debounce
 * and keep the query short — this is meant for light, interactive autocomplete use, not bulk lookups. */
export async function searchAddress(query: string, signal?: AbortSignal): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=5&q=${encodeURIComponent(trimmed)}`,
      { signal },
    );
    if (!res.ok) return [];
    const results = (await res.json()) as NominatimResult[];
    return results.map((r) => ({ label: r.display_name }));
  } catch {
    return [];
  }
}
