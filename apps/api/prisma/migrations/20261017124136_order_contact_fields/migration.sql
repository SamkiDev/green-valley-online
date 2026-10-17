-- Rename the checkout contact columns; they now hold contact details for every order, not only guests.
ALTER TABLE "Order" RENAME COLUMN "guestName" TO "contactName";
ALTER TABLE "Order" RENAME COLUMN "guestPhone" TO "contactPhone";
ALTER TABLE "Order" RENAME COLUMN "guestEmail" TO "contactEmail";
