// Run the whole pipeline from the terminal:  npm run demo -- "a mind-bending psychological thriller"
import { existsSync } from "node:fs";
import { createCineverse } from "../src/core";

for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);

const query = process.argv.slice(2).join(" ") || "a mind-bending psychological thriller";
const svc = createCineverse();
console.log("Providers:", svc.info(), "\n");
console.log(`> ${query}\n`);

const { items, dropped } = await svc.recommend(query);
for (const [i, { movie, reason }] of items.entries()) {
  console.log(`${i + 1}. ${movie.title} (${movie.year ?? "?"})  [${movie.id}]\n   ${reason}`);
}
if (dropped.length) console.log(`\nDropped (not found in catalogue): ${dropped.join(", ")}`);

console.log("\n--- Watch resolution ---");
for (const { movie } of items) {
  const w = await svc.watch(movie.id);
  const detail =
    w.mode === "PLAY"
      ? `${w.playback!.source} → ${w.playback!.embedUrl}`
      : w.mode === "WHERE_TO_WATCH"
        ? w.options.map((o) => `${o.provider} (${o.type})`).join(", ")
        : w.mode === "TRAILER_ONLY"
          ? `trailer ${w.trailer!.key}`
          : "—";
  console.log(`${movie.title.padEnd(28)} ${w.mode.padEnd(15)} ${detail}`);
  if (w.warnings.length) console.log(`   warnings: ${w.warnings.join("; ")}`);
}
