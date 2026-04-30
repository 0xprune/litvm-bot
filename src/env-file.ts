import { readFile, writeFile } from "node:fs/promises";

export type EnvUpdates = Record<string, string | number | boolean | undefined>;

export async function updateEnvFile(filePath: string, updates: EnvUpdates): Promise<void> {
  let existing = "";
  try {
    existing = await readFile(filePath, "utf8");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }

  const lines = existing ? existing.split(/\r?\n/) : [];
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  const positions = new Map<string, number>();

  lines.forEach((line, index) => {
    const match = line.match(/^\s*([A-Z0-9_]+)=/);
    if (match?.[1]) positions.set(match[1], index);
  });

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    const rendered = `${key}=${renderEnvValue(value)}`;
    const position = positions.get(key);
    if (position === undefined) {
      lines.push(rendered);
    } else {
      lines[position] = rendered;
    }
  }

  await writeFile(filePath, `${lines.filter((line, index) => line.length > 0 || index < lines.length - 1).join("\n")}\n`, "utf8");
}

function renderEnvValue(value: string | number | boolean): string {
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (/^[A-Za-z0-9_:/.,?=&-]+$/.test(value)) return value;
  return JSON.stringify(value);
}
