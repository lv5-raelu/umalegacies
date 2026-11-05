import { describe, expect, it } from 'vitest';
import {
  base32,
  decodeLz4,
  fetchMasterMdb,
  fetchWithRetry,
  SourceUnavailableError,
  genericUrl,
  hnameOf,
  isLz4Frame,
  isSqlite,
  liveMasterName,
  manifestEntries,
  manifestUrl,
  parseBsv,
  rootManifestUrl,
  USER_AGENT,
} from './game-cdn.js';
import {
  inputs,
  LZ4_CASES,
  MASTER_MANIFEST,
  PLATFORM_MANIFEST,
  ROOT_MANIFEST,
} from './game-cdn.fixtures.js';

/**
 * The master.mdb fetcher, without the network.
 *
 * Everything that can be wrong here is wrong SILENTLY at the byte level -- a
 * decoder that drops one byte of a 17 MB database produces a file that is
 * still 17 MB -- so every check compares against something this code did not
 * produce: frames the real `lz4` tool wrote, manifests the real CDN served, and
 * names the CDN accepted.
 */

const bytes = (b64: string): Uint8Array => new Uint8Array(Buffer.from(b64, 'base64'));

describe('LZ4, against frames the real lz4 tool wrote', () => {
  const originals = inputs();

  it.each(LZ4_CASES)('$input ($flags)', ({ input, frame }) => {
    const decoded = decodeLz4(bytes(frame));
    const original = originals[input] as Uint8Array;
    expect(decoded.length).toBe(original.length);
    // Byte for byte. A length check alone passes a decoder that writes the
    // right number of wrong bytes.
    expect(Buffer.from(decoded).equals(Buffer.from(original))).toBe(true);
  });

  it('decodes linked blocks, where block 2 is mostly references into block 1', () => {
    // The case a decoder that restarts its output per block gets wrong. In
    // this frame block 2 is 27 bytes standing for ~4 KB of output.
    const linked = LZ4_CASES.find((c) => c.flags.includes('-BD'));
    const frame = bytes(linked?.frame as string);
    expect((frame[4] as number) & 0x20).toBe(0); // B.Indep clear: blocks ARE linked
    expect(decodeLz4(frame).length).toBe(70_000);
  });

  it('decodes the size-prefixed raw block a manifest may use instead of a frame', () => {
    // A little-endian u32 of the decompressed size, then a raw block. Built by
    // hand: one sequence, 5 literals, then a 7-byte match at offset 5.
    //   token 0x53 = 5 literals, match nibble 3 (+4 = 7)
    const raw = Uint8Array.from([12, 0, 0, 0, 0x53, ...new TextEncoder().encode('hello'), 5, 0]);
    expect(new TextDecoder().decode(decodeLz4(raw))).toBe('hellohellohe');
  });

  it('refuses a match that reaches before the start of the output', () => {
    // A corrupt offset must fail loudly. Reading out of bounds would yield
    // `undefined` bytes, which a typed array silently writes as 0.
    const bad = Uint8Array.from([4, 0, 0, 0, 0x10, 0x41, 9, 0]);
    expect(() => decodeLz4(bad)).toThrow(/before the start/);
  });

  it('refuses a frame cut off before its end mark', () => {
    const frame = bytes(LZ4_CASES[2]?.frame as string);
    expect(() => decodeLz4(frame.subarray(0, frame.length - 10))).toThrow();
  });

  it('knows a frame by its magic', () => {
    expect(isLz4Frame(Uint8Array.from([0x04, 0x22, 0x4d, 0x18, 0]))).toBe(true);
    expect(isLz4Frame(Uint8Array.from([0x04, 0x22, 0x4d]))).toBe(false);
    expect(isLz4Frame(new TextEncoder().encode('SQLite format 3\0'))).toBe(false);
  });
});

describe('base32, against RFC 4648', () => {
  // Section 10's test vectors, minus the padding the CDN names omit.
  it.each([
    ['', ''],
    ['f', 'MY'],
    ['fo', 'MZXQ'],
    ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI'],
  ])('%j -> %s', (input, expected) => {
    expect(base32(new TextEncoder().encode(input))).toBe(expected);
  });
});

