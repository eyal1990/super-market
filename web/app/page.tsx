'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AddressSuggestion } from '@/lib/address-directory';
import { calculateBasket, calculateLine, catalogCompleteness, formatDistance, freshnessLabel, getPrice, isPromotionActive, money, priceTrustState, products, searchProducts, type AddressResult, type Product, type Store } from '@/lib/data';
import { getCatalogBranchCoverage, type CatalogBranchCoverage, type PriceContract } from '@/lib/shopping';
import { LOCATION_MEMORY_STORAGE_KEY, parseRememberedLocation, serializeRememberedLocation } from '@/lib/location-state';
import { BASKET_STORAGE_KEY, LEGACY_BASKET_STORAGE_KEY, parseBasket, parseShoppingMode, serializeBasket, SHOPPING_MODE_STORAGE_KEY, type Basket, type ShoppingMode } from '@/lib/shopping';
import type { DeliveryHandoff } from '@/lib/shopping';
type LocationSelection = {
  label: string;
  source: 'address' | 'browser';
  status: 'resolved' | 'unresolved';
  coordinates?: { lat: number; lon: number };
};

type AddressSearchStatus = 'fixture' | 'ok' | 'empty' | 'ambiguous' | 'timeout' | 'rate_limited' | 'out_of_coverage' | 'unavailable';

type AddressSearchResponse = {
  results: AddressResult[];
  status: AddressSearchStatus;
  limitations: string[];
};

type ProductDiscoveryResponse = {
  status?: 'ready' | 'no_results';
  results?: ProductDiscoveryResult[];
  pagination?: { page: number; pageSize: number; total: number; hasNext: boolean; hasPrevious: boolean; nextPage: number | null; previousPage: number | null };
  coverage?: CatalogBranchCoverage | null;
  catalogSource?: 'configured' | 'fixture';
  catalog?: CatalogSummary;
};

type ProductDiscoveryResult = {
  id?: string;
  barcode?: string;
  name?: string;
  brand?: string;
  size?: string;
  category?: string;
  tag?: string;
  icon?: string;
  aliases?: string[];
  imageUrl?: string;
  imageAlt?: string;
  image?: Product['image'] | null;
  provenance?: Product['provenance'] | null;
  prices?: Record<string, PriceContract | null>;
  branchPrices?: Record<string, PriceContract | null>;
  branchAvailability?: Record<string, boolean>;
  promotions?: Product['promotions'];
  branchPromotions?: Record<string, BranchPromotion[]>;
  price?: PriceContract | null;
};

type BranchPromotion = {
  id: string;
  kind: 'public' | 'club';
  label: string;
  startsAt: string | null;
  endsAt: string | null;
  minimumQuantity: number | null;
  promotionalPriceNis: number | null;
};

type RenderProduct = Product & { branchPromotions?: Record<string, BranchPromotion[]> };

type CatalogSummary = {
  dataset?: string;
  productCount?: number;
  branchCount?: number;
  branchPriceCoverage?: number;
  limitations?: string[];
};

function priceObservation(contract: PriceContract | null | undefined): Product['prices'][string] | null {
  if (!contract) return null;
  const amount = typeof contract.amount === 'number' && Number.isFinite(contract.amount) ? contract.amount : null;
  return {
    amount,
    unitPrice: typeof contract.unitPrice === 'string' ? contract.unitPrice : '',
    updatedAt: typeof contract.updatedAt === 'string' ? contract.updatedAt : '',
    available: contract.available === true && amount !== null,
    source: typeof contract.source === 'string' ? contract.source : '',
  };
}

function branchPromotionIsActive(promotion: BranchPromotion, now = new Date()) {
  const startsAt = promotion.startsAt ? new Date(promotion.startsAt).getTime() : -Infinity;
  const endsAt = promotion.endsAt ? new Date(promotion.endsAt).getTime() : Infinity;
  return (!promotion.startsAt || Number.isFinite(startsAt)) && (!promotion.endsAt || Number.isFinite(endsAt)) && now.getTime() >= startsAt && now.getTime() <= endsAt;
}

function branchPromotionAsProductPromotion(promotion: BranchPromotion) {
  return {
    id: promotion.id,
    kind: promotion.kind,
    label: promotion.label,
    minimumQuantity: promotion.minimumQuantity ?? undefined,
    offerPrice: promotion.kind === 'public' && promotion.promotionalPriceNis !== null ? promotion.promotionalPriceNis : undefined,
    clubPrice: promotion.kind === 'club' && promotion.promotionalPriceNis !== null ? promotion.promotionalPriceNis : undefined,
    validUntil: promotion.endsAt ?? '9999-12-31T23:59:59.999Z',
    explanation: promotion.label,
  } satisfies Product['promotions'][number];
}

function productForStore(product: RenderProduct, storeId: string, now = new Date()): Product {
  const branchPromotions = product.branchPromotions?.[storeId]?.filter((promotion) => branchPromotionIsActive(promotion, now)).map(branchPromotionAsProductPromotion) ?? [];
  if (!branchPromotions.length) return product;
  const promotions = [...product.promotions.filter((promotion) => !branchPromotions.some((candidate) => candidate.id === promotion.id)), ...branchPromotions];
  return { ...product, promotions };
}

function productFromApiResult(result: ProductDiscoveryResult, catalogSource: ProductDiscoveryResponse['catalogSource'], selectedStore: string | null): RenderProduct | null {
  const id = result.id?.trim();
  if (!id) return null;
  const fixtureProduct = products.find((product) => product.id === id);
  if (fixtureProduct && (catalogSource === 'fixture' || !result.name)) return fixtureProduct;
  const name = result.name?.trim();
  if (!name) return fixtureProduct ?? null;
  const branchPriceContracts = result.branchPrices ?? result.prices ?? {};
  const prices: Product['prices'] = Object.fromEntries(Object.entries(branchPriceContracts).flatMap(([storeId, contract]) => {
    const observation = priceObservation(contract);
    return observation ? [[storeId, observation]] : [];
  }));
  if (selectedStore && !Object.prototype.hasOwnProperty.call(prices, selectedStore)) {
    const selectedPrice = priceObservation(result.price);
    if (selectedPrice) prices[selectedStore] = selectedPrice;
  }
  const image = result.image ?? undefined;
  const imageUrl = result.imageUrl?.trim() || image?.url;
  const imageAlt = result.imageAlt?.trim() || image?.alt || `${name}, תמונת מוצר`;
  return {
    id,
    barcode: result.barcode?.trim() || id,
    name,
    brand: result.brand?.trim() || 'מותג לא סופק',
    size: result.size?.trim() || 'מידה לא סופקה',
    category: result.category?.trim() || 'מוצרי מזון',
    tag: result.tag?.trim() || 'מוצר מהקטלוג',
    icon: result.icon || '🛒',
    aliases: Array.from(new Set([name, result.brand, ...(result.aliases ?? [])].filter((value): value is string => Boolean(value?.trim())))),
    imageUrl,
    imageAlt,
    image,
    branchAvailability: result.branchAvailability,
    provenance: result.provenance ?? undefined,
    prices,
    promotions: result.promotions ?? [],
    branchPromotions: result.branchPromotions,
  };
}

