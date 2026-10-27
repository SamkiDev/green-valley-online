# Green Valley Online user guide

Last updated: 18 October 2026

Step-by-step instructions for everyone who uses Green Valley Online: the people running the shop, the drivers and the customers. Button names are written exactly as they appear on screen.

## Getting started

Everyone uses the same website on a phone or computer; there is nothing to install. Replace `[site]` below with the shop's web address.

| Who | Where to sign in | What they do |
| --- | --- | --- |
| Admin (owner or manager) | `[site]/admin` | Everything: orders, products, stock, staff, drivers, customers, store settings |
| Store staff | `[site]/admin` | Orders, products and stock for their own store only |
| Driver | `[site]/driver` | Accept deliveries and update each step on the road |
| Customer | `[site]` | Shop, pay, track orders; an account is optional |

Admins create every staff and driver account; drivers and staff cannot sign themselves up. New staff, and anyone whose password was reset, must choose their own password the first time they sign in.

## Admins and store staff

### Handling a new order

When a customer pays, a pop-up appears in the admin and the browser tab flashes "New order". Keep the admin open on the shop's computer or tablet during trading hours.

1. Click **Open orders** on the pop-up, or open **Orders**. Paid orders show as *Preparing*.
2. Pick and pack the items. For items sold per kg, weigh as close to the ordered amount as you can.
3. Under **Order status**, choose **Change to…** and pick **Packed**.
4. **Delivery orders:** under **Driver**, pick a driver. The order then appears in that driver's portal. Drivers can also accept unassigned deliveries themselves.
5. **Collection orders:** set the status to **Ready for collection**. When the customer has collected it, set **Collected**.
6. To cancel an order, choose **Cancelled** under **Order status**. Its stock goes back on sale. A delivery can no longer be cancelled once the driver has left.

To hear a chime for new orders, click **Order chime off** at the bottom of the admin menu (on a computer) so it reads **Order chime on**.

### Products and stock

- **Add a product:** **Products**, then **Add product**. Prices for weighed items are per kg.
- **Change a price or description:** **Edit** on the product, then **Save**.
- **Add a photo:** **Take photo** opens the phone camera; **Upload** picks a saved photo. To add many at once, use **Upload many photos** and name each file after its product, e.g. *Beef Mince.jpg*.
- **Load a whole price list:** **Import products** under *Import from a spreadsheet*. Use **Download template** the first time. Check the preview, then confirm; nothing changes before you confirm.
- **Hide a product for now:** **Mark unavailable**. It stays in the list and comes back with **Make available**.
- **Update stock:** **Inventory** lists the most urgent items first. Type the new quantity and click **Save** after a delivery or a stock count. Out-of-stock items can't be ordered.

### Questions and reviews

- **Q&A:** customers ask questions on product pages. Type an answer and click **Post answer**. Store staff answers show as *Not shown yet* until an admin clicks **Approve**.
- **Reviews:** only customers with a completed order can review. Use **Remove** on a review that breaks your rules.
- **Analytics** shows sales for the last 7 days and the best-selling products.

## Admins only

### Drivers and store staff

1. Open **Drivers** (or **Store staff**) and click **Add driver** (or **Add staff member**).
2. Fill in the name, the email they will sign in with, an optional phone number and, for staff, their store.
3. Type a first password of at least 8 characters and click the add button.
4. Send them the email and password privately, for example on WhatsApp. Staff must choose their own password at first sign-in.

**Disable** stops someone signing in straight away and signs them out on every device; **Enable** lets them back in. Disabled drivers can't be given deliveries.

### Forgotten passwords

There is no reset-by-email yet, so an admin resets passwords:

1. Find the person under **Customers**, **Drivers** or **Store staff** and click **Reset password**, then confirm.
2. A temporary password appears once. Click **Copy** and send it to them privately.
3. They are signed out everywhere, sign in with the temporary password, and must choose a new one.

### Store settings and delivery zones

- **Stores & settings** controls each store's WhatsApp number, opening hours and delivery time estimate. Click **Save settings** after changes.
- **Open online** makes a store and its available products visible to customers; **Set to coming soon** hides it again.
- **Delivery zones:** each zone has a name, a fee and a list of suburbs (separated by commas or one per line). Checkout picks the zone and fee from the customer's suburb and refuses addresses outside every list. A suburb can belong to one zone only. Use **Add zone** for a new zone and **Save zone** after changes; untick **Delivering to this zone** to pause one.

### Unpaid orders and bulk quotes

- An order reserves its stock until it is paid. Unpaid orders are cancelled automatically after 30 minutes and the stock goes back on sale. **Release unpaid orders** on the **Orders** page does this immediately.
- **Bulk quotes** lists requests sent from the Bulk & Wholesale page, with the customer's email and phone, so you can reply directly.

## Drivers

Sign in at `[site]/driver` on your phone. Your screen lists the deliveries assigned to you, plus paid deliveries no driver has taken yet.

1. **ACCEPT DELIVERY** to take the order. Check the address and the customer's phone number on the card.
2. Collect the packed order from the store, then tap **START DELIVERY**. The customer's tracking page now shows you are on the way.
3. Tap **Share my location** so the customer sees you on a map. **Pause sharing** stops it at any time. Your location is only shared while you are on the road.
4. At the address, tap **ARRIVED**.
5. Hand over the order and tap **DELIVERED**, then **TAP AGAIN TO CONFIRM DELIVERED**. The second tap stops accidental taps.

A **CHECK ID** badge means the order contains liquor: see proof that the person receiving it is 18 or older, or don't hand it over.

If a button says the delivery was already updated, refresh the page; someone else may have changed it.

## Customers

Share this part with customers, or send it as a WhatsApp message when the shop goes online.

1. Open `[site]`, browse **Shop** or search, and tap **Add to cart**. Items sold per kg let you choose the weight.
2. Not sure what to buy? Tap **Vallerie** and ask, for example "What do I need for a braai for 8?"
3. Open the cart, choose **Delivery** or **Collect in store**, and tap **Checkout**.
4. Sign in, create an account, or tap **Continue as guest**. Fill in your details and, for delivery, your street and suburb. The delivery fee appears from your suburb.
5. Accept the privacy policy and terms, tap **Place order & pay** and pay on the next screen. Pay within 30 minutes or the order is cancelled.
6. Follow your order on its tracking page. Guests can find it any time under **Track Order** with the order number and email.

With an account you also get saved addresses, **Favourites**, the full order history and **Order again**, which refills your cart from a past order with whatever is in stock. **Sign out everywhere** on the account page signs you out on every device.

## When something goes wrong

| Problem | What to do |
| --- | --- |
| Someone forgot their password | An admin resets it (see *Forgotten passwords*). Admins who forget theirs need another admin, or the developer. |
| The site takes a minute to open | On the free plan it sleeps after 15 quiet minutes. Wait about a minute; it then runs normally. |
| A customer's suburb is refused | Add the suburb to the right delivery zone in **Stores & settings**, or offer collection. |
| A product can't be added to the cart | It is out of stock or marked unavailable. Update **Inventory** or click **Make available**. |
| An order shows *Awaiting payment* | The customer hasn't paid yet. It cancels itself after 30 minutes and the stock returns. |
| No pop-up for new orders | Keep the admin page open (it can stay in a background tab) and check that the computer hasn't gone to sleep. |
| A driver can't share their location | The phone must allow location for the site, and the site must open with `https://`. |
| A staff member sees only some menus | That is expected: staff see their own store's orders, products, stock, Q&A, reviews and analytics; customers, drivers, staff accounts and store settings are for admins only. |