describe('the real manifests, and the names the CDN accepted', () => {
  const root = manifestEntries(parseBsv(decodeLz4(bytes(ROOT_MANIFEST))));
  const platform = manifestEntries(parseBsv(decodeLz4(bytes(PLATFORM_MANIFEST))));
  const master = manifestEntries(parseBsv(decodeLz4(bytes(MASTER_MANIFEST))));

  it('finds a Windows platform in the root manifest', () => {
    expect(root.map((e) => e.name)).toContain('Windows');
  });

  /*
   * THE EXTERNAL CHECK ON THE HASHING. These three names are what the live CDN
   * returned 200 for on 2026-11-03; a wrong hash is a 404. So if `hnameOf`
   * reproduces them from the manifests, it is right by the CDN's definition,
   * not by ours.
   */
  it('derives the name the CDN served the Windows manifest under', () => {
    expect(root.find((e) => e.name === 'Windows')?.hname).toBe('A3PXELKPN43JA7JPK2KJEYN2WGPCBVCK');
  });

  it('derives the name the CDN served the master bundle under', () => {
    expect(platform.find((e) => e.name.toLowerCase() === 'master')?.hname).toBe(
      'ENWUOCUYG7B5ZRUJNUYUCTV7PB5AJD2G',
    );
  });

  it('derives the name the CDN served master.mdb itself under', () => {
    const mdb = master.find((e) => e.name.toLowerCase().includes('master.mdb'));
    expect(mdb?.hname).toBe('HBKZJDH2HQXIKJSLFSFONM3VSF6M4V7A');
  });

  it('keeps 64-bit checksums exact, which a Number would round', () => {
    // A checksum above 2^53 survives only as a BigInt, and one rounded bit is a
    // different hash and a 404.
    const all = [...root, ...platform, ...master];
    expect(all.every((e) => typeof e.checksum === 'bigint')).toBe(true);
    expect(all.some((e) => e.checksum > BigInt(Number.MAX_SAFE_INTEGER))).toBe(true);
  });

  it('builds the URLs from the first two letters of the name', () => {
    expect(manifestUrl('A3PXELKPN43JA7JPK2KJEYN2WGPCBVCK')).toMatch(
      /\/dl\/vertical\/resources\/Manifest\/A3\/A3PXELKPN43JA7JPK2KJEYN2WGPCBVCK$/,
    );
    expect(genericUrl('HBKZ')).toMatch(/\/resources\/Generic\/HB\/HBKZ$/);
    expect(rootManifestUrl('10008400')).toMatch(
      /\/dl\/vertical\/10008400\/manifests\/manifestdat\/root\.manifest\.bsv\.lz4$/,
    );
  });

  it('refuses something that is not a BSV table', () => {
    expect(() => parseBsv(new TextEncoder().encode('not a manifest'))).toThrow(/Not a BSV/);
  });
});

describe('the whole chain, against a fake CDN', () => {
  /** An LZ4 frame holding `data` as one stored (uncompressed) block. */
  const storedFrame = (data: Uint8Array): Uint8Array => {
    const size = new DataView(new ArrayBuffer(4));
    size.setUint32(0, (data.length | 0x80000000) >>> 0, true);
    return Uint8Array.from([
      0x04, 0x22, 0x4d, 0x18, // magic
      0x60, 0x40, 0x00, // FLG (version 01, independent), BD, header checksum
      ...new Uint8Array(size.buffer),
      ...data,
      0, 0, 0, 0, // end mark
    ]);
  };
  const fakeDatabase = new TextEncoder().encode('SQLite format 3\0' + 'x'.repeat(100));

  /** Serves the real manifests, and `last` for the master.mdb itself. */
  const cdn = (last: Uint8Array | number) => {
    const seen: Array<{ url: string; agent: string | null }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url, agent: new Headers(init.headers).get('User-Agent') });
      const body = url.includes('root.manifest')
        ? bytes(ROOT_MANIFEST)
        : url.includes('A3PXELKPN43JA7JPK2KJEYN2WGPCBVCK')
          ? bytes(PLATFORM_MANIFEST)
          : url.includes('ENWUOCUYG7B5ZRUJNUYUCTV7PB5AJD2G')
            ? bytes(MASTER_MANIFEST)
            : url.includes('HBKZJDH2HQXIKJSLFSFONM3VSF6M4V7A')
              ? last
              : 404;
      if (typeof body === 'number') return new Response(null, { status: body });
      return new Response(body);
    }) as unknown as typeof fetch;
    return { fetchImpl, seen };
  };

  it('walks root -> Windows -> master -> master.mdb and returns the database', async () => {
    const { fetchImpl, seen } = cdn(storedFrame(fakeDatabase));
    const result = await fetchMasterMdb('10008400', fetchImpl);
    expect(Buffer.from(result.bytes).equals(Buffer.from(fakeDatabase))).toBe(true);
    expect(seen).toHaveLength(4);
    expect(result.path).toEqual(seen.map((s) => s.url));
  });

  it('reports the content address of what it downloaded', async () => {
    const { fetchImpl } = cdn(storedFrame(fakeDatabase));
    const result = await fetchMasterMdb('10008400', fetchImpl);
    expect(result.cdnName).toBe('HBKZJDH2HQXIKJSLFSFONM3VSF6M4V7A');
  });

  it('can name the live master.mdb without downloading it', async () => {
    // What the daily check runs. Three manifests, under a kilobyte, and the
    // 5 MB file is never requested -- if it were, this would cost a full
    // download every day the game did not change.
    const { fetchImpl, seen } = cdn(storedFrame(fakeDatabase));
    const live = await liveMasterName('10008400', fetchImpl);
    expect(live.cdnName).toBe('HBKZJDH2HQXIKJSLFSFONM3VSF6M4V7A');
    expect(seen).toHaveLength(3);
    expect(seen.some((s) => s.url.includes('/Generic/'))).toBe(false);
  });

  it('says who it is, and it is not the game client', async () => {
    const { fetchImpl, seen } = cdn(storedFrame(fakeDatabase));
    await fetchMasterMdb('10008400', fetchImpl);
    expect(seen.every((s) => s.agent === USER_AGENT)).toBe(true);
    expect(USER_AGENT).not.toMatch(/Unity/i);
    // And no personal contact detail: the project's repository identifies it.
    expect(USER_AGENT).not.toMatch(/@/);
  });

  it('refuses a download that is not a SQLite database', async () => {
    const { fetchImpl } = cdn(storedFrame(new TextEncoder().encode('<html>gateway timeout</html>')));
    await expect(fetchMasterMdb('10008400', fetchImpl)).rejects.toThrow(/not a SQLite database/);
  });

  it('names the URL when a hop fails', async () => {
    const { fetchImpl } = cdn(404);
    await expect(fetchMasterMdb('10008400', fetchImpl)).rejects.toThrow(/HTTP 404 from .*HBKZ/);
  });

  it('names what the manifest held when an entry is missing', async () => {
    // What a format change after a patch would look like: say what IS there.
    const empty = (async (url: string) =>
      new Response(url.includes('root.manifest') ? bytes(MASTER_MANIFEST) : null)) as unknown as typeof fetch;
    await expect(fetchMasterMdb('10008400', empty)).rejects.toThrow(/No 'Windows' platform entry.*holds:/);
  });

  it('knows SQLite by its sixteen-byte header, NUL included', () => {
    expect(isSqlite(fakeDatabase)).toBe(true);
    expect(isSqlite(new TextEncoder().encode('SQLite format 3!'))).toBe(false);
    expect(isSqlite(new Uint8Array(8))).toBe(false);
  });
});

