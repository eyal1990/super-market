import directory from './address-directory.generated.ts';

export type AddressDirectoryEntry = {
  cityCode: number;
  cityName: string;
  streetCode: number;
  streetName: string;
  aliases: readonly string[];
};

export type AddressSuggestion = {
  id: string;
  kind: 'city' | 'street' | 'address';
  label: string;
  detail: string;
  addressQuery: string;
};

const finalLetterMap: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };

export function normalizeAddressText(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/[׳״'".,/\\()-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split('')
    .map((character) => finalLetterMap[character] ?? character)
    .join('')
    .toLocaleLowerCase('he-IL');
}

function words(value: string) {
  return normalizeAddressText(value).split(' ').filter(Boolean);
}

function includesAllWords(haystack: string, needles: string[]) {
  return needles.every((needle) => haystack.includes(needle));
}

function extractHouseNumber(query: string) {
  return query.match(/\b\d+[א-ת]?\b/)?.[0] ?? '';
}

export function getAddressSuggestions(query: string, entries: readonly AddressDirectoryEntry[] = directory as readonly AddressDirectoryEntry[]): AddressSuggestion[] {
  const trimmed = query.trim();
  const normalizedQuery = normalizeAddressText(trimmed);
  if (normalizedQuery.length < 2) return [];

  const queryWords = words(trimmed);
  const houseNumber = extractHouseNumber(trimmed);
  const suggestions: AddressSuggestion[] = [];
  const seen = new Set<string>();
  const add = (suggestion: AddressSuggestion) => {
    if (seen.has(suggestion.id)) return;
    seen.add(suggestion.id);
    suggestions.push(suggestion);
  };

  const cityNames = new Map<string, string>();
  for (const entry of entries) cityNames.set(normalizeAddressText(entry.cityName), entry.cityName);
  for (const [normalizedCity, cityName] of cityNames) {
    if (normalizedCity.startsWith(normalizedQuery) && suggestions.length < 8) {
      add({ id: `city-${normalizedCity}`, kind: 'city', label: cityName, detail: 'יישוב בישראל', addressQuery: cityName });
    }
  }

  const ranked = entries
    .map((entry) => {
      const streetNames = [entry.streetName, ...entry.aliases].map(normalizeAddressText);
      const streetMatch = streetNames.find((name) => name.startsWith(normalizedQuery)) ?? streetNames.find((name) => name.includes(normalizedQuery));
      const normalizedStreet = normalizeAddressText(entry.streetName);
      const normalizedCity = normalizeAddressText(entry.cityName);
      const fullAddressMatch = includesAllWords(`${normalizedStreet} ${normalizedCity}`, queryWords.filter((word) => !/^\d+[א-ת]?$/.test(word)));
      const score = fullAddressMatch && houseNumber ? 0 : streetMatch ? (streetMatch === normalizedStreet && normalizedStreet.startsWith(normalizedQuery) ? 1 : 2) : 99;
      return { entry, score, fullAddressMatch };
    })
    .filter((item) => item.score < 99)
    .sort((a, b) => a.score - b.score || a.entry.cityName.localeCompare(b.entry.cityName, 'he') || a.entry.streetName.localeCompare(b.entry.streetName, 'he'));

  for (const { entry, score, fullAddressMatch } of ranked) {
    if (suggestions.length >= 8) break;
    const isAddress = Boolean(houseNumber && (fullAddressMatch || score === 0));
    const label = isAddress ? `${entry.streetName} ${houseNumber}, ${entry.cityName}` : `${entry.streetName}, ${entry.cityName}`;
    add({
      id: `${isAddress ? 'address' : 'street'}-${entry.cityCode}-${entry.streetCode}-${houseNumber}`,
      kind: isAddress ? 'address' : 'street',
      label,
      detail: isAddress ? 'כתובת בישראל' : `רחוב ב${entry.cityName}`,
      addressQuery: label,
    });
  }

  return suggestions.slice(0, 8);
}
