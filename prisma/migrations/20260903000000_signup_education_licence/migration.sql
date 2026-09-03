-- Signup profile fields (client revision): education type + NSW-style licence status.
-- Nullable, no default — mirrors 20260817100000_signup_profile_fields. Enforced as
-- required at the API validation layer, not in the database.
ALTER TABLE "User" ADD COLUMN "educationType" TEXT;
ALTER TABLE "User" ADD COLUMN "licenceStatus" TEXT;
