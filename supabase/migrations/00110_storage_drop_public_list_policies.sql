-- Session 1 — Fix advisor sécu : public_bucket_allows_listing
-- Drop les policies SELECT qui permettent le listing énumératif des buckets
-- publics avatars et exercise-gifs. Les URLs publiques directes
-- /storage/v1/object/public/<bucket>/<path> continuent de fonctionner grâce au
-- flag storage.buckets.public = true (vérifié). Aucun .list() dans le code.

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
DROP POLICY IF EXISTS "exercise_gifs_public_read" ON storage.objects;
