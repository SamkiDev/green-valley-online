// DEMO DATA ONLY (isDemo=true). Fictional people, demo prices. Never run against a real shop's database.
// On a hosted demo (NODE_ENV=production) it needs SEED_PASSWORD and only runs on an empty database.
import { PrismaClient } from '@prisma/client'; import bcrypt from 'bcryptjs';
const db = new PrismaClient();
// [name, category, demo price (per kg when soldByWeight), soldByWeight, stock (kg or units), popularity, description]
const P: [string, string, number, boolean, number, number, string][] = [
  ['Beef Mince', 'Beef', 99.99, true, 18, 88, 'Fresh beef mince for burgers, meatballs and everyday cooking.'],
  ['T-Bone Steak', 'Beef', 169.99, true, 0, 80, 'Classic T-bone, ideal for the braai.'],
  ['Sirloin Steak', 'Beef', 189.99, true, 12, 74, 'Tender sirloin cut.'],
  ['Beef Short Ribs', 'Beef', 109.99, true, 10, 61, 'Rich ribs for slow cooking or the braai.'],
  ['Beef Brisket', 'Beef', 129.99, true, 8, 42, 'Great for smoking or slow roasting.'],
  ['Stewing Beef', 'Beef', 99.99, true, 14, 55, 'Cubed beef for stews and potjies.'],
  ['Whole Chicken', 'Chicken', 74.99, false, 20, 70, 'Fresh whole chicken.'],
  ['Chicken Wings', 'Chicken', 64.99, true, 15, 77, 'Perfect for marinating and braaiing.'],
  ['Chicken Drumsticks', 'Chicken', 54.99, true, 16, 66, 'Juicy drumsticks.'],
  ['Chicken Thighs', 'Chicken', 59.99, true, 12, 58, 'Flavourful thighs.'],
  ['Chicken Breasts', 'Chicken', 89.99, true, 12, 63, 'Skinless breast fillets.'],
  ['Pork Chops', 'Pork', 89.99, true, 9, 50, 'Thick-cut pork chops.'],
  ['Pork Ribs', 'Pork', 119.99, true, 7, 57, 'Pork ribs for the braai or oven.'],
  ['Pork Belly', 'Pork', 99.99, true, 6, 39, 'Pork belly for roasting.'],
  ['Lamb Chops', 'Lamb', 179.99, true, 6, 68, 'Lamb loin chops.'],
  ['Lamb Stew', 'Lamb', 139.99, true, 9, 44, 'Lamb pieces for potjies.'],
  ['Lamb Ribs', 'Lamb', 149.99, true, 5, 47, 'Lamb ribs for the braai.'],
  ['Boerewors', 'Braai', 89.99, true, 3, 95, 'Traditional boerewors.'],
  ['Braai Pack', 'Braai', 249.99, false, 10, 85, 'Starter braai pack.'],
  ['Steak Pack', 'Braai', 299.99, false, 0, 72, 'Selection of steaks, serves 4.'],
  ['Mixed Grill Pack', 'Braai', 329.99, false, 5, 69, 'Assorted cuts for the grill, serves 4.'],
  ['Family Braai Pack', 'Braai', 549.99, false, 8, 90, 'Wors, chops, chicken and steak for about 6 people.'],
];
// Activating a store later is a status/config change (status: 'ACTIVE'), not code.
// Opening hours, WhatsApp number and compliance text are configured by an admin; nothing real is hard-coded here.
const STORES = [
  { slug: 'meat-market', name: 'Green Valley Meat Market', category: 'Butcher / Meat Wholesaler', status: 'ACTIVE', ageRestricted: false,
    description: 'Fresh quality meat, braai packs and bulk & wholesale orders.',
    config: { accent: { primary: '#B91C1C', secondary: '#111111' }, whatsapp: '', hours: '', wholesale: true, delivery: true, collection: true,
      deliveryWindowMinutes: [60, 120] /* DEMO estimate; configure real times in admin */ } },
  { slug: 'farm-stall', name: 'Green Valley Farm Stall', category: 'Fresh Produce', status: 'COMING_SOON', ageRestricted: false,
    description: 'Fresh fruit, vegetables and farm produce.',
    config: { accent: { primary: '#B8860B', secondary: '#166534' }, whatsapp: '', hours: '' } },
  { slug: 'bottle-liquors', name: 'Green Valley Bottle Liquors', category: 'Liquor', status: 'COMING_SOON', ageRestricted: true,
    description: 'Beers, wines and spirits.',
    config: { accent: { primary: '#1E3A8A', secondary: '#0F172A' }, whatsapp: '', hours: '',
      ageVerification: { required: true, minimumAge: 18 }, responsibleSaleMessage: 'Please drink responsibly.', complianceNotice: '' } },
  { slug: 'supermarket', name: 'Green Valley Supermarket', category: 'Groceries', status: 'COMING_SOON', ageRestricted: false,
    description: 'Everyday groceries and household essentials.',
    config: { accent: { primary: '#0284C7', secondary: '#0C4A6E' }, whatsapp: '', hours: '' } },
];
async function main() {
  // Hosted demo: the demo accounts must not use the public default password, and a restart must not undo admin edits.
  if (process.env.NODE_ENV === 'production') {
    if ((process.env.SEED_PASSWORD ?? '').length < 12) throw new Error('Set SEED_PASSWORD (12+ characters) before seeding a hosted demo: the demo accounts would otherwise use the public default password.');
    if (await db.store.count()) { console.log('Demo data already present; seed skipped.'); return; }
  }
  for (const s of STORES) await db.store.upsert({ where: { slug: s.slug }, update: { name: s.name, category: s.category, description: s.description }, create: s });
  const meat = await db.store.findUniqueOrThrow({ where: { slug: 'meat-market' } });
  for (const [name, fee] of [['Zone 1 – Nearby areas', 40], ['Zone 2 – Extended areas', 65], ['Zone 3 – Further delivery area', 100]] as const)
    if (!(await db.deliveryZone.findFirst({ where: { storeId: meat.id, name } }))) await db.deliveryZone.create({ data: { storeId: meat.id, name, fee } });
  if (!(await db.product.count({ where: { storeId: meat.id } })))
    for (const [name, cat, price, kg, qty, popularity, description] of P) {
      const category = await db.category.upsert({ where: { name: cat }, update: {}, create: { name: cat } });
      await db.product.create({ data: { storeId: meat.id, categoryId: category.id, name, description, price, soldByWeight: kg, popularity, inventory: { create: { quantity: qty } } } });
    }
  const pw = await bcrypt.hash(process.env.SEED_PASSWORD || 'demo-password-1', 12);
  const mk = (email: string, name: string, role: 'ADMIN' | 'DRIVER' | 'STORE_STAFF' | 'CUSTOMER', extra: object) => db.user.upsert({ where: { email }, update: {}, create: { email, name, role, passwordHash: pw, ...extra } });
  await mk('admin@demo.local', 'Demo Admin', 'ADMIN', { admin: { create: {} } });
  await mk('driver1@demo.local', 'Sipho Demo', 'DRIVER', { driver: { create: { vehicle: 'Demo van' } } });
  await mk('staff@demo.local', 'Lerato Demo', 'STORE_STAFF', { staff: { create: { storeId: meat.id } } });
  await mk('customer@demo.local', 'Naledi Demo', 'CUSTOMER', { customer: { create: {} } });
  console.log('Seeded demo data. Demo logins use SEED_PASSWORD or the default in this file (demo only).');
}
main().finally(() => db.$disconnect());
