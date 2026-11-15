// Helper for building the allowlist (not used at runtime):
//   npm run archive:find -- "Nosferatu"
// Lists candidate Internet Archive items from the feature_films collection. You still have to
// open each one, check the rights for your region, and copy the identifier into data/allowlist.json.
import { fetchJson } from "../src/core/infra/http";

const title = process.argv.slice(2).join(" ");
if (!title) {
  console.error('Usage: npm run archive:find -- "Movie title"');
  process.exit(1);
}

const q = `title:("${title.replace(/"/g, "")}") AND mediatype:(movies) AND collection:(feature_films)`;
const qs = new URLSearchParams({ q, rows: "10", output: "json", "sort[]": "downloads desc" });
for (const f of ["identifier", "title", "year", "licenseurl", "downloads"]) qs.append("fl[]", f);

type Doc = { identifier: string; title: string; year?: string; licenseurl?: string; downloads?: number };
const res = await fetchJson<{ response: { docs: Doc[] } }>(`https://archive.org/advancedsearch.php?${qs}`, { retries: 2 });

if (!res.response.docs.length) console.log("No matches in feature_films.");
for (const d of res.response.docs) {
  console.log(`${d.identifier}\n  ${d.title} (${d.year ?? "?"}) · downloads ${d.downloads ?? 0}`);
  console.log(`  license: ${d.licenseurl ?? "not stated — check the item page"}`);
  console.log(`  page:    https://archive.org/details/${d.identifier}\n`);
}
