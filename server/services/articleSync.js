"use strict";

// Pulls articles from an external site (the cwf-air.com marketing site) into
// the homepage CMS's "articles" section when auto_sync is enabled. Tries the
// site's WordPress REST API first (structured, reliable); falls back to
// scraping Open Graph / JSON-LD metadata off admin-provided seed URLs when
// the REST API isn't available (e.g. disabled, or the site isn't WordPress).

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_PER_PAGE = 12;

function cleanText(value, max = 500) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
}

function stripHtml(value) {
  return cleanText(String(value || "").replace(/<[^>]*>/g, " "));
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#0?39;/g, "'");
}

function normalizeSourceUrl(sourceUrl) {
  const trimmed = cleanText(sourceUrl, 300).replace(/\/+$/, "");
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return `${parsed.protocol}//${parsed.host}`;
  } catch (_) {
    return "";
  }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function pickFeaturedImage(post) {
  const media = post?._embedded?.["wp:featuredmedia"]?.[0];
  return media?.source_url ? cleanText(media.source_url, 700) : "";
}

function extractRenderedField(value) {
  return value && typeof value === "object" ? value.rendered : value;
}

function normalizeWordPressPost(post) {
  if (!post || typeof post !== "object") return null;
  const externalId = cleanText(post.slug || post.id, 200);
  const link = cleanText(post.link, 700);
  const title = stripHtml(decodeHtmlEntities(extractRenderedField(post.title))).slice(0, 120);
  if (!externalId || !link || !title) return null;
  return {
    external_id: externalId,
    title,
    summary: stripHtml(decodeHtmlEntities(extractRenderedField(post.excerpt))).slice(0, 260),
    image_url: pickFeaturedImage(post),
    link,
    published_at: post.date_gmt ? `${post.date_gmt}Z` : (post.date || null),
  };
}

async function fetchFromWordPressApi(baseUrl, options = {}) {
  const perPage = Math.max(1, Math.min(20, Number(options.limit) || DEFAULT_PER_PAGE));
  const url = `${baseUrl}/wp-json/wp/v2/posts?per_page=${perPage}&_embed=true&orderby=date&order=desc`;
  const res = await fetchWithTimeout(url, { timeoutMs: options.timeoutMs, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`WP_API_HTTP_${res.status}`);
  const contentType = String(res.headers.get("content-type") || "");
  if (!contentType.includes("application/json")) throw new Error("WP_API_NOT_JSON");
  const body = await res.json();
  if (!Array.isArray(body)) throw new Error("WP_API_UNEXPECTED_SHAPE");
  return body.map(normalizeWordPressPost).filter(Boolean);
}

function extractMetaContent(html, propertyOrName) {
  const forward = new RegExp(`<meta[^>]+(?:property|name)=["']${propertyOrName}["'][^>]+content=["']([^"']*)["']`, "i");
  const forwardMatch = html.match(forward);
  if (forwardMatch) return forwardMatch[1];
  const reversed = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${propertyOrName}["']`, "i");
  const reversedMatch = html.match(reversed);
  return reversedMatch ? reversedMatch[1] : "";
}

function extractJsonLdArticle(html) {
  const blocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of blocks) {
    const inner = block.replace(/^[\s\S]*?>/, "").replace(/<\/script>\s*$/i, "");
    try {
      const parsed = JSON.parse(inner);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const candidate of candidates) {
        const types = Array.isArray(candidate?.["@type"]) ? candidate["@type"] : [candidate?.["@type"]];
        if (types.some((t) => /article|blogposting|newsarticle/i.test(String(t || "")))) return candidate;
      }
    } catch (_) {
      // ignore unparsable JSON-LD blocks, keep scanning the rest
    }
  }
  return null;
}

