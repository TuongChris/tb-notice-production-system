// Reported item URL normalization (P4B) — deterministic, offline, recognize-or-reject.
//
// Frozen rules (DATABASE_SCHEMA_v1 ReportedItem; DOMAIN_MODEL_v1 §11; INVARIANTS §4): only YouTube
// video item formats in V1; externalItemId is the video id, case-sensitive, unique within one case
// and never globally; host names may normalize to lowercase, the video id's character case never
// changes; the raw URL is retained exactly as supplied.
//
// Accepted shapes (anything else is refused, never guessed):
//   https?://(www.|m.)youtube.com/watch?…v=<id>…   exactly one `v` query parameter, written
//                                                  literally (no percent-encoded name or id)
//   https?://(www.|m.)youtube.com/shorts/<id>
//   https?://(www.|m.)youtube.com/live/<id>
//   https?://youtu.be/<id>
// where <id> is exactly 11 characters from A–Z, a–z, 0–9, "_" and "-" (the path keywords are
// lowercase; the host is compared after the URL parser lowercases it). No user name or password
// and no port other than the scheme's default. Other query parameters (a time offset, a playlist,
// a share token) and the fragment are not part of the item identity; they stay in the raw URL. The
// normalized URL is https://www.youtube.com/watch?v=<id>. Nothing is fetched: no availability,
// uploader, channel or title is looked up or inferred.
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const SHORT_HOST = 'youtu.be';
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PATH_ID = /^\/(shorts|live)\/([^/]*)$/;

export type ReportedUrlProblem =
  | 'UNPARSEABLE'
  | 'CREDENTIALS_IN_URL'
  | 'PORT_IN_URL'
  | 'NOT_YOUTUBE'
  | 'NOT_A_VIDEO_URL'
  | 'AMBIGUOUS_VIDEO_ID'
  | 'INVALID_VIDEO_ID';

export type ReportedUrl =
  | { readonly ok: true; readonly externalItemId: string; readonly normalizedUrl: string }
  | { readonly ok: false; readonly reason: ReportedUrlProblem };

export function normalizeReportedUrl(rawUrl: string): ReportedUrl {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'UNPARSEABLE' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: 'UNPARSEABLE' };
  }
  if (url.username !== '' || url.password !== '')
    return { ok: false, reason: 'CREDENTIALS_IN_URL' };
  if (url.port !== '') return { ok: false, reason: 'PORT_IN_URL' };
  // The URL parser lowercases the host (and punycode-encodes non-ASCII hosts); nothing else is
  // lowercased.
  const host = url.hostname;
  let id: string | null;
  if (host === SHORT_HOST) {
    id =
      url.pathname.length > 1 && !url.pathname.slice(1).includes('/')
        ? url.pathname.slice(1)
        : null;
    if (id === null) return { ok: false, reason: 'NOT_A_VIDEO_URL' };
  } else if (HOSTS.has(host)) {
    if (url.pathname === '/watch') {
      // Exactly one `v` parameter, written literally: a percent-encoded name or id is refused
      // rather than decoded (the id is then compared exactly as written).
      const decoded = url.searchParams.getAll('v');
      const literal = url.search
        .slice(1)
        .split('&')
        .filter((pair) => pair.startsWith('v='));
      if (decoded.length === 0) return { ok: false, reason: 'NOT_A_VIDEO_URL' };
      if (decoded.length > 1 || literal.length !== 1) {
        return { ok: false, reason: 'AMBIGUOUS_VIDEO_ID' };
      }
      id = literal[0]?.slice(2) ?? null;
    } else {
      const match = PATH_ID.exec(url.pathname);
      if (match === null) return { ok: false, reason: 'NOT_A_VIDEO_URL' };
      id = match[2] ?? null;
    }
  } else {
    return { ok: false, reason: 'NOT_YOUTUBE' };
  }
  if (id === null || !VIDEO_ID.test(id)) return { ok: false, reason: 'INVALID_VIDEO_ID' };
  return {
    ok: true,
    externalItemId: id,
    normalizedUrl: `https://www.youtube.com/watch?v=${id}`,
  };
}
