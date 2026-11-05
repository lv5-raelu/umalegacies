import { createHash } from 'node:crypto';

/**
 * master.mdb, FROM THE SAME PLACE THE GAME GETS IT.
 *
 * WHY THIS EXISTS. A game patch used to mean: update the Steam build on another
 * computer, find master.mdb in its local files, copy it here, rebuild. PRs #51
 * and #52 were exactly that, by hand, for the 2026-10-07 and 2026-10-18
 * patches. The game client does not get master.mdb from anywhere special. It
 * downloads it from Cygames' asset CDN, following a chain of public manifests
 * keyed by the live resource version, with no login. So can we.
 *
 * THE CHAIN, four requests:
 *
 *   1. root manifest      /dl/vertical/{resource_version}/manifests/manifestdat/
 *                         root.manifest.bsv.lz4      -> one entry per platform
 *   2. platform manifest  the "Windows" entry         -> one entry per bundle kind
 *   3. master manifest    the "master" entry          -> the files in that bundle
 *   4. master.mdb         the entry named like it     -> LZ4-compressed SQLite
 *
 * Every hop after the first is addressed by an `hname`: the base32 of
 * SHA-1(checksum || size || name), both numbers as big-endian u64.
 *
 * WHERE THE FORMAT CAME FROM. uma.moe's resource server (uma-moe/umamoe-
 * resources, `src/master_fetch.rs`) does this to keep its own data current, and
 * reading it is how this project learned the manifest layout and the BSV
 * encoding. That repository carries NO LICENCE, so nothing here is copied from
 * it: this is an independent implementation of the same on-the-wire format,
 * checked against the live CDN rather than against their code. Two things are
 * deliberately different. It does not pretend to be the game -- theirs sends a
 * Unity user-agent, and the CDN answered an honest one with the same 200 -- and
 * the LZ4 decoder is written here rather than pulled in, because Node has none
 * built in and a dependency for a script run once per patch is a poor trade.
 *
 * Pure functions, plus one that takes an injected `fetch`, so all of it is
 * testable without the network. `scripts/fetch-master.mjs` does the files.
 */

/** Cygames' asset CDN for the Global (English) build. */
export const CDN_BASE = 'https://assets-umamusume-en.akamaized.net';

/** The platform whose master.mdb this project's extract was always built from. */
export const PLATFORM = 'Windows';

/** Who we say we are. Not the game client, and not anybody's email address. */
export const USER_AGENT = 'umalegacies-fetch-master (+https://github.com/lv5-raelu/umalegacies)';

// ---------------------------------------------------------------- LZ4

/** `04 22 4D 18`: the LZ4 frame magic, 0x184D2204 little-endian. */
export const LZ4_FRAME_MAGIC = [0x04, 0x22, 0x4d, 0x18] as const;

export const isLz4Frame = (data: Uint8Array): boolean =>
  data.length >= 4 && LZ4_FRAME_MAGIC.every((byte, i) => data[i] === byte);

/** A byte buffer that grows by doubling, so a 17 MB output is not 17M pushes. */
class Output {
  bytes: Uint8Array;
  length = 0;

  constructor(capacity: number) {
    this.bytes = new Uint8Array(Math.max(capacity, 1024));
  }

  private reserve(extra: number): void {
    if (this.length + extra <= this.bytes.length) return;
    let size = this.bytes.length * 2;
    while (size < this.length + extra) size *= 2;
    const grown = new Uint8Array(size);
    grown.set(this.bytes.subarray(0, this.length));
    this.bytes = grown;
  }

  append(source: Uint8Array, from: number, count: number): void {
    this.reserve(count);
    this.bytes.set(source.subarray(from, from + count), this.length);
    this.length += count;
  }

