import { exportStaticProgram, seedMoviesFromStaticProgram } from "./export-static";
import { triggerFullSync } from "./sync";

console.log("Lancement de la synchronisation complète des cinémas de Toulouse...");
seedMoviesFromStaticProgram();
const status = await triggerFullSync();

console.log("\n=== Bilan par cinéma ===");
let totalScreenings = 0;
for (const c of status.cinemas) {
  totalScreenings += c.screeningsCount;
  const icon = c.status === "ok" ? "OK" : "ERR";
  console.log(
    `[${icon}] ${c.name.padEnd(28)} ${String(c.screeningsCount).padStart(4)} séances  (${c.durationMs ?? 0}ms)${c.errorMessage ? `  -> ${c.errorMessage}` : ""}`
  );
}
console.log(
  `\nTotal séances en cache: ${totalScreenings} | Letterboxd: ${status.letterboxdDone}/${status.letterboxdTotal}`
);

if (totalScreenings > 0) {
  const exported = exportStaticProgram();
  console.log(
    `[StaticExport] ${exported.screeningsCount} séances, ${exported.moviesCount} films (${Math.round(exported.bytes / 1024)} Ko) -> public/data/program.json`
  );
} else {
  console.error("[StaticExport] Aucune séance récupérée : abandon de l'export.");
  process.exitCode = 1;
}
