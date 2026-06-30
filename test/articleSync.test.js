"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeSourceUrl,
  fetchFromWordPressApi,
  fetchFromSeedUrls,
  parseArticleHtml,
  normalizeWordPressPost,
  fetchArticlesFromSource,
  syncArticles,
  getSyncedArticles,
} = require("../server/services/articleSync");

function jsonResponse(body, init = {}) {
  return {
    ok: init.status == null || (init.status >= 200 && init.status < 300),
    status: init.status || 200,
    headers: { get: (name) => (String(name).toLowerCase() === "content-type" ? (init.contentType || "application/json") : "") },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function htmlResponse(html, init = {}) {
  return {
    ok: init.status == null || (init.status >= 200 && init.status < 300),
    status: init.status || 200,
    headers: { get: (name) => (String(name).toLowerCase() === "content-type" ? "text/html" : "") },
    text: async () => html,
  };
}

async function withMockFetch(handler, fn) {
  const original = global.fetch;
  global.fetch = handler;
  try {
    await fn();
  } finally {
    global.fetch = original;
  }
}

function createSyncPool() {
  const rows = [];
  return {
    rows,
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ");
      if (normalized.includes("INSERT INTO public.homepage_synced_articles")) {
        const [source_url, external_id, title, summary, image_url, link, published_at] = params;
        const idx = rows.findIndex((row) => row.source_url === source_url && row.external_id === external_id);
        const row = { source_url, external_id, title, summary, image_url, link, published_at, synced_at: new Date().toISOString() };
        if (idx >= 0) rows[idx] = row; else rows.push(row);
        return { rows: [] };
      }
      if (normalized.includes("FROM public.homepage_synced_articles")) {
        const [sourceUrl, limit] = params;
        const filtered = rows
          .filter((row) => row.source_url === sourceUrl)
          .sort((a, b) => {
            const ad = a.published_at ? new Date(a.published_at).getTime() : -Infinity;
            const bd = b.published_at ? new Date(b.published_at).getTime() : -Infinity;
            if (bd !== ad) return bd - ad;
            return new Date(b.synced_at).getTime() - new Date(a.synced_at).getTime();
          })
          .slice(0, limit);
        return { rows: filtered };
      }
      throw new Error(`Unhandled query: ${normalized}`);
    },
  };
}

test("normalizeSourceUrl keeps only protocol+host and rejects non-http(s)/invalid input", () => {
  assert.equal(normalizeSourceUrl("https://www.cwf-air.com/blog/?x=1"), "https://www.cwf-air.com");
  assert.equal(normalizeSourceUrl("https://www.cwf-air.com///"), "https://www.cwf-air.com");
  assert.equal(normalizeSourceUrl("ftp://www.cwf-air.com"), "");
  assert.equal(normalizeSourceUrl("not a url"), "");
  assert.equal(normalizeSourceUrl(""), "");
});

test("normalizeWordPressPost decodes HTML entities in title/excerpt, strips tags, and picks featured media", () => {
  const post = {
    id: 501,
    slug: "air-conditioner-water-leaking",
    link: "https://www.cwf-air.com/air-conditioner-water-leaking/",
    title: { rendered: "แอร์มีน้ำหยด &amp; วิธีแก้ไขเบื้องต้น" },
    excerpt: { rendered: "<p>สาเหตุที่แอร์มีน้ำหยด &amp; วิธีแก้ไขที่ถูกต้อง</p>\n" },
    date: "2026-06-01T09:00:00",
    date_gmt: "2026-06-01T02:00:00",
    _embedded: { "wp:featuredmedia": [{ source_url: "https://www.cwf-air.com/wp-content/uploads/leak.jpg" }] },
  };
  const normalized = normalizeWordPressPost(post);
  assert.equal(normalized.external_id, "air-conditioner-water-leaking");
  assert.equal(normalized.title, "แอร์มีน้ำหยด & วิธีแก้ไขเบื้องต้น");
  assert.equal(normalized.summary, "สาเหตุที่แอร์มีน้ำหยด & วิธีแก้ไขที่ถูกต้อง");
  assert.equal(normalized.image_url, "https://www.cwf-air.com/wp-content/uploads/leak.jpg");
  assert.equal(normalized.link, post.link);
  assert.equal(normalized.published_at, "2026-06-01T02:00:00Z");
});

test("normalizeWordPressPost returns null when slug, link, or title is missing", () => {
  assert.equal(normalizeWordPressPost(null), null);
  assert.equal(normalizeWordPressPost({ link: "https://x.com/a", title: { rendered: "x" } }), null);
  assert.equal(normalizeWordPressPost({ slug: "a", title: { rendered: "x" } }), null);
  assert.equal(normalizeWordPressPost({ slug: "a", link: "https://x.com/a", title: { rendered: "" } }), null);
});

test("fetchFromWordPressApi requests the expected REST endpoint and maps posts", async () => {
  const posts = [
    { id: 1, slug: "post-a", link: "https://www.cwf-air.com/post-a/", title: { rendered: "Post A" }, excerpt: { rendered: "Body A" }, date: "2026-01-01T00:00:00" },
    { id: 2, slug: "post-b", link: "https://www.cwf-air.com/post-b/", title: { rendered: "Post B" }, excerpt: { rendered: "Body B" }, date: "2026-01-02T00:00:00" },
  ];
  let requestedUrl = null;
  await withMockFetch(async (url) => { requestedUrl = url; return jsonResponse(posts); }, async () => {
    const result = await fetchFromWordPressApi("https://www.cwf-air.com", { limit: 5 });
    assert.equal(result.length, 2);
    assert.equal(result[0].external_id, "post-a");
    assert.equal(result[1].title, "Post B");
  });
  assert.match(requestedUrl, /^https:\/\/www\.cwf-air\.com\/wp-json\/wp\/v2\/posts\?per_page=5&_embed=true&orderby=date&order=desc$/);
});

test("fetchFromWordPressApi throws on non-2xx status, non-JSON content-type, or unexpected body shape", async () => {
  await withMockFetch(async () => jsonResponse({}, { status: 404 }), async () => {
    await assert.rejects(() => fetchFromWordPressApi("https://www.cwf-air.com"), /WP_API_HTTP_404/);
  });
  await withMockFetch(async () => jsonResponse([], { contentType: "text/html" }), async () => {
    await assert.rejects(() => fetchFromWordPressApi("https://www.cwf-air.com"), /WP_API_NOT_JSON/);
  });
  await withMockFetch(async () => jsonResponse({ not: "an array" }), async () => {
    await assert.rejects(() => fetchFromWordPressApi("https://www.cwf-air.com"), /WP_API_UNEXPECTED_SHAPE/);
  });
});

const SAMPLE_ARTICLE_HTML = `<!doctype html>
<html><head>
<title>แอร์ไม่เย็น สาเหตุและวิธีแก้ - CWF</title>
<meta property="og:title" content="แอร์ไม่เย็น สาเหตุและวิธีแก้ไข &amp; การดูแลรักษา">
<meta property="og:description" content="รวมสาเหตุที่แอร์ไม่เย็นและวิธีแก้ไขเบื้องต้นก่อนเรียกช่าง">
<meta property="og:image" content="https://www.cwf-air.com/wp-content/uploads/not-cooling.jpg">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Article","headline":"แอร์ไม่เย็น สาเหตุและวิธีแก้ไข","description":"คำอธิบายแบบละเอียดเกี่ยวกับแอร์ไม่เย็น","image":["https://www.cwf-air.com/wp-content/uploads/not-cooling-jsonld.jpg"],"datePublished":"2026-05-20T08:00:00+07:00"}
</script>
</head><body><p>เนื้อหาบทความ</p></body></html>`;

test("parseArticleHtml prefers JSON-LD over OG tags and derives external_id from the URL slug", () => {
  const article = parseArticleHtml(SAMPLE_ARTICLE_HTML, "https://www.cwf-air.com/air-conditioner-not-cooling/");
  assert.equal(article.external_id, "air-conditioner-not-cooling");
  assert.equal(article.title, "แอร์ไม่เย็น สาเหตุและวิธีแก้ไข");
  assert.equal(article.summary, "คำอธิบายแบบละเอียดเกี่ยวกับแอร์ไม่เย็น");
  assert.equal(article.image_url, "https://www.cwf-air.com/wp-content/uploads/not-cooling-jsonld.jpg");
  assert.equal(article.published_at, "2026-05-20T08:00:00+07:00");
  assert.equal(article.link, "https://www.cwf-air.com/air-conditioner-not-cooling/");
});

test("parseArticleHtml falls back to OG tags, then <title>, when JSON-LD is absent", () => {
  const ogOnly = `<html><head>
    <meta property="og:title" content="หัวข้อจาก OG &amp; เครื่องหมาย">
    <meta property="og:description" content="คำอธิบายจาก OG">
    <meta property="og:image" content="https://www.cwf-air.com/og.jpg">
  </head><body></body></html>`;
  const article = parseArticleHtml(ogOnly, "https://www.cwf-air.com/some-post/");
  assert.equal(article.title, "หัวข้อจาก OG & เครื่องหมาย");
  assert.equal(article.summary, "คำอธิบายจาก OG");
  assert.equal(article.image_url, "https://www.cwf-air.com/og.jpg");

  const titleOnly = `<html><head><title>หัวข้อจาก title tag</title></head><body></body></html>`;
  const fromTitle = parseArticleHtml(titleOnly, "https://www.cwf-air.com/other-post/");
  assert.equal(fromTitle.title, "หัวข้อจาก title tag");
});

test("parseArticleHtml returns null when no usable title can be found", () => {
  assert.equal(parseArticleHtml("<html><head></head><body>no metadata here</body></html>", "https://www.cwf-air.com/x/"), null);
});

test("fetchFromSeedUrls skips unreachable or unparsable URLs and keeps going", async () => {
  const seedUrls = [
    "https://www.cwf-air.com/air-conditioner-water-leaking/",
    "https://www.cwf-air.com/broken-page/",
    "https://www.cwf-air.com/air-conditioner-not-cooling/",
  ];
  await withMockFetch(async (url) => {
    if (String(url).includes("broken-page")) return htmlResponse("", { status: 500 });
    if (String(url).includes("water-leaking")) return htmlResponse(`<html><head><meta property="og:title" content="แอร์มีน้ำหยด"></head></html>`);
    return htmlResponse(SAMPLE_ARTICLE_HTML);
  }, async () => {
    const results = await fetchFromSeedUrls(seedUrls);
    assert.equal(results.length, 2);
    assert.equal(results[0].title, "แอร์มีน้ำหยด");
    assert.equal(results[1].external_id, "air-conditioner-not-cooling");
  });
});

test("fetchArticlesFromSource tries the WordPress REST API first and only falls back to seed URLs when it yields nothing", async () => {
  let apiCalled = false;
  let seedCalled = false;
  await withMockFetch(async (url) => {
    if (String(url).includes("/wp-json/")) { apiCalled = true; return jsonResponse([{ id: 1, slug: "a", link: "https://www.cwf-air.com/a/", title: { rendered: "A" }, excerpt: { rendered: "x" }, date: "2026-01-01" }]); }
    seedCalled = true;
    return htmlResponse(SAMPLE_ARTICLE_HTML);
  }, async () => {
    const result = await fetchArticlesFromSource("https://www.cwf-air.com", { seedUrls: ["https://www.cwf-air.com/air-conditioner-not-cooling/"] });
    assert.equal(result.length, 1);
    assert.equal(apiCalled, true);
    assert.equal(seedCalled, false);
  });

  await withMockFetch(async (url) => {
    if (String(url).includes("/wp-json/")) { apiCalled = true; return jsonResponse({}, { status: 404 }); }
    seedCalled = true;
    return htmlResponse(SAMPLE_ARTICLE_HTML);
  }, async () => {
    apiCalled = false;
    seedCalled = false;
    const result = await fetchArticlesFromSource("https://www.cwf-air.com", { seedUrls: ["https://www.cwf-air.com/air-conditioner-not-cooling/"] });
    assert.equal(result.length, 1);
    assert.equal(apiCalled, true);
    assert.equal(seedCalled, true);
  });
});

test("syncArticles upserts fetched articles into the pool and getSyncedArticles shapes them as homepage items", async () => {
  const pool = createSyncPool();
  await withMockFetch(async () => jsonResponse([
    { id: 1, slug: "air-conditioner-not-cooling", link: "https://www.cwf-air.com/air-conditioner-not-cooling/", title: { rendered: "แอร์ไม่เย็น" }, excerpt: { rendered: "สาเหตุและวิธีแก้" }, date_gmt: "2026-05-20T08:00:00", _embedded: { "wp:featuredmedia": [{ source_url: "https://www.cwf-air.com/img.jpg" }] } },
  ]), async () => {
    const result = await syncArticles(pool, "https://www.cwf-air.com/", {});
    assert.equal(result.ok, true);
    assert.equal(result.synced, 1);
    assert.equal(result.fetched, 1);
  });

  const { articles, last_synced_at } = await getSyncedArticles(pool, "https://www.cwf-air.com", 12);
  assert.equal(articles.length, 1);
  assert.equal(articles[0].title, "แอร์ไม่เย็น");
  assert.equal(articles[0].body, "สาเหตุและวิธีแก้");
  assert.equal(articles[0].image_url, "https://www.cwf-air.com/img.jpg");
  assert.equal(articles[0].url, "https://www.cwf-air.com/air-conditioner-not-cooling/");
  assert.ok(articles[0].date_label);
  assert.ok(last_synced_at);
});

test("syncArticles rejects an invalid source URL without making any network calls", async () => {
  const pool = createSyncPool();
  let fetchCalled = false;
  await withMockFetch(async () => { fetchCalled = true; return jsonResponse([]); }, async () => {
    const result = await syncArticles(pool, "not-a-url", {});
    assert.equal(result.ok, false);
    assert.equal(result.error, "INVALID_SOURCE_URL");
  });
  assert.equal(fetchCalled, false);
});

test("getSyncedArticles returns an empty result for a source with no cached rows", async () => {
  const pool = createSyncPool();
  const { articles, last_synced_at } = await getSyncedArticles(pool, "https://www.cwf-air.com", 12);
  assert.deepEqual(articles, []);
  assert.equal(last_synced_at, null);
});
