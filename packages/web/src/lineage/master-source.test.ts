import { afterEach, describe, expect, it, vi } from 'vitest';
import { StaleMasterError, forgetMaster, loadMaster, requireFresh } from './master-source';

/**
 * The shared game-data loader, and the staleness rule that replaced a 409.
 *
 * `explain-pair` used to answer `409 STALE_MASTER_HASH` when the extract the
 * caller last saw was not the one the server was serving. With the computation
 * moved into the tab (T16), the same disagreement is now the page's to notice,
 * and it is noticed here.
 */

const HASH = '0451b16eebb0fc7cb28461f43ab780d963838718f5b4a9cf1fdd7214cf273ecd';

const doc = {
  hash: HASH,
  tables: {
    successionRelation: { keys: ['relation_type', 'relation_point'], cols: [[1], [5]] },
    successionRelationMember: { keys: ['relation_type', 'chara_id'], cols: [[1], [1006]] },
    cardData: { keys: ['id', 'chara_id'], cols: [[100601], [1006]] },
    winsSaddle: { keys: ['id', 'group_id', 'win_saddle_type'], cols: [[1], [1], [1]] },
    careerRank: { keys: ['id', 'min_value', 'max_value'], cols: [[1], [0], [99999]] },
    relationRank: { keys: ['relation_rank', 'rank_value_min', 'rank_value_max'], cols: [[1], [0], [999]] },
    textData: { keys: ['category', 'idx', 'text'], cols: [[6], [1006], ['Oguri Cap']] },
    successionFactor: {
      keys: ['factor_id', 'factor_group_id', 'rarity', 'factor_type'],
      cols: [[101], [1], [1], [1]],
    },
  },
};

const ok = () =>
  vi.fn(async () => new Response(JSON.stringify(doc), { status: 200 })) as unknown as typeof fetch;

afterEach(() => {
  forgetMaster();
  vi.restoreAllMocks();
});

describe('loading the game data', () => {
  it('fetches once and reuses it', async () => {
    // A user narrowing a filter explains a pair repeatedly. Refetching and
    // rebuilding the Maps each time would be work with nothing to show for it.
    const fetchImpl = ok();
    const first = await loadMaster(fetchImpl);
    const second = await loadMaster(fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(second.master).toBe(first.master);
    expect(first.hash).toBe(HASH);
  });

  it('shares ONE fetch between two callers racing a cold start', async () => {
    const fetchImpl = ok();
    const [a, b] = await Promise.all([loadMaster(fetchImpl), loadMaster(fetchImpl)]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(a.master).toBe(b.master);
  });

  it('lets the next attempt retry after a failure', async () => {
    // A dropped connection must not brick the page for the rest of the session.
    // Caching the rejected promise would do exactly that.
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(new Response(JSON.stringify(doc), { status: 200 })) as unknown as typeof fetch;

    await expect(loadMaster(fetchImpl)).rejects.toThrow('network down');
    await expect(loadMaster(fetchImpl)).resolves.toMatchObject({ hash: HASH });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('names the file when the server will not serve it', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 404 })) as unknown as typeof fetch;
    await expect(loadMaster(fetchImpl)).rejects.toThrow(/404 from \/master\.json/);
  });
});

describe('the staleness rule that replaced 409 STALE_MASTER_HASH', () => {
  it('passes when the page and the roster read the same extract', async () => {
    const source = await loadMaster(ok());
    expect(() => requireFresh(source, HASH)).not.toThrow();
  });

  it('refuses rather than reconciles when they differ', async () => {
    // A row would carry names from one version of the game and numbers from
    // another, and nothing on screen could say so.
    const source = await loadMaster(ok());
    expect(() => requireFresh(source, 'deadbeefdeadbeef')).toThrow(StaleMasterError);
  });

  it('tells the user both sides and what to do', async () => {
    const source = await loadMaster(ok());
    try {
      requireFresh(source, 'deadbeefdeadbeef');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(StaleMasterError);
      const message = (error as StaleMasterError).message;
      expect(message).toContain('0451b16e');
      expect(message).toContain('deadbeef');
      expect(message).toMatch(/Reload/);
    }
  });

  it('is catchable as itself, which is what drives the banner', async () => {
    // App.tsx switches on `instanceof StaleMasterError` where it used to switch
    // on an ApiError code. A plain Error here would silently stop showing the
    // "game data changed" banner and surface a raw message instead.
    const source = await loadMaster(ok());
    const thrown = (() => {
      try {
        requireFresh(source, 'other');
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(thrown).toBeInstanceOf(StaleMasterError);
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as StaleMasterError).name).toBe('StaleMasterError');
  });
});
