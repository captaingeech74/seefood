# Management Menu Tools

## Product Decision

Management has two explicit ways to improve the menu:

1. Rank the seven items management believes guests order most.
2. Photograph one or more menu pages and convert them into an editable draft.

These are different signals and must remain separate.

## Management Top 7

`management_popular_items` stores a restaurant-scoped rank from 1 through 7.
The rank is management's stated popularity, not a customer-love count and not a
claim that SeeFood independently observed the same behavior.

Popular 7 uses this as its core menu set. Standard and Growth may also provide
the ranking because it is valuable input to the hero pipeline. In the customer
grid, management rank creates a strong popularity signal and enables the
`#1`, `#2`, and `#3 Most Popular` labels. It does not override photo quality,
customer loves, representative-photo votes, or whether a usable photo exists.

## Menu Page Capture

Management may capture a page with the camera or select multiple page images.
The browser compresses ordinary phone images before upload. The server repeats
orientation, size, metadata stripping, and WebP normalization.

Each page is processed independently to avoid a multi-page request exceeding
serverless request limits. Gemini extracts orderable food, drinks, desserts,
sides, and separately sold add-ons with exact printed names, descriptions,
prices, category headings, and confidence. The client merges duplicate names
across pages.

The extracted menu is always a draft. Management can:

- edit names and descriptions;
- remove false positives;
- add a missed item;
- review source page and confidence;
- confirm the complete set before publishing.

Publishing writes `merchant` menu rows through the existing source-specific
corpus path. It does not retire or overwrite Google, website, DoorDash,
customer, or other source records. Menu-page images are stored in R2 and the
import audit is recorded in `management_menu_imports`.

## Current Boundary

The management interface remains a clearly labeled development sample without
authentication. Before real merchant access, both management endpoints require
owner/manager authorization and the restaurant ID must come from the verified
session rather than the sample LRay's Kitchen constant.
