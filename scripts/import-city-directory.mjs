// Offline, reproducible generation from GeoNames' tab-delimited public exports.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../data/locations/', import.meta.url));
const countyCodes = ['025', '029', '037', '059', '065', '071', '073', '079', '083', '111'];
const featureCodes = ['PPL', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLX'];
const sha = (value) => createHash('sha256').update(value).digest('hex');
if (process.argv[2] === '--import') {
  const [, , , placesPath, countiesPath, retrieved] = process.argv;
  if (!placesPath || !countiesPath || !/^\d{4}-\d{2}-\d{2}$/.test(retrieved ?? '')) throw new Error('Usage: --import US.txt admin2Codes.txt YYYY-MM-DD');
  const places = readFileSync(placesPath), counties = readFileSync(countiesPath);
  const names = new Map(counties.toString('utf8').trim().split(/\r?\n/).map((line) => { const c = line.split('\t'); return [c[0], c[2]]; }));
  const rows = places.toString('utf8').trim().split(/\r?\n/).map((line) => line.split('\t'))
    .filter((c) => c[8] === 'US' && c[10] === 'CA' && countyCodes.includes(c[11]) && c[6] === 'P' && featureCodes.includes(c[7]))
    .map((c) => {
      const county = names.get(`US.CA.${c[11]}`);
      if (!county) throw new Error('Missing source county');
      return [c[0], c[2], county, c[11], c[7], c[18]];
    }).sort((a, b) => Number(a[0]) - Number(b[0]));
  if (!rows.length || new Set(rows.map((c) => c[0])).size !== rows.length) throw new Error('Invalid source IDs');
  mkdirSync(root, { recursive: true });
  const source = 'geonameId\tcity\tcounty\tcountyCode\tfeatureCode\tmodified\n' + rows.map((c) => c.join('\t')).join('\n') + '\n';
  writeFileSync(resolve(root, 'geonames-socal.tsv'), source);
  writeFileSync(resolve(root, 'source.json'), JSON.stringify({ provider: 'GeoNames', license: 'CC BY 4.0', retrieved,
    placesUrl: 'https://download.geonames.org/export/dump/US.zip', countiesUrl: 'https://download.geonames.org/export/dump/admin2Codes.txt',
    placesSha256: sha(places), countiesSha256: sha(counties), subsetSha256: sha(source), countyCodes, featureCodes,
    transforms: 'US/CA, listed counties and populated-place feature codes; ASCII city/county names; ID sort. Coordinates and unrelated fields omitted. Not a route dataset.' }, null, 2) + '\n');
}
const source = readFileSync(resolve(root, 'geonames-socal.tsv'), 'utf8');
const manifest = JSON.parse(readFileSync(resolve(root, 'source.json'), 'utf8'));
if (sha(source) !== manifest.subsetSha256) throw new Error('Source snapshot hash mismatch');
const cities = source.trim().split('\n').slice(1).map((line) => {
  const [id, name, county, countyCode, featureCode] = line.split('\t');
  return { id: `geonames:${id}`, name, county, countyCode, kind: featureCode === 'PPLX' ? 'neighborhood' : 'locality' };
});
const rendered = JSON.stringify({ version: `geonames-${manifest.retrieved}-${manifest.subsetSha256.slice(0, 12)}`, cities }, null, 2) + '\n';
const routes = JSON.parse(readFileSync(resolve(root, 'verified-routes.json'), 'utf8'));
const mapped = new Set(routes.records.map((r) => r.cityId));
const pending = 'cityId\tcity\tcounty\treason\n' + cities.filter((c) => !mapped.has(c.id)).map((c) => `${c.id}\t${c.name}\t${c.county}\tNo verified route record`).join('\n') + '\n';
if (process.argv[2] === '--check') {
  if (readFileSync(resolve(root, 'cities.json'), 'utf8') !== rendered) throw new Error('Generated directory differs from source');
  if (readFileSync(resolve(root, 'route-verification-needed.tsv'), 'utf8') !== pending) throw new Error('Verification queue differs from source');
} else {
  writeFileSync(resolve(root, 'cities.json'), rendered);
  writeFileSync(resolve(root, 'route-verification-needed.tsv'), pending);
}
console.log(JSON.stringify({ count: cities.length, counties: Object.fromEntries([...new Set(cities.map((c) => c.county))].sort().map((county) => [county, cities.filter((c) => c.county === county).length])), reproducible: true }));
