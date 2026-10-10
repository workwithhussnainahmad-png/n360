# Nisaab360 search files

These are ready-to-host copies for `https://nisaab360.app`:

| File | Public URL |
| --- | --- |
| `sitemap.xml` | `https://nisaab360.app/sitemap.xml` |
| `robots.txt` | `https://nisaab360.app/robots.txt` |
| `llms.txt` | `https://nisaab360.app/llms.txt` |

The XML snapshot contains the eight built-in public pages. It excludes all login pages, including employee, institution/admin and super-admin logins, and private portal pages. It does not export database-managed pages or blog posts. The application's dynamic sitemap includes eligible managed pages and published posts when deployed against the production database.

## Publish with this application

Deploy the updated `src/app/sitemap.ts`, `src/app/robots.ts`, and `public/llms.txt` through the normal production build/release process. Next.js serves them at the three public URLs above. These local changes do not update an already-running deployment.

Do not copy this directory's `sitemap.xml` or `robots.txt` into `public/` while the existing metadata routes remain: they would compete for the same URLs. The files in this directory are standalone exports for download or a separately configured web server. They are not automatically served by Next.js. For a separate static host, serve these filenames from the domain's web root; these rules are intended for the apex domain, not tenant subdomains. The static sitemap snapshot needs manual updates as public content changes.

## Submit to Google

1. Deploy the updated application, or publish the standalone files with your web server.
2. Open all three public URLs and confirm the new content appears. The updated sitemap contains `/faq`, `/download-app`, and `/download-software`, and does not contain `/login`. If a CDN cache override still returns old content after deployment, purge these exact URLs.
3. In Google Search Console, select the `nisaab360.app` property, open **Sitemaps**, and submit `https://nisaab360.app/sitemap.xml` (or `sitemap.xml` if the field already supplies the domain).

Search Console receives the hosted sitemap URL, not a local file upload. Keep `robots.txt` at the domain root; Google fetches it automatically. `llms.txt` is descriptive information for tools that support it, not a sitemap to submit to Google. It is not required for Google's AI search features.

References: [Google sitemap submission](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [Google robots.txt setup](https://developers.google.com/crawling/docs/robots-txt/create-robots-txt), [Google AI features](https://developers.google.com/search/docs/appearance/ai-features).
