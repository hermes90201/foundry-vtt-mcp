/**
 * Black Flag (Tales of the Valiant) System Adapter
 *
 * Implements SystemAdapter interface for Black Flag support.
 * Black Flag is a D&D5e-derived system with compatible data models.
 */

import type {
  SystemAdapter,
  SystemMetadata,
  SystemCreatureIndex,
  BlackFlagCreatureIndex,
} from '../types.js';
import {
  BlackFlagFiltersSchema,
  matchesBlackFlagFilters,
  describeBlackFlagFilters,
  type BlackFlagFilters,
} from './filters.js';

/**
 * Black Flag system adapter
 */
export class BlackFlagAdapter implements SystemAdapter {
  getMetadata(): SystemMetadata {
    return {
      id: 'black-flag',
      name: 'black-flag',
      displayName: 'Black Flag (Tales of the Valiant)',
      version: '1.0.0',
      description:
        'Support for Black Flag Roleplaying (Tales of the Valiant) with Challenge Rating, creature types, and legendary actions',
      supportedFeatures: {
        creatureIndex: true,
        characterStats: true,
        spellcasting: true,
        powerLevel: true, // Uses Challenge Rating
      },
    };
  }

  canHandle(systemId: string): boolean {
    return systemId.toLowerCase() === 'black-flag';
  }

  extractCreatureData(
    _doc: any,
    _pack: any
  ): { creature: SystemCreatureIndex; errors: number } | null {
    // Delegated to BlackFlagIndexBuilder (runs in browser context)
    throw new Error('extractCreatureData should be called from BlackFlagIndexBuilder');
  }

  getFilterSchema() {
    return BlackFlagFiltersSchema;
  }

  matchesFilters(creature: SystemCreatureIndex, filters: Record<string, any>): boolean {
    const validated = BlackFlagFiltersSchema.safeParse(filters);
    if (!validated.success) {
      return false;
    }
    return matchesBlackFlagFilters(creature, validated.data as BlackFlagFilters);
  }

  /**
   * Black Flag data paths — mirror D&D5e with system-specific differences.
   * Returns null for paths that don't exist in this system.
   */
  getDataPaths(): Record<string, string | null> {
    return {
      challengeRating: 'system.details.cr',
      creatureType: 'system.details.type.value',
      size: 'system.traits.size',
      alignment: 'system.details.alignment',
      level: 'system.details.level.value',
      hitPoints: 'system.attributes.hp',
      armorClass: 'system.attributes.ac.value',
      abilities: 'system.abilities',
      skills: 'system.skills',
      spells: 'system.spells',
      legendaryActions: 'system.resources.legact',
      legendaryResistances: 'system.resources.legres',
      // Black Flag specific
      rarity: 'system.details.rarity',
      // PF2e paths don't exist in Black Flag
      perception: null,
      saves: null,
    };
  }

  formatCreatureForList(creature: SystemCreatureIndex): any {
    const bfCreature = creature as BlackFlagCreatureIndex;
    const formatted: any = {
      id: creature.id,
      name: creature.name,
      type: creature.type,
      pack: {
        id: creature.packName,
        label: creature.packLabel,
      },
    };

    if (bfCreature.systemData) {
      const stats: any = {};

      if (bfCreature.systemData.challengeRating !== undefined) {
        stats.challengeRating = bfCreature.systemData.challengeRating;
      }

      if (bfCreature.systemData.creatureType) {
        stats.creatureType = bfCreature.systemData.creatureType;
      }

      if (bfCreature.systemData.size) {
        stats.size = bfCreature.systemData.size;
      }

      if (bfCreature.systemData.alignment) {
        stats.alignment = bfCreature.systemData.alignment;
      }

      if (bfCreature.systemData.hitPoints) {
        stats.hitPoints = bfCreature.systemData.hitPoints;
      }

      if (bfCreature.systemData.armorClass) {
        stats.armorClass = bfCreature.systemData.armorClass;
      }

      if (bfCreature.systemData.hasLegendaryActions) {
        stats.hasLegendaryActions = true;
      }

      if (bfCreature.systemData.hasSpellcasting) {
        stats.spellcaster = true;
      }

      if (bfCreature.systemData.rarity) {
        stats.rarity = bfCreature.systemData.rarity;
      }

      if (Object.keys(stats).length > 0) {
        formatted.stats = stats;
      }
    }

    if (creature.img) {
      formatted.hasImage = true;
    }

    return formatted;
  }

