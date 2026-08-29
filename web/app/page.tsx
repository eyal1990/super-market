'use client';

import { useMemo, useState } from 'react';

type Product = { id: string; name: string; brand: string; size: string; price: number; unitPrice: string; category: string; tag: string; clubPrice?: number; stores: number[] };

const stores = [
  { name: 'שופרסל דיל · אבן גבירול', distance: '0.8 ק״מ', address: 'אבן גבירול 124, תל אביב', color: 'mint' },
  { name: 'רמי לוי · מגדלי תל אביב', distance: '1.6 ק״מ', address: 'דרך מנחם בגין 132, תל אביב', color: 'blue' },
  { name: 'ויקטורי · יהודה המכבי', distance: '2.1 ק״מ', address: 'יהודה המכבי 42, תל אביב', color: 'yellow' },
];

const products: Product[] = [
  { id: 'milk', name: 'חלב 3% מועשר בקרטון', brand: 'תנובה', size: '1 ליטר', price: 7.28, unitPrice: '7.28 ₪ לליטר', category: 'מוצרי חלב', tag: 'מחיר מפוקח', stores: [7.28, 6.9, 7.28] },
  { id: 'cereal', name: 'קורנפלקס תלמה', brand: 'תלמה', size: '750 גרם', price: 24.9, unitPrice: '3.32 ₪ ל-100 גרם', category: 'דגני בוקר', tag: 'מבצע 1+1', clubPrice: 19.9, stores: [24.9, 22.9, 25.9] },
  { id: 'tomatoes', name: 'עגבניות אשכולות', brand: 'תוצרת ישראל', size: '1 ק״ג', price: 8.9, unitPrice: '8.90 ₪ לק״ג', category: 'פירות וירקות', tag: 'טרי היום', stores: [8.9, 7.9, 9.9] },
  { id: 'pasta', name: 'ספגטי מספר 8', brand: 'אסם', size: '500 גרם', price: 8.9, unitPrice: '1.78 ₪ ל-100 גרם', category: 'מזווה', tag: 'מחיר טוב', stores: [8.9, 7.5, 8.9] },
  { id: 'eggs', name: 'ביצים L · 12 יחידות', brand: 'ישר למהדרין', size: '12 יח׳', price: 14.9, unitPrice: '1.24 ₪ לביצה', category: 'מוצרי יסוד', tag: 'במלאי', stores: [14.9, 13.9, 15.9] },
];

const money = (value: number) => `${value.toFixed(2)} ₪`;
const iconFor = (id: string) => ({ milk: '🥛', cereal: '🥣', tomatoes: '🍅', pasta: '🍝', eggs: '🥚' }[id] ?? '🛒');