function ProductImage({ product, compact = false }: { product: Product; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const className = compact ? `mini-art art-${product.id}` : `product-art art-${product.id}`;
  if (!product.imageUrl || failed) {
    return <div className={`${className} image-fallback`} role="img" aria-label={`${product.name}, תמונת מוצר לא זמינה`}>{product.icon}</div>;
  }
  // A plain image preserves the source URL and lets the browser's failed-load fallback run without a Next image host allowlist.
  /* eslint-disable-next-line @next/next/no-img-element */
  return <div className={className}><img src={product.imageUrl} alt={product.imageAlt} loading="lazy" decoding="async" onError={() => setFailed(true)} /></div>;
}

function containsHebrew(value: string) {
  return /[\u0590-\u05ff]/.test(value);
}

function displayAddressResults(results: AddressResult[], query: string) {
  if (!containsHebrew(query)) return results.map((result) => ({ ...result, detail: `${result.detail} · ${addressPrecisionLabel(result)}` }));
  const localized = results.filter((result) => containsHebrew(result.label) || containsHebrew(result.detail));
  if (localized.length) {
    return localized.map((result) => ({ ...result, label: result.isExactAddress && /\d/.test(query) ? query : result.label, detail: `${result.detail} · ${addressPrecisionLabel(result)}` }));
  }
  // Some providers return only transliterated labels even when the search was
  // in Hebrew. Keep one usable, coordinate-backed result without exposing an
  // English duplicate or dropping the exact address the user entered.
  return results[0] ? [{ ...results[0], label: query, detail: 'התאמה שנמצאה במפה' }] : [];
}

function addressPrecisionLabel(result: AddressResult) {
  if (result.granularity === 'address') return 'כתובת מדויקת';
  if (result.granularity === 'street') return 'רמת דיוק: רחוב';
  if (result.granularity === 'city') return 'רמת דיוק: יישוב';
  return 'רמת דיוק לא ידועה';
}

async function searchAddress(query: string, signal: AbortSignal): Promise<AddressSearchResponse> {
  const response = await fetch(`/api/location/search?q=${encodeURIComponent(query)}`, { signal });
  const payload = await response.json() as { results?: AddressResult[]; error?: string; geocoding?: { status?: string; limitations?: string[] } };
  if (!response.ok) {
    const error = new Error(payload.error || 'address search failed') as Error & { code?: string };
    error.code = response.status === 429 ? 'rate_limited' : 'unavailable';
    throw error;
  }
  return {
    results: displayAddressResults(Array.isArray(payload.results) ? payload.results : [], query),
    status: (payload.geocoding?.status as AddressSearchStatus | undefined) ?? 'empty',
    limitations: Array.isArray(payload.geocoding?.limitations) ? payload.geocoding.limitations : [],
  };
}

export default function Home() {
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [nearbyStores, setNearbyStores] = useState<Store[]>([]);
  const [location, setLocation] = useState<LocationSelection | null>(null);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<'relevance' | 'price' | 'unit'>('relevance');
  const [productPage, setProductPage] = useState(1);
  const [visibleProducts, setVisibleProducts] = useState<RenderProduct[]>([]);
  const [catalogProductMap, setCatalogProductMap] = useState<Record<string, RenderProduct>>(() => Object.fromEntries(products.map((product) => [product.id, product])));
  const [catalogCoverage, setCatalogCoverage] = useState<CatalogBranchCoverage | null>(null);
  const [catalogSource, setCatalogSource] = useState<'configured' | 'fixture'>('fixture');
  const [catalogSummary, setCatalogSummary] = useState<CatalogSummary>(catalogCompleteness);
  const [productTotal, setProductTotal] = useState(0);
  const [productHasNext, setProductHasNext] = useState(false);
  const [productHasPrevious, setProductHasPrevious] = useState(false);
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [productSearchError, setProductSearchError] = useState('');
  const [productSearchStatus, setProductSearchStatus] = useState<'idle' | 'ready' | 'empty' | 'error'>('idle');
  const [productRetryNonce, setProductRetryNonce] = useState(0);
  const [basket, setBasket] = useState<Basket>({});
  const [shoppingMode, setShoppingMode] = useState<ShoppingMode>('physical');
  const [modeChosen, setModeChosen] = useState(false);
  const [locationQuery, setLocationQuery] = useState('');
  const [addressResults, setAddressResults] = useState<AddressResult[]>([]);
  const [addressStatus, setAddressStatus] = useState<AddressSearchStatus | null>(null);
  const [directorySuggestions, setDirectorySuggestions] = useState<AddressSuggestion[]>([]);
  const [directorySearchLoading, setDirectorySearchLoading] = useState(false);
  const [addressSearchLoading, setAddressSearchLoading] = useState(false);
  const [locationOpen, setLocationOpen] = useState(true);
  const [locationError, setLocationError] = useState('');
  const [locationNotice, setLocationNotice] = useState('');
  const [rememberLocation, setRememberLocation] = useState(false);
  const [loadingStores, setLoadingStores] = useState(false);
  const [storeCoverageFallback, setStoreCoverageFallback] = useState(false);
  const [storeDirectoryNote, setStoreDirectoryNote] = useState('');
  const [storeOpen, setStoreOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [handoff, setHandoff] = useState<DeliveryHandoff | null>(null);
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [handoffError, setHandoffError] = useState('');
  const [liveMessage, setLiveMessage] = useState('');
  const [clientReady, setClientReady] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const basketHydrated = useRef(false);
  const modeHydrated = useRef(false);
  const physicalStoresRef = useRef<Store[]>([]);
  const shoppingModeRef = useRef<ShoppingMode>(shoppingMode);
  const nearbyRequestId = useRef(0);
  const productRequestId = useRef(0);
  const modalReturnFocus = useRef<HTMLElement | null>(null);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const locationRestoreAttempted = useRef(false);
  const skipNextDirectorySearch = useRef<string | null>(null);
  const [addressSearchNonce, setAddressSearchNonce] = useState(0);
  const [directorySearchNonce, setDirectorySearchNonce] = useState(0);

  useEffect(() => {
    if (!storageReady) return;
    const frame = window.requestAnimationFrame(() => setClientReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, [storageReady]);

  useEffect(() => {
    if (!locationOpen && !compareOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (compareOpen) setCompareOpen(false);
        else setLocationOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const modal = document.querySelector<HTMLElement>(compareOpen ? '.compare-modal' : '.location-modal');
      if (!modal) return;
      const focusable = Array.from(modal.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea, a[href]'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [compareOpen, locationOpen]);

  useEffect(() => {
    if (locationOpen || compareOpen) {
      modalReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const frame = window.requestAnimationFrame(() => {
        if (!compareOpen && locationInputRef.current) {
          locationInputRef.current.focus();
          return;
        }
        document.querySelector<HTMLElement>(compareOpen ? '.compare-modal' : '.location-modal')?.querySelector<HTMLElement>('button:not(:disabled), input, select, textarea, a[href]')?.focus();
      });
      return () => window.cancelAnimationFrame(frame);
    }
    modalReturnFocus.current?.focus();
    modalReturnFocus.current = null;
  }, [compareOpen, locationOpen]);

  useEffect(() => {
    shoppingModeRef.current = shoppingMode;
  }, [shoppingMode]);

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
      if (modeHydrated.current) setStorageReady(true);
    });
  }, []);

  useEffect(() => {
    if (basketHydrated.current) {
      try {
        window.localStorage.setItem(BASKET_STORAGE_KEY, serializeBasket(basket));
      } catch {
        // Private browsing may disable local storage.
      }
    }
  }, [basket]);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      try {
        const savedMode = parseShoppingMode(window.localStorage.getItem(SHOPPING_MODE_STORAGE_KEY));
        if (savedMode) { setShoppingMode(savedMode); setModeChosen(true); }
      } catch {
        // A missing preference is safe; physical shopping remains the default.
      }
      modeHydrated.current = true;
      if (basketHydrated.current) setStorageReady(true);
    });
  }, []);

  useEffect(() => {
    if (modeHydrated.current) {
      try {
        window.localStorage.setItem(SHOPPING_MODE_STORAGE_KEY, shoppingMode);
      } catch {
        // Private browsing may disable local storage.
      }
    }
  }, [shoppingMode]);

  useEffect(() => {
    if (!storageReady || locationRestoreAttempted.current) return;
    locationRestoreAttempted.current = true;
    try {
      const raw = window.localStorage.getItem(LOCATION_MEMORY_STORAGE_KEY);
      const saved = parseRememberedLocation(raw);
      if (!saved) {
        if (raw) window.localStorage.removeItem(LOCATION_MEMORY_STORAGE_KEY);
        return;
      }
      const frame = window.requestAnimationFrame(() => {
        setShoppingMode(saved.mode);
        shoppingModeRef.current = saved.mode;
        setModeChosen(true);
        setRememberLocation(true);
        // The callback is intentionally declared below the hooks so it can use
        // the latest location/mode state without a stale closure.
        // eslint-disable-next-line react-hooks/immutability
        void loadNearbyStores('מיקום שנשמר במכשיר', saved.lat, saved.lon, 'address', { restoreStoreId: saved.storeId, remember: true });
      });
      return () => window.cancelAnimationFrame(frame);
    } catch {
      // A malformed or unavailable preference must leave the user at setup.
    }
  // The one-shot guard makes this restoration effect independent of the
  // render-scoped loader function; location changes are never auto-replayed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageReady]);

  useEffect(() => {
    const query = locationQuery.trim();
    if (query.length < 3) {
      const clearTimer = window.setTimeout(() => {
        setAddressResults([]);
        setAddressStatus(null);
        setAddressSearchLoading(false);
      }, 0);
      return () => window.clearTimeout(clearTimer);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setAddressSearchLoading(true);
      searchAddress(query, controller.signal)
        .then(({ results, status, limitations }) => {
          setAddressResults(results);
          setAddressStatus(status);
          if (status === 'ambiguous') setLocationNotice('נמצאו כמה התאמות. בחרו את הכתובת המדויקת כדי לאשר את המיקום.');
          else if (status === 'empty') setLocationNotice('לא נמצאה התאמה לכתובת הזו. נסו ניסוח אחר או בדקו את הכתובת.');
          else if (status === 'out_of_coverage') setLocationError('התוצאה נמצאה מחוץ לישראל. נסו כתובת ישראלית אחרת.');
          else if (status === 'timeout') setLocationError('חיפוש הכתובת ארך יותר מדי זמן. נסו שוב או השתמשו במיקום הנוכחי.');
          else if (status === 'rate_limited') setLocationError('בוצעו יותר מדי חיפושים. נסו שוב בעוד דקה.');
          else if (status === 'unavailable') setLocationError('שירות חיפוש הכתובות אינו זמין כרגע. נסו שוב או השתמשו במיקום הנוכחי.');
          if (limitations.length && status !== 'ambiguous') setLocationNotice(limitations[0] ?? '');
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          setAddressResults([]);
          const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : '';
          setAddressStatus(code === 'rate_limited' ? 'rate_limited' : 'unavailable');
          setLocationError(code === 'rate_limited' ? 'בוצעו יותר מדי חיפושים. נסו שוב בעוד דקה.' : 'לא הצלחנו לחפש כתובת כרגע. נסו שוב או השתמשו במיקום הנוכחי.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setAddressSearchLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [addressSearchNonce, locationQuery]);

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
          setLocationNotice('חיפוש הכתובות אינו זמין כרגע. אפשר לנסות שוב או להשתמש במיקום הנוכחי.');
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

  /* eslint-disable react-hooks/set-state-in-effect -- reset and expose async request state for the external search API. */
  useEffect(() => {
    setProductPage(1);
  }, [categoryFilter, query, selectedStore, sortOrder]);

  useEffect(() => {
    if (!clientReady) return;
    const requestId = ++productRequestId.current;
    const controller = new AbortController();
    const params = new URLSearchParams({ q: query, page: String(productPage), pageSize: '24', sort: sortOrder });
    if (categoryFilter !== 'all') params.set('category', categoryFilter);
    if (selectedStore) params.set('storeId', selectedStore);
    setProductSearchLoading(true);
    setProductSearchError('');
    setProductSearchStatus('idle');
    setVisibleProducts([]);
    setProductTotal(0);
    setProductHasNext(false);
    setProductHasPrevious(false);
    setCatalogCoverage(null);
    fetch(`/api/products/search?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as ProductDiscoveryResponse;
        if (!response.ok) throw new Error('לא ניתן לטעון את המוצרים כרגע');
        if (requestId !== productRequestId.current) return;
        const results = (Array.isArray(payload.results) ? payload.results : [])
          .map((result) => productFromApiResult(result, payload.catalogSource, selectedStore))
          .filter((product): product is RenderProduct => Boolean(product));
        setVisibleProducts(results);
        setCatalogProductMap((previous) => Object.fromEntries([...Object.entries(previous), ...results.map((product) => [product.id, product])]));
        setCatalogCoverage(payload.coverage ?? null);
        setCatalogSource(payload.catalogSource === 'configured' ? 'configured' : 'fixture');
        setCatalogSummary(payload.catalog ?? catalogCompleteness);
        setProductTotal(payload.pagination?.total ?? results.length);
        setProductHasNext(payload.pagination?.hasNext === true);
        setProductHasPrevious(payload.pagination?.hasPrevious === true);
        setProductSearchStatus(results.length ? 'ready' : 'empty');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (requestId !== productRequestId.current) return;
        const fallbackProducts = searchProducts(query, products);
        setVisibleProducts(fallbackProducts);
        setCatalogProductMap((previous) => Object.fromEntries([...Object.entries(previous), ...fallbackProducts.map((product) => [product.id, product])]));
        setCatalogCoverage(null);
        setCatalogSource('fixture');
        setCatalogSummary(catalogCompleteness);
        setProductTotal(fallbackProducts.length);
        setProductHasNext(false);
        setProductHasPrevious(false);
        setProductSearchStatus('error');
        setProductSearchError(error instanceof Error ? error.message : 'לא ניתן לטעון את המוצרים כרגע');
      })
      .finally(() => {
        if (requestId === productRequestId.current) setProductSearchLoading(false);
      });
    return () => controller.abort();
  }, [categoryFilter, clientReady, productPage, productRetryNonce, query, selectedStore, sortOrder]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const catalogProducts = useMemo(() => Object.values(catalogProductMap), [catalogProductMap]);
  const categories = useMemo(() => [...new Set(catalogProducts.map((product) => product.category))], [catalogProducts]);
  const productCoverage = selectedStore ? catalogCoverage ?? getCatalogBranchCoverage(catalogProducts, nearbyStores, new Date()).find((coverage) => coverage.storeId === selectedStore) : null;
  const productResultCount = productSearchStatus === 'ready' || productSearchStatus === 'empty' ? productTotal : 0;
  const selectedStoreData = selectedStore ? nearbyStores.find((store) => store.id === selectedStore) : undefined;
  const calculationProducts = useMemo(() => selectedStore ? catalogProducts.map((product) => productForStore(product, selectedStore)) : catalogProducts, [catalogProducts, selectedStore]);
  const calculation = useMemo(() => selectedStore ? calculateBasket(basket, selectedStore, calculationProducts) : null, [basket, calculationProducts, selectedStore]);
  const itemCount = Object.values(basket).reduce((sum, quantity) => sum + quantity, 0);
  const basketProducts = catalogProducts.filter((product) => basket[product.id]);
  const alternateStore = selectedStore ? nearbyStores.find((store) => store.id !== selectedStore) : undefined;
  const alternateCalculationProducts = useMemo(() => alternateStore ? catalogProducts.map((product) => productForStore(product, alternateStore.id)) : catalogProducts, [alternateStore, catalogProducts]);
  const alternateCalculation = useMemo(() => alternateStore ? calculateBasket(basket, alternateStore.id, alternateCalculationProducts) : null, [alternateCalculationProducts, alternateStore, basket]);
  const savings = calculation && alternateCalculation ? Math.max(0, calculation.publicTotal - alternateCalculation.publicTotal) : 0;
  const locationReady = location?.status === 'resolved';
  const retryableAddressError = addressStatus === 'timeout' || addressStatus === 'rate_limited' || addressStatus === 'unavailable';

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
    if (!locationReady) {
      setLiveMessage('יש להגדיר מיקום לפני בחירת דרך הקנייה');
      setLocationOpen(true);
      return;
    }
    const previousMode = shoppingModeRef.current;
    shoppingModeRef.current = mode;
    setShoppingMode(mode);
    setModeChosen(true);
    setStoreOpen(false);
    setStoreDirectoryNote('');
    if (mode === 'physical') setHandoff(null);
    let message = mode === 'delivery' ? 'מצב משלוח נבחר' : 'מצב קנייה פיזית נבחר';
    if (mode === 'delivery') {
      const supportedStores = physicalStoresRef.current.filter((store) => store.delivery.capability !== 'unsupported');
      setNearbyStores(supportedStores);
      if (physicalStoresRef.current.length > 0 && supportedStores.length === 0) setStoreDirectoryNote('לא נמצאו סניפים עם יכולת העברת סל למשלוח באזור הזה. אפשר לעבור לקנייה פיזית.');
      if (selectedStore && !supportedStores.some((store) => store.id === selectedStore)) {
        setSelectedStore(null);
        clearRememberedLocation();
        message = 'הסניף הקודם לא תומך בהעברת סל; בחרו סניף משלוח אחר';
      }
    } else if (previousMode === 'delivery') {
      const restoredStores = physicalStoresRef.current;
      setNearbyStores(restoredStores);
      if (selectedStore && !restoredStores.some((store) => store.id === selectedStore)) setSelectedStore(null);
    }
    if (selectedStore) {
      const remainsValid = mode === 'delivery'
        ? physicalStoresRef.current.some((store) => store.id === selectedStore && store.delivery.capability !== 'unsupported')
        : physicalStoresRef.current.some((store) => store.id === selectedStore);
      if (remainsValid) persistRememberedStore(selectedStore, mode);
      else clearRememberedLocation();
    }
    setLiveMessage(message);
  }

  function clearRememberedLocation() {
    try { window.localStorage.removeItem(LOCATION_MEMORY_STORAGE_KEY); } catch { /* private browsing */ }
  }

  function persistRememberedStore(storeId: string, mode = shoppingMode, shouldRemember = rememberLocation) {
    const coordinates = location?.coordinates;
    if (!shouldRemember || !coordinates) {
      clearRememberedLocation();
      return;
    }
    const serialized = serializeRememberedLocation({ storeId, mode, lat: coordinates.lat, lon: coordinates.lon });
    if (!serialized) return;
    try { window.localStorage.setItem(LOCATION_MEMORY_STORAGE_KEY, serialized); } catch { /* private browsing */ }
  }

  function chooseStore(storeId: string) {
    if (!modeChosen) {
      setLiveMessage('בחרו קודם דרך קנייה: פיזית או משלוח');
      return;
    }
    if (!locationReady || !nearbyStores.some((store) => store.id === storeId)) {
      setLiveMessage('יש להזין כתובת או לאשר מיקום לפני בחירת סניף');
      setLocationOpen(true);
      return;
    }
    setSelectedStore(storeId);
    persistRememberedStore(storeId);
    setStoreOpen(false);
    const store = nearbyStores.find((item) => item.id === storeId);
    if (store) setLiveMessage(`הסניף הנבחר: ${store.name}`);
  }

  async function loadNearbyStores(label: string, latitude: number, longitude: number, source: LocationSelection['source'], options: { restoreStoreId?: string; remember?: boolean } = {}) {
    const requestId = ++nearbyRequestId.current;
    // A new location must never leave the previously remembered branch active.
    // The replacement is persisted only after the user explicitly selects it.
    if (!options.restoreStoreId) clearRememberedLocation();
    setLocationError('');
    setLocationNotice('');
    setLoadingStores(true);
    setSelectedStore(null);
    setNearbyStores([]);
    physicalStoresRef.current = [];
    setStoreCoverageFallback(false);
    setStoreDirectoryNote('');
    try {
      const response = await fetch(`/api/stores/nearby?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&mode=physical`);
      const payload = await response.json() as { stores?: Store[]; fallbackUsed?: boolean; outOfCoverage?: boolean; limitations?: string[]; code?: string; error?: string };
      if (!response.ok) {
        const error = new Error(payload.error || 'nearby stores request failed') as Error & { code?: string };
        error.code = payload.code || (response.status === 429 ? 'rate_limited' : 'unavailable');
        throw error;
      }
      if (requestId !== nearbyRequestId.current) return;
      const foundStores = Array.isArray(payload.stores) ? payload.stores : [];
      if (!foundStores.length) {
        setLocation({ label, source, status: 'unresolved' });
        if (options.restoreStoreId) clearRememberedLocation();
        setStoreCoverageFallback(payload.outOfCoverage === true);
        setLocationError(payload.outOfCoverage === true ? 'לא נמצאו סניפים בטווח שביקשתם. נסו להגדיל את הרדיוס או לבחור כתובת אחרת.' : 'לא נמצאו סניפים באזור הזה. אפשר לנסות כתובת אחרת.');
        return;
      }
      physicalStoresRef.current = foundStores;
      const visibleStores = shoppingModeRef.current === 'delivery' ? foundStores.filter((store) => store.delivery.capability !== 'unsupported') : foundStores;
      setNearbyStores(visibleStores);
      setStoreCoverageFallback(payload.outOfCoverage === true || payload.fallbackUsed === true);
      setStoreDirectoryNote(Array.isArray(payload.limitations) ? payload.limitations.join(' ') : '');
      setLocation({ label, source, status: 'resolved', coordinates: { lat: latitude, lon: longitude } });
      setRememberLocation((current) => options.remember ?? current);
      const restoredStore = options.restoreStoreId && visibleStores.some((store) => store.id === options.restoreStoreId) ? options.restoreStoreId : null;
      setSelectedStore(restoredStore);
      if (options.restoreStoreId && !restoredStore) clearRememberedLocation();
      setLocationOpen(false);
      setLiveMessage(payload.outOfCoverage ? `לא נמצאו סניפים בטווח המבוקש ליד ${label}` : `נמצאו ${foundStores.length} סניפים ליד ${label}`);
    } catch (error) {
      if (requestId !== nearbyRequestId.current) return;
      setLocation({ label, source, status: 'unresolved' });
      const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : '';
      setLocationError(code === 'out_of_coverage' ? 'המיקום נמצא מחוץ לאזור השירות בישראל. נסו כתובת אחרת.' : code === 'rate_limited' ? 'בוצעו יותר מדי בקשות. נסו שוב בעוד דקה.' : 'לא הצלחנו לטעון סניפים כרגע. נסו שוב או חפשו כתובת אחרת.');
    } finally {
      if (requestId === nearbyRequestId.current) setLoadingStores(false);
    }
  }

  function useBrowserLocation() {
    clearRememberedLocation();
    setLocationError('');
    setLocationNotice('');
    setLocation({ label: 'מיקום הדפדפן', source: 'browser', status: 'unresolved' });
    setSelectedStore(null);
    setNearbyStores([]);
    nearbyRequestId.current += 1;
    physicalStoresRef.current = [];
    if (!navigator.geolocation) {
      setLocationError('הדפדפן לא תומך במיקום. אפשר לחפש כתובת במקום.');
      return;
    }
    setLoadingStores(true);
    navigator.geolocation.getCurrentPosition(
      (position) => { void loadNearbyStores('המיקום הנוכחי', position.coords.latitude, position.coords.longitude, 'browser', { remember: rememberLocation }); },
      (error) => {
        setLoadingStores(false);
        setLocation({ label: 'מיקום הדפדפן', source: 'browser', status: 'unresolved' });
        const message = error.code === 1
          ? 'הרשאת המיקום נדחתה. אפשר לאשר אותה בהגדרות הדפדפן או לחפש כתובת באופן ידני.'
          : error.code === 2
            ? 'המיקום הנוכחי אינו זמין. אפשר לנסות שוב או לחפש כתובת באופן ידני.'
            : 'קבלת המיקום ארכה יותר מדי זמן. אפשר לנסות שוב או לחפש כתובת באופן ידני.';
        setLocationError(message);
        setLiveMessage(message);
      },
      { timeout: 6000 },
    );
  }

  function chooseAddress(result: { label: string; lat: number; lon: number }) {
    void loadNearbyStores(result.label, result.lat, result.lon, 'address', { remember: rememberLocation });
  }

  async function requestHandoff(storeId: string) {
    setHandoffError('');
    setHandoff(null);
    setHandoffLoading(true);
    try {
      const response = await fetch('/api/basket/handoff', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'delivery', storeId, items: basket }) });
      const payload = await response.json() as { handoff?: DeliveryHandoff; error?: string };
      if (!response.ok || !payload.handoff) throw new Error(payload.error || 'לא ניתן להכין את ההעברה');
      setHandoff(payload.handoff);
      setLiveMessage('רשימת הקנייה מוכנה להעברה לרשת');
    } catch (error) {
      setHandoffError(error instanceof Error ? error.message : 'לא ניתן להכין את ההעברה');
    } finally {
      setHandoffLoading(false);
    }
  }

  async function copyHandoff() {
    if (!handoff) return;
    const text = handoff.items.map((item) => `${item.name} · ${item.size} · ${item.quantity} יח׳ · ${item.barcode}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setLiveMessage('רשימת המוצרים הועתקה');
    } catch {
      setHandoffError('ההעתקה נחסמה בדפדפן. אפשר לסמן ולהעתיק את הרשימה ידנית.');
    }
  }

  function chooseDirectorySuggestion(suggestion: AddressSuggestion) {
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
    clearRememberedLocation();
    setRememberLocation(false);
    setSelectedStore(null);
    setNearbyStores([]);
    setLocationError('הכתובת נשמרה לחיפוש הנוכחי, אבל אין לה התאמה בנתוני הדוגמה. לא נציג סניף עד שנמצא מיקום.');
    setLocationNotice('אפשר להמשיך לחפש מוצרים, או לנסות ניסוח קצר יותר / כתובת מההצעות.');
  }

  function retryAddressSearch() {
    setLocationError('');
    setLocationNotice('');
    setAddressSearchNonce((value) => value + 1);
  }

  if (!clientReady) {
    return <main className="app-shell hydration-shell" dir="rtl" data-app-ready="false" aria-busy="true"><div className="loading-state" role="status" aria-live="polite">טוענים את הבחירות השמורות…</div></main>;
  }

  return <main className="app-shell" dir="rtl" data-app-ready="true">
    <a className="skip-link" href="#product-search">דלגו לתוכן הראשי</a>
    <header className="topbar">
      <div className="brand-lockup" aria-label="סל זול"><span className="brand-mark" aria-hidden="true">ס</span><span><strong>סל זול</strong><small>קונים חכם, משלמים פחות</small></span></div>
      <div className="topbar-actions"><span className="mode-indicator" aria-label={`מצב קנייה: ${modeChosen ? (shoppingMode === 'delivery' ? 'משלוח' : 'קנייה פיזית') : 'בחירת דרך קנייה'}`}>{modeChosen ? (shoppingMode === 'delivery' ? '🚚 משלוח' : '🛒 קנייה פיזית') : 'בחירת דרך קנייה'}</span><button className={`location-pill ${locationReady ? '' : 'location-pill-pending'}`} onClick={() => setLocationOpen(true)} aria-label={`שינוי מיקום, ${location?.label ?? 'נדרשת כתובת'}`}><span className="pin" aria-hidden="true">⌖</span><span>{location?.label ?? 'הזנת כתובת'}</span><span className="chevron" aria-hidden="true">⌄</span></button></div>
    </header>
    {locationReady && selectedStore && <div className="remember-location-banner"><span>רוצים לפתוח כאן בפעם הבאה?</span><button type="button" className="remember-location-toggle" onClick={() => { const next = !rememberLocation; setRememberLocation(next); persistRememberedStore(selectedStore, shoppingMode, next); }} aria-pressed={rememberLocation}>{rememberLocation ? '✓ הסניף נשמר במכשיר' : 'שמירת הסניף במכשיר'}</button><small>נשמרים סניף ומיקום מעוגל בלבד, לא הכתובת.</small></div>}
    <div className="page-grid">
      <section className="main-column" aria-labelledby="page-title">
        <div className="welcome-row"><div><p className="eyebrow">מתחילים בקנייה שמתאימה לכם</p><h1 id="page-title">הקנייה השבועית,<br /><span>במחיר הכי טוב.</span></h1><p className="intro">הזינו מיקום, בחרו דרך קנייה וסניף קרוב, ואז הוסיפו מוצרים להשוואה.</p></div><div className="basket-badge" aria-label={`${itemCount} פריטים בסל`}><span aria-hidden="true">🛒</span><strong>{itemCount}</strong><span>פריטים בסל</span></div></div>
        <div className="mode-panel" aria-label="בחירת דרך קנייה"><div><strong>איך תרצו לקנות?</strong><small>{locationReady ? 'הבחירה נשמרת במכשיר בלבד' : 'בחרו דרך קנייה אחרי הגדרת מיקום'}</small></div><div className="mode-switch" role="group" aria-label="דרך קנייה"><button className={modeChosen && shoppingMode === 'physical' ? 'active' : ''} onClick={() => chooseMode('physical')} aria-pressed={modeChosen && shoppingMode === 'physical'} disabled={!locationReady}><span aria-hidden="true">🛒</span>קנייה פיזית</button><button className={modeChosen && shoppingMode === 'delivery' ? 'active' : ''} onClick={() => chooseMode('delivery')} aria-pressed={modeChosen && shoppingMode === 'delivery'} disabled={!locationReady}><span aria-hidden="true">🚚</span>קנייה במשלוח</button></div></div>
        <div className="onboarding-progress" aria-label="התקדמות התחלה"><span className={locationReady ? 'done' : 'current'}>1. כתובת או מיקום</span><span className={selectedStore ? 'done' : locationReady ? 'current' : ''}>2. סניף קרוב</span><span className={selectedStore ? 'current' : ''}>3. בחירת מוצרים</span></div>
        {!locationReady && <div className={`setup-card ${location?.status === 'unresolved' ? 'setup-card-warning' : ''}`} role="status"><span className="setup-icon" aria-hidden="true">⌖</span><div><strong>{location?.status === 'unresolved' ? 'עדיין אין לנו מיקום שניתן לשייך לסניפים' : 'מתחילים כאן: איפה אתם קונים?'}</strong><p>{location?.status === 'unresolved' ? (locationError || 'נסו כתובת אחרת כדי שנוכל להציג סניפים קרובים.') : 'הזינו כתובת או אפשרו מיקום. לא נבחר סניף אוטומטית ולא נציג כתובת מדומה.'}</p></div><button className="setup-button" onClick={() => setLocationOpen(true)}>{location?.status === 'unresolved' ? 'תיקון המיקום' : 'הזנת כתובת'}</button></div>}
        <div className="search-wrap"><span className="search-icon" aria-hidden="true">⌕</span><input id="product-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חפש מוצר, מותג או ברקוד..." aria-label="חיפוש מוצר, מותג או ברקוד" /><kbd>⌘ K</kbd></div>
        {locationReady ? <><div className="section-heading"><div><h2>{storeCoverageFallback ? 'הסניפים הנתמכים הקרובים ביותר' : 'סניפים בסביבה שלך'}</h2><p>{storeCoverageFallback ? 'לא נמצאו סניפים בטווח הקרוב; בחרו מתוך הסניפים הנתמכים הבאים.' : 'מחירים שנבדקו לאחרונה בסניפים שנמצאו ליד המיקום שלך'}</p></div>{nearbyStores.length > 0 && <button className="text-button" onClick={() => setStoreOpen((open) => !open)}>{storeOpen ? 'סגירת הסניפים' : 'החלף סניף'} <span aria-hidden="true">←</span></button>}</div><div className={`store-strip ${!selectedStore || storeOpen ? 'store-strip-expanded' : ''}`} aria-label="בחירת סניף">{nearbyStores.map((store) => <button key={store.id} className={`store-card ${selectedStore === store.id ? 'active' : ''}`} onClick={() => chooseStore(store.id)} aria-pressed={selectedStore === store.id} disabled={!modeChosen} title={!modeChosen ? 'בחרו קודם קנייה פיזית או משלוח' : undefined}><span className={`store-logo ${store.color}`}>{store.chain.slice(0, 1)}</span><span className="store-copy"><strong>{store.name}</strong><small>{formatDistance(store.distanceKm)} · {store.openNow === null ? 'שעות לא אומתו' : store.openNow ? 'פתוח עכשיו' : 'סגור'}</small></span>{selectedStore === store.id && <span className="check" aria-hidden="true">✓</span>}</button>)}</div>{storeCoverageFallback && <div className="store-note" role="status">המרחקים מחושבים לפי נתוני הדוגמה. הסניפים האלה אינם בהכרח קרובים לכתובת; נתוני סניפים מלאים יחליפו את ההצעה הזו.</div>}{storeDirectoryNote && <div className="store-note" role="status">{storeDirectoryNote}</div>}{!modeChosen && <div className="store-note store-note-required" role="status">בחרו קודם קנייה פיזית או משלוח, ואז תוכלו לבחור סניף קרוב.</div>}{modeChosen && !selectedStore && <div className="store-note" role="status">בחרו סניף כדי לראות מחירים ולאפשר הוספה לסל. הכתובת לבדה לא בוחרת סניף אוטומטית.</div>}{storeOpen && <div className="store-note" role="status">ההשוואה מציגה מחירים לפי סניף. החלפת סניף תעדכן את המחירים והסכומים.</div>}</> : <div className="store-placeholder"><span aria-hidden="true">⌖</span><strong>הסניפים יופיעו כאן אחרי הגדרת מיקום</strong><small>כך נמנע מהצגת סניף או מרחק שלא אומתו.</small></div>}
        <div className="section-heading products-heading"><div><h2>מוצרים</h2><p>{productResultCount} תוצאות · מוצגים עד 24 בכל חיפוש</p></div><div className="data-actions"><details className="data-details"><summary>מקורות ומגבלות</summary><div><strong>{catalogSource === 'configured' ? 'קטלוג מוגדר' : 'נתוני fixture לפיתוח'}</strong><span>{catalogSummary.productCount ?? productResultCount} מוצרים · {catalogSummary.branchCount ?? 0} סניפים{catalogSummary.branchPriceCoverage === undefined ? '' : ` · ${Math.round(catalogSummary.branchPriceCoverage * 100)}% כיסוי מחירים`}</span>{catalogSummary.limitations?.[0] && <span>{catalogSummary.limitations[0]}</span>}</div></details><span className="fresh-dot" title="הנתונים התקבלו ממקורות השקיפות של הרשתות">● מקור נתונים</span></div></div>
        <div className="product-filters" aria-label="סינון מוצרים"><label>קטגוריה<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">כל הקטגוריות</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label><label>מיון<select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)}><option value="relevance">רלוונטיות</option><option value="price" disabled={!selectedStore}>מחיר בסניף</option><option value="unit" disabled={!selectedStore}>מחיר ליחידה</option></select></label></div>
        <div className="product-list" aria-live="polite">{visibleProducts.map((product) => { const storeProduct = selectedStore ? productForStore(product, selectedStore) : product; const price = selectedStore ? getPrice(storeProduct, selectedStore) : null; const quantity = basket[product.id] ?? 0; const line = selectedStore ? calculateLine(storeProduct, selectedStore, quantity || 1) : null; const branchPromotions = selectedStore ? product.branchPromotions?.[selectedStore]?.filter((promotion) => branchPromotionIsActive(promotion)) ?? [] : []; const publicPromo = storeProduct.promotions.find((promotion) => isPromotionActive(promotion) && promotion.kind === 'public'); const clubPromo = storeProduct.promotions.find((promotion) => isPromotionActive(promotion) && promotion.kind === 'club'); const publicBranchPromo = branchPromotions.find((promotion) => promotion.kind === 'public'); const clubBranchPromo = branchPromotions.find((promotion) => promotion.kind === 'club'); const trustState = price ? priceTrustState(price) : 'unknown'; const stale = trustState === 'stale'; return <article className={`product-card ${stale ? 'product-card-stale' : ''}`} key={product.id}><ProductImage product={product} /><div className="product-info"><span className="category-label">{product.category}</span><h3>{product.name}</h3><p>{product.brand} · {product.size}</p><div className="tag-row"><span className="product-tag">{product.tag}</span>{(publicBranchPromo || publicPromo) && <span className="promo-tag">ציבורי: {publicBranchPromo?.label ?? publicPromo?.label}</span>}{(clubBranchPromo || clubPromo) && <span className="club-tag">מועדון: {clubPromo?.clubPrice !== undefined ? money(clubPromo.clubPrice) : clubBranchPromo?.promotionalPriceNis !== null && clubBranchPromo?.promotionalPriceNis !== undefined ? money(clubBranchPromo.promotionalPriceNis) : clubBranchPromo?.label}</span>}{trustState === 'unavailable' && <span className="unavailable-tag">לא זמין בסניף</span>}{trustState === 'stale' && <span className="stale-tag">נתון ישן</span>}{trustState === 'unknown' && price && <span className="stale-tag">אמינות לא ידועה</span>}</div></div><div className="price-column">{price ? <><strong>{price.available ? money(price.amount!) : 'לא זמין'}</strong><small>{price.unitPrice}</small><span className="updated">{freshnessLabel(price.updatedAt)} · {price.source || 'מקור לא ידוע'}</span>{line?.promotionNote && <span className="promotion-note">{line.promotionNote}</span>}</> : <><strong className="price-pending">בחרו סניף</strong><small>המחיר יוצג אחרי הבחירה</small></>}</div><div className="product-action">{quantity ? <div className="quantity" aria-label={`כמות ${product.name}`}><button onClick={() => updateBasket(product, -1)} aria-label={`הסר יחידה של ${product.name}`}>−</button><strong>{quantity}</strong><button onClick={() => updateBasket(product, 1)} aria-label={`הוסף יחידה של ${product.name}`}>+</button></div> : <button className="add-button" onClick={() => updateBasket(product, 1)} disabled={!selectedStore || !price?.available} title={!selectedStore ? 'יש לבחור מיקום וסניף' : undefined}>+ הוסף</button>}</div></article>; })}{productSearchStatus === 'empty' && <div className="empty-state"><strong>לא מצאנו מוצר כזה</strong><span>נסו לחפש לפי שם, מותג או ברקוד אחר.</span><button className="text-button" onClick={() => { setQuery(''); setCategoryFilter('all'); }}>הצגת כל המוצרים</button></div>}</div>
      </section>
      <aside className="basket-panel" aria-labelledby="basket-title"><div className="panel-top"><div><span className="eyebrow">{shoppingMode === 'delivery' ? 'הבחירות למשלוח' : 'הבחירות שלך'}</span><h2 id="basket-title">הסל שלי <span>{itemCount}</span></h2></div><button className="clear-button" aria-label="ניקוי הסל" onClick={() => setBasket({})}>נקה</button></div>{selectedStoreData ? <div className="basket-store"><span className={`store-logo ${selectedStoreData.color}`}>{selectedStoreData.chain.slice(0, 1)}</span><div><strong>{selectedStoreData.name}</strong><small>{selectedStoreData.address} · {formatDistance(selectedStoreData.distanceKm)}</small></div><span className="open-now">{selectedStoreData.openNow === null ? 'שעות לא אומתו' : selectedStoreData.openNow ? 'פתוח' : 'סגור'}</span></div> : <div className="basket-store basket-store-pending"><span className="store-logo muted-logo" aria-hidden="true">⌖</span><div><strong>עדיין לא נבחר סניף</strong><small>{locationReady ? 'בחרו סניף כדי לראות סכומים ומחירים' : 'הזינו כתובת ואז בחרו סניף'}</small></div></div>}<div className="basket-items">{basketProducts.length ? basketProducts.map((product) => { const line = selectedStore ? calculateLine(product, selectedStore, basket[product.id]) : null; const price = selectedStore ? getPrice(product, selectedStore) : null; return <div className="basket-item" key={product.id}><ProductImage product={product} compact /><div><strong>{product.name}</strong><small>{basket[product.id]} × {price?.amount !== null && price?.amount !== undefined ? money(price.amount) : 'מחיר אחרי בחירת סניף'}</small>{line?.promotionNote && <em>{line.promotionNote}</em>}</div><b>{line ? (line.publicTotal === null ? 'לא זמין' : money(line.publicTotal)) : '—'}</b></div>; }) : <div className="empty-basket">הסל שלך ריק כרגע.<br />הוסיפו מוצרים מהרשימה אחרי בחירת סניף.</div>}</div>{calculation && calculation.unavailable.length > 0 && <div className="unavailable-note" role="alert">{calculation.unavailable.length} מוצר{calculation.unavailable.length > 1 ? 'ים' : ''} לא זמין בסניף הזה. הסכום לא כולל אותו.</div>}{calculation && alternateStore && alternateCalculation && basketProducts.length > 0 && <div className="compare-callout"><span aria-hidden="true">✦</span><div><strong>{savings > 0 ? `אפשר לחסוך ${money(savings)}` : 'הסניף הנבחר משתלם'}</strong><small>{savings > 0 ? `בסניף ${alternateStore.chain}, שנמצא ${formatDistance(alternateStore.distanceKm)} מכאן` : 'המחיר הנמוך ביותר בין הסניפים שנבדקו'}</small></div><button onClick={() => setCompareOpen(true)} aria-label="השוואת סל בין סניפים">←</button></div>}{<div className={`total-block ${calculation ? '' : 'total-block-pending'}`}>{calculation ? <><div><span>סה״כ בסניף הנבחר</span><strong>{money(calculation.publicTotal)}</strong></div><div className="club-total"><span>עם הטבות מועדון</span><strong>−{money(calculation.clubSavings)}</strong></div><div className="total-line"><span>סה״כ לתשלום</span><strong>{money(calculation.publicTotal - calculation.clubSavings)}</strong></div></> : <div><span>סה״כ</span><strong>—</strong></div>}</div>}<button className="primary-action" disabled={!selectedStore || !basketProducts.length} onClick={() => { if (selectedStore) setCompareOpen(true); }}>{shoppingMode === 'delivery' ? 'השוואת סל למשלוח' : 'השוואת הסל המלא'} <span aria-hidden="true">←</span></button>{shoppingMode === 'delivery' && <p className="mode-note">הכיסוי ודמי המשלוח לא אומתו. לפני המשך, בדקו את הרשימה והמחירים באתר הרשת.</p>}<p className="disclaimer">מחירי המדף עשויים להשתנות בחנות. המחיר בקופה הוא הקובע.</p></aside>
    </div>
    <footer className="site-footer"><span>© 2026 סל זול · נתוני מחירים ממקורות השקיפות של הרשתות</span><nav><a href="https://prices.shufersal.co.il/" rel="noreferrer">מקור נתונים</a><a href="/privacy">פרטיות</a><a href="/terms">תנאי שימוש</a></nav></footer><div className="sr-only" aria-live="polite">{liveMessage}</div>
        {locationOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLocationOpen(false); }}><section className="modal location-modal" role="dialog" aria-modal="true" aria-labelledby="location-title" aria-describedby="location-description"><button className="modal-close" onClick={() => setLocationOpen(false)} aria-label="סגירת חלון">×</button><span className="modal-icon">⌖</span><h2 id="location-title">איפה אתם קונים?</h2><p id="location-description">נמצא סניפים לידכם רק אחרי כתובת או מיקום. לא נשמור את הכתובת, ולא נבחר סניף באופן אוטומטי.</p><button className="location-detect" onClick={useBrowserLocation} disabled={loadingStores}>שימוש במיקום הנוכחי <span>⌖</span></button><div className="modal-divider"><span>או חיפוש כתובת</span></div><input ref={locationInputRef} autoFocus value={locationQuery} onChange={(event) => { setLocationQuery(event.target.value); setAddressResults([]); setAddressStatus(null); setDirectorySuggestions([]); setLocationError(''); setLocationNotice(''); }} placeholder="רחוב, מספר ועיר..." aria-label="חיפוש כתובת" /><label className="privacy-option"><input type="checkbox" checked={rememberLocation} onChange={(event) => { const next = event.target.checked; setRememberLocation(next); if (!next) clearRememberedLocation(); else if (selectedStore) persistRememberedStore(selectedStore, shoppingMode, true); }} /><span>לזכור סניף ומיקום מעוגל במכשיר זה</span></label>{directorySearchLoading && <div className="loading-state" role="status">מחפשים בכתובות ישראל…</div>}{directorySuggestions.map((suggestion) => <button className="address-result" key={suggestion.id} onClick={() => chooseDirectorySuggestion(suggestion)} disabled={loadingStores}><strong>{suggestion.label}</strong><small>{suggestion.detail}</small></button>)}{addressSearchLoading && !directorySuggestions.length && <div className="loading-state" role="status">מאתרים את הכתובת…</div>}{!directorySuggestions.length && addressResults.map((result) => <button className="address-result" key={`${result.id}-${result.label}`} onClick={() => chooseAddress(result)} disabled={loadingStores || addressSearchLoading}><strong>{result.label}</strong><small>{result.isExactAddress ? result.detail : `${result.detail} · התאמה לפי הרחוב והיישוב`}</small></button>)}{locationQuery.trim().length >= 2 && !directorySearchLoading && !addressSearchLoading && !directorySuggestions.length && !addressResults.length && !locationError && <><div className="modal-error" role="status">{addressStatus === 'empty' ? 'לא נמצאה התאמה לכתובת הזו. נסו ניסוח אחר או בדקו את הכתובת.' : 'לא נמצאה התאמה מדויקת. נסו לבחור רחוב ויישוב מתוך ההצעות.'}</div><button className="manual-address-button" onClick={continueWithManualAddress}>המשך עם הכתובת הזו בלי לבחור סניף</button></>}{loadingStores && <div className="loading-state" role="status">טוענים סניפים לפי המיקום שסיפקתם…</div>}{locationError && <><div className="modal-error" role="alert">{locationError}</div>{retryableAddressError && <button className="manual-address-button" onClick={retryAddressSearch}>ניסיון נוסף</button>}</>}{locationNotice && <div className="modal-notice" role="status">{locationNotice}</div>}<small className="privacy-hint">🔒 הכתובת והמיקום משמשים לחיפוש הנוכחי בלבד. סימון השמירה שומר רק סניף ומיקום מעוגל.</small><div className="sr-only" aria-live="assertive" aria-atomic="true">{locationError || locationNotice}</div></section></div>}
    {compareOpen && selectedStore && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCompareOpen(false); }}><section className="modal compare-modal" role="dialog" aria-modal="true" aria-labelledby="compare-title"><button className="modal-close" onClick={() => setCompareOpen(false)} aria-label="סגירת חלון">×</button><span className="eyebrow">השוואת סל · {shoppingMode === 'delivery' ? 'משלוח' : 'קנייה פיזית'}</span><h2 id="compare-title">איפה הסל שלך משתלם יותר?</h2><p>המחירים כוללים מבצעים ציבוריים. הטבות מועדון מוצגות בנפרד.</p><div className="compare-table">{nearbyStores.map((store) => { const storeProducts = store.id === selectedStore ? calculationProducts : catalogProducts.map((product) => productForStore(product, store.id)); const total = calculateBasket(basket, store.id, storeProducts); const selected = store.id === selectedStore; return <button className={`compare-row ${selected ? 'selected' : ''}`} key={store.id} onClick={() => { chooseStore(store.id); if (shoppingMode === 'physical') setCompareOpen(false); }}><span className={`store-logo ${store.color}`}>{store.chain.slice(0, 1)}</span><span><strong>{store.name}</strong><small>{formatDistance(store.distanceKm)} · {total.unavailable.length ? `${total.unavailable.length} חסרים` : 'הכל זמין'} · {store.delivery.capability === 'manual' ? 'העברה ידנית' : 'העברה חלקית'}</small></span><b>{money(total.publicTotal)}</b>{selected && <em>נבחר</em>}</button>; })}</div>{shoppingMode === 'delivery' && <div className="handoff-panel"><strong>המשך לרשת או העתקת הרשימה</strong><small>ההעברה אינה הזמנה, אינה כוללת כתובת או פרטי תשלום, והמחיר בקופה הוא הקובע.</small><div className="handoff-actions">{nearbyStores.map((store) => <button key={store.id} className="handoff-button" onClick={() => void requestHandoff(store.id)} disabled={handoffLoading}>{handoffLoading ? 'מכינים…' : `העבר ל${store.chain}`}</button>)}</div>{handoffError && <div className="modal-error" role="alert">{handoffError}</div>}{handoff && <div className="handoff-result"><strong>העברה מוכנה · {handoff.retailer.name}</strong><p>{handoff.items.length} מוצרים · נוצרה {freshnessLabel(handoff.generatedAt)}</p><button className="manual-address-button" onClick={copyHandoff}>העתקת רשימת מוצרים</button><ul>{handoff.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>{handoff.retailer.retailerUrl && <a href={handoff.retailer.retailerUrl} target="_blank" rel="noreferrer">פתיחת אתר הרשת</a>}</div>}</div>}<p className="modal-footnote">ההשוואה היא לפי המחירים שנקלטו לאחרונה. המחיר בקופה הוא הקובע.</p></section></div>}
    {(productSearchLoading || productSearchStatus === 'idle') && <div className="loading-state product-search-status" role="status" aria-live="polite" data-testid="product-search-loading">טוענים מוצרים…</div>}
    {productSearchStatus === 'error' && <div className="modal-error product-search-status" role="alert" data-testid="product-search-error">{productSearchError}<button className="text-button" onClick={() => setProductRetryNonce((nonce) => nonce + 1)}>ניסיון נוסף</button></div>}
    {productSearchStatus === 'ready' && productTotal > 24 && <nav className="product-pagination" aria-label="דפדוף בתוצאות המוצרים" data-testid="product-pagination"><button className="text-button" disabled={!productHasPrevious || productSearchLoading} onClick={() => setProductPage((page) => Math.max(1, page - 1))}>הקודם</button><span>עמוד {productPage} · {productTotal} תוצאות</span><button className="text-button" disabled={!productHasNext || productSearchLoading} onClick={() => setProductPage((page) => page + 1)}>הבא</button></nav>}
    {selectedStore && productCoverage && <div className="coverage-status" role="status" data-testid="product-coverage">כיסוי הסניף: {productCoverage.availableProducts}/{productCoverage.pricedProducts} מוצרים זמינים · {productCoverage.availabilityState === 'partial' ? 'יש מוצרים שאינם זמינים' : productCoverage.availabilityState === 'unknown' ? 'חלק מהכיסוי אינו ידוע' : 'כל התצפיות זמינות'}</div>}
  </main>;
}