  formatCreatureForDetails(creature: SystemCreatureIndex): any {
    const bfCreature = creature as BlackFlagCreatureIndex;
    const formatted = this.formatCreatureForList(creature);

    if (bfCreature.systemData) {
      formatted.detailedStats = {
        challengeRating: bfCreature.systemData.challengeRating,
        creatureType: bfCreature.systemData.creatureType,
        size: bfCreature.systemData.size,
        alignment: bfCreature.systemData.alignment,
        level: bfCreature.systemData.level,
        hitPoints: bfCreature.systemData.hitPoints,
        armorClass: bfCreature.systemData.armorClass,
        hasSpellcasting: bfCreature.systemData.hasSpellcasting,
        hasLegendaryActions: bfCreature.systemData.hasLegendaryActions,
        rarity: bfCreature.systemData.rarity,
      };
    }

    if (creature.img) {
      formatted.img = creature.img;
    }

    return formatted;
  }

  describeFilters(filters: Record<string, any>): string {
    const validated = BlackFlagFiltersSchema.safeParse(filters);
    if (!validated.success) {
      return 'invalid filters';
    }
    return describeBlackFlagFilters(validated.data as BlackFlagFilters);
  }

  getPowerLevel(creature: SystemCreatureIndex): number | undefined {
    const bfCreature = creature as BlackFlagCreatureIndex;

    if (bfCreature.systemData?.challengeRating !== undefined) {
      return bfCreature.systemData.challengeRating;
    }

    if (bfCreature.systemData?.level !== undefined) {
      return bfCreature.systemData.level;
    }

    return undefined;
  }

  /**
   * Extract character statistics from actor data
   * Mirrors D&D5e extraction with Black Flag data paths
   */
  extractCharacterStats(actorData: any): any {
    const system = actorData.system || {};
    const stats: any = {};

    stats.name = actorData.name;
    stats.type = actorData.type;

    // Challenge Rating or Level
    const cr = system.details?.cr ?? system.details?.cr?.value ?? system.cr;
    if (cr !== undefined && cr !== null) {
      stats.challengeRating = Number(cr);
    }

    const level = system.details?.level?.value ?? system.details?.level ?? system.level;
    if (level !== undefined && level !== null) {
      stats.level = Number(level);
    }

    // Hit Points
    const hp = system.attributes?.hp;
    if (hp) {
      stats.hitPoints = {
        current: hp.value ?? 0,
        max: hp.max ?? 0,
        temp: hp.temp ?? 0,
      };
    }

    // Armor Class
    const ac = system.attributes?.ac?.value ?? system.attributes?.ac;
    if (ac !== undefined) {
      stats.armorClass = ac;
    }

    // Abilities (STR, DEX, CON, INT, WIS, CHA)
    if (system.abilities) {
      stats.abilities = {};
      for (const [key, ability] of Object.entries(system.abilities)) {
        const abilityData = ability as any;
        stats.abilities[key] = {
          value: abilityData.value ?? 10,
          modifier: abilityData.mod ?? 0,
        };
      }
    }

    // Skills
    if (system.skills) {
      stats.skills = {};
      for (const [key, skill] of Object.entries(system.skills)) {
        const skillData = skill as any;
        stats.skills[key] = {
          value: skillData.value ?? 0,
          modifier: skillData.total ?? skillData.mod ?? 0,
          proficient: skillData.proficient ?? 0,
        };
      }
    }

    // Creature-specific info
    if (actorData.type === 'npc') {
      const creatureType = system.details?.type?.value ?? system.details?.type;
      if (creatureType) {
        stats.creatureType = creatureType;
      }

      const size = system.traits?.size?.value ?? system.traits?.size ?? system.size;
      if (size) {
        stats.size = size;
      }

      const alignment = system.details?.alignment?.value ?? system.details?.alignment;
      if (alignment) {
        stats.alignment = alignment;
      }

      const legact = system.resources?.legact;
      if (legact) {
        stats.legendaryActions = {
          available: legact.value ?? 0,
          max: legact.max ?? 0,
        };
      }

      // Rarity
      const rawRarity = system.details?.rarity ?? system.rarity;
      if (rawRarity) {
        if (typeof rawRarity === 'object' && rawRarity !== null && 'value' in rawRarity) {
          stats.rarity = String((rawRarity as any).value || '');
        } else if (typeof rawRarity === 'string') {
          stats.rarity = rawRarity;
        }
      }
    }

    // Spellcasting
    const hasSpells = !!(
      system.spells ||
      system.attributes?.spellcasting ||
      (system.details?.spellLevel && system.details.spellLevel > 0)
    );
    if (hasSpells) {
      stats.spellcasting = {
        hasSpells: true,
        spellLevel: system.details?.spellLevel ?? 0,
      };
    }

    return stats;
  }
}
