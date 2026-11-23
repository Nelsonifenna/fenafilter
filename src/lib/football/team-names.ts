/**
 * Team-name normalisation and matching.
 *
 * Screenshots use many spellings: "Man Utd", "Manchester United", "Man. United",
 * "Bayern München", "FC Bayern". We normalise both sides and compare, with a
 * curated alias table for common abbreviations. Matching is deliberately
 * conservative: "Manchester United" must NEVER be matched to "Manchester City".
 */

const STOP_TOKENS = new Set([
  "fc", "cf", "afc", "sc", "ac", "as", "ss", "ssc", "cd", "ud", "sd", "rc", "rcd", "fk", "sk", "nk", "bk", "if",
  "club", "de", "futbol", "football", "calcio", "sv", "vfb", "vfl", "tsg", "bsc", "1", "the", "cp", "sl", "ec",
]);

/** Abbreviation → canonical normalised name. Keys and values are already normalised. */
const ALIASES: Record<string, string> = {
  "man utd": "manchester united",
  "man united": "manchester united",
  "manchester utd": "manchester united",
  "man city": "manchester city",
  "spurs": "tottenham",
  "tottenham hotspur": "tottenham",
  // The data provider stores the club as "Wolves", so search and match on that name.
  "wolves": "wolves",
  "wolverhampton wanderers": "wolves",
  "wolverhampton": "wolves",
  "brighton hove albion": "brighton",
  "brighton and hove albion": "brighton",
  "newcastle utd": "newcastle",
  "newcastle united": "newcastle",
  "west ham united": "west ham",
  "nottm forest": "nottingham forest",
  "nott m forest": "nottingham forest",
  "sheff utd": "sheffield utd",
  "sheffield united": "sheffield utd",
  "sheff wed": "sheffield wednesday",
  "leeds united": "leeds",
  "leicester city": "leicester",
  "psg": "paris saint germain",
  "paris sg": "paris saint germain",
  "inter": "inter",
  "inter milan": "inter",
  "internazionale": "inter",
  "ac milan": "milan",
  "atletico madrid": "atletico madrid",
  "atl madrid": "atletico madrid",
  "atletico": "atletico madrid",
  "barca": "barcelona",
  "bayern munich": "bayern munchen",
  "bayern": "bayern munchen",
  "dortmund": "borussia dortmund",
  "bvb": "borussia dortmund",
  "gladbach": "borussia monchengladbach",
  "m gladbach": "borussia monchengladbach",
  "leverkusen": "bayer leverkusen",
  "rb leipzig": "rb leipzig",
  "leipzig": "rb leipzig",
  "juve": "juventus",
  "napoli": "napoli",
  "roma": "as roma",
  "sporting cp": "sporting cp",
  "sporting lisbon": "sporting cp",
  "benfica": "benfica",
  "porto": "porto",
  "ajax amsterdam": "ajax",
  "psv eindhoven": "psv",
  "celtic glasgow": "celtic",
  // English names for clubs the data provider stores in the local language
  "slavia prague": "slavia praha",
  "sparta prague": "sparta praha",
  "red star belgrade": "crvena zvezda",
  "bayer 04 leverkusen": "bayer leverkusen",
  "rangers glasgow": "rangers",
};

export function stripDiacritics(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").replace(/ø/g, "o").replace(/æ/g, "ae");
}

/** Lowercase, remove accents/punctuation, collapse whitespace. Keeps all words. */
export function basicNormalize(name: string): string {
  return stripDiacritics(name)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** basicNormalize + alias resolution + removal of generic tokens like "FC". */
export function canonicalName(name: string): string {
  const basic = basicNormalize(name);
  const aliased = ALIASES[basic] ?? basic;
  const tokens = aliased.split(" ").filter((t) => t && !STOP_TOKENS.has(t));
  const core = tokens.join(" ");
  return ALIASES[core] ?? (core || aliased);
}

export function isAlias(name: string) {
  return basicNormalize(name) in ALIASES;
}

/** Token-level Dice similarity on canonical names, 0..1. */
export function similarity(a: string, b: string): number {
  const ca = canonicalName(a);
  const cb = canonicalName(b);
  if (!ca || !cb) return 0;
  if (ca === cb) return 1;
  const ta = ca.split(" ");
  const tb = cb.split(" ");
  // Distinguishing words such as "united" vs "city" must both be present.
  const setB = new Set(tb);
  const common = ta.filter((t) => setB.has(t)).length;
  const tokenDice = (2 * common) / (ta.length + tb.length);
  const bigramDice = diceBigrams(ca.replace(/ /g, ""), cb.replace(/ /g, ""));
  // Penalise when each side has a distinctive token the other lacks (Man United vs Man City).
  const onlyA = ta.filter((t) => !setB.has(t));
  const setA = new Set(ta);
  const onlyB = tb.filter((t) => !setA.has(t));
  const conflict = onlyA.length > 0 && onlyB.length > 0 && common > 0;
  const score = Math.max(tokenDice, bigramDice * 0.9);
  return conflict ? score * 0.6 : score;
}

function diceBigrams(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const grams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const c = grams.get(g) ?? 0;
    if (c > 0) {
      hits++;
      grams.set(g, c - 1);
    }
  }
  return (2 * hits) / (a.length - 1 + b.length - 1);
}

/** Does a fixture team name refer to the user-specified team? Used for "remove matches involving X". */
export function namesRefersToSameTeam(a: string, b: string): boolean {
  const ca = canonicalName(a);
  const cb = canonicalName(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  // "Arsenal" vs "Arsenal FC" handled by canonical; also allow whole-word containment
  // when the shorter side is at least 4 chars and the longer side adds no conflicting words.
  const [short, long] = ca.length <= cb.length ? [ca, cb] : [cb, ca];
  if (short.length >= 4 && new RegExp(`(^| )${escapeRe(short)}( |$)`).test(long)) {
    const extra = long.replace(short, "").trim().split(" ").filter(Boolean);
    const CONFLICT = new Set(["city", "united", "utd", "town", "county", "rovers", "wanderers", "athletic", "women", "w", "u21", "u23", "u19", "ii", "b", "reserves"]);
    return !extra.some((t) => CONFLICT.has(t));
  }
  return false;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** API-Football's /teams?search= requires 3+ alphanumeric chars; build a usable search term. */
export function searchTermFor(name: string): string | null {
  // API search is substring-based and accent-sensitive, so we search for the most
  // distinctive single word (e.g. "manchester") and score all candidates locally.
  const GENERIC = new Set(["united", "city", "real", "sporting", "athletic", "town", "county", "rovers", "saint", "west", "north", "south"]);
  const tokens = canonicalName(name).split(" ").filter((t) => t.length >= 3);
  if (tokens.length === 0) return null;
  const distinctive = tokens.filter((t) => !GENERIC.has(t));
  const pool = distinctive.length > 0 ? distinctive : tokens;
  return [...pool].sort((x, y) => y.length - x.length)[0]!;
}
