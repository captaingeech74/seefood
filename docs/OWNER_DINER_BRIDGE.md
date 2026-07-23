# Management-to-Diner Bridge

## Product Thesis

Restaurants already have a small group of diners who create disproportionate
value by returning, loving dishes, sharing photos, and bringing friends.
SeeFood should help management recognize those people and extend a personal
olive branch before the relationship cools. The core object is a **Hookup**:
a management-sent offer that feels selected, works for the member and friends,
and is redeemed inside SeeFood without touching payment.

## V1 Flow

1. Management chooses an offer, expiration, and the top N supporters.
2. SeeFood ranks supporters from restaurant visits, dish loves, useful photo
   contributions, shares, and recency.
3. Each selected member receives the Hookup in My SeeFood.
4. The member presents a unique QR code at the restaurant.
5. An owner or manager scans it in the management view, marking it used.
6. Management can see sent, used, expired, and recipient-level redemption.

The current build is a browser-persisted product sample. It demonstrates this
entire interaction without pretending that accounts, messaging, or secure
server-side coupon issuance are already complete.

## Guardrails for Simplicity

- Default to offers for the member **and friends**.
- Start with top 10, 25, 50, or 100 supporters, not a segment builder.
- One scan means one redemption. No payment integration.
- Lead with recognition and invitation language, not bulk discount language.
- Show only the metrics that help management decide what to do next.

## Expansion Ideas, Ordered by Product Value

1. **Recognition note:** management adds one sentence such as “You’ve shown
   our rotisserie chicken a lot of love.” Personal context makes the offer feel
   earned instead of broadcast.
2. **Bring-the-table defaults:** offers are written for two to four people and
   explicitly encourage bringing someone new.
3. **Dish-specific Hookups:** invite top fans of a particular dish to try a
   new variation, seasonal item, or tasting.
4. **First-look circle:** selected supporters get early access to a new menu
   item and are invited to add the first customer photos.
5. **Thank-the-photographer:** automatically suggest a Hookup when a member
   photo reaches Gold or drives meaningful dish engagement.
6. **Win-back moment:** identify a formerly frequent supporter who has not
   returned recently, without turning the product into a surveillance feed.
7. **Surprise upgrade:** management can attach a non-discount gesture such as
   a chef hello, off-menu taste, priority reservation note, or complimentary
   shared item.
8. **Supporter milestones:** celebrate a tenth visit, fifth useful photo, or
   hundredth love received with a management-triggered recognition.
9. **Friend conversion:** after redemption, invite the accompanying friends
   to save the restaurant and contribute a photo, while keeping the original
   member visibly credited for bringing the table.
10. **Management replies:** owners can thank a member for a useful photo using
    a small set of warm, controlled responses before adding freeform messaging.
11. **Supporter circle:** an opt-in, limited group for tastings and menu
    feedback, positioned as access rather than a generic loyalty program.
12. **Community nights:** invite several high-affinity members, each with
    friends, to a coordinated low-demand time and measure new-party creation.

The category-defining opportunity is not “restaurant coupons.” It is making
restaurant appreciation visible, specific, and reciprocated.
