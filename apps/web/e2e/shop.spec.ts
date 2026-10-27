import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const ADMIN = { email: 'admin@demo.local', password: process.env.ADMIN_PASSWORD ?? 'demo-password-1' };
const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

type P = { id: string; name: string; soldByWeight: boolean; store?: { slug: string }; inventory: { quantity: string } | null };

/** The Meat Market item (sold per item) with the most stock, so repeated test runs don't run out. */
async function stockedItem(request: APIRequestContext) {
  const all: P[] = await (await request.get('/api/products?store=meat-market&inStock=1')).json();
  const items = all.filter(p => !p.soldByWeight).sort((a, b) => Number(b.inventory?.quantity ?? 0) - Number(a.inventory?.quantity ?? 0));
  if (!items.length || Number(items[0].inventory?.quantity ?? 0) < 3) throw new Error('No stock left: run npm run db:reset -w apps/api');
  return items[0];
}

async function addToCart(page: Page, request: APIRequestContext) {
  const p = await stockedItem(request);
  await page.goto(`/product/${p.id}`);
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await expect(page.getByRole('button', { name: 'Added' }).first()).toBeVisible();
  return p.name;
}

async function fillContact(page: Page) {
  await page.getByLabel('First name').fill('Playwright');
  await page.getByLabel('Surname').fill('Tester');
  await page.getByLabel('Phone', { exact: true }).fill('082 123 4567');
  await page.getByLabel('Email', { exact: true }).fill(`pw-${unique()}@demo.local`);
}

test('guest checks out for collection and pays @mobile', async ({ page, request }) => {
  await addToCart(page, request);
  await page.goto('/cart');
  await page.getByRole('button', { name: 'Collect in store' }).click();
  await page.getByRole('button', { name: /checkout/i }).click();
  await page.getByRole('button', { name: 'Continue as guest' }).click();
  await fillContact(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: /Collect from store/ }).check();
  await page.getByRole('button', { name: 'Continue' }).click();

  // POPIA: guests must accept the privacy policy before the order is placed.
  await page.getByRole('button', { name: /Place order/ }).click();
  await expect(page.getByText('Please accept the privacy policy and terms to place your order')).toBeVisible();
  await page.getByRole('checkbox', { name: /privacy policy/ }).check();
  await page.getByRole('button', { name: /Place order/ }).click();

  await expect(page).toHaveURL(/\/checkout\/pay\//);
  await expect(page.getByTestId('pay-deadline')).toContainText('Please pay by');
  await page.getByRole('button', { name: /Pay Now/ }).click();
  await expect(page.getByText('Order confirmed')).toBeVisible();
});

test('registration needs consent, and the cart follows the customer to another device', async ({ page, request, browser }) => {
  test.slow(); // several password hashes (bcrypt) on a busy laptop
  const email = `pw-${unique()}@demo.local`;
  await page.goto('/account');
  await page.getByRole('tab', { name: 'Register' }).click();
  await page.getByLabel('Full name').fill('Playwright Customer');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password').fill('playwright-pass-1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Please accept the privacy policy and terms to create an account')).toBeVisible();
  await page.getByRole('checkbox', { name: /privacy policy/ }).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: /Hello, Playwright/ })).toBeVisible();

  const saved = page.waitForResponse(r => r.url().endsWith('/api/cart') && r.request().method() === 'PUT' && r.ok());
  const item = await addToCart(page, request);
  await saved;

  const phone = await browser.newContext();
  const page2 = await phone.newPage();
  await page2.goto('/account');
  await page2.getByLabel('Email', { exact: true }).fill(email);
  await page2.getByLabel('Password').fill('playwright-pass-1');
  await page2.getByRole('button', { name: 'Sign in' }).last().click();
  await expect(page2.getByRole('heading', { name: /Hello, Playwright/ })).toBeVisible();
  await page2.goto('/cart');
  await expect(page2.getByRole('main').getByText(item).first()).toBeVisible();
  await phone.close();

  // Signing out empties the cart on this device, so the next person on a shared phone doesn't see it.
  await page.goto('/account');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Sign in' })).toBeVisible();
  await page.getByRole('link', { name: /^Cart/ }).first().click();
  await expect(page.getByText('Your cart is empty')).toBeVisible();
});

