# Menu Intelligence

## Product Thesis

Menu Intelligence gives restaurant owners a customer-side understanding of
individual menu items. POS systems explain what sold. Review platforms explain
what a small, vocal subset wrote. SeeFood can explain what people chose to look
at, love, photograph, compare, revisit, and share before and after a menu
change.

The interface must answer three questions in this order:

1. What changed?
2. Why might it be changing?
3. What should management do next?

It is deliberately a ranked decision surface rather than a dashboard of charts.

## V1 Signals

- **Item opens:** unique people who opened a menu item.
- **Love rate:** people who loved the item divided by people who opened it.
- **Momentum:** current-period rate compared with the matching prior period,
  normalized for total restaurant traffic.
- **Customer photo lift:** engagement with customer photos compared with
  management photos for the same item.
- **Regular share:** the share of item engagement from returning restaurant
  visitors.
- **Comparison readiness:** whether both management and customer evidence exists.
- **Learning window:** a declared new item or management change with a fixed
  before/after comparison period.

These are behavioral signals, not claims about sales, profitability, or
sentiment. Low-sample results must be labeled as early and cannot create a
strong recommendation.

## Management Decisions It Should Support

- Keep featuring an item that is gaining customer interest.
- Replace a lead photo when customer photography materially outperforms it.
- Ask an item's early fans for more customer photos.
- Understand whether regular customers accepted a recipe or presentation change.
- Find a promising item with high love but weak visibility.
- Recognize the strongest supporters of one item with a personal Hookup.
- Notice a core item losing attention before the decline becomes obvious in sales.

## Change Tracking

Management can mark a recipe, plating, price, name or description, lead photo,
or portion change. SeeFood stores the item, change type, timestamp, and an
internal note. It compares equal windows before and after the change and
separates returning customers, who knew the old version, from new customers.

Future high-value feedback can ask only the most relevant people one lightweight
question, such as Better, Same, or Miss the old one. It should never become a
general survey builder.

## Action Loop

Every important signal should have one primary action: review photos, request
customer photos, keep featured, mark a change, or send a Hookup to the relevant
supporters. The eventual category advantage is a closed loop from customer
behavior to management action to a fresh customer response.

## Research Basis

The product borrows the useful discipline, not the UI, of established
restaurant reporting:

- Toast emphasizes menu-item product mix, comparative periods, and trend
  identification.
- Square emphasizes matching restaurant cycles with week-over-week comparison
  and breaking performance down to understand the source of change.
- Traditional menu engineering joins popularity with profitability. SeeFood
  intentionally owns the complementary customer-perception layer and should
  later combine with POS economics when merchants connect them.

The current route is a clearly labeled product sample. Real production signals
require authenticated management access, event aggregation, minimum sample
rules, and server-backed change annotations.
