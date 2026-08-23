import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
process.env.ZYT_EXPERT_LIBRARY = path.resolve(here, "../../tests/fixtures/expert-library.json");
