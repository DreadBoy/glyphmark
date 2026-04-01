import yaml from "js-yaml";
import type {
  Pf2eBlock,
  Pf2eCreature,
  Pf2eSpell,
  Pf2eItem,
  Pf2eFeat,
  Pf2eAttack,
  Pf2eAbility,
} from "../ir/types.js";

const JSON_SCHEMA = yaml.JSON_SCHEMA;

function parseYaml(raw: string): Record<string, unknown> {
  // Use JSON_SCHEMA to avoid type coercion (e.g., +14 staying as string)
  // But JSON_SCHEMA is too strict for our needs -- it doesn't allow bare strings.
  // Use DEFAULT_SCHEMA but treat everything we extract as strings manually.
  const result = yaml.load(raw) as Record<string, unknown>;
  if (!result || typeof result !== "object") {
    throw new Error("YAML block did not parse to an object");
  }
  return result;
}

function str(val: unknown): string | undefined {
  if (val === undefined || val === null) return undefined;
  return String(val);
}

function num(val: unknown): number | undefined {
  if (val === undefined || val === null) return undefined;
  const n = Number(val);
  return isNaN(n) ? undefined : n;
}

function strArray(val: unknown): string[] | undefined {
  if (!Array.isArray(val)) return undefined;
  return val.map(String);
}

function parseAttacks(val: unknown): Pf2eAttack[] | undefined {
  if (!Array.isArray(val)) return undefined;
  return val.map((a: unknown) => {
    const atk = a as Record<string, unknown>;
    return {
      name: str(atk.name) ?? "Unknown",
      actions: num(atk.actions) ?? 1,
      modifier: str(atk.modifier) ?? "+0",
      damage: str(atk.damage) ?? "",
      traits: strArray(atk.traits),
    };
  });
}

function parseAbilities(val: unknown): Pf2eAbility[] | undefined {
  if (!Array.isArray(val)) return undefined;
  return val.map((a: unknown) => {
    const ab = a as Record<string, unknown>;
    return {
      name: str(ab.name) ?? "Unknown",
      actions: num(ab.actions),
      traits: strArray(ab.traits),
      description: str(ab.description) ?? "",
    };
  });
}

function parseSkills(val: unknown): Record<string, string> | undefined {
  if (!val || typeof val !== "object") return undefined;
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    result[k] = String(v);
  }
  return result;
}

export function parseCreature(raw: string): Pf2eCreature {
  const data = parseYaml(raw);
  return {
    type: "creature",
    name: str(data.name) ?? "Unknown Creature",
    level: num(data.level) ?? 0,
    traits: strArray(data.traits),
    perception: str(data.perception),
    languages: str(data.languages),
    skills: parseSkills(data.skills),
    hp: str(data.hp) ?? "0",
    ac: str(data.ac) ?? "0",
    fortitude: str(data.fortitude),
    reflex: str(data.reflex),
    will: str(data.will),
    speed: str(data.speed),
    immunities: strArray(data.immunities),
    resistances: str(data.resistances),
    weaknesses: str(data.weaknesses),
    melee: parseAttacks(data.melee),
    ranged: parseAttacks(data.ranged),
    abilities: parseAbilities(data.abilities),
  };
}

export function parseSpell(raw: string): Pf2eSpell {
  const data = parseYaml(raw);
  return {
    type: "spell",
    name: str(data.name) ?? "Unknown Spell",
    level: num(data.level) ?? 0,
    traits: strArray(data.traits),
    traditions: strArray(data.traditions),
    cast: str(data.cast),
    range: str(data.range),
    area: str(data.area),
    targets: str(data.targets),
    duration: str(data.duration),
    defense: str(data.defense),
    description: str(data.description) ?? "",
  };
}

export function parseItem(raw: string): Pf2eItem {
  const data = parseYaml(raw);
  return {
    type: "item",
    name: str(data.name) ?? "Unknown Item",
    level: num(data.level) ?? 0,
    traits: strArray(data.traits),
    price: str(data.price),
    usage: str(data.usage),
    bulk: str(data.bulk),
    description: str(data.description) ?? "",
  };
}

export function parseFeat(raw: string): Pf2eFeat {
  const data = parseYaml(raw);
  return {
    type: "feat",
    name: str(data.name) ?? "Unknown Feat",
    level: num(data.level) ?? 0,
    actions: num(data.actions),
    traits: strArray(data.traits),
    prerequisites: str(data.prerequisites),
    frequency: str(data.frequency),
    trigger: str(data.trigger),
    requirements: str(data.requirements),
    description: str(data.description) ?? "",
  };
}

const BLOCK_PARSERS: Record<string, (raw: string) => Pf2eBlock> = {
  "pf2e-creature": parseCreature,
  "pf2e-spell": parseSpell,
  "pf2e-item": parseItem,
  "pf2e-feat": parseFeat,
};

export function parsePf2eBlock(
  lang: string,
  raw: string,
): Pf2eBlock | null {
  const parser = BLOCK_PARSERS[lang];
  if (!parser) return null;
  try {
    return parser(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`Warning: Failed to parse ${lang} block: ${msg}`);
    return null;
  }
}

export const PF2E_LANGUAGES = Object.keys(BLOCK_PARSERS);
