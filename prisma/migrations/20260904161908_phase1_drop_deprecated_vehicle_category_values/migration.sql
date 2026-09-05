-- AlterEnum
BEGIN;
CREATE TYPE "VehicleCategory_new" AS ENUM ('CRANE', 'TRUCK', 'TRAILER', 'PICKUP', 'OTHER');
ALTER TABLE "public"."Vehicle" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "Vehicle" ALTER COLUMN "category" TYPE "VehicleCategory_new" USING ("category"::text::"VehicleCategory_new");
ALTER TYPE "VehicleCategory" RENAME TO "VehicleCategory_old";
ALTER TYPE "VehicleCategory_new" RENAME TO "VehicleCategory";
DROP TYPE "public"."VehicleCategory_old";
ALTER TABLE "Vehicle" ALTER COLUMN "category" SET DEFAULT 'OTHER';
COMMIT;

