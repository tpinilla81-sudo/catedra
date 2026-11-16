// Auxiliar de la batería E2E (verify-tree-biblioteca.sh §5): recibe la fila Task
// en JSON por argv y devuelve las categorías Nivel 3 que deriveLevel3Ids de
// PRODUCCIÓN asigna en lectura. Vive en el repo (no en /tmp) para que la
// batería sea reproducible en cualquier sandbox fresco.
import { deriveLevel3Ids } from "../src/lib/task-taxonomy";

const row = JSON.parse(process.argv[2] ?? "{}");
console.log(
  JSON.stringify(
    deriveLevel3Ids(
      row.nivel3Ids ?? [],
      row.family ?? null,
      `${row.title ?? ""} ${row.objective ?? ""}`,
    ),
  ),
);
