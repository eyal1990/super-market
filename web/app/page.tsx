'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AddressSuggestion } from '@/lib/address-directory';
import { addressQueryWithoutHouseNumber, calculateBasket, calculateLine, formatDistance, getPrice, isPromotionActive, money, normalizeProviderResults, products, searchProducts, type AddressResult, type Product, type Store } from '@/lib/data';

type Basket = Record<string, number>;
const BASKET_STORAGE_KEY = 'sal-zol-basket-v2';
const LEGACY_BASKET_STORAGE_KEY = 'sal-zol-basket';
type ShoppingMode = 'physical' | 'delivery';
type LocationSelection = {
  label: string;
  source: 'address' | 'browser';
  status: 'resolved' | 'unresolved';
};

function parseBasket(value: string | null): Basket | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const safe = Object.fromEntries(Object.entries(parsed).filter(([id, quantity]) => products.some((product) => product.id === id) && Number.isInteger(quantity) && quantity > 0 && quantity <= 99));
    return safe;
  } catch {
    return null;
  }
}

function parseShoppingMode(value: string | null): ShoppingMode | null {
  return value === 'physical' || value === 'delivery' ? value : null;
}

async function searchPhotonInBrowser(query: string, signal: AbortSignal): Promise<AddressResult[]> {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '8');
  const response = await fetch(url, { signal, headers: { accept: 'application/json' } });
  if (!response.ok) return [];
  return normalizeProviderResults(await response.json() as unknown, 'photon');
}

function containsHebrew(value: string) {
  return /[\u0590-\u05ff]/.test(value);
}

function displayAddressResults(results: AddressResult[], query: string) {
  if (!containsHebrew(query)) return results;
  const localized = results.filter((result) => containsHebrew(result.label) || containsHebrew(result.detail));
  if (localized.length) {
    return localized.map((result) => result.isExactAddress && /\d/.test(query) ? { ...result, label: query } : result);
  }
  // Some providers return only transliterated labels even when the search was
  // in Hebrew. Keep one usable, coordinate-backed result without exposing an
  // English duplicate or dropping the exact address the user entered.
  return results[0] ? [{ ...results[0], label: query, detail: 'התאמה שנמצאה במפה' }] : [];
}

async function searchAddress(query: string, signal: AbortSignal): Promise<AddressResult[]> {
  const response = await fetch(`/api/location/search?q=${encodeURIComponent(query)}`, { signal });
  const payload = await response.json() as { results?: AddressResult[]; error?: string; geocoding?: { status?: string } };
  if (!response.ok) throw new Error(payload.error || 'address search failed');
  let results = Array.isArray(payload.results) ? payload.results : [];
  if (!results.length && payload.geocoding?.status === 'unavailable') {
    results = await searchPhotonInBrowser(query, signal);
    if (!results.length) {
      const fallbackQuery = addressQueryWithoutHouseNumber(query);
      if (fallbackQuery) results = await searchPhotonInBrowser(fallbackQuery, signal);
    }
  }
  return displayAddressResults(results, query);
}

