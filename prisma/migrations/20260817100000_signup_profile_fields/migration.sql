-- Signup profile fields (client revision: first/last name, mobile, suburb, state)
ALTER TABLE "User" ADD COLUMN "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN "lastName" TEXT;
ALTER TABLE "User" ADD COLUMN "mobile" TEXT;
ALTER TABLE "User" ADD COLUMN "suburb" TEXT;
ALTER TABLE "User" ADD COLUMN "state" TEXT;
