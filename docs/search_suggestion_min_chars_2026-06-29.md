# Search suggestion minimum length

Date: 2026-06-29

## Summary

Asset suggestion requests now start after 3 typed characters instead of 2. This applies to asset-style autocomplete fields in the first column and the administration pages. User and LDAP/Keycloak user searches keep their existing behavior and are not part of this threshold change.

The same performance pass also paginates the admin OCR and subtitle record lists. Those lists now load 20 records per page and use previous/next controls instead of rendering every OCR/subtitle record in one request.

## Why 3 characters

Two-character autocomplete queries can match a very large portion of the asset catalog. That increases unnecessary frontend requests and backend DB/Elasticsearch work, especially as the asset count grows. A 3-character minimum is a small guardrail that reduces broad suggestion traffic without changing explicit search form submissions.

## Affected areas

- First column asset suggestions.
- First column OCR suggestions.
- First column subtitle suggestions.
- Video tools subtitle suggestions.
- Admin proxy/audit/asset-rights asset suggestions.
- Admin asset-rights group token suggestions.
- Backend asset suggestion endpoint.
- Backend OCR/subtitle suggestion endpoints.

## Not affected

- LDAP / Keycloak user search.
- Normal user permissions search.
- Explicit full search actions such as pressing search or submitting the search form.

## Files changed

- `public/main-search-suggest.js`
- `public/main-video-tools.js`
- `public/admin.js`
- `public/admin-records.js`
- `public/admin.html`
- `src/server.js`
- `src/routes/admin.js`
- `src/routes/assets.js`
- `src/routes/textProcessing.js`

## Current threshold

The current minimum is `3` characters.

Relevant checks look like:

```js
if (query.length < 3) {
  hideSearchSuggestions();
  return;
}
```

or:

```js
if (q.length < 3) return res.json([]);
```

## Changing the threshold later

If the minimum should become 4 characters later, update only the autocomplete/suggestion guards from `3` to `4` in the files listed above.

Do not change user/LDAP search guards such as:

```js
if (q.length < 2) {
  ...
}
```

Those are intentionally left at 2 characters because user lookup is manually triggered and needs to remain usable for short usernames.

## Verification

Run:

```bash
node --check src/server.js
node --check src/routes/assets.js
node --check src/routes/textProcessing.js
node --check public/main-search-suggest.js
node --check public/main-video-tools.js
node --check public/admin.js
node --check public/admin-records.js
```

Manual checks:

- Type 1 or 2 characters in first-column asset/OCR/subtitle suggestion fields. No suggestion request should be made and no dropdown should appear.
- Type 3 characters. Suggestions may appear.
- In admin asset suggestion fields, 1 or 2 characters should not trigger suggestions; 3 characters should.
- User and LDAP/Keycloak search behavior should remain unchanged.
- Open Management > Settings > OCR. OCR records should show 20 rows per page with previous/next controls.
- Open Management > Settings > Subtitles. Subtitle records should show 20 rows per page with previous/next controls.
- Search in either OCR/subtitle list. The page should reset to page 1 and still load 20 records at a time.