export default function Home() {
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [nearbyStores, setNearbyStores] = useState<Store[]>([]);
  const [location, setLocation] = useState<LocationSelection | null>(null);
  const [query, setQuery] = useState('');
  const [basket, setBasket] = useState<Basket>({});
  const [shoppingMode, setShoppingMode] = useState<ShoppingMode>('physical');
  const [locationQuery, setLocationQuery] = useState('');
  const [addressResults, setAddressResults] = useState<AddressResult[]>([]);
  const [directorySuggestions, setDirectorySuggestions] = useState<AddressSuggestion[]>([]);
  const [directorySearchLoading, setDirectorySearchLoading] = useState(false);
  const [addressSearchLoading, setAddressSearchLoading] = useState(false);
  const [locationOpen, setLocationOpen] = useState(true);
  const [locationError, setLocationError] = useState('');
  const [locationNotice, setLocationNotice] = useState('');
  const [loadingStores, setLoadingStores] = useState(false);
  const [storeCoverageFallback, setStoreCoverageFallback] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [liveMessage, setLiveMessage] = useState('');
  const basketHydrated = useRef(false);
  const modeHydrated = useRef(false);
  const pendingDirectoryAddress = useRef<string | null>(null);
  const skipNextDirectorySearch = useRef<string | null>(null);
  const [addressSearchNonce, setAddressSearchNonce] = useState(0);
  const [directorySearchNonce, setDirectorySearchNonce] = useState(0);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      try {
        // The old key contained the original demo basket. Do not carry that
        // seeded state into the product, and start new storage at zero.
        window.localStorage.removeItem(LEGACY_BASKET_STORAGE_KEY);
        const saved = parseBasket(window.localStorage.getItem(BASKET_STORAGE_KEY));
        if (saved !== null) setBasket(saved);
      } catch {
        // A corrupt or unavailable local basket should not prevent shopping.
      }
      basketHydrated.current = true;
    });
  }, []);

  useEffect(() => {
    if (basketHydrated.current) {
      try {
        window.localStorage.setItem(BASKET_STORAGE_KEY, JSON.stringify(basket));
      } catch {
        // Private browsing may disable local storage.
      }
    }
  }, [basket]);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      try {
        const savedMode = parseShoppingMode(window.localStorage.getItem('sal-zol-shopping-mode'));
        if (savedMode) setShoppingMode(savedMode);
      } catch {
        // A missing preference is safe; physical shopping remains the default.
      }
      modeHydrated.current = true;
    });
  }, []);

  useEffect(() => {
    if (modeHydrated.current) {
      try {
        window.localStorage.setItem('sal-zol-shopping-mode', shoppingMode);
      } catch {
        // Private browsing may disable local storage.
      }
    }
  }, [shoppingMode]);

  useEffect(() => {
    const query = locationQuery.trim();
    if (query.length < 3) {
      const clearTimer = window.setTimeout(() => {
        setAddressResults([]);
        setAddressSearchLoading(false);
      }, 0);
      return () => window.clearTimeout(clearTimer);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setAddressSearchLoading(true);
      searchAddress(query, controller.signal)
        .then((results) => {
          setAddressResults(results);
          const pendingAddress = pendingDirectoryAddress.current;
          if (pendingAddress === query) {
            pendingDirectoryAddress.current = null;
            if (results[0]) void loadNearbyStores(pendingAddress, results[0].lat, results[0].lon, 'address');
            else setLocationError('לא הצלחנו לאתר את הכתובת הזו במפה. אפשר לנסות את שם הרחוב והעיר או להשתמש במיקום הנוכחי.');
          }
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          setAddressResults([]);
          setLocationError('לא הצלחנו לחפש כתובת כרגע. נסו שוב או השתמשו במיקום הנוכחי.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setAddressSearchLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [locationQuery, addressSearchNonce]);

  useEffect(() => {
    const query = locationQuery.trim();
    if (query.length < 2) {
      const clearTimer = window.setTimeout(() => {
        setDirectorySuggestions([]);
        setDirectorySearchLoading(false);
      }, 0);
      return () => window.clearTimeout(clearTimer);
    }
    if (skipNextDirectorySearch.current === query) {
      skipNextDirectorySearch.current = null;
      setDirectorySuggestions([]);
      setDirectorySearchLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setDirectorySearchLoading(true);
      fetch(`/api/location/suggestions?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(async (response) => {
          const payload = await response.json() as { suggestions?: AddressSuggestion[] };
          if (!response.ok) throw new Error('address suggestions failed');
          setDirectorySuggestions(Array.isArray(payload.suggestions) ? payload.suggestions : []);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          setDirectorySuggestions([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setDirectorySearchLoading(false);
        });
    }, 100);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [locationQuery, directorySearchNonce]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.getElementById('product-search')?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const filteredProducts = useMemo(() => searchProducts(query), [query]);
  const selectedStoreData = selectedStore ? nearbyStores.find((store) => store.id === selectedStore) : undefined;
  const calculation = useMemo(() => selectedStore ? calculateBasket(basket, selectedStore) : null, [basket, selectedStore]);
  const itemCount = Object.values(basket).reduce((sum, quantity) => sum + quantity, 0);
  const basketProducts = products.filter((product) => basket[product.id]);
  const alternateStore = selectedStore ? nearbyStores.find((store) => store.id !== selectedStore) : undefined;
  const alternateCalculation = useMemo(() => alternateStore ? calculateBasket(basket, alternateStore.id) : null, [basket, alternateStore]);
  const savings = calculation && alternateCalculation ? Math.max(0, calculation.publicTotal - alternateCalculation.publicTotal) : 0;
  const locationReady = location?.status === 'resolved';

  function updateBasket(product: Product, change: number) {
    if (!selectedStore) {
      setLiveMessage('בחרו כתובת וסניף לפני הוספה לסל');
      setLocationOpen(true);
      return;
    }
    const current = basket[product.id] ?? 0;
    const next = Math.max(0, Math.min(99, current + change));
    setBasket((previous) => {
      const copy = { ...previous };
      if (next) copy[product.id] = next;
      else delete copy[product.id];
      return copy;
    });
    setLiveMessage(next ? `${product.name}, ${next} יחידות בסל` : `${product.name} הוסר מהסל`);
  }

  function chooseMode(mode: ShoppingMode) {
    setShoppingMode(mode);
    setLiveMessage(mode === 'delivery' ? 'מצב משלוח נבחר' : 'מצב קנייה פיזית נבחר');
  }

  function chooseStore(storeId: string) {
    if (!locationReady || !nearbyStores.some((store) => store.id === storeId)) {
      setLiveMessage('יש להזין כתובת או לאשר מיקום לפני בחירת סניף');
      setLocationOpen(true);
      return;
    }
    setSelectedStore(storeId);
    setStoreOpen(false);
    const store = nearbyStores.find((item) => item.id === storeId);
    if (store) setLiveMessage(`הסניף הנבחר: ${store.name}`);
  }

  async function loadNearbyStores(label: string, latitude: number, longitude: number, source: LocationSelection['source']) {
    setLocationError('');
    setLocationNotice('');
    setLoadingStores(true);
    setSelectedStore(null);
    setNearbyStores([]);
    setStoreCoverageFallback(false);
    try {
      const response = await fetch(`/api/stores/nearby?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`);
      if (!response.ok) throw new Error('nearby stores request failed');
      const payload = await response.json() as { stores?: Store[]; fallbackUsed?: boolean };
      const foundStores = Array.isArray(payload.stores) ? payload.stores : [];
      if (!foundStores.length) {
        setLocation({ label, source, status: 'unresolved' });
        setLocationError('לא נמצאו סניפים בנתוני הדוגמה באזור הזה. אפשר לנסות כתובת אחרת.');
        return;
      }
      setNearbyStores(foundStores);
      setStoreCoverageFallback(payload.fallbackUsed === true);
      setLocation({ label, source, status: 'resolved' });
      setLocationOpen(false);
      setLiveMessage(payload.fallbackUsed ? `לא נמצאו סניפים בטווח המבוקש; מוצגים הסניפים הקרובים ביותר ל${label}` : `נמצאו ${foundStores.length} סניפים ליד ${label}`);
    } catch {
      setLocation({ label, source, status: 'unresolved' });
      setLocationError('לא הצלחנו לטעון סניפים כרגע. נסו שוב או חפשו כתובת אחרת.');
    } finally {
      setLoadingStores(false);
    }
  }

  function useBrowserLocation() {
    setLocationError('');
    setLocationNotice('');
    if (!navigator.geolocation) {
      setLocationError('הדפדפן לא תומך במיקום. אפשר לחפש כתובת במקום.');
      return;
    }
    setLoadingStores(true);
    navigator.geolocation.getCurrentPosition(
      (position) => { void loadNearbyStores('המיקום הנוכחי', position.coords.latitude, position.coords.longitude, 'browser'); },
      () => { setLoadingStores(false); setLocationError('לא הצלחנו לקבל הרשאת מיקום. אפשר לחפש כתובת באופן ידני.'); },
      { timeout: 6000 },
    );
  }

  function chooseAddress(result: { label: string; lat: number; lon: number }) {
    void loadNearbyStores(result.label, result.lat, result.lon, 'address');
  }

  function chooseDirectorySuggestion(suggestion: AddressSuggestion) {
    pendingDirectoryAddress.current = suggestion.kind === 'address' ? suggestion.addressQuery : null;
    if (suggestion.kind === 'address') {
      skipNextDirectorySearch.current = suggestion.addressQuery;
      setAddressSearchNonce((value) => value + 1);
      setAddressResults([]);
    }
    setLocationQuery(suggestion.addressQuery);
    setDirectorySuggestions([]);
    setDirectorySearchNonce((value) => value + 1);
    setLocationError('');
    setLocationNotice('');
    if (suggestion.kind === 'city' || suggestion.kind === 'street') return;
    setLiveMessage(`מחפשים את ${suggestion.label}`);
  }

  function continueWithManualAddress() {
    const label = locationQuery.trim();
    if (label.length < 3) return;
    setLocation({ label, source: 'address', status: 'unresolved' });
    setSelectedStore(null);
    setNearbyStores([]);
    setLocationError('הכתובת נשמרה לחיפוש הנוכחי, אבל אין לה התאמה בנתוני הדוגמה. לא נציג סניף עד שנמצא מיקום.');
    setLocationNotice('אפשר להמשיך לחפש מוצרים, או לנסות ניסוח קצר יותר / כתובת מההצעות.');
  }

  return <main className="app-shell" dir="rtl">
    <a className="skip-link" href="#product-search">דלגו לתוכן הראשי</a>
    <header className="topbar">
      <div className="brand-lockup" aria-label="סל זול"><span className="brand-mark" aria-hidden="true">ס</span><span><strong>סל זול</strong><small>קונים חכם, משלמים פחות</small></span></div>
      <div className="topbar-actions"><button className={`location-pill ${locationReady ? '' : 'location-pill-pending'}`} onClick={() => setLocationOpen(true)} aria-label={`שינוי מיקום, ${location?.label ?? 'נדרשת כתובת'}`}><span className="pin" aria-hidden="true">⌖</span><span>{location?.label ?? 'הזנת כתובת'}</span><span className="chevron" aria-hidden="true">⌄</span></button></div>
    </header>
    <div className="page-grid">
      <section className="main-column" aria-labelledby="page-title">
        <div className="welcome-row"><div><p className="eyebrow">מתחילים בקנייה שמתאימה לכם</p><h1 id="page-title">הקנייה השבועית,<br /><span>במחיר הכי טוב.</span></h1><p className="intro">בחרו דרך קנייה, הזינו מיקום, ואז השוו מחירים בסניפים שבאמת רלוונטיים לכם.</p></div><div className="basket-badge" aria-label={`${itemCount} פריטים בסל`}><span aria-hidden="true">🛒</span><strong>{itemCount}</strong><span>פריטים בסל</span></div></div>
        <div className="mode-panel" aria-label="בחירת דרך קנייה"><div><strong>איך תרצו לקנות?</strong><small>הבחירה נשמרת במכשיר בלבד</small></div><div className="mode-switch" role="group" aria-label="דרך קנייה"><button className={shoppingMode === 'physical' ? 'active' : ''} onClick={() => chooseMode('physical')} aria-pressed={shoppingMode === 'physical'}><span aria-hidden="true">🛒</span>קנייה פיזית</button><button className={shoppingMode === 'delivery' ? 'active' : ''} onClick={() => chooseMode('delivery')} aria-pressed={shoppingMode === 'delivery'}><span aria-hidden="true">🚚</span>קנייה במשלוח</button></div></div>
        {!locationReady && <div className={`setup-card ${location?.status === 'unresolved' ? 'setup-card-warning' : ''}`} role="status"><span className="setup-icon" aria-hidden="true">⌖</span><div><strong>{location?.status === 'unresolved' ? 'עדיין אין לנו מיקום שניתן לשייך לסניפים' : 'מתחילים כאן: איפה אתם קונים?'}</strong><p>{location?.status === 'unresolved' ? (locationError || 'נסו כתובת אחרת כדי שנוכל להציג סניפים קרובים.') : 'הזינו כתובת או אפשרו מיקום. לא נבחר סניף אוטומטית ולא נציג כתובת מדומה.'}</p></div><button className="setup-button" onClick={() => setLocationOpen(true)}>{location?.status === 'unresolved' ? 'תיקון המיקום' : 'הזנת כתובת'}</button></div>}
        <div className="search-wrap"><span className="search-icon" aria-hidden="true">⌕</span><input id="product-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חפש מוצר, מותג או ברקוד..." aria-label="חיפוש מוצר, מותג או ברקוד" /><kbd>⌘ K</kbd></div>
        {locationReady ? <><div className="section-heading"><div><h2>{storeCoverageFallback ? 'הסניפים הנתמכים הקרובים ביותר' : 'סניפים בסביבה שלך'}</h2><p>{storeCoverageFallback ? 'לא נמצאו סניפים בטווח הקרוב; בחרו מתוך הסניפים הנתמכים הבאים.' : 'מחירים שנבדקו לאחרונה בסניפים שנמצאו ליד המיקום שלך'}</p></div>{nearbyStores.length > 0 && <button className="text-button" onClick={() => setStoreOpen((open) => !open)}>{storeOpen ? 'סגירת הסניפים' : 'החלף סניף'} <span aria-hidden="true">←</span></button>}</div><div className={`store-strip ${!selectedStore || storeOpen ? 'store-strip-expanded' : ''}`} aria-label="בחירת סניף">{nearbyStores.map((store) => <button key={store.id} className={`store-card ${selectedStore === store.id ? 'active' : ''}`} onClick={() => chooseStore(store.id)} aria-pressed={selectedStore === store.id}><span className={`store-logo ${store.color}`}>{store.chain.slice(0, 1)}</span><span className="store-copy"><strong>{store.name}</strong><small>{formatDistance(store.distanceKm)} · {store.openNow ? 'פתוח עכשיו' : 'סגור'}</small></span>{selectedStore === store.id && <span className="check" aria-hidden="true">✓</span>}</button>)}</div>{storeCoverageFallback && <div className="store-note" role="status">המרחקים מחושבים לפי נתוני הדוגמה. הסניפים האלה אינם בהכרח קרובים לכתובת; נתוני סניפים מלאים יחליפו את ההצעה הזו.</div>}{!selectedStore && <div className="store-note" role="status">בחרו סניף כדי לראות מחירים ולאפשר הוספה לסל. הכתובת לבדה לא בוחרת סניף אוטומטית.</div>}{storeOpen && <div className="store-note" role="status">ההשוואה מציגה מחירים לפי סניף. החלפת סניף תעדכן את המחירים והסכומים.</div>}</> : <div className="store-placeholder"><span aria-hidden="true">⌖</span><strong>הסניפים יופיעו כאן אחרי הגדרת מיקום</strong><small>כך נמנע מהצגת סניף או מרחק שלא אומתו.</small></div>}
        <div className="section-heading products-heading"><div><h2>מוצרים</h2><p>{filteredProducts.length} מוצרים · המחירים מתעדכנים ממקורות הרשתות</p></div><span className="fresh-dot" title="הנתונים התקבלו ממקורות השקיפות של הרשתות">● מקור נתונים</span></div>
        <div className="product-list" aria-live="polite">{filteredProducts.map((product) => { const price = selectedStore ? getPrice(product, selectedStore) : null; const quantity = basket[product.id] ?? 0; const line = selectedStore ? calculateLine(product, selectedStore, quantity || 1) : null; const publicPromo = product.promotions.find((promotion) => isPromotionActive(promotion) && promotion.kind === 'public'); const clubPromo = product.promotions.find((promotion) => isPromotionActive(promotion) && promotion.kind === 'club'); return <article className="product-card" key={product.id}><div className={`product-art art-${product.id}`} aria-hidden="true">{product.icon}</div><div className="product-info"><span className="category-label">{product.category}</span><h3>{product.name}</h3><p>{product.brand} · {product.size}</p><div className="tag-row"><span className="product-tag">{product.tag}</span>{publicPromo && <span className="promo-tag">ציבורי: {publicPromo.label}</span>}{clubPromo && <span className="club-tag">מועדון: {money(clubPromo.clubPrice!)}</span>}</div></div><div className="price-column">{price ? <><strong>{price.available ? money(price.amount!) : 'לא זמין'}</strong><small>{price.unitPrice}</small><span className="updated">נבדק לפני {price.updatedAt === '2026-08-29T18:20:00+03:00' ? '14 שעות' : '12 דקות'}</span>{line?.promotionNote && <span className="promotion-note">{line.promotionNote}</span>}</> : <><strong className="price-pending">בחרו סניף</strong><small>המחיר יוצג אחרי הבחירה</small></>}</div><div className="product-action">{quantity ? <div className="quantity" aria-label={`כמות ${product.name}`}><button onClick={() => updateBasket(product, -1)} aria-label={`הסר יחידה של ${product.name}`}>−</button><strong>{quantity}</strong><button onClick={() => updateBasket(product, 1)} aria-label={`הוסף יחידה של ${product.name}`}>+</button></div> : <button className="add-button" onClick={() => updateBasket(product, 1)} disabled={!selectedStore || !price?.available} title={!selectedStore ? 'יש לבחור מיקום וסניף' : undefined}>+ הוסף</button>}</div></article>; })}{!filteredProducts.length && <div className="empty-state"><strong>לא מצאנו מוצר כזה</strong><span>נסו לחפש לפי שם, מותג או ברקוד אחר.</span><button className="text-button" onClick={() => setQuery('')}>הצגת כל המוצרים</button></div>}</div>
      </section>
      <aside className="basket-panel" aria-labelledby="basket-title"><div className="panel-top"><div><span className="eyebrow">הבחירות שלך</span><h2 id="basket-title">הסל שלי <span>{itemCount}</span></h2></div><button className="clear-button" aria-label="ניקוי הסל" onClick={() => setBasket({})}>נקה</button></div>{selectedStoreData ? <div className="basket-store"><span className={`store-logo ${selectedStoreData.color}`}>{selectedStoreData.chain.slice(0, 1)}</span><div><strong>{selectedStoreData.name}</strong><small>{selectedStoreData.address}</small></div><span className="open-now">{selectedStoreData.openNow ? 'פתוח' : 'סגור'}</span></div> : <div className="basket-store basket-store-pending"><span className="store-logo muted-logo" aria-hidden="true">⌖</span><div><strong>עדיין לא נבחר סניף</strong><small>{locationReady ? 'בחרו סניף כדי לראות סכומים ומחירים' : 'הזינו כתובת ואז בחרו סניף'}</small></div></div>}<div className="basket-items">{basketProducts.length ? basketProducts.map((product) => { const line = selectedStore ? calculateLine(product, selectedStore, basket[product.id]) : null; const price = selectedStore ? getPrice(product, selectedStore) : null; return <div className="basket-item" key={product.id}><span className={`mini-art art-${product.id}`} aria-hidden="true">{product.icon}</span><div><strong>{product.name}</strong><small>{basket[product.id]} × {price?.amount !== null && price?.amount !== undefined ? money(price.amount) : 'מחיר אחרי בחירת סניף'}</small>{line?.promotionNote && <em>{line.promotionNote}</em>}</div><b>{line ? (line.publicTotal === null ? 'לא זמין' : money(line.publicTotal)) : '—'}</b></div>; }) : <div className="empty-basket">הסל שלך ריק כרגע.<br />הוסיפו מוצרים מהרשימה אחרי בחירת סניף.</div>}</div>{calculation && calculation.unavailable.length > 0 && <div className="unavailable-note" role="alert">{calculation.unavailable.length} מוצר{calculation.unavailable.length > 1 ? 'ים' : ''} לא זמין בסניף הזה. הסכום לא כולל אותו.</div>}{calculation && alternateStore && alternateCalculation && basketProducts.length > 0 && <div className="compare-callout"><span aria-hidden="true">✦</span><div><strong>{savings > 0 ? `אפשר לחסוך ${money(savings)}` : 'הסניף הנבחר משתלם'}</strong><small>{savings > 0 ? `בסניף ${alternateStore.chain}, שנמצא ${formatDistance(alternateStore.distanceKm)} מכאן` : 'המחיר הנמוך ביותר בין הסניפים שנבדקו'}</small></div><button onClick={() => setCompareOpen(true)} aria-label="השוואת סל בין סניפים">←</button></div>}{<div className={`total-block ${calculation ? '' : 'total-block-pending'}`}>{calculation ? <><div><span>סה״כ בסניף הנבחר</span><strong>{money(calculation.publicTotal)}</strong></div><div className="club-total"><span>עם הטבות מועדון</span><strong>−{money(calculation.clubSavings)}</strong></div><div className="total-line"><span>סה״כ לתשלום</span><strong>{money(calculation.publicTotal - calculation.clubSavings)}</strong></div></> : <div><span>סה״כ</span><strong>—</strong></div>}</div>}<button className="primary-action" disabled={!selectedStore || !basketProducts.length} onClick={() => { if (selectedStore) setCompareOpen(true); }}>{shoppingMode === 'delivery' ? 'השוואת סל למשלוח' : 'השוואת הסל המלא'} <span aria-hidden="true">←</span></button>{shoppingMode === 'delivery' && <p className="mode-note">מצב משלוח מסמן את כוונת הקנייה. העברת הסל לאתרי הרשתות עדיין אינה זמינה.</p>}<p className="disclaimer">מחירי המדף עשויים להשתנות בחנות. המחיר בקופה הוא הקובע.</p></aside>
    </div>
    <footer className="site-footer"><span>© 2026 סל זול · נתוני מחירים ממקורות השקיפות של הרשתות</span><nav><a href="https://prices.shufersal.co.il/" rel="noreferrer">מקור נתונים</a><a href="/privacy">פרטיות</a><a href="/terms">תנאי שימוש</a></nav></footer><div className="sr-only" aria-live="polite">{liveMessage}</div>
        {locationOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLocationOpen(false); }}><section className="modal location-modal" role="dialog" aria-modal="true" aria-labelledby="location-title"><button className="modal-close" onClick={() => setLocationOpen(false)} aria-label="סגירת חלון">×</button><span className="modal-icon">⌖</span><h2 id="location-title">איפה אתם קונים?</h2><p>נמצא סניפים לידכם רק אחרי כתובת או מיקום. לא נשמור את הכתובת, ולא נבחר סניף באופן אוטומטי.</p><button className="location-detect" onClick={useBrowserLocation} disabled={loadingStores}>שימוש במיקום הנוכחי <span>⌖</span></button><div className="modal-divider"><span>או חיפוש כתובת</span></div><input autoFocus value={locationQuery} onChange={(event) => { pendingDirectoryAddress.current = null; setLocationQuery(event.target.value); setAddressResults([]); setDirectorySuggestions([]); setLocationError(''); setLocationNotice(''); }} placeholder="רחוב, מספר ועיר..." aria-label="חיפוש כתובת" />{directorySearchLoading && <div className="loading-state" role="status">מחפשים בכתובות ישראל…</div>}{directorySuggestions.map((suggestion) => <button className="address-result" key={suggestion.id} onClick={() => chooseDirectorySuggestion(suggestion)} disabled={loadingStores}><strong>{suggestion.label}</strong><small>{suggestion.detail}</small></button>)}{addressSearchLoading && !directorySuggestions.length && <div className="loading-state" role="status">מאתרים את הכתובת…</div>}{!directorySuggestions.length && addressResults.map((result) => <button className="address-result" key={`${result.id}-${result.label}`} onClick={() => chooseAddress(result)} disabled={loadingStores || addressSearchLoading}><strong>{result.label}</strong><small>{result.isExactAddress ? result.detail : `${result.detail} · התאמה לפי הרחוב והיישוב`}</small></button>)}{locationQuery.trim().length >= 2 && !directorySearchLoading && !addressSearchLoading && !directorySuggestions.length && !addressResults.length && !locationError && <><div className="modal-error">לא נמצאה התאמה מדויקת. נסו לבחור רחוב ויישוב מתוך ההצעות.</div><button className="manual-address-button" onClick={continueWithManualAddress}>המשך עם הכתובת הזו בלי לבחור סניף</button></>}{loadingStores && <div className="loading-state" role="status">טוענים סניפים לפי המיקום שסיפקתם…</div>}{locationError && <div className="modal-error" role="alert">{locationError}</div>}{locationNotice && <div className="modal-notice" role="status">{locationNotice}</div>}<small className="privacy-hint">🔒 הכתובת והמיקום משמשים לחיפוש הנוכחי בלבד.</small></section></div>}
    {compareOpen && selectedStore && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCompareOpen(false); }}><section className="modal compare-modal" role="dialog" aria-modal="true" aria-labelledby="compare-title"><button className="modal-close" onClick={() => setCompareOpen(false)} aria-label="סגירת חלון">×</button><span className="eyebrow">השוואת סל</span><h2 id="compare-title">איפה הסל שלך משתלם יותר?</h2><p>המחירים כוללים מבצעים ציבוריים. הטבות מועדון מוצגות בנפרד.</p><div className="compare-table">{nearbyStores.map((store) => { const total = calculateBasket(basket, store.id); const selected = store.id === selectedStore; return <button className={`compare-row ${selected ? 'selected' : ''}`} key={store.id} onClick={() => { chooseStore(store.id); setCompareOpen(false); }}><span className={`store-logo ${store.color}`}>{store.chain.slice(0, 1)}</span><span><strong>{store.name}</strong><small>{formatDistance(store.distanceKm)} · {total.unavailable.length ? `${total.unavailable.length} חסרים` : 'הכל זמין'}</small></span><b>{money(total.publicTotal)}</b>{selected && <em>נבחר</em>}</button>; })}</div><p className="modal-footnote">ההשוואה היא לפי המחירים שנקלטו לאחרונה. המחיר בקופה הוא הקובע.</p></section></div>}
  </main>;
}
