---
title: Session 1 - The Crimson Vault
watermark: Homebrew
---

# The Crimson Vault

The party enters through the northern passage. A faint red glow emanates from deeper within the cavern. The air smells of iron and old stone.

## The Guardian

At the end of the corridor stands a massive construct, its crystalline eyes tracking movement.

```pf2e-creature
name: Crimson Guardian
level: 6
traits: [uncommon, construct, mindless]
perception: "+14"
skills:
  athletics: "+16"
  intimidation: "+12"
hp: "95"
ac: "24"
fortitude: "+15"
reflex: "+10"
will: "+12"
speed: 25 ft.
melee:
  - name: fist
    actions: 1
    modifier: "+16"
    damage: 2d8+8 bludgeoning
  - name: slam
    actions: 2
    modifier: "+16"
    damage: 3d6+8 bludgeoning
    traits: [forceful, sweep]
abilities:
  - name: Crimson Fury
    actions: 2
    traits: [rage]
    description: The guardian's eyes glow red as it makes two fist Strikes against different targets.
  - name: Hardness
    description: The guardian has Hardness 8, reducing all damage by 8.
```

## Treasure

The guardian drops a powerful weapon when defeated.

```pf2e-item
name: Crimson Blade
level: 5
traits: [uncommon, evocation, magical]
price: 160 gp
usage: held in 1 hand
bulk: "1"
description: |
  This longsword has a blade that glows faintly red in darkness.

  **Activate** :a: command; **Effect** The blade erupts in flame, dealing an additional 1d6 fire damage on Strikes for 1 minute.
```

## Magical Defenses

The vault is protected by a ward spell.

```pf2e-spell
name: Crimson Ward
level: 3
traits: [uncommon, abjuration]
traditions: [arcane, occult]
cast: ":aa:"
range: 30 feet
area: 10-foot burst
duration: 1 hour
description: |
  You create a shimmering red barrier that alerts you when creatures enter. Any creature entering the area must succeed at a Will save or be briefly dazed.

  **Critical Success** The creature is unaffected.
  **Success** The creature is briefly disoriented but can act normally.
  **Failure** The creature is stunned 1.
  **Critical Failure** The creature is stunned 2 and the caster is alerted.
```

## NPC: The Vault Keeper

A ghostly figure guards the inner sanctum.

```pf2e-feat
name: Spectral Strike
level: 4
actions: 2
traits: [rare, ghost, divine]
prerequisites: undead creature
trigger: An enemy enters your reach
description: |
  You channel ethereal energy into a devastating strike that bypasses physical armor. Make a melee Strike. This Strike ignores the target's armor bonus to AC and deals an additional 1d6 negative damage.

  **Special** If the target is living, the negative damage increases to 2d6.
```

## Notes

The party should be **level 5-6** to handle this encounter. The Crimson Guardian uses :a: fist most rounds, saving :aa: slam for when multiple targets are adjacent. If reduced below 30 HP, it uses Crimson Fury :aa: every round.

> **GM Tip:** Play up the red glow, the grinding of stone joints. The guardian is *ancient* and *relentless*.
