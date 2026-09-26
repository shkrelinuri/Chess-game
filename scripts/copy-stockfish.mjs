import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const engineDirectory = path.join(projectRoot, "public", "engine");
const packageDirectory = path.join(projectRoot, "node_modules", "stockfish");
const files = [
  ["bin/stockfish-19-lite-single.js", "stockfish-19-lite-single.js"],
  ["bin/stockfish-19-lite-single.wasm", "stockfish-19-lite-single.wasm"],
  ["Copying.txt", "Copying.txt"],
];

await mkdir(engineDirectory, { recursive: true });
await Promise.all(
  files.map(([source, destination]) =>
    copyFile(path.join(packageDirectory, source), path.join(engineDirectory, destination)),
  ),
);