  /**
   * Copies `count` bytes from `offset` back. BYTE BY BYTE, on purpose: LZ4
   * matches may overlap their own output (offset 1, length 20 is a run of one
   * byte), and a bulk copy would read bytes it has not written yet.
   */
  copyBack(offset: number, count: number): void {
    const from = this.length - offset;
    if (offset === 0 || from < 0) {
      throw new Error(`LZ4 match offset ${offset} reaches before the start of the output`);
    }
    this.reserve(count);
    const bytes = this.bytes;
    for (let i = 0; i < count; i++) bytes[this.length + i] = bytes[from + i] as number;
    this.length += count;
  }

  result(): Uint8Array {
    return this.bytes.slice(0, this.length);
  }
}

/** A run length: 15 in the nibble means "keep adding the following bytes until one is not 255". */
function readLength(data: Uint8Array, at: { i: number }, nibble: number): number {
  let length = nibble;
  if (nibble !== 15) return length;
  for (;;) {
    const byte = data[at.i++];
    if (byte === undefined) throw new Error('LZ4 length runs past the end of the block');
    length += byte;
    if (byte !== 255) return length;
  }
}

/**
 * One LZ4 block (the raw format, no frame), appended to `out`.
 *
 * Decoding into ONE output across all of a frame's blocks is what makes linked
 * blocks work for free: a match in block 2 may point back into block 1's
 * output, and here block 1's output is simply earlier in the same buffer.
 */
function decodeBlock(data: Uint8Array, start: number, end: number, out: Output): void {
  const at = { i: start };
  while (at.i < end) {
    const token = data[at.i++] as number;
    const literals = readLength(data, at, token >> 4);
    if (at.i + literals > end) throw new Error('LZ4 literals run past the end of the block');
    out.append(data, at.i, literals);
    at.i += literals;
    // The last sequence of a block is literals only.
    if (at.i >= end) return;
    const offset = (data[at.i] as number) | ((data[at.i + 1] as number) << 8);
    at.i += 2;
    const matchLength = readLength(data, at, token & 0x0f) + 4;
    out.copyBack(offset, matchLength);
  }
}

const u32le = (data: Uint8Array, i: number): number =>
  ((data[i] as number) |
    ((data[i + 1] as number) << 8) |
    ((data[i + 2] as number) << 16) |
    ((data[i + 3] as number) << 24)) >>>
  0;

/**
 * Decompresses an LZ4 FRAME (the format the `lz4` command writes), or the
 * size-prefixed raw block some manifests use instead.
 *
 * Checksums are skipped rather than verified: verifying needs xxHash32, and the
 * thing that actually matters -- that the result is an intact SQLite database --
 * is checked downstream by SQLite itself, which is a far stronger test of the
 * bytes than a 32-bit hash of them.
 */
export function decodeLz4(data: Uint8Array): Uint8Array {
  if (!isLz4Frame(data)) {
    // Not a frame: a little-endian u32 of the decompressed size, then one block.
    if (data.length < 4) throw new Error('Too short to be LZ4');
    const out = new Output(u32le(data, 0));
    decodeBlock(data, 4, data.length, out);
    return out.result();
  }

  const flags = data[4] as number;
  if (flags >> 6 !== 1) throw new Error(`Unsupported LZ4 frame version ${flags >> 6}`);
  const blockChecksum = (flags & 0x10) !== 0;
  const hasContentSize = (flags & 0x08) !== 0;
  const hasDictId = (flags & 0x01) !== 0;

  let i = 6; // magic (4), FLG (1), BD (1)
  let contentSize = 0;
  if (hasContentSize) {
    // Only used to size the buffer, so the low 32 bits are plenty.
    contentSize = u32le(data, i);
    i += 8;
  }
  if (hasDictId) throw new Error('LZ4 frames with a dictionary are not supported');
  i += 1; // header checksum

  const out = new Output(contentSize || data.length * 4);
  for (;;) {
    if (i + 4 > data.length) throw new Error('LZ4 frame ends without an end mark');
    const word = u32le(data, i);
    i += 4;
    if (word === 0) break; // end mark
    const size = word & 0x7fffffff;
    if (i + size > data.length) throw new Error('LZ4 block runs past the end of the frame');
    // The high bit marks a block stored uncompressed.
    if (word & 0x80000000) out.append(data, i, size);
    else decodeBlock(data, i, i + size, out);
    i += size + (blockChecksum ? 4 : 0);
  }
  return out.result();
}

