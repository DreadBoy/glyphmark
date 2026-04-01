import type {
  Pf2eBlock,
  Pf2eCreature,
  Pf2eSpell,
  Pf2eItem,
  Pf2eFeat,
} from "../ir/types.js";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderTraits(traits: string[] | undefined): string {
  if (!traits || traits.length === 0) return "";
  return `<div class="pf2e-traits">${traits
    .map((t) => {
      const rarity = getRarityClass(t);
      return `<span class="pf2e-trait ${rarity}">${escapeHtml(t)}</span>`;
    })
    .join("")}</div>`;
}

function getRarityClass(trait: string): string {
  const lower = trait.toLowerCase();
  if (lower === "uncommon") return "rarity-uncommon";
  if (lower === "rare") return "rarity-rare";
  if (lower === "unique") return "rarity-unique";
  return "";
}

function renderActionIcons(actions: number | undefined): string {
  if (actions === undefined) return "";
  if (actions === 1) return `<span class="pf2e-action" title="Single Action"><svg viewBox="0 0 12 12" width="18" height="18"><polygon points="3,6 6,1 9,6 6,11" fill="currentColor"/></svg></span>`;
  if (actions === 2) return `<span class="pf2e-action" title="Two Actions"><svg viewBox="0 0 24 12" width="36" height="18"><polygon points="3,6 6,1 9,6 6,11" fill="currentColor"/><polygon points="15,6 18,1 21,6 18,11" fill="currentColor"/></svg></span>`;
  if (actions === 3) return `<span class="pf2e-action" title="Three Actions"><svg viewBox="0 0 36 12" width="54" height="18"><polygon points="3,6 6,1 9,6 6,11" fill="currentColor"/><polygon points="15,6 18,1 21,6 18,11" fill="currentColor"/><polygon points="27,6 30,1 33,6 30,11" fill="currentColor"/></svg></span>`;
  return "";
}

const ACTION_SVGS: Record<string, string> = {
  ":aaa:": `<span class="pf2e-action" title="Three Actions"><svg viewBox="0 0 36 12" width="54" height="18"><polygon points="3,6 6,1 9,6 6,11" fill="currentColor"/><polygon points="15,6 18,1 21,6 18,11" fill="currentColor"/><polygon points="27,6 30,1 33,6 30,11" fill="currentColor"/></svg></span>`,
  ":aa:": `<span class="pf2e-action" title="Two Actions"><svg viewBox="0 0 24 12" width="36" height="18"><polygon points="3,6 6,1 9,6 6,11" fill="currentColor"/><polygon points="15,6 18,1 21,6 18,11" fill="currentColor"/></svg></span>`,
  ":a:": `<span class="pf2e-action" title="Single Action"><svg viewBox="0 0 12 12" width="18" height="18"><polygon points="3,6 6,1 9,6 6,11" fill="currentColor"/></svg></span>`,
  ":r:": `<span class="pf2e-action" title="Reaction"><svg viewBox="0 0 12 12" width="18" height="18"><path d="M9,6 L5,2 L5,5 L3,5 L3,7 L5,7 L5,10 Z" fill="currentColor"/></svg></span>`,
  ":f:": `<span class="pf2e-action" title="Free Action"><svg viewBox="0 0 12 12" width="18" height="18"><polygon points="3,6 6,1 9,6 6,11" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></span>`,
};

function replaceActionSymbols(text: string): string {
  return text.replace(/:aaa:|:aa:|:a:|:r:|:f:/g, (match) => ACTION_SVGS[match] ?? match);
}

function renderInlineMarkdown(text: string): string {
  // Basic inline markdown: **bold**, *italic*, then action symbols
  return replaceActionSymbols(
    text
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>"),
  );
}

function statLine(label: string, value: string | undefined): string {
  if (!value) return "";
  return `<div class="pf2e-stat-line"><strong>${label}</strong> ${escapeHtml(value)}</div>`;
}

