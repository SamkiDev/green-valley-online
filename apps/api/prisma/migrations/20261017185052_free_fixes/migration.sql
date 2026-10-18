-- AlterTable
ALTER TABLE "Cart" ADD COLUMN     "fulfilment" "Fulfilment" NOT NULL DEFAULT 'DELIVERY',
ADD COLUMN     "storeSlug" TEXT NOT NULL DEFAULT 'meat-market',
ADD COLUMN     "zoneId" TEXT;

-- AlterTable
ALTER TABLE "DeliveryZone" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "suburbs" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "privacyAcceptedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "privacyAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Cart_customerId_key" ON "Cart"("customerId");