// ---------------------------------------------------------------- BSV

/** Every manifest is a BSV table. Ints are BigInt: checksums use all 64 bits. */
export type BsvValue = string | bigint;

const BSV_MAGIC = 0xbf;

/**
 * Parses an ANONYMOUS-format BSV table -- version 1, no column names -- into rows.
 *
 * Layout: magic, a format byte (version high nibble, type low), a 2-byte header
 * size, then VLQs for row count, max row size, schema version and column count,
 * then one type byte per column (some followed by a fixed width), then rows.
 *
 * Column types, by what they hold here: `0x4_` is NUL-terminated text, `0x1_` a
 * VLQ, and the fixed-width kinds a big-endian unsigned of that many bytes.
 */
export function parseBsv(data: Uint8Array): BsvValue[][] {
  if (data.length < 2 || data[0] !== BSV_MAGIC) {
    throw new Error(`Not a BSV table (first byte 0x${(data[0] ?? 0).toString(16)})`);
  }
  const version = (data[1] as number) >> 4;
  const kind = (data[1] as number) & 0x0f;
  if (version !== 1 || kind !== 1) {
    throw new Error(`Unsupported BSV format: version ${version}, type ${kind}`);
  }

  let i = 2;
  const byte = (): number => {
    const b = data[i++];
    if (b === undefined) throw new Error('BSV ends mid-value');
    return b;
  };
  // Big-endian VLQ, 7 bits a byte, at most eight bytes.
  const vlq = (): bigint => {
    let value = 0n;
    for (let n = 0; n < 8; n++) {
      const b = byte();
      value = (value << 7n) | BigInt(b & 0x7f);
      if ((b & 0x80) === 0) break;
    }
    return value;
  };
  const unsigned = (width: number): bigint => {
    let value = 0n;
    for (let n = 0; n < width; n++) value = (value << 8n) | BigInt(byte());
    return value;
  };
  const text = (): string => {
    const start = i;
    while (i < data.length && data[i] !== 0) i++;
    const value = new TextDecoder().decode(data.subarray(start, i));
    if (i < data.length) i++; // the NUL
    return value;
  };

  unsigned(2); // header size
  const rows = Number(vlq());
  vlq(); // max row size
  vlq(); // schema version
  const columns = Number(vlq());

  const schema: Array<{ type: number; width: number | null }> = [];
  for (let c = 0; c < columns; c++) {
    const type = byte();
    // The fixed-width kinds are 0x21, 0x31, 0x61 and 0x71 -- and not 0x51.
    const fixed = ((type - 0x21) & 0xcf) === 0 && type !== 0x51;
    schema.push({ type, width: fixed ? Number(vlq()) : null });
  }

  const table: BsvValue[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: BsvValue[] = [];
    for (const { type, width } of schema) {
      if ((type & 0xf0) === 0x40) row.push(text());
      else if ((type & 0xf0) === 0x10) row.push(vlq());
      else if (width !== null) row.push(unsigned(width));
      else throw new Error(`Unknown BSV column type 0x${type.toString(16)}`);
    }
    table.push(row);
  }
  return table;
}

// ---------------------------------------------------------------- manifests

