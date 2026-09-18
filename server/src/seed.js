import * as db from './db.js';
import { hash } from './auth.js';

/** Datos de arranque tomados del handoff de diseño. */
const SELLERS = [
  { key: 'ra', name: 'Relojería Andina', initials: 'RA', rating: 99.2, grad: '#0E7C66', title: 'Relojes vintage y piezas raras', tag: 'RELOJES\nVINTAGE', viewers: 342, mode: 'auction' },
  { key: 'pc', name: 'PachaCards', initials: 'PC', rating: 98.7, grad: '#0A6350', title: 'Cartas coleccionables — packs sellados', tag: 'PACK\nRIPS', viewers: 128, mode: 'fixed' },
  { key: 'js', name: 'Joyas del Sur', initials: 'JS', rating: 99.8, grad: '#AE5115', title: 'Plata boliviana artesanal 925', tag: 'PLATA\n925', viewers: 89, mode: 'auction' },
  { key: 'te', name: 'TecnoExpress', initials: 'TE', rating: 97.9, grad: '#0A3B31', title: 'Gadgets y smartphones', tag: 'TECH\nBLITZ', viewers: 210, mode: 'fixed' },
  { key: 'vb', name: 'Vestir BO', initials: 'VB', rating: 98.1, grad: '#8E4211', title: 'Moda urbana y sneakers', tag: 'STREET\nWEAR', viewers: 156, mode: 'fixed' },
  { key: 'aa', name: 'Arte Altiplano', initials: 'AA', rating: 100, grad: '#0E4A3D', title: 'Cuadros y arte contemporáneo', tag: 'ARTE', viewers: 61, mode: 'auction' },
];

const CATALOG = {
  ra: [
    { name: 'Reloj Orient automático', category: 'Relojes', mode: 'auction', start: 70, min: 200, grad: '#0E7C66' },
    { name: 'Seiko 5 esfera azul', category: 'Relojes', mode: 'auction', start: 120, min: 380, grad: '#0A6350' },
    { name: 'Correa de cuero cosida a mano', category: 'Relojes', mode: 'fixed', price: 90, stock: 12, grad: '#AE5115' },
  ],
  pc: [
    { name: 'Pack cartas premium', category: 'Coleccionables', mode: 'fixed', price: 45, stock: 24, grad: '#AE5115' },
    { name: 'Caja sellada edición limitada', category: 'Coleccionables', mode: 'auction', start: 150, min: 400, grad: '#0A3B31' },
  ],
  js: [
    { name: 'Anillo de plata 925', category: 'Joyas', mode: 'auction', start: 50, min: 120, grad: '#0A6350' },
    { name: 'Aretes filigrana potosina', category: 'Joyas', mode: 'fixed', price: 180, stock: 8, grad: '#8E4211' },
  ],
  te: [
    { name: 'Auriculares bluetooth ANC', category: 'Tecnología', mode: 'fixed', price: 890, stock: 3, grad: '#0A3B31' },
    { name: 'Smartwatch deportivo', category: 'Tecnología', mode: 'fixed', price: 420, stock: 10, grad: '#0E7C66' },
  ],
  vb: [{ name: "Sneakers retro '90", category: 'Ropa', mode: 'fixed', price: 320, stock: 6, grad: '#8E4211' }],
  aa: [{ name: 'Cuadro Altiplano', category: 'Arte', mode: 'auction', start: 120, min: 300, grad: '#0E4A3D' }],
};

export function seed() {
  if (process.argv.includes('--reset')) db.reset();
  db.load();
  if (db.get().sellers.length) {
    console.log('La base ya tiene datos. Usá "npm run seed" con --reset para rehacerla.');
    return;
  }

  for (const s of SELLERS) {
    const owner = db.insert('users', {
      id: db.id('usr'),
      name: s.name,
      handle: s.key + '_bo',
      initials: s.initials,
      phone: `7000000${SELLERS.indexOf(s)}`,
      password: hash('vender123'),
      role: 'seller',
      sellerId: null,
      favorites: [],
      createdAt: new Date().toISOString(),
    });

    const seller = db.insert('sellers', {
      id: db.id('sel'),
      ownerId: owner.id,
      name: s.name,
      initials: s.initials,
      verified: true,
      rating: s.rating,
      qr: { bank: 'Banco Nacional de Bolivia', account: '1000-2345-678', holder: s.name, payload: null },
      createdAt: new Date().toISOString(),
    });
    db.update('users', owner.id, { sellerId: seller.id });

    CATALOG[s.key].forEach((p, i) => {
      db.insert('products', {
        id: db.id('prd'),
        sellerId: seller.id,
        name: p.name,
        category: p.category,
        mode: p.mode,
        start: p.start || 0,
        min: p.min || 0,
        increment: 10,
        price: p.price || 0,
        stock: p.stock || 0,
        grad: p.grad,
        // Alternamos para que la demo muestre las dos modalidades de envío.
        shipping: i % 2 === 0 ? 'free' : 'arranged',
        status: 'ready',
        createdAt: new Date().toISOString(),
      });
    });

    db.insert('streams', {
      id: db.id('str'),
      sellerId: seller.id,
      title: s.title,
      tag: s.tag,
      grad: s.grad,
      live: true,
      defaultMode: s.mode,
      baseViewers: s.viewers,
      previewPrice: s.mode === 'fixed' ? CATALOG[s.key].find((p) => p.mode === 'fixed')?.price : CATALOG[s.key].find((p) => p.mode === 'auction')?.start,
      previewStock: CATALOG[s.key].find((p) => p.mode === 'fixed')?.stock ?? null,
      activeProductId: null,
      activeLotNo: null,
      startedAt: new Date().toISOString(),
    });
  }

  // Cuenta de comprador para probar el flujo completo.
  db.insert('users', {
    id: db.id('usr'),
    name: 'Ana Quispe',
    handle: 'ana_bo',
    initials: 'AQ',
    phone: '71234567',
    password: hash('comprar123'),
    role: 'buyer',
    favorites: [],
    address: 'Av. Ballivián 1234, La Paz',
    createdAt: new Date().toISOString(),
  });

  db.flush();
  console.log('Datos cargados.');
  console.log('  Comprador  71234567 / comprar123');
  console.log('  Vendedor   70000000 / vender123   (Relojería Andina)');
}

seed();