test('Vallerie answers in basic mode without an AI key', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ask Vallerie, the shopping assistant' }).click();
  await page.getByRole('button', { name: 'How does delivery work?' }).click();
  await expect(page.getByText('● Basic mode')).toBeVisible();
  await expect(page.getByRole('dialog').getByText(/Zone 1/).first()).toBeVisible();
});

test('checkout picks the delivery zone from the suburb', async ({ page, request, playwright, baseURL }) => {
  const admin = await playwright.request.newContext({ baseURL });
  await admin.post('/api/auth/login', { data: ADMIN });
  const stores: { slug: string; zones: { id: string; name: string }[] }[] = await (await admin.get('/api/admin/stores')).json();
  const zone1 = stores.find(s => s.slug === 'meat-market')!.zones.find(z => z.name.startsWith('Zone 1'))!;
  expect((await admin.put(`/api/admin/zones/${zone1.id}`, { data: { suburbs: ['Playwright Park'] } })).ok()).toBeTruthy();
  try {
    await addToCart(page, request);
    await page.goto('/checkout');
    await page.getByRole('button', { name: 'Continue as guest' }).click();
    await fillContact(page);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('radio', { name: /^Delivery/ }).check();
    await expect(page.getByText('Your delivery zone and fee are set from your suburb on the next step.')).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Street address').fill('1 Test Street');
    await page.getByLabel('Suburb / area').fill('Nowhere Village');
    await page.getByLabel('Postal code').fill('2000');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText("We don't deliver to Nowhere Village yet")).toBeVisible();
    await page.getByLabel('Suburb / area').fill('playwright park');
    await expect(page.getByText(/Zone 1.*delivery R/)).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
  } finally {
    await admin.put(`/api/admin/zones/${zone1.id}`, { data: { suburbs: [] } });
    await admin.dispose();
  }
});

test('admin adds staff, resets a password, and previews a catalogue import', async ({ page, browser }) => {
  test.slow();
  const staffEmail = `pw-staff-${unique()}@demo.local`;
  page.on('dialog', d => d.accept());
  await page.goto('/admin');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

  await page.goto('/admin/staff');
  await page.getByRole('button', { name: 'Add staff member' }).click();
  await page.getByLabel('Full name').fill('Playwright Staff');
  await page.getByLabel('Email (sign-in)').fill(staffEmail);
  await page.getByLabel('First-time password').fill('first-pass-123');
  await page.getByRole('button', { name: 'Add staff member' }).click();
  const card = page.getByRole('listitem').filter({ hasText: staffEmail });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /Reset password/ }).click();
  const temp = (await page.getByTestId('temp-password').textContent())!.trim();
  expect(temp).toMatch(/^[a-z]+-\d{4}-[0-9a-f]{8}$/);

  // The staff member signs in with the temporary password and must choose their own.
  const staff = await browser.newContext();
  const s = await staff.newPage();
  await s.goto('/admin');
  await s.getByLabel('Email').fill(staffEmail);
  await s.getByLabel('Password').fill(temp);
  await s.getByRole('button', { name: 'Sign in' }).click();
  await expect(s.getByRole('heading', { name: 'Choose your own password' })).toBeVisible();
  await s.getByLabel('Temporary password', { exact: true }).fill(temp);
  await s.getByLabel('New password', { exact: true }).fill('my-own-pass-456');
  await s.getByLabel('Repeat new password').fill('my-own-pass-456');
  await s.getByRole('button', { name: 'Save password and continue' }).click();
  await expect(s.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await staff.close();

  // Import preview only: nothing is saved until the admin confirms.
  await page.goto('/admin/products');
  await page.getByRole('button', { name: 'Import products' }).click();
  await page.locator('input[type=file][accept=".csv,text/csv"]').setInputFiles({
    name: 'prices.csv', mimeType: 'text/csv',
    buffer: Buffer.from('name,category,price,unit,stock\nBeef Mince,Beef,111.11,kg,20\nPlaywright Wors,Braai,79.99,kg,5\nBad Row,Beef,abc,kg,1\n'),
  });
  await expect(page.getByText(/1 new, 1 to update, 1 with errors/)).toBeVisible();
  await expect(page.getByText(/price R[\d.]+ → R111\.11/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Import 2 products/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel' }).click();
});