export interface ManifestEntry {
  name: string;
  size: bigint;
  checksum: bigint;
  /** Where the entry lives on the CDN. */
  hname: string;
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32, no padding. */
export function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

/** An entry's CDN name: base32(SHA-1(checksum u64be || size u64be || name)). */
export function hnameOf(checksum: bigint, size: bigint, name: string): string {
  const header = new DataView(new ArrayBuffer(16));
  header.setBigUint64(0, checksum);
  header.setBigUint64(8, size);
  return base32(
    createHash('sha1').update(new Uint8Array(header.buffer)).update(name, 'utf8').digest(),
  );
}

const asText = (v: BsvValue | undefined): string => {
  if (typeof v !== 'string') throw new Error('Expected a text column in the manifest');
  return v;
};
const asInt = (v: BsvValue | undefined): bigint => {
  if (typeof v !== 'bigint') throw new Error('Expected an integer column in the manifest');
  return v;
};

/**
 * Manifest rows as entries. Two row shapes: the root manifest's three columns
 * (name, size, checksum), and content manifests with seven or more, where size
 * and checksum sit at 4 and 5.
 */
export function manifestEntries(rows: readonly BsvValue[][]): ManifestEntry[] {
  const entries: ManifestEntry[] = [];
  for (const row of rows) {
    let name: string;
    let size: bigint;
    let checksum: bigint;
    if (row.length >= 7) {
      [name, size, checksum] = [asText(row[0]), asInt(row[4]), asInt(row[5])];
    } else if (row.length >= 3) {
      [name, size, checksum] = [asText(row[0]), asInt(row[1]), asInt(row[2])];
    } else continue;
    entries.push({ name, size, checksum, hname: hnameOf(checksum, size, name) });
  }
  return entries;
}

export const rootManifestUrl = (resourceVersion: string): string =>
  `${CDN_BASE}/dl/vertical/${resourceVersion}/manifests/manifestdat/root.manifest.bsv.lz4`;

export const manifestUrl = (hname: string): string =>
  `${CDN_BASE}/dl/vertical/resources/Manifest/${hname.slice(0, 2)}/${hname}`;

export const genericUrl = (hname: string): string =>
  `${CDN_BASE}/dl/vertical/resources/Generic/${hname.slice(0, 2)}/${hname}`;

// ---------------------------------------------------------------- the chain

/** `04 22 4D 18`, or plain bytes: a manifest may arrive either way. */
const maybeLz4 = (data: Uint8Array): Uint8Array => (isLz4Frame(data) ? decodeLz4(data) : data);

/** The first SIXTEEN bytes of every SQLite database, NUL included. */
const SQLITE_MAGIC = new TextEncoder().encode('SQLite format 3\0');

export const isSqlite = (data: Uint8Array): boolean =>
  data.length >= SQLITE_MAGIC.length && SQLITE_MAGIC.every((b, i) => data[i] === b);

export interface FetchedMaster {
  bytes: Uint8Array;
  /** The CDN's content address for this exact file. Same name, same bytes. */
  cdnName: string;
  /** The four URLs walked, in order, so a failure can say which hop broke. */
  path: string[];
  /** What the CDN sent before decompression. */
  compressedBytes: number;
}

export interface LiveMaster {
  /**
   * The CDN's name for the live master.mdb: base32(SHA-1(checksum, size, name)).
   *
   * A CONTENT ADDRESS, which is what makes it the right thing to compare. The
   * game's resource version moves for any asset patch, master.mdb or not, so
   * "the version changed" would mean downloading 5 MB for nothing every time a
   * texture is fixed. This name changes exactly when the file does.
   */
  cdnName: string;
  /** The three manifest URLs walked to find it. */
  path: string[];
}

type Getter = (url: string) => Promise<Uint8Array>;

/**
 * The source did not answer, or said it is broken: a connection that never
 * produced a response, or a 5xx. Distinct from every other failure because it is
 * the one kind that fixes itself. The scheduled run treats it as "try again at
 * the next schedule"; a 4xx, or an answer in the wrong shape, means the source
 * CHANGED, and stays a failure someone has to look at.
 */
export class SourceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceUnavailableError';
  }
}

