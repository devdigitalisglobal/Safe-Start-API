-- Remove placeholder helpful links requested by client (Aug 2026).
DELETE FROM "ResourceItem"
WHERE "category" = 'helpful_links'
  AND "title" IN (
    'Roadside Assistance (TBC)',
    'Insurance (TBC)',
    'Car Buying (TBC)'
  );
