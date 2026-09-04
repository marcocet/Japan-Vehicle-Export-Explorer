const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Randomizes a delay by ±spreadRatio, so request timing isn't perfectly periodic. */
export function jitter(baseMs: number, spreadRatio = 0.3): number {
  const spread = baseMs * spreadRatio;
  return Math.max(0, baseMs + (Math.random() * 2 - 1) * spread);
}

type FetchOptions = {
  /** Minimum delay (ms) to wait before this request, to stay polite to the source site. */
  delayMs?: number;
  /** Number of retry attempts on failure (network error or 5xx). */
  retries?: number;
  headers?: Record<string, string>;
  /** Reuse cookies across calls (e.g. a bot-check/session cookie set on the first hit to a site). */
  cookieJar?: CookieJar;
};

/**
 * A minimal per-host cookie jar. Some of these sites (e.g. SBT Japan, behind Cloudflare)
 * respond to the first request with a redirect-to-self while setting a session cookie —
 * Node's fetch doesn't carry that automatically across redirects the way a browser does,
 * so without replaying it manually the request loops forever.
 */
export class CookieJar {
  private cookies = new Map<string, string>();

  applySetCookie(headers: Headers): void {
    const setCookies = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
    for (const raw of setCookies) {
      const pair = raw.split(";")[0];
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  header(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
}

/**
 * A fetch wrapper for scrapers: sends a realistic browser User-Agent, waits a polite
 * delay before each request, follows redirects while replaying cookies, and retries
 * transient failures with backoff.
 */
export async function politeFetch(url: string, options: FetchOptions = {}): Promise<string> {
  const { delayMs = 1500, retries = 2, headers = {}, cookieJar } = options;

  await sleep(jitter(delayMs));

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let currentUrl = url;
      for (let redirectCount = 0; redirectCount < 5; redirectCount++) {
        const res = await fetch(currentUrl, {
          redirect: "manual",
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            ...(cookieJar?.header() ? { Cookie: cookieJar.header() } : {}),
            ...headers,
          },
        });

        cookieJar?.applySetCookie(res.headers);

        if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
          currentUrl = new URL(res.headers.get("location")!, currentUrl).toString();
          continue;
        }

        if (!res.ok) {
          throw new Error(`Request to ${url} failed with status ${res.status}`);
        }

        return await res.text();
      }
      throw new Error(`Too many redirects fetching ${url}`);
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await sleep(2000 * (attempt + 1));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
}

export { USER_AGENT };
