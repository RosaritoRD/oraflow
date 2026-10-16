# Subscriber conversion

The Performance panel separates Shorts from long videos and shows which videos turn views into subscribers. A native Short is recognized by `contentFormat: short`, even if publishing uses `contentType: long_form` to identify the production flow.

## Reading the results

- **Shorts:** subscribers gained / engaged views × 1,000.
- **Long videos:** subscribers gained / views × 1,000.
- Each row shows the first and last day YouTube actually returned.
- A measured zero is shown as zero. A report without joint data, simulated, or without a positive denominator stays pending.
- The «Unidentified format» group keeps the videos without enough context.

Compare pieces of the same format over similar periods before repeating a topic or changing a hook. A high rate with few views carries little evidence; this table doesn't declare winners or start experiments automatically. The metrics show associations and don't prove that an editorial change caused the result.

## Data contract

`getOutcomeAnalytics` queries `views,engagedViews,subscribersGained,subscribersLost` together, with `day` as dimension and sort. `subscriberConversion` validates the rows and stores both the requested period and the one actually returned. It never divides one window's subscribers by cumulative public views or by metrics from another query. Revenue is still a separate query.

Old reports aren't reinterpreted as conversion measurements. They're measured again with the existing analytics flow. On restart, the publishing context recovers the format and the stored report serves as a fallback. No SQLite schema migration is needed.

YouTube may return data only up to the last day for which all requested metrics are available. On 3 October 2026 a daily query from 29 September to 2 October was verified on the channel: it returned data up to 30 September, with 2,482 views, 1,034 engaged views and 23 subscribers gained. It's a check of the query, not a permanently updated indicator.

## Validating the change

- 7 new tests cover the joint query, the real cut-off, missing data and zeros, per-format denominators, excluding simulations, native Shorts and reloading the history.
- 34 conversion and analytics-reliability tests pass.
- Full suite `node test.js`: 59/59 passing.
- Browser: Spanish and English at 390 and 1,440 pixels; no JavaScript errors or page overflow; titles escaped and zeros/pending told apart.

On 4 October the mobile check was extended: the table container must fit on screen and allow horizontal scrolling to the last column. A clipping at 390 pixels caused by a grid child's automatic minimum size was reproduced; `min-width: 0` on `#subscriber-growth` keeps scrolling inside the table. The check waits for the document's entry animation to finish so it measures its stable size.

## First history update

On 4 October 2026, at 04:59 UTC, 19 videos were updated successfully through the existing analytics flow, keeping each video's preferred window. 17 conversion measurements were obtained: 5 Shorts and 12 long videos. 2 videos were left pending YouTube data. Internal reports and learning snapshots are updated, without publishing videos or changing their titles.

## Official sources checked on 3 October 2026

- [YouTube: how Shorts views and engaged views are counted](https://support.google.com/youtube/answer/10059070).
- [YouTube Analytics: metric availability over time](https://developers.google.com/youtube/analytics/reference/reports/query).
- [YouTube Analytics: channel reports and supported metrics](https://developers.google.com/youtube/analytics/channel_reports).
