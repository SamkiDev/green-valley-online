-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "lastAccuracy" DOUBLE PRECISION,
ADD COLUMN     "lastLat" DOUBLE PRECISION,
ADD COLUMN     "lastLng" DOUBLE PRECISION,
ADD COLUMN     "lastLocationAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TrackingPoint" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackingPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrackingPoint_deliveryId_at_idx" ON "TrackingPoint"("deliveryId", "at");

-- CreateIndex
CREATE INDEX "TrackingPoint_at_idx" ON "TrackingPoint"("at");

-- AddForeignKey
ALTER TABLE "TrackingPoint" ADD CONSTRAINT "TrackingPoint_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