function renderCreature(block: Pf2eCreature): string {
  const parts: string[] = [];

  parts.push(`<header class="pf2e-header">`);
  parts.push(`<h3 class="pf2e-name">${escapeHtml(block.name)}</h3>`);
  parts.push(`<span class="pf2e-level">Creature ${block.level}</span>`);
  parts.push(`</header>`);

  parts.push(renderTraits(block.traits));
  parts.push(`<div class="pf2e-separator"></div>`);

  parts.push(statLine("Perception", block.perception));
  if (block.languages) parts.push(statLine("Languages", block.languages));

  if (block.skills) {
    const skillStr = Object.entries(block.skills)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ");
    parts.push(statLine("Skills", skillStr));
  }

  parts.push(`<div class="pf2e-separator"></div>`);

  // Defenses
  const defParts: string[] = [];
  defParts.push(`<strong>AC</strong> ${escapeHtml(block.ac)}`);
  if (block.fortitude) defParts.push(`<strong>Fort</strong> ${escapeHtml(block.fortitude)}`);
  if (block.reflex) defParts.push(`<strong>Ref</strong> ${escapeHtml(block.reflex)}`);
  if (block.will) defParts.push(`<strong>Will</strong> ${escapeHtml(block.will)}`);
  parts.push(`<div class="pf2e-stat-line">${defParts.join("; ")}</div>`);

  parts.push(statLine("HP", block.hp));

  if (block.immunities?.length) {
    parts.push(statLine("Immunities", block.immunities.join(", ")));
  }
  if (block.resistances) parts.push(statLine("Resistances", block.resistances));
  if (block.weaknesses) parts.push(statLine("Weaknesses", block.weaknesses));

  parts.push(`<div class="pf2e-separator"></div>`);

  if (block.speed) parts.push(statLine("Speed", block.speed));

  // Attacks
  for (const atk of block.melee ?? []) {
    const traitsStr = atk.traits?.length ? ` (${atk.traits.join(", ")})` : "";
    parts.push(`<div class="pf2e-stat-line"><strong>Melee</strong> ${renderActionIcons(atk.actions)} ${escapeHtml(atk.name)} ${escapeHtml(atk.modifier)}${escapeHtml(traitsStr)}, <strong>Damage</strong> ${escapeHtml(atk.damage)}</div>`);
  }
  for (const atk of block.ranged ?? []) {
    const traitsStr = atk.traits?.length ? ` (${atk.traits.join(", ")})` : "";
    parts.push(`<div class="pf2e-stat-line"><strong>Ranged</strong> ${renderActionIcons(atk.actions)} ${escapeHtml(atk.name)} ${escapeHtml(atk.modifier)}${escapeHtml(traitsStr)}, <strong>Damage</strong> ${escapeHtml(atk.damage)}</div>`);
  }

  // Abilities
  for (const ab of block.abilities ?? []) {
    const traitsStr = ab.traits?.length
      ? ` <span class="pf2e-inline-traits">(${ab.traits.join(", ")})</span>`
      : "";
    parts.push(`<div class="pf2e-ability"><strong>${escapeHtml(ab.name)}</strong> ${renderActionIcons(ab.actions)}${traitsStr} ${renderInlineMarkdown(escapeHtml(ab.description))}</div>`);
  }

  return parts.join("\n");
}

function renderSpell(block: Pf2eSpell): string {
  const parts: string[] = [];

  parts.push(`<header class="pf2e-header">`);
  parts.push(`<h3 class="pf2e-name">${escapeHtml(block.name)}</h3>`);
  parts.push(`<span class="pf2e-level">Spell ${block.level}</span>`);
  parts.push(`</header>`);

  parts.push(renderTraits(block.traits));
  parts.push(`<div class="pf2e-separator"></div>`);

  if (block.traditions?.length) {
    parts.push(statLine("Traditions", block.traditions.join(", ")));
  }
  if (block.cast) parts.push(`<div class="pf2e-stat-line"><strong>Cast</strong> ${replaceActionSymbols(escapeHtml(block.cast))}</div>`);
  if (block.range) parts.push(statLine("Range", block.range));
  if (block.area) parts.push(statLine("Area", block.area));
  if (block.targets) parts.push(statLine("Targets", block.targets));
  if (block.duration) parts.push(statLine("Duration", block.duration));
  if (block.defense) parts.push(statLine("Defense", block.defense));

  parts.push(`<div class="pf2e-separator"></div>`);
  parts.push(`<div class="pf2e-description">${renderInlineMarkdown(escapeHtml(block.description))}</div>`);

  return parts.join("\n");
}

function renderItem(block: Pf2eItem): string {
  const parts: string[] = [];

  parts.push(`<header class="pf2e-header">`);
  parts.push(`<h3 class="pf2e-name">${escapeHtml(block.name)}</h3>`);
  parts.push(`<span class="pf2e-level">Item ${block.level}</span>`);
  parts.push(`</header>`);

  parts.push(renderTraits(block.traits));
  parts.push(`<div class="pf2e-separator"></div>`);

  if (block.price) parts.push(statLine("Price", block.price));
  if (block.usage) parts.push(statLine("Usage", block.usage));
  if (block.bulk) parts.push(statLine("Bulk", block.bulk));

  parts.push(`<div class="pf2e-separator"></div>`);
  parts.push(`<div class="pf2e-description">${renderInlineMarkdown(escapeHtml(block.description))}</div>`);

  return parts.join("\n");
}

function renderFeat(block: Pf2eFeat): string {
  const parts: string[] = [];

  parts.push(`<header class="pf2e-header">`);
  parts.push(`<h3 class="pf2e-name">${escapeHtml(block.name)} ${renderActionIcons(block.actions)}</h3>`);
  parts.push(`<span class="pf2e-level">Feat ${block.level}</span>`);
  parts.push(`</header>`);

  parts.push(renderTraits(block.traits));
  parts.push(`<div class="pf2e-separator"></div>`);

  if (block.prerequisites) parts.push(statLine("Prerequisites", block.prerequisites));
  if (block.frequency) parts.push(statLine("Frequency", block.frequency));
  if (block.trigger) parts.push(statLine("Trigger", block.trigger));
  if (block.requirements) parts.push(statLine("Requirements", block.requirements));

  parts.push(`<div class="pf2e-separator"></div>`);
  parts.push(`<div class="pf2e-description">${renderInlineMarkdown(escapeHtml(block.description))}</div>`);

  return parts.join("\n");
}

export function renderPf2eBlock(block: Pf2eBlock): string {
  switch (block.type) {
    case "creature":
      return renderCreature(block);
    case "spell":
      return renderSpell(block);
    case "item":
      return renderItem(block);
    case "feat":
      return renderFeat(block);
  }
}
