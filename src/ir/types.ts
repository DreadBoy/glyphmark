// Intermediate Representation types for PF2e content blocks

export interface Pf2eCreature {
  type: "creature";
  name: string;
  level: number;
  traits?: string[];
  perception?: string;
  languages?: string;
  skills?: Record<string, string>;
  hp: string;
  ac: string;
  fortitude?: string;
  reflex?: string;
  will?: string;
  speed?: string;
  immunities?: string[];
  resistances?: string;
  weaknesses?: string;
  melee?: Pf2eAttack[];
  ranged?: Pf2eAttack[];
  abilities?: Pf2eAbility[];
}

export interface Pf2eAttack {
  name: string;
  actions: number;
  modifier: string;
  damage: string;
  traits?: string[];
}

export interface Pf2eAbility {
  name: string;
  actions?: number;
  traits?: string[];
  description: string;
}

export interface Pf2eSpell {
  type: "spell";
  name: string;
  level: number;
  traits?: string[];
  traditions?: string[];
  cast?: string;
  range?: string;
  area?: string;
  targets?: string;
  duration?: string;
  defense?: string;
  description: string;
}

export interface Pf2eItem {
  type: "item";
  name: string;
  level: number;
  traits?: string[];
  price?: string;
  usage?: string;
  bulk?: string;
  description: string;
}

export interface Pf2eFeat {
  type: "feat";
  name: string;
  level: number;
  actions?: number;
  traits?: string[];
  prerequisites?: string;
  frequency?: string;
  trigger?: string;
  requirements?: string;
  description: string;
}

export type Pf2eBlock = Pf2eCreature | Pf2eSpell | Pf2eItem | Pf2eFeat;

export interface DocumentMeta {
  title?: string;
  watermark?: string;
  pageNumbers?: boolean;
}