function parseArticleHtml(html, pageUrl) {
  const jsonLd = extractJsonLdArticle(html);
  const ogTitle = decodeHtmlEntities(extractMetaContent(html, "og:title"));
  const ogDescription = decodeHtmlEntities(extractMetaContent(html, "og:description"));
  const ogImage = extractMetaContent(html, "og:image");
  const titleTagMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);

  const title = stripHtml(jsonLd?.headline || ogTitle || (titleTagMatch ? decodeHtmlEntities(titleTagMatch[1]) : "")).slice(0, 120);
  if (!title) return null;
  const summary = stripHtml(jsonLd?.description || ogDescription).slice(0, 260);
  const jsonLdImage = Array.isArray(jsonLd?.image) ? jsonLd.image[0] : (jsonLd?.image?.url || jsonLd?.image);
  const image = cleanText(jsonLdImage || ogImage, 700);
  const publishedAt = cleanText(jsonLd?.datePublished || "", 40) || null;

  let externalId = pageUrl;
  try {
    externalId = new URL(pageUrl).pathname.replace(/\/+$/, "").split("/").pop() || pageUrl;
  } catch (_) {
    // keep pageUrl as the external_id fallback
  }
  return {
    external_id: cleanText(externalId, 200),
    title,
    summary,
    image_url: image,
    link: pageUrl,
    published_at: publishedAt,
  };
}

async function fetchFromSeedUrls(seedUrls, options = {}) {
  const results = [];
  for (const seedUrl of seedUrls) {
    try {
      const res = await fetchWithTimeout(seedUrl, { timeoutMs: options.timeoutMs, headers: { Accept: "text/html" } });
      if (!res.ok) continue;
      const html = await res.text();
      const article = parseArticleHtml(html, seedUrl);
      if (article) results.push(article);
    } catch (_) {
      // skip unreachable/unparsable seed URLs, keep going with the rest
    }
  }
  return results;
}

async function fetchArticlesFromSource(sourceUrl, options = {}) {
  const baseUrl = normalizeSourceUrl(sourceUrl);
  if (!baseUrl) throw new Error("INVALID_SOURCE_URL");
  try {
    const fromApi = await fetchFromWordPressApi(baseUrl, options);
    if (fromApi.length) return fromApi;
  } catch (_) {
    // WP REST API unavailable/disabled/non-WordPress site — fall back below
  }
  const seedUrls = Array.isArray(options.seedUrls) ? options.seedUrls.filter(Boolean) : [];
  if (!seedUrls.length) return [];
  return fetchFromSeedUrls(seedUrls, options);
}

async function syncArticles(pool, sourceUrl, options = {}) {
  const baseUrl = normalizeSourceUrl(sourceUrl);
  if (!baseUrl) return { ok: false, error: "INVALID_SOURCE_URL", synced: 0, fetched: 0 };
  const articles = await fetchArticlesFromSource(baseUrl, options);
  let synced = 0;
  for (const article of articles) {
    await pool.query(
      `INSERT INTO public.homepage_synced_articles
         (source_url, external_id, title, summary, image_url, link, published_at, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (source_url, external_id) DO UPDATE
         SET title=EXCLUDED.title,
             summary=EXCLUDED.summary,
             image_url=EXCLUDED.image_url,
             link=EXCLUDED.link,
             published_at=EXCLUDED.published_at,
             synced_at=NOW()`,
      [baseUrl, article.external_id, article.title, article.summary || null, article.image_url || null, article.link, article.published_at]
    );
    synced += 1;
  }
  return { ok: true, synced, fetched: articles.length };
}

async function getSyncedArticles(pool, sourceUrl, limit = 12) {
  const baseUrl = normalizeSourceUrl(sourceUrl);
  if (!baseUrl) return { articles: [], last_synced_at: null };
  const result = await pool.query(
    `SELECT title, summary, image_url, link, published_at, synced_at
       FROM public.homepage_synced_articles
      WHERE source_url=$1
      ORDER BY published_at DESC NULLS LAST, synced_at DESC
      LIMIT $2`,
    [baseUrl, Math.max(1, Math.min(20, Number(limit) || 12))]
  );
  const rows = result.rows || [];
  const lastSyncedAt = rows.reduce((latest, row) => {
    const ts = row.synced_at ? new Date(row.synced_at).getTime() : 0;
    return ts > latest ? ts : latest;
  }, 0);
  return {
    articles: rows.map((row) => ({
      title: row.title,
      body: row.summary || "",
      image_url: row.image_url || "",
      url: row.link,
      date_label: row.published_at
        ? new Date(row.published_at).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })
        : "",
    })),
    last_synced_at: lastSyncedAt ? new Date(lastSyncedAt).toISOString() : null,
  };
}

module.exports = {
  normalizeSourceUrl,
  fetchArticlesFromSource,
  fetchFromWordPressApi,
  fetchFromSeedUrls,
  parseArticleHtml,
  normalizeWordPressPost,
  syncArticles,
  getSyncedArticles,
};
