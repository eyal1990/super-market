import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const webDirectory = resolve(scriptDirectory, '..');
const dataDirectory = join(webDirectory, 'node_modules/@il-address/data/generated');
const outputPath = join(webDirectory, 'lib/address-directory.generated.ts');

const [cities, streetFiles] = await Promise.all([
  readFile(join(dataDirectory, 'cities.json'), 'utf8').then(JSON.parse),
  readdir(join(dataDirectory, 'streets')),
]);

const cityByCode = new Map(cities.map((city) => [String(city.code), city]));
const entries = [];

for (const fileName of streetFiles.filter((file) => file.endsWith('.json'))) {
  const city = cityByCode.get(fileName.slice(0, -5));
  if (!city) continue;
  const streets = JSON.parse(await readFile(join(dataDirectory, 'streets', fileName), 'utf8'));
  for (const street of streets) {
    entries.push({
      cityCode: city.code,
      cityName: city.nameHe,
      streetCode: street.code,
      streetName: street.nameHe,
      aliases: street.aliases,
    });
  }
}

entries.sort((a, b) => `${a.cityName} ${a.streetName}`.localeCompare(`${b.cityName} ${b.streetName}`, 'he'));
await writeFile(outputPath, `const directory = ${JSON.stringify(entries)} as const;\nexport default directory;\n`, 'utf8');
console.log(`Built ${entries.length} Israeli street directory entries.`);