export default function Home() {
  const [selectedStore, setSelectedStore] = useState(0);
  const [query, setQuery] = useState('');
  const [basket, setBasket] = useState<Record<string, number>>({ milk: 1, cereal: 1, tomatoes: 1 });
  const [locationMessage, setLocationMessage] = useState('תל אביב-יפו');
  const [showStores, setShowStores] = useState(false);
  const filteredProducts = useMemo(() => { const q = query.trim().toLowerCase(); return q ? products.filter((p) => `${p.name} ${p.brand} ${p.category}`.toLowerCase().includes(q)) : products; }, [query]);
  const basketItems = products.filter((p) => basket[p.id]);
  const itemCount = Object.values(basket).reduce((a, b) => a + b, 0);
  const publicTotal = basketItems.reduce((sum, p) => sum + p.price * basket[p.id], 0);
  const clubSavings = basketItems.reduce((sum, p) => p.clubPrice ? sum + (p.price - p.clubPrice) * basket[p.id] : sum, 0);
  const alternateTotal = basketItems.reduce((sum, p) => sum + p.stores[1] * basket[p.id], 0);
  function updateBasket(id: string, change: number) { setBasket((current) => { const next = Math.max(0, (current[id] ?? 0) + change); const copy = { ...current }; if (next) copy[id] = next; else delete copy[id]; return copy; }); }

  return <main className="app-shell" dir="rtl">
    <header className="topbar"><div className="brand-lockup" aria-label="סל זול"><span className="brand-mark">ס</span><span><strong>סל זול</strong><small>קונים חכם, משלמים פחות</small></span></div><div className="topbar-actions"><button className="location-pill" onClick={() => setLocationMessage('המיקום שלך זוהה ✓')} aria-label="עדכון מיקום"><span className="pin">⌖</span><span>{locationMessage}</span><span className="chevron">⌄</span></button><button className="icon-button" aria-label="הודעות">♧</button><button className="avatar" aria-label="הפרופיל שלי">א</button></div></header>
    <div className="page-grid"><section className="main-column"><div className="welcome-row"><div><p className="eyebrow">יום ראשון, 30 באוגוסט</p><h1>הקנייה השבועית,<br /><span>במחיר הכי טוב.</span></h1><p className="intro">מצאנו עבורך את המחירים המשתלמים ביותר בסביבה שלך.</p></div><div className="basket-badge">🛒 <strong>{itemCount}</strong><span>פריטים בסל</span></div></div>
      <div className="search-wrap"><span className="search-icon">⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חפש מוצר, מותג או ברקוד..." aria-label="חיפוש מוצר" /><kbd>⌘ K</kbd></div>
      <div className="section-heading"><div><h2>מה קורה בסביבה</h2><p>מחירים שנבדקו לאחרונה בסניפים הקרובים</p></div><button className="text-button" onClick={() => setShowStores(!showStores)}>{showStores ? 'סגור' : 'החלף סניף'} <span>←</span></button></div>
      <div className="store-strip">{stores.map((store, index) => <button key={store.name} className={`store-card ${selectedStore === index ? 'active' : ''}`} onClick={() => setSelectedStore(index)}><span className={`store-logo ${store.color}`}>{index === 0 ? 'ש' : index === 1 ? 'ר' : 'ו'}</span><span className="store-copy"><strong>{store.name}</strong><small>{store.distance} · פתוח עכשיו</small></span>{selectedStore === index && <span className="check">✓</span>}</button>)}</div>
      {showStores && <div className="store-note">המחירים מסונכרנים לפי סניף. בחר סניף כדי לעדכן את תוצאות ההשוואה.</div>}
      <div className="section-heading products-heading"><div><h2>מומלץ להוסיף לסל</h2><p>{filteredProducts.length} מוצרים · עדכון אחרון לפני 12 דקות</p></div><span className="fresh-dot">● נתונים חיים</span></div>
      <div className="product-list">{filteredProducts.map((product) => <article className="product-card" key={product.id}><div className={`product-art art-${product.id}`}>{iconFor(product.id)}</div><div className="product-info"><span className="category-label">{product.category}</span><h3>{product.name}</h3><p>{product.brand} · {product.size}</p><div className="tag-row"><span className="product-tag">{product.tag}</span>{product.clubPrice && <span className="club-tag">מועדון: {money(product.clubPrice)}</span>}</div></div><div className="price-column"><strong>{money(product.price)}</strong><small>{product.unitPrice}</small><span className="updated">נבדק לפני 12 דק׳</span></div><div className="product-action">{basket[product.id] ? <div className="quantity"><button onClick={() => updateBasket(product.id, -1)} aria-label={`הסר ${product.name}`}>−</button><strong>{basket[product.id]}</strong><button onClick={() => updateBasket(product.id, 1)} aria-label={`הוסף ${product.name}`}>+</button></div> : <button className="add-button" onClick={() => updateBasket(product.id, 1)}>+ הוסף</button>}</div></article>)}{!filteredProducts.length && <div className="empty-state">לא מצאנו מוצר כזה. נסה חיפוש אחר.</div>}</div>
    </section><aside className="basket-panel"><div className="panel-top"><div><span className="eyebrow">הבחירות שלך</span><h2>הסל שלי <span>{itemCount}</span></h2></div><button className="more-button" aria-label="אפשרויות סל">•••</button></div><div className="basket-store"><span className="store-logo mint">ש</span><div><strong>{stores[selectedStore].name}</strong><small>{stores[selectedStore].address}</small></div><span className="open-now">פתוח</span></div><div className="basket-items">{basketItems.length ? basketItems.map((p) => <div className="basket-item" key={p.id}><span className={`mini-art art-${p.id}`}>{iconFor(p.id)}</span><div><strong>{p.name}</strong><small>{basket[p.id]} × {money(p.price)}</small></div><b>{money(p.price * basket[p.id])}</b></div>) : <div className="empty-basket">הסל שלך ריק כרגע.<br />הוסף מוצרים מהרשימה.</div>}</div><div className="compare-callout"><span>✦</span><div><strong>אפשר לחסוך {money(Math.max(0, publicTotal - alternateTotal))}</strong><small>בסניף רמי לוי, שנמצא {stores[1].distance} מכאן</small></div><button aria-label="השוואת סניפים">←</button></div><div className="total-block"><div><span>סה״כ בסניף הנבחר</span><strong>{money(publicTotal)}</strong></div><div className="club-total"><span>עם הטבות מועדון</span><strong>−{money(clubSavings)}</strong></div><div className="total-line"><span>סה״כ לתשלום</span><strong>{money(publicTotal - clubSavings)}</strong></div></div><button className="primary-action">השוואת הסל המלא <span>←</span></button><p className="disclaimer">המחירים עשויים להשתנות בחנות. המחיר בקופה הוא הקובע.</p></aside></div>
  </main>;
}
