/**
 * Black Flag Index Builder
 *
 * Builds enhanced creature index from Foundry compendiums.
 * Runs in Foundry's browser context (not Node.js).
 *
 * Black Flag is a D&D5e-derived system. Data paths are largely the same
 * but with some system-specific differences (e.g., rarity uses localized keys).
 */

import type { IndexBuilder, BlackFlagCreatureIndex } from '../types.js';

// Foundry browser globals (unavailable in Node.js TypeScript compilation)
declare const ui: any;

/**
 * Black Flag implementation of IndexBuilder
 */
export class BlackFlagIndexBuilder implements IndexBuilder {
  private moduleId: string;

  constructor(moduleId: string = 'foundry-mcp-bridge') {
    this.moduleId = moduleId;
  }

  getSystemId() {
    return 'black-flag' as const;
  }

  /**
   * Build enhanced creature index from compendium packs
   */
  async buildIndex(packs: any[], force = false): Promise<BlackFlagCreatureIndex[]> {
    const startTime = Date.now();
    let progressNotification: any = null;
    let totalErrors = 0;

    try {
      const actorPacks = packs.filter(pack => pack.metadata.type === 'Actor');
      const enhancedCreatures: BlackFlagCreatureIndex[] = [];

      console.log(
        `[${this.moduleId}] Starting Black Flag creature index build from ${actorPacks.length} packs...`
      );
      if (typeof ui !== 'undefined' && ui.notifications) {
        ui.notifications.info(
          `Starting Black Flag creature index build from ${actorPacks.length} packs...`
        );
      }

      for (let i = 0; i < actorPacks.length; i++) {
        const pack = actorPacks[i];
        const progressPercent = Math.round((i / actorPacks.length) * 100);

        if (i % 3 === 0 || pack.metadata.label.toLowerCase().includes('monster')) {
          if (progressNotification && typeof ui !== 'undefined') {
            progressNotification.remove();
          }
          if (typeof ui !== 'undefined' && ui.notifications) {
            progressNotification = ui.notifications.info(
              `Building Black Flag creature index... ${progressPercent}% (${i + 1}/${actorPacks.length}) Processing: ${pack.metadata.label}`
            );
          }
        }

        try {
          if (!pack.indexed) {
            await pack.getIndex({});
          }

          const packResult = await this.extractDataFromPack(pack);
          enhancedCreatures.push(...packResult.creatures);
          totalErrors += packResult.errors;

          if (i === 0 || (i + 1) % 5 === 0 || i === actorPacks.length - 1) {
            const totalCreaturesSoFar = enhancedCreatures.length;
            if (progressNotification && typeof ui !== 'undefined') {
              progressNotification.remove();
            }
            if (typeof ui !== 'undefined' && ui.notifications) {
              progressNotification = ui.notifications.info(
                `Index Progress: ${i + 1}/${actorPacks.length} packs complete, ${totalCreaturesSoFar} creatures indexed`
              );
            }
          }
        } catch (error) {
          console.warn(`[${this.moduleId}] Failed to process pack ${pack.metadata.label}:`, error);
          if (typeof ui !== 'undefined' && ui.notifications) {
            ui.notifications.warn(
              `Warning: Failed to index pack "${pack.metadata.label}" - continuing with other packs`
            );
          }
        }
      }

      if (progressNotification && typeof ui !== 'undefined') {
        progressNotification.remove();
      }

      const buildTimeSeconds = Math.round((Date.now() - startTime) / 1000);
      const errorText = totalErrors > 0 ? ` (${totalErrors} extraction errors)` : '';
      const successMessage = `Black Flag creature index complete! ${enhancedCreatures.length} creatures indexed from ${actorPacks.length} packs in ${buildTimeSeconds}s${errorText}`;

      console.log(`[${this.moduleId}] ${successMessage}`);
      if (typeof ui !== 'undefined' && ui.notifications) {
        ui.notifications.info(successMessage);
      }

      return enhancedCreatures;
    } catch (error) {
      if (progressNotification && typeof ui !== 'undefined') {
        progressNotification.remove();
      }

      const errorMessage = `Failed to build Black Flag creature index: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`[${this.moduleId}] ${errorMessage}`);
      if (typeof ui !== 'undefined' && ui.notifications) {
        ui.notifications.error(errorMessage);
      }

      throw error;
    }
  }

  /**
   * Extract creature data from a single compendium pack
   */
  async extractDataFromPack(
    pack: any
  ): Promise<{ creatures: BlackFlagCreatureIndex[]; errors: number }> {
    const creatures: BlackFlagCreatureIndex[] = [];
    let errors = 0;

    try {
      const documents = await pack.getDocuments();

      for (const doc of documents) {
        try {
          if (doc.type !== 'npc' && doc.type !== 'character') {
            continue;
          }

          const result = this.extractCreatureData(doc, pack);
          if (result) {
            creatures.push(result.creature);
            errors += result.errors;
          }
        } catch (error) {
          console.warn(
            `[${this.moduleId}] Failed to extract data from ${doc.name} in ${pack.metadata.label}:`,
            error
          );
          errors++;
        }
      }
    } catch (error) {
      console.warn(
        `[${this.moduleId}] Failed to load documents from ${pack.metadata.label}:`,
        error
      );
      errors++;
    }

    return { creatures, errors };
  }

  /**
   * Extract Black Flag creature data from a single document
   *
   * Black Flag is D&D5e-derived — uses the same core data structure
   * but with system-specific data paths for some fields.
   */
  extractCreatureData(
    doc: any,
    pack: any
  ): { creature: BlackFlagCreatureIndex; errors: number } | null {
    try {
      const system = doc.system || {};

      // ── Challenge Rating ──────────────────────────────────
      // Black Flag uses D&D5e-compatible CR paths
      let challengeRating =
        system.details?.cr ??
        system.details?.cr?.value ??
        system.cr?.value ??
        system.cr ??
        system.attributes?.cr?.value ??
        system.attributes?.cr ??
        0;

      if (challengeRating === null || challengeRating === undefined) {
        challengeRating = 0;
      }

      if (typeof challengeRating === 'string') {
        if (challengeRating === '1/8') challengeRating = 0.125;
        else if (challengeRating === '1/4') challengeRating = 0.25;
        else if (challengeRating === '1/2') challengeRating = 0.5;
        else challengeRating = parseFloat(challengeRating) || 0;
      }

      challengeRating = Number(challengeRating) || 0;

      // ── Creature Type ──────────────────────────────────
      let creatureType =
        system.details?.type?.value ??
        system.details?.type ??
        system.type?.value ??
        system.type ??
        system.race?.value ??
        system.race ??
        system.details?.race ??
        'unknown';

      if (creatureType === null || creatureType === undefined || creatureType === '') {
        creatureType = 'unknown';
      }

      if (typeof creatureType !== 'string') {
        creatureType = String(creatureType || 'unknown');
      }

      // ── Size ────────────────────────────────────────────
      let size =
        system.traits?.size?.value ||
        system.traits?.size ||
        system.size?.value ||
        system.size ||
        system.details?.size ||
        'medium';

      if (typeof size !== 'string') {
        size = String(size || 'medium');
      }

      // ── Hit Points ──────────────────────────────────────
      const hitPoints =
        system.attributes?.hp?.max ||
        system.hp?.max ||
        system.attributes?.hp?.value ||
        system.hp?.value ||
        system.health?.max ||
        system.health?.value ||
        0;

      // ── Armor Class ─────────────────────────────────────
      const armorClass =
        system.attributes?.ac?.value ||
        system.ac?.value ||
        system.attributes?.ac ||
        system.ac ||
        system.armor?.value ||
        system.armor ||
        10;

      // ── Alignment ───────────────────────────────────────
      let alignment =
        system.details?.alignment?.value ||
        system.details?.alignment ||
        system.alignment?.value ||
        system.alignment ||
        'unaligned';

      if (typeof alignment !== 'string') {
        alignment = String(alignment || 'unaligned');
      }

      // ── Rarity (Black Flag specific) ────────────────────
      // Black Flag rarity uses localized keys. Mundane = null/empty.
      let rarity: string | undefined;
      const rawRarity = system.details?.rarity ?? system.rarity;
      if (rawRarity) {
        if (typeof rawRarity === 'object' && rawRarity !== null && 'value' in rawRarity) {
          rarity = String(rawRarity.value || '');
        } else if (typeof rawRarity === 'string') {
          rarity = rawRarity;
        } else if (typeof rawRarity === 'object') {
          rarity = (rawRarity as any).value ?? (rawRarity as any).localized ?? '';
        }
        if (rarity) rarity = rarity.toLowerCase();
      }

      // ── Derived Flags ──────────────────────────────────
      const hasSpellcasting = !!(
        system.spells ||
        system.attributes?.spellcasting ||
        (system.details?.spellLevel && system.details.spellLevel > 0) ||
        (system.resources?.spell && system.resources.spell.max > 0) ||
        system.spellcasting ||
        system.traits?.spellcasting ||
        system.details?.spellcaster
      );

      const hasLegendaryActions = !!(
        system.resources?.legact ||
        system.legendary ||
        (system.resources?.legres && system.resources.legres.value > 0) ||
        system.details?.legendary ||
        system.traits?.legendary ||
        (system.resources?.legendary && system.resources.legendary.max > 0)
      );

      const level: number | undefined =
        system.details?.level?.value || system.details?.level || system.level || undefined;

      // ── Build Index Entry ───────────────────────────────
      const systemData: any = {
        challengeRating,
        creatureType: creatureType.toLowerCase(),
        size: size.toLowerCase(),
        alignment: alignment.toLowerCase(),
        hasSpellcasting,
        hasLegendaryActions,
        hitPoints,
        armorClass,
      };
      if (level !== undefined) ((systemData as any).level as any) = level;
      if (rarity) ((systemData as any).rarity as any) = rarity;

      return {
        creature: {
          id: doc._id,
          name: doc.name,
          type: doc.type,
          packName: pack.metadata.id,
          packLabel: pack.metadata.label,
          img: doc.img,
          system: 'black-flag',
          systemData: systemData as any,
        },
        errors: 0,
      };
    } catch (error) {
      console.warn(`[${this.moduleId}] Failed to extract Black Flag data from ${doc.name}:`, error);

      return {
        creature: {
          id: doc._id,
          name: doc.name,
          type: doc.type,
          packName: pack.metadata.id,
          packLabel: pack.metadata.label,
          img: doc.img || '',
          system: 'black-flag',
          systemData: {
            challengeRating: 0,
            creatureType: 'unknown',
            size: 'medium',
            hitPoints: 1,
            armorClass: 10,
            hasSpellcasting: false,
            hasLegendaryActions: false,
            alignment: 'unaligned',
          },
        },
        errors: 1,
      };
    }
  }
}
