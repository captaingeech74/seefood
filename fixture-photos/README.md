# Fixture photos

For Kyle: drop your own photos here to use as "management" photos on the
LRay's Kitchen test restaurant.

1. Put image files (jpg/png/webp/heic) into `fixture-photos/inbox/`.
2. Run `npm run ingest-fixture-photos`.
3. Each photo gets identified (dish name + description derived automatically
   via the same AI vision step the live app uses), uploaded, and added to
   the menu as an owner/management photo. Files move to `processed/` once
   done — safe to run again any time you add more.
4. Check the result at https://seefood-rho.vercel.app/r/lrays-kitchen-temecula

If a photo isn't a clear shot of a single dish, it's skipped and left in
`inbox/` for you to review rather than guessed at.
