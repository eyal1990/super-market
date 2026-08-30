import assert from 'node:assert/strict';
import test from 'node:test';
import { getAddressSuggestions, type AddressDirectoryEntry } from '../lib/address-directory.ts';

const entries: AddressDirectoryEntry[] = [
  { cityCode: 9000, cityName: 'גן יבנה', streetCode: 278, streetName: 'היורה', aliases: [] },
  { cityCode: 9000, cityName: 'גן יבנה', streetCode: 107, streetName: 'אדמונית', aliases: [] },
  { cityCode: 5000, cityName: 'תל אביב - יפו', streetCode: 126, streetName: 'הרצל', aliases: [] },
];

test('street-first typing returns Israeli street options', () => {
  const suggestions = getAddressSuggestions('היורה', entries);
  assert.equal(suggestions[0]?.kind, 'street');
  assert.equal(suggestions[0]?.label, 'היורה, גן יבנה');
});

test('a complete street, house number, and city returns an address option', () => {
  const suggestions = getAddressSuggestions('היורה 10 גן יבנה', entries);
  assert.deepEqual(suggestions.map((suggestion) => suggestion.label), ['היורה 10, גן יבנה']);
  assert.equal(suggestions[0]?.kind, 'address');
  assert.equal(suggestions[0]?.addressQuery, 'היורה 10, גן יבנה');
});

test('the bundled Israeli directory contains the reported address components', () => {
  const suggestions = getAddressSuggestions('היורה 10 גן יבנה');
  assert.equal(suggestions[0]?.kind, 'address');
  assert.equal(suggestions[0]?.label, 'היורה 10, גן יבנה');
});

test('Hebrew final letters and punctuation do not prevent a match', () => {
  const suggestions = getAddressSuggestions('הרצל, 10 תל אביב', entries);
  assert.equal(suggestions[0]?.kind, 'address');
  assert.match(suggestions[0]?.label ?? '', /הרצל 10/);
});