/**
 * `fetch`, retried when the source is DOWN and never when it has answered.
 *
 * Two things are down. A connection that never produced an answer (found on the
 * first unattended-style run: a bare "fetch failed" against a healthy host,
 * gone a second later). And a 5xx, which is the server saying it is broken just
 * now -- uma.moe's /api/ver answered 521, Cloudflare's "origin is not
 * responding", during a scheduled run, and for a pipeline whose next attempt is
 * six hours away that was a failure email about someone else's outage. Both are
 * retried with a growing pause (pauseMs, then twice it, ...) and, if the source
 * is still down after the last attempt, thrown as SourceUnavailableError.
 *
 * A 4xx is an answer and is returned at once: a 403 or 404 will not improve by
 * asking again, and asking again is not polite.
 */
export async function fetchWithRetry(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  { attempts = 3, pauseMs = 2000 }: { attempts?: number; pauseMs?: number } = {},
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    let down: string;
    try {
      const response = await fetchImpl(url, init);
      if (response.status < 500) return response;
      down = `HTTP ${response.status}`;
    } catch (error) {
      down = (error as Error).message;
    }
    if (attempt >= attempts) {
      throw new SourceUnavailableError(`${down} (${url}, ${attempts} attempts)`);
    }
    await new Promise((resolve) => setTimeout(resolve, pauseMs * attempt));
  }
}

function getter(fetchImpl: typeof fetch, path: string[]): Getter {
  return async (url) => {
    path.push(url);
    const response = await fetchWithRetry(fetchImpl, url, {
      headers: { 'User-Agent': USER_AGENT, Accept: '*/*', 'Accept-Encoding': 'identity' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
    return new Uint8Array(await response.arrayBuffer());
  };
}

function finder(path: readonly string[]) {
  return (entries: ManifestEntry[], match: (name: string) => boolean, what: string) => {
    const entry = entries.find((e) => match(e.name.toLowerCase()));
    if (!entry) {
      throw new Error(
        `No ${what} entry in the manifest at ${path.at(-1)}. ` +
          `It holds: ${entries.slice(0, 12).map((e) => e.name).join(', ')}` +
          (entries.length > 12 ? `, ...(${entries.length})` : ''),
      );
    }
    return entry;
  };
}

async function walkToMaster(resourceVersion: string, get: Getter, path: string[]): Promise<ManifestEntry> {
  const find = finder(path);
  const root = manifestEntries(parseBsv(decodeLz4(await get(rootManifestUrl(resourceVersion)))));
  const platform = find(root, (n) => n === PLATFORM.toLowerCase(), `'${PLATFORM}' platform`);

  const bundles = manifestEntries(parseBsv(maybeLz4(await get(manifestUrl(platform.hname)))));
  const master = find(bundles, (n) => n === 'master', "'master' bundle");

  const files = manifestEntries(parseBsv(maybeLz4(await get(manifestUrl(master.hname)))));
  return find(files, (n) => n.includes('master.mdb'), 'master.mdb');
}

/**
 * Which master.mdb is live, without downloading it: three manifests, under a
 * kilobyte between them. What the daily check runs; the 5 MB download only
 * happens when this name differs from the one the repository last recorded.
 */
export async function liveMasterName(
  resourceVersion: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LiveMaster> {
  const path: string[] = [];
  const entry = await walkToMaster(resourceVersion, getter(fetchImpl, path), path);
  return { cdnName: entry.hname, path };
}

/**
 * Walks the manifest chain and returns master.mdb's bytes, decompressed and
 * checked to be SQLite. Writes nothing.
 *
 * @throws naming the hop and the URL, because "the download failed" after a
 *   patch is useless; "the Windows entry is missing from the root manifest" says
 *   the format moved.
 */
export async function fetchMasterMdb(
  resourceVersion: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchedMaster> {
  const path: string[] = [];
  const get = getter(fetchImpl, path);
  const mdb = await walkToMaster(resourceVersion, get, path);

  const compressed = await get(genericUrl(mdb.hname));
  const bytes = maybeLz4(compressed);
  if (!isSqlite(bytes)) {
    throw new Error(`What ${path.at(-1)} decompressed to is not a SQLite database`);
  }
  return { bytes, cdnName: mdb.hname, path, compressedBytes: compressed.length };
}