describe('a source that is down for a moment', () => {
  it('retries a connection that never answered, and returns the answer when it comes', async () => {
    let calls = 0;
    const flaky = (async () => {
      calls++;
      if (calls < 3) throw new TypeError('fetch failed');
      return new Response('ok');
    }) as unknown as typeof fetch;
    const response = await fetchWithRetry(flaky, 'https://example.test/', {}, { pauseMs: 1 });
    expect(await response.text()).toBe('ok');
    expect(calls).toBe(3);
  });

  it('retries a 5xx too, and returns the answer when the server recovers', async () => {
    // uma.moe answered 521 on a scheduled run and was fine minutes later.
    let calls = 0;
    const recovering = (async () => {
      calls++;
      return calls < 3 ? new Response(null, { status: 521 }) : new Response('ok');
    }) as unknown as typeof fetch;
    const response = await fetchWithRetry(recovering, 'https://example.test/', {}, { pauseMs: 1 });
    expect(await response.text()).toBe('ok');
    expect(calls).toBe(3);
  });

  it('gives up after its attempts, says how many it made, and says the source was down', async () => {
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const failure = fetchWithRetry(down, 'https://example.test/', {}, { attempts: 3, pauseMs: 1 });
    await expect(failure).rejects.toThrow(/fetch failed .*3 attempts/);
    await expect(failure).rejects.toBeInstanceOf(SourceUnavailableError);
  });

  it('gives up on a server that stays broken, naming the status it kept answering', async () => {
    let calls = 0;
    const broken = (async () => {
      calls++;
      return new Response(null, { status: 521 });
    }) as unknown as typeof fetch;
    const failure = fetchWithRetry(broken, 'https://example.test/', {}, { attempts: 4, pauseMs: 1 });
    await expect(failure).rejects.toThrow(/HTTP 521 .*4 attempts/);
    await expect(failure).rejects.toBeInstanceOf(SourceUnavailableError);
    expect(calls).toBe(4);
  });

  it('never retries a 4xx, because a 404 is an answer', async () => {
    // Asking a server again after it has said no will not change its mind, and
    // is the kind of thing that gets a client blocked. It also means the source
    // changed, which is not "down" and must not be waved through as such.
    let calls = 0;
    const refuses = (async () => {
      calls++;
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;
    const response = await fetchWithRetry(refuses, 'https://example.test/', {}, { pauseMs: 1 });
    expect(response.status).toBe(404);
    expect(calls).toBe(1);
  });
});
