/**
 * Black Flag (Tales of the Valiant) Filter Schemas
 *
 * Based on the D&D 5e adapter, adapted for Black Flag's data model.
 * Black Flag is a D&D5e-derived system with similar creature taxonomy.
 */

import { z } from 'zod';

/**
 * Black Flag creature types — mirrors D&D5e taxonomy
 */
export const BlackFlagCreatureTypes = [
  'aberration',
  'beast',
  'celestial',
  'construct',
  'dragon',
  'elemental',
  'fey',
  'fiend',
  'giant',
  'humanoid',
  'monstrosity',
  'ooze',
  'plant',
  'undead',
] as const;

export type BlackFlagCreatureType = (typeof BlackFlagCreatureTypes)[number];

/**
 * Common creature sizes
 */
export const CreatureSizes = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'] as const;
export type CreatureSize = (typeof CreatureSizes)[number];

/**
 * Black Flag rarity values
 * In Black Flag, rarity uses localized labels. Mundane has a null/empty key.
 */
export const BlackFlagRarityValues = [
  'mundane',
  'common',
  'uncommon',
  'rare',
  'veryRare',
  'legendary',
  'artifact',
] as const;

/**
 * Black Flag filter schema
 * Mirrors D&D5e with addition of rarity filter
 */
export const BlackFlagFiltersSchema = z.object({
  challengeRating: z
    .union([
      z.number(),
      z.object({
        min: z.number().optional(),
        max: z.number().optional(),
      }),
    ])
    .optional(),
  creatureType: z.enum(BlackFlagCreatureTypes).optional(),
  size: z.enum(CreatureSizes).optional(),
  alignment: z.string().optional(),
  hasLegendaryActions: z.boolean().optional(),
  spellcaster: z.boolean().optional(),
  rarity: z.enum(BlackFlagRarityValues).optional(),
});

export type BlackFlagFilters = z.infer<typeof BlackFlagFiltersSchema>;

/**
 * Check if a creature matches Black Flag filters
 */
export function matchesBlackFlagFilters(creature: any, filters: BlackFlagFilters): boolean {
  // Challenge Rating filter
  if (filters.challengeRating !== undefined) {
    const cr = creature.systemData?.challengeRating;
    if (cr === undefined) return false;

    if (typeof filters.challengeRating === 'number') {
      if (cr !== filters.challengeRating) return false;
    } else {
      const min = filters.challengeRating.min ?? 0;
      const max = filters.challengeRating.max ?? 30;
      if (cr < min || cr > max) return false;
    }
  }

  // Creature Type filter
  if (filters.creatureType) {
    const creatureType = creature.systemData?.creatureType;
    if (!creatureType || creatureType.toLowerCase() !== filters.creatureType.toLowerCase()) {
      return false;
    }
  }

  // Size filter
  if (filters.size) {
    const size = creature.systemData?.size;
    if (!size || size.toLowerCase() !== filters.size.toLowerCase()) {
      return false;
    }
  }

  // Alignment filter
  if (filters.alignment) {
    const alignment = creature.systemData?.alignment;
    if (!alignment || !alignment.toLowerCase().includes(filters.alignment.toLowerCase())) {
      return false;
    }
  }

  // Legendary Actions filter
  if (filters.hasLegendaryActions !== undefined) {
    const hasLegendary = creature.systemData?.hasLegendaryActions || false;
    if (hasLegendary !== filters.hasLegendaryActions) {
      return false;
    }
  }

  // Spellcaster filter
  if (filters.spellcaster !== undefined) {
    const hasSpells = creature.systemData?.hasSpellcasting || false;
    if (hasSpells !== filters.spellcaster) {
      return false;
    }
  }

  // Rarity filter — treats null/empty as "mundane"
  if (filters.rarity) {
    const rarity = creature.systemData?.rarity;
    if (filters.rarity === 'mundane') {
      // Mundane = null, undefined, or empty string
      if (rarity && rarity !== '' && rarity !== 'mundane') return false;
    } else {
      if (!rarity || rarity.toLowerCase() !== filters.rarity.toLowerCase()) return false;
    }
  }

  return true;
}

/**
 * Generate human-readable description of Black Flag filters
 */
export function describeBlackFlagFilters(filters: BlackFlagFilters): string {
  const parts: string[] = [];

  if (filters.challengeRating !== undefined) {
    if (typeof filters.challengeRating === 'number') {
      parts.push(`CR ${filters.challengeRating}`);
    } else {
      const min = filters.challengeRating.min ?? 0;
      const max = filters.challengeRating.max ?? 30;
      parts.push(`CR ${min}-${max}`);
    }
  }

  if (filters.creatureType) parts.push(filters.creatureType);
  if (filters.size) parts.push(filters.size);
  if (filters.alignment) parts.push(filters.alignment);
  if (filters.hasLegendaryActions) parts.push('legendary');
  if (filters.spellcaster) parts.push('spellcaster');
  if (filters.rarity) parts.push(filters.rarity);

  return parts.length > 0 ? parts.join(', ') : 'no filters';
}

/**
 * Validate creature type
 */
export function isValidBlackFlagCreatureType(creatureType: string): boolean {
  return BlackFlagCreatureTypes.includes(creatureType as BlackFlagCreatureType);
}
