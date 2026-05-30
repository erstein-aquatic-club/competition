// Garde anti-régression (§344 Lot 5) — les chemins réseau qui BLOQUENT l'UI du
// flux mésocycle doivent rester bornés par `withTimeout` (invariant §298/§311).
// C'est un scan statique : il échoue si quelqu'un retire un wrap `withTimeout`
// (ré-introduisant un spinner infini sur connexion dégradée).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(
  fileURLToPath(new URL('../strength-mesocycles.ts', import.meta.url)),
  'utf8',
);

/** Corps d'une fonction exportée : de sa déclaration au prochain `export` racine. */
function bodyOf(name: string): string {
  const start = src.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `fonction ${name} introuvable`);
  const rest = src.slice(start + 1);
  const nextExport = rest.indexOf('\nexport ');
  return nextExport === -1 ? rest : rest.slice(0, nextExport);
}

describe('reads/RPC mésocycle bornés withTimeout (invariant §298/§311)', () => {
  const CRITICAL = [
    'applyMesocycle',
    'revertMesocycle',
    'getMesocycle',
    'getActiveMesocycle',
    'listMesocycles',
    'getMesocycleSessionsContent',
  ];

  for (const fn of CRITICAL) {
    it(`${fn} enveloppe son appel Supabase dans withTimeout`, () => {
      assert.ok(
        bodyOf(fn).includes('withTimeout('),
        `${fn} doit borner son appel réseau (withTimeout) — sinon spinner infini`,
      );
    });
  }

  it('aucune RPC apply/revert awaitée HORS withTimeout', () => {
    assert.ok(
      !/await\s+supabase\s*\.rpc\(\s*'apply_strength_mesocycle'/.test(src),
      'apply_strength_mesocycle ne doit pas être awaité directement (hors withTimeout)',
    );
    assert.ok(
      !/await\s+supabase\s*\.rpc\(\s*'revert_strength_mesocycle'/.test(src),
      'revert_strength_mesocycle ne doit pas être awaité directement (hors withTimeout)',
    );
  });
});
