import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Switch,
  Typography,
  Alert,
  Snackbar,
  FormControlLabel,
  Tooltip,
} from "@mui/material";
import PaymentIcon from "@mui/icons-material/Payment";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import UndoOutlinedIcon from "@mui/icons-material/UndoOutlined";
import MenuIcon from "@mui/icons-material/Menu";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import {
  addProductToCart,
  buildPriceLabelEscPos,
  buildSaleTicketEscPos,
  bytesToBase64,
  cartTotals,
  clearCart,
  createEmptyCart,
  formatDecimalFr,
  formatMoneyDh,
  formatMoneyFr,
  formatBalanceWeightKgFr,
  formatWeightKgFr,
  mergeLineIntoCart,
  removeLine,
  setClient,
  updateCartLine,
  type CatalogProduct,
  type CartLine,
  type CartState,
} from "@opf/caisse-core";
import {
  activeCatalogProducts,
  ALL_SUBCATEGORY,
  categoryTabsFromCatalog,
  productsForCategoryAndSubcategory,
  resolveProductByCode,
  subcategoryTabsFromCatalog,
} from "../data/catalog-helpers";
import { fetchCatalogFromApi, isCatalogApiConfigured } from "../lib/catalog";
import { fetchWeight, printEscPosBase64, reconnectScale, sendTare, subscribeWeight } from "../lib/agent";
import { playAddProductBeep, playAddProductErrorBeep } from "../lib/sounds";
import {
  cartRowsWithCategories,
  clearCachedCart,
  loadCachedCart,
  saveCachedCart,
} from "../lib/cart-cache";
import PaymentDialog from "../components/PaymentDialog";
import ClientSelectDialog from "../components/ClientSelectDialog";
import ProductQtyDialog from "../components/ProductQtyDialog";
import HoldCartDialog from "../components/HoldCartDialog";
import MenuDialog from "../components/MenuDialog";
import SettingsDialog from "../components/SettingsDialog";
import CashierStatusBar from "../components/CashierStatusBar";
import CaisseVersionBadge from "../components/CaisseVersionBadge";
import { nextTicketNumber } from "../lib/ticket-counter";
import {
  hasLastTicketEscPos,
  loadLastTicketEscPosBase64,
  saveLastTicketEscPosBase64,
} from "../lib/last-ticket";
import { getCaisseRuntimeConfig, syncHardwareConfigToAgent } from "../lib/hardware-config";
import { isTestMagasin } from "../lib/caisse-identity";
import {
  createHoldId,
  loadHeldCarts,
  saveHeldCarts,
  type HeldCartEntry,
} from "../lib/cart-holds";
import RoundNumpad from "../components/RoundNumpad";
import RoundActionButton from "../components/RoundActionButton";
import logoOpetitFrais from "../assets/logo-opetit-frais.png";

const DEFAULT_MAGASIN = "00";
const DEFAULT_CAISSE = "01";

const PRODUCT_GRID_COLS = 8;
const PRODUCT_GRID_ROWS = 6;
const PRODUCTS_PER_PAGE = PRODUCT_GRID_COLS * PRODUCT_GRID_ROWS;

const CASHIER_SIDEBAR_WIDTH_PX = 300;
const CATEGORY_ROW_HEIGHT_PX = 38;

const PRODUCT_LONG_PRESS_MS = 550;

type CartAddEntry = {
  lineId: string;
  qtyAdded: number;
};

export default function CashierScreen() {
  const [magasin, setMagasin] = useState(DEFAULT_MAGASIN);
  const [caisseCode, setCaisseCode] = useState(DEFAULT_CAISSE);
  const [ticketPrinter, setTicketPrinter] = useState("");
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [cart, setCart] = useState<CartState>(() => createEmptyCart());
  const [category, setCategory] = useState<string>("");
  const [subcategory, setSubcategory] = useState<string>(ALL_SUBCATEGORY);
  const [productPage, setProductPage] = useState(0);
  const [weightKg, setWeightKg] = useState(0);
  const [weightStable, setWeightStable] = useState(false);
  const [weightSource, setWeightSource] = useState("offline");
  const [printPriceMode, setPrintPriceMode] = useState(false);
  const [codeBuffer, setCodeBuffer] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [clearCartConfirmOpen, setClearCartConfirmOpen] = useState(false);
  const [holdDialogOpen, setHoldDialogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saurusSending, setSaurusSending] = useState(false);
  const [quitConfirmOpen, setQuitConfirmOpen] = useState(false);
  const [backofficeUrl, setBackofficeUrl] = useState<string | null>(null);
  const [heldCarts, setHeldCarts] = useState<HeldCartEntry[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [lineEditOpen, setLineEditOpen] = useState(false);
  const [manualQtyOpen, setManualQtyOpen] = useState(false);
  const [manualQtyProduct, setManualQtyProduct] = useState<CatalogProduct | null>(null);
  const [addHistory, setAddHistory] = useState<CartAddEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [lastTicketAvailable, setLastTicketAvailable] = useState(() => hasLastTicketEscPos());
  const productTouchMoved = useRef(false);
  const productLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productLongPressTriggered = useRef(false);
  const cartCacheReady = useRef(false);
  const holdsCacheReady = useRef(false);

  const clearProductLongPressTimer = () => {
    if (productLongPressTimer.current) {
      clearTimeout(productLongPressTimer.current);
      productLongPressTimer.current = null;
    }
  };

  const markProductTouchStart = () => {
    productTouchMoved.current = false;
  };

  const markProductTouchMove = () => {
    productTouchMoved.current = true;
    clearProductLongPressTimer();
  };

  const handleProductPointerDown = (product: CatalogProduct) => {
    if (printPriceMode) return;
    productLongPressTriggered.current = false;
    productTouchMoved.current = false;
    clearProductLongPressTimer();
    productLongPressTimer.current = setTimeout(() => {
      productLongPressTriggered.current = true;
      setManualQtyProduct(product);
      setManualQtyOpen(true);
    }, PRODUCT_LONG_PRESS_MS);
  };

  const handleProductPointerEnd = () => {
    clearProductLongPressTimer();
  };

  const handleProductTap = (product: CatalogProduct) => {
    if (productTouchMoved.current || productLongPressTriggered.current) {
      productLongPressTriggered.current = false;
      return;
    }
    void handleAddProduct(product, "grid");
  };

  const activeCatalog = useMemo(() => activeCatalogProducts(catalog), [catalog]);
  const categoryTabs = useMemo(() => categoryTabsFromCatalog(activeCatalog), [activeCatalog]);
  const subcategoryTabs = useMemo(
    () => subcategoryTabsFromCatalog(activeCatalog, category),
    [activeCatalog, category],
  );

  useEffect(() => {
    if (categoryTabs.length === 0) return;
    if (!categoryTabs.includes(category)) {
      setCategory(categoryTabs[0]!);
    }
  }, [categoryTabs, category]);

  useEffect(() => {
    setSubcategory(ALL_SUBCATEGORY);
    setProductPage(0);
  }, [category]);

  useEffect(() => {
    setProductPage(0);
  }, [subcategory]);

  useEffect(() => {
    if (subcategoryTabs.length === 0) return;
    if (!subcategoryTabs.includes(subcategory)) {
      setSubcategory(ALL_SUBCATEGORY);
    }
  }, [subcategoryTabs, subcategory]);

  const effectiveSubcategory =
    subcategoryTabs.length > 0 && subcategoryTabs.includes(subcategory)
      ? subcategory
      : ALL_SUBCATEGORY;

  const products = useMemo(
    () => productsForCategoryAndSubcategory(activeCatalog, category, effectiveSubcategory),
    [activeCatalog, category, effectiveSubcategory],
  );

  const productPageCount = useMemo(
    () => Math.max(1, Math.ceil(products.length / PRODUCTS_PER_PAGE)),
    [products.length],
  );

  const paginatedProducts = useMemo(() => {
    const safePage = Math.min(productPage, productPageCount - 1);
    const start = safePage * PRODUCTS_PER_PAGE;
    return products.slice(start, start + PRODUCTS_PER_PAGE);
  }, [products, productPage, productPageCount]);

  useEffect(() => {
    if (productPage >= productPageCount) {
      setProductPage(Math.max(0, productPageCount - 1));
    }
  }, [productPage, productPageCount]);

  const sortedCartLines = useMemo(() => {
    const categoryOrder = new Map(categoryTabs.map((label, index) => [label, index]));
    return [...cart.lines].sort((a, b) => {
      const orderA = categoryOrder.get(a.categoryLabel) ?? 9999;
      const orderB = categoryOrder.get(b.categoryLabel) ?? 9999;
      if (orderA !== orderB) return orderA - orderB;
      return a.productName.localeCompare(b.productName, "fr");
    });
  }, [cart.lines, categoryTabs]);

  const cartDisplayRows = useMemo(
    () => cartRowsWithCategories(sortedCartLines),
    [sortedCartLines],
  );

  const { total, lineCount } = cartTotals(cart);

  const selectedLine = useMemo(
    () => cart.lines.find((l) => l.id === selectedLineId) ?? null,
    [cart.lines, selectedLineId],
  );

  const selectedLinePhotoUrl = useMemo(() => {
    if (!selectedLine) return null;
    return activeCatalog.find((p) => p.id === selectedLine.productId)?.photoUrl ?? null;
  }, [selectedLine, activeCatalog]);

  const openLineEdit = (line: CartLine) => {
    setSelectedLineId(line.id);
    setLineEditOpen(true);
  };

  const handleLineSave = (patch: { qty: number; unitPrice: number }) => {
    if (!selectedLineId) return;
    setCart((prev) => {
      const result = updateCartLine(prev, selectedLineId, patch);
      if (result.error) {
        setError(result.error);
        return prev;
      }
      return result.cart;
    });
    setAddHistory((prev) => prev.filter((entry) => entry.lineId !== selectedLineId));
  };

  const handleLineDelete = () => {
    if (!selectedLineId) return;
    setCart((prev) => removeLine(prev, selectedLineId));
    setAddHistory((prev) => prev.filter((entry) => entry.lineId !== selectedLineId));
    setSelectedLineId(null);
    setLineEditOpen(false);
  };

  const clearAddHistory = () => setAddHistory([]);

  const lastAddedLineId =
    addHistory.length > 0 ? addHistory[addHistory.length - 1]!.lineId : null;

  const handleUndoLastAdd = () => {
    if (addHistory.length === 0) return;

    const entry = addHistory[addHistory.length - 1]!;
    const line = cart.lines.find((l) => l.id === entry.lineId);

    if (!line) {
      setAddHistory((prev) => prev.slice(0, -1));
      setInfo("Ajout déjà annulé");
      return;
    }

    const remaining = Math.round((line.qty - entry.qtyAdded) * 1000) / 1000;
    if (remaining > 0.0005) {
      setCart((prev) => {
        const result = updateCartLine(prev, entry.lineId, { qty: remaining });
        if (result.error) {
          setError(result.error);
          return prev;
        }
        return result.cart;
      });
    } else {
      setCart((prev) => removeLine(prev, entry.lineId));
    }

    setAddHistory((prev) => prev.slice(0, -1));
    setSelectedLineId(null);
    setInfo("Dernier produit annulé");
  };

  useEffect(() => {
    void getCaisseRuntimeConfig().then((cfg) => {
      setBackofficeUrl(cfg.backofficeUrl);
      setMagasin(cfg.magasinCode);
      setCaisseCode(cfg.caisseCode);
      setTicketPrinter(cfg.ticketPrinter);

      const cached = loadCachedCart(cfg.magasinCode, cfg.caisseCode);
      if (cached && (cached.lines.length > 0 || cached.clientId != null)) {
        setCart(cached);
        if (cached.lines.length > 0) {
          setInfo(`Panier restauré (${cached.lines.length} ligne(s))`);
        }
      }
      cartCacheReady.current = true;
      setHeldCarts(loadHeldCarts(cfg.magasinCode, cfg.caisseCode));
      holdsCacheReady.current = true;
    });
    void syncHardwareConfigToAgent();
  }, []);

  useEffect(() => {
    if (!holdsCacheReady.current) return;
    saveHeldCarts(magasin, caisseCode, heldCarts);
  }, [heldCarts, magasin, caisseCode]);

  useEffect(() => {
    if (!cartCacheReady.current) return;
    if (cart.lines.length === 0 && cart.clientId == null && cart.clientName == null) {
      clearCachedCart(magasin, caisseCode);
      return;
    }
    saveCachedCart(magasin, caisseCode, cart);
  }, [cart, magasin, caisseCode]);

  const loadCatalog = useCallback(async (options?: { showInfo?: boolean }) => {
    setCatalogLoading(true);
    try {
      let rawProducts: CatalogProduct[] = [];

      if (window.caisseApi?.refreshCatalogCache && options?.showInfo) {
        const cached = await window.caisseApi.refreshCatalogCache();
        if (cached.products.length > 0) {
          rawProducts = cached.products;
        }
      }

      if (rawProducts.length === 0) {
        const result = await fetchCatalogFromApi();
        if (result.products.length > 0) {
          rawProducts = result.products;
        } else {
          if (result.error && (await isCatalogApiConfigured())) {
            setError(`Catalogue : ${result.error}`);
          } else if (result.error) {
            setError(result.error);
          }
        }
      }

      const active = activeCatalogProducts(rawProducts);
      const tabs = categoryTabsFromCatalog(active);
      setCatalog(active);
      setCategory((prev) => (tabs.includes(prev) ? prev : tabs[0] ?? ""));
      setCatalogReady(true);
      if (options?.showInfo) {
        setInfo(`${active.length} produits importés`);
      }
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setCatalogLoading(true);
      try {
        const initial = await window.caisseApi?.getInitialCatalog?.();
        if (initial && initial.products.length > 0) {
          const active = activeCatalogProducts(initial.products);
          const tabs = categoryTabsFromCatalog(active);
          setCatalog(active);
          setCategory(tabs[0] ?? "");
          setCatalogReady(true);
          return;
        }
        await loadCatalog();
      } catch {
        await loadCatalog();
      } finally {
        setCatalogLoading(false);
      }
    })();
  }, [loadCatalog]);

  const broadcast = useCallback(
    (next: CartState, idle = false) => {
      const t = cartTotals(next);
      window.caisseApi?.broadcastCart({
        lines: next.lines.map((l) => ({
          productName: l.productName,
          categoryLabel: l.categoryLabel,
          qty: l.qty,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
          salesUnit: l.salesUnit,
        })),
        total: t.total,
        lineCount: t.lineCount,
        idle,
      });
    },
    [],
  );

  useEffect(() => {
    broadcast(cart, cart.lines.length === 0);
  }, [cart, broadcast]);

  useEffect(() => {
    return subscribeWeight((w) => {
      setWeightKg(w.weightKg);
      setWeightStable(w.stable);
      setWeightSource(w.source);
    });
  }, []);

  const scaleConnected = weightSource === "serial";
  const weightNegative = weightKg < 0;
  const balanceWeightLabel = formatBalanceWeightKgFr(weightKg);

  const handleReconnectScale = async () => {
    const w = await reconnectScale();
    setWeightKg(w.weightKg);
    setWeightStable(w.stable);
    setWeightSource(w.source);
    if (w.source === "serial") {
      setInfo("Balance reconnectée");
    } else {
      setError(w.error ?? "Balance non disponible — vérifiez USB et agent");
    }
  };

  const handleAddProduct = async (
    product: CatalogProduct,
    source: "grid" | "keyboard",
    manualQty?: number,
  ) => {
    try {
      let w = weightKg;
      if (manualQty === undefined && product.salesUnit === "kg" && w <= 0) {
        const live = await fetchWeight();
        w = live.weightKg;
        setWeightKg(live.weightKg);
        setWeightStable(live.stable);
        setWeightSource(live.source);
      }

      if (printPriceMode) {
        const printResult = addProductToCart(createEmptyCart(), {
          source,
          code: product.code,
          product,
          weightKg: w,
          printPriceMode: true,
        });
        if (!printResult.ok) {
          setError(printResult.error);
          playAddProductErrorBeep();
          return;
        }
        const buf = buildPriceLabelEscPos({
          productName: product.salesName,
          price: product.price,
          salesUnit: product.salesUnit,
        });
        const labelPrintResult = await printEscPosBase64(bytesToBase64(buf), { ticketPrinter });
        if (!labelPrintResult.ok) {
          setError(labelPrintResult.error);
          playAddProductErrorBeep();
        }
        return;
      }

      let cartError: string | null = null;
      let addedToCart = false;
      let addedLineMeta: CartAddEntry | null = null;
      setCart((prev) => {
        const result = addProductToCart(prev, {
          source,
          code: product.code,
          product,
          weightKg: w,
          qty: manualQty,
          printPriceMode: false,
        });
        if (!result.ok) {
          cartError = result.error;
          return prev;
        }
        if (result.line) {
          addedToCart = true;
          const mergeTarget = prev.lines.find(
            (l) => l.productId === result.line!.productId && l.unitPrice === result.line!.unitPrice,
          );
          addedLineMeta = {
            lineId: mergeTarget?.id ?? result.line.id,
            qtyAdded: result.line.qty,
          };
          return mergeLineIntoCart(prev, result.line);
        }
        return prev;
      });
      if (cartError) {
        setError(cartError);
        playAddProductErrorBeep();
      } else if (addedToCart && addedLineMeta) {
        setAddHistory((prev) => [...prev, addedLineMeta!]);
        playAddProductBeep();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inattendue";
      setError(msg);
      playAddProductErrorBeep();
    }
  };

  const validateCode = () => {
    const product = resolveProductByCode(activeCatalog, codeBuffer);
    if (!product) {
      setError(`Code inconnu : ${codeBuffer}`);
      playAddProductErrorBeep();
      setCodeBuffer("");
      return;
    }
    void handleAddProduct(product, "keyboard");
    setCodeBuffer("");
  };

  const numpadKey = (key: string) => {
    if (key === "C") {
      setCodeBuffer("");
      return;
    }
    if (key === "OK") {
      validateCode();
      return;
    }
    setCodeBuffer((p) => p + key);
  };

  const handlePayment = async (opts: {
    printTicket: boolean;
    isDelivery: boolean;
    payments: Array<{ label: string; amount: number }>;
    change: number;
  }) => {
    if (opts.printTicket) {
      try {
        const ticketNumber = nextTicketNumber(magasin, caisseCode);
        const buf = buildSaleTicketEscPos({
          magasinCode: magasin,
          caisseCode: caisseCode,
          ticketNumber,
          soldAt: new Date(),
          lines: cart.lines,
          total,
          articleCount: lineCount,
          clientName: cart.clientName,
          payments: opts.payments,
          change: opts.change,
        });
        const base64 = bytesToBase64(buf);
        saveLastTicketEscPosBase64(base64);
        setLastTicketAvailable(true);
        const printResult = await printEscPosBase64(base64, { ticketPrinter });
        if (!printResult.ok) {
          setError(printResult.error);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ticket impossible à générer");
      }
    }
    setCart(clearCart(cart));
    clearCachedCart(magasin, caisseCode);
    clearAddHistory();
    broadcast(createEmptyCart(), true);
    if (opts.isDelivery) {
      setError("Vente livraison enregistrée (sync Phase 2)");
    }
  };

  const handleReprintLastTicket = async () => {
    const base64 = loadLastTicketEscPosBase64();
    if (!base64) {
      setError("Aucun ticket à réimprimer");
      setLastTicketAvailable(false);
      return;
    }
    const printResult = await printEscPosBase64(base64, { ticketPrinter });
    if (!printResult.ok) {
      setError(printResult.error);
      return;
    }
    setInfo("Dernier ticket réimprimé");
  };

  const handleSendSaurusPrices = async () => {
    if (!window.caisseApi?.sendSaurusCatalog) {
      setError("Envoi balance SAURUS indisponible (mode navigateur)");
      return;
    }
    setSaurusSending(true);
    setError(null);
    try {
      const result = await window.caisseApi.sendSaurusCatalog();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const skipped = result.skipped?.length ?? 0;
      setInfo(
        `${result.productCount} article(s) envoyé(s) à la balance SAURUS${
          skipped > 0 ? ` (${skipped} ignoré(s))` : ""
        }`,
      );
      setMenuOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi balance impossible");
    } finally {
      setSaurusSending(false);
    }
  };

  const confirmClearCart = () => {
    setCart(clearCart(cart));
    clearCachedCart(magasin, caisseCode);
    clearAddHistory();
    setClearCartConfirmOpen(false);
  };

  const cloneCart = (source: CartState): CartState => ({
    clientId: source.clientId,
    clientName: source.clientName,
    lines: source.lines.map((line) => ({ ...line })),
  });

  const handleHoldCurrentCart = () => {
    if (lineCount === 0) return;
    const entry: HeldCartEntry = {
      id: createHoldId(),
      cart: cloneCart(cart),
      heldAt: new Date().toISOString(),
    };
    setHeldCarts((prev) => [...prev, entry]);
    setCart(createEmptyCart());
    clearCachedCart(magasin, caisseCode);
    clearAddHistory();
    setInfo("Panier mis en attente");
  };

  const handleRecallHold = (holdId: string) => {
    const entry = heldCarts.find((h) => h.id === holdId);
    if (!entry) return;

    const hasCurrentCart = lineCount > 0 || cart.clientId != null;
    let nextHolds = heldCarts.filter((h) => h.id !== holdId);

    if (hasCurrentCart) {
      nextHolds = [
        ...nextHolds,
        {
          id: createHoldId(),
          cart: cloneCart(cart),
          heldAt: new Date().toISOString(),
        },
      ];
    }

    setHeldCarts(nextHolds);
    setCart(cloneCart(entry.cart));
    clearAddHistory();
    setHoldDialogOpen(false);
    setInfo(`Panier rappelé${entry.cart.clientName ? ` : ${entry.cart.clientName}` : ""}`);
  };

  const handleDeleteHold = (holdId: string) => {
    setHeldCarts((prev) => prev.filter((h) => h.id !== holdId));
  };

  const compactActionBtnSx = {
    fontSize: 11,
    py: 0.2,
    px: 0.75,
    minHeight: 28,
    lineHeight: 1.2,
  } as const;

  return (
    <Box sx={{ width: 1024, height: 768, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {isTestMagasin(magasin) ? (
        <Alert severity="warning" sx={{ borderRadius: 0, py: 0.25, flexShrink: 0 }}>
          Mode test (magasin 0) — ventes non comptabilisées dans les statistiques
        </Alert>
      ) : null}
      <Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "stretch",
              gap: 0.5,
              px: 0.75,
              py: 0.5,
              flexShrink: 0,
              borderBottom: 1,
              borderColor: "divider",
              minWidth: 0,
            }}
          >
            <Box
              sx={{
                flex: 1,
                display: "flex",
                flexWrap: "nowrap",
                gap: 0.5,
                minWidth: 0,
                overflow: "hidden",
              }}
            >
            {catalogReady
              ? categoryTabs.map((c) => (
              <Button
                key={c}
                variant={category === c ? "contained" : "outlined"}
                onClick={() => setCategory(c)}
                sx={{
                  flex: "1 1 0",
                  minWidth: 0,
                  fontSize: 13,
                  fontWeight: 700,
                  px: 0.75,
                  py: 0,
                  height: CATEGORY_ROW_HEIGHT_PX,
                  minHeight: CATEGORY_ROW_HEIGHT_PX,
                  whiteSpace: "nowrap",
                }}
              >
                {c}
              </Button>
            ))
              : null}
            </Box>
            {catalogReady ? (
              <Box sx={{ display: "flex", gap: 0.5, alignItems: "stretch", flexShrink: 0 }}>
                <Tooltip
                  title={
                    !scaleConnected
                      ? "Balance déconnectée — clic pour reconnecter"
                      : weightNegative
                        ? "Poids négatif"
                        : weightStable
                          ? "Poids stable"
                          : "Poids instable"
                  }
                >
                  <Paper
                    component="button"
                    onClick={() => void handleReconnectScale()}
                    sx={{
                      px: 0.75,
                      border: 2,
                      borderColor: !scaleConnected
                        ? "#8e0000"
                        : weightNegative
                          ? "#8e0000"
                          : weightStable
                            ? "#1b5e20"
                            : "#424242",
                      borderRadius: 1,
                      cursor: "pointer",
                      bgcolor: !scaleConnected
                        ? "#c62828"
                        : weightNegative
                          ? "#c62828"
                          : weightStable
                            ? "#269641"
                            : "#757575",
                      color: "#fff",
                      width: 148,
                      height: CATEGORY_ROW_HEIGHT_PX,
                      minHeight: CATEGORY_ROW_HEIGHT_PX,
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                      boxShadow: "0 2px 6px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.18)",
                    }}
                  >
                    <Box
                      sx={{
                        flex: 1,
                        minWidth: 0,
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        px: 0.5,
                        borderRadius: 0.5,
                        bgcolor: "rgba(0,0,0,0.42)",
                        boxShadow: "inset 0 2px 4px rgba(0,0,0,0.35)",
                      }}
                    >
                      <Typography
                        sx={{
                          fontFamily: '"DSEG7 Classic Mini", monospace',
                          fontSize: 26,
                          lineHeight: 1,
                          letterSpacing: "0.08em",
                          width: "100%",
                          textAlign: "left",
                          fontVariantNumeric: "tabular-nums",
                          color: !scaleConnected
                            ? "#ffcdd2"
                            : weightNegative
                              ? "#ffcdd2"
                              : weightStable
                                ? "#e8f5e9"
                                : "#f5f5f5",
                          textShadow: weightNegative
                            ? "0 0 10px rgba(255,82,82,0.85)"
                            : "0 0 8px rgba(255,255,255,0.45)",
                        }}
                      >
                        {balanceWeightLabel}
                      </Typography>
                    </Box>
                    <Typography
                      sx={{
                        fontWeight: 800,
                        fontSize: 13,
                        flexShrink: 0,
                        lineHeight: 1,
                        letterSpacing: 0.5,
                        textShadow: "0 1px 2px rgba(0,0,0,0.35)",
                      }}
                    >
                      Kg
                    </Typography>
                  </Paper>
                </Tooltip>
                <Button
                  variant="outlined"
                  onClick={() => void sendTare()}
                  title="Tare Arduino (T)"
                  sx={{
                    minWidth: 44,
                    px: 1,
                    flexShrink: 0,
                    height: CATEGORY_ROW_HEIGHT_PX,
                    minHeight: CATEGORY_ROW_HEIGHT_PX,
                    fontWeight: 800,
                    fontSize: 15,
                    borderWidth: 2,
                  }}
                >
                  T
                </Button>
              </Box>
            ) : null}
          </Box>

          {subcategoryTabs.length > 0 ? (
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: 0.5,
                px: 0.75,
                py: 0.5,
                flexShrink: 0,
                borderBottom: 1,
                borderColor: "divider",
                bgcolor: "#fafafa",
              }}
            >
              {subcategoryTabs.map((sc) => (
                <Button
                  key={sc}
                  size="small"
                  variant={effectiveSubcategory === sc ? "contained" : "outlined"}
                  color={effectiveSubcategory === sc ? "secondary" : "inherit"}
                  onClick={() => setSubcategory(sc)}
                  sx={{
                    minWidth: 56,
                    fontSize: 13,
                    fontWeight: 600,
                    px: 1.5,
                    py: 0.35,
                    minHeight: 36,
                  }}
                >
                  {sc}
                </Button>
              ))}
            </Box>
          ) : null}

          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                overflow: "hidden",
                p: 0.5,
                position: "relative",
              }}
            >
              {!catalogReady ? (
                <Box
                  sx={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <CircularProgress size={40} />
                </Box>
              ) : (
                <Box
                  sx={{
                    height: "100%",
                    display: "grid",
                    gridTemplateColumns: `repeat(${PRODUCT_GRID_COLS}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${PRODUCT_GRID_ROWS}, minmax(0, 1fr))`,
                    gap: 0.5,
                  }}
                >
                  {paginatedProducts.map((p) => (
                    <Paper
                      key={p.id}
                      sx={{
                        position: "relative",
                        cursor: "pointer",
                        minHeight: 0,
                        height: "100%",
                        overflow: "hidden",
                        userSelect: "none",
                        bgcolor: "#f5f5f5",
                        "&:hover": { bgcolor: "#e8f5e9" },
                        "&:active": { bgcolor: "#c8e6c9" },
                      }}
                      onPointerDown={() => handleProductPointerDown(p)}
                      onPointerUp={handleProductPointerEnd}
                      onPointerLeave={handleProductPointerEnd}
                      onPointerCancel={handleProductPointerEnd}
                      onTouchStart={markProductTouchStart}
                      onTouchMove={markProductTouchMove}
                      onClick={() => handleProductTap(p)}
                    >
                    <Box
                      sx={{
                        position: "absolute",
                        inset: 0,
                        zIndex: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        pointerEvents: "none",
                      }}
                    >
                      {p.photoUrl ? (
                        <Box
                          component="img"
                          src={p.photoUrl}
                          alt={p.salesName}
                          sx={{
                            width: "92%",
                            height: "92%",
                            objectFit: "contain",
                          }}
                        />
                      ) : (
                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: 22, fontWeight: 700 }}>
                          {p.salesUnit === "kg" ? "Kg" : "U"}
                        </Typography>
                      )}
                    </Box>

                    <Box
                      sx={{
                        position: "relative",
                        zIndex: 1,
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 0.25,
                        px: 0.35,
                        py: 0.2,
                        bgcolor: "rgba(255,255,255,0.82)",
                      }}
                    >
                      <Typography variant="caption" sx={{ fontSize: 9, lineHeight: 1.1 }}>
                        {p.code}
                      </Typography>
                      <Typography variant="caption" sx={{ fontSize: 9, lineHeight: 1.1, fontWeight: 600 }}>
                        {p.price} DH/{p.salesUnit === "kg" ? "Kg" : "U"}
                      </Typography>
                    </Box>

                    <Box
                      sx={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 1,
                        px: 0.35,
                        py: 0.15,
                        display: "flex",
                        alignItems: "flex-end",
                        justifyContent: "center",
                        textAlign: "center",
                        bgcolor: "rgba(255,255,255,0.88)",
                      }}
                    >
                      <Typography
                        variant="caption"
                        component="div"
                        sx={{
                          fontSize: 11,
                          fontWeight: 700,
                          lineHeight: 1.15,
                          width: "100%",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                        }}
                      >
                        {p.salesName}
                      </Typography>
                    </Box>
                    </Paper>
                  ))}
                </Box>
              )}
            </Box>

            {catalogReady ? (
              <Box
                sx={{
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  px: 1,
                  py: 0.5,
                  borderTop: 1,
                  borderColor: "divider",
                  bgcolor: "#fafafa",
                }}
              >
                <Box sx={{ flexShrink: 0, minWidth: 0, display: "flex", alignItems: "center", gap: 1 }}>
                  <CaisseVersionBadge />
                  <CashierStatusBar backofficeUrl={backofficeUrl} />
                </Box>
                <Box
                  sx={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 1,
                    minWidth: 0,
                  }}
                >
                  {products.length > 0 ? (
                    <>
                      <IconButton
                        aria-label="Page précédente"
                        disabled={productPage <= 0}
                        onClick={() => setProductPage((page) => Math.max(0, page - 1))}
                        sx={{ bgcolor: "#fff", border: 1, borderColor: "divider" }}
                      >
                        <ChevronLeftIcon />
                      </IconButton>
                      <Typography sx={{ fontWeight: 700, fontSize: 14, minWidth: 88, textAlign: "center" }}>
                        Page {Math.min(productPage, productPageCount - 1) + 1} / {productPageCount}
                      </Typography>
                      <IconButton
                        aria-label="Page suivante"
                        disabled={productPage >= productPageCount - 1}
                        onClick={() =>
                          setProductPage((page) => Math.min(productPageCount - 1, page + 1))
                        }
                        sx={{ bgcolor: "#fff", border: 1, borderColor: "divider" }}
                      >
                        <ChevronRightIcon />
                      </IconButton>
                    </>
                  ) : null}
                </Box>
                <FormControlLabel
                  sx={{ m: 0, flexShrink: 0 }}
                  control={
                    <Switch size="small" checked={printPriceMode} onChange={(_, v) => setPrintPriceMode(v)} />
                  }
                  label={<Typography variant="caption">Imprimer prix</Typography>}
                />
              </Box>
            ) : null}
          </Box>
        </Box>

        <Box
          sx={{
            width: CASHIER_SIDEBAR_WIDTH_PX,
            flexShrink: 0,
            borderLeft: 1,
            borderColor: "divider",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Box
            sx={{
              flexShrink: 0,
              bgcolor: "#fff",
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              px: 1,
              py: 0.75,
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <Box
              component="img"
              src={logoOpetitFrais}
              alt="O'petit frais"
              sx={{ flex: 1, height: 44, width: "auto", maxWidth: "100%", objectFit: "contain" }}
            />
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                setLastTicketAvailable(hasLastTicketEscPos());
                setMenuOpen(true);
              }}
              sx={{ ...compactActionBtnSx, minWidth: 56, flexShrink: 0 }}
              startIcon={<MenuIcon sx={{ fontSize: 18 }} />}
            >
              Menu
            </Button>
          </Box>

          <Box sx={{ px: 1, pt: 0.75, pb: 0.5, display: "flex", gap: 0.5 }}>
            <Button
              size="small"
              variant={cart.clientId ? "contained" : "outlined"}
              fullWidth
              onClick={() => setClientDialogOpen(true)}
              sx={compactActionBtnSx}
            >
              {cart.clientName ?? "Client"}
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="secondary"
              fullWidth
              onClick={() => setHoldDialogOpen(true)}
              disabled={lineCount === 0 && heldCarts.length === 0}
              sx={compactActionBtnSx}
            >
              Attente{heldCarts.length > 0 ? ` (${heldCarts.length})` : ""}
            </Button>
            <Tooltip title="Supprimer le panier">
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  disabled={lineCount === 0}
                  onClick={() => setClearCartConfirmOpen(true)}
                  sx={{ ...compactActionBtnSx, minWidth: 44, px: 0.75, flexShrink: 0 }}
                >
                  <DeleteOutlineOutlinedIcon sx={{ fontSize: 20 }} />
                </Button>
              </span>
            </Tooltip>
          </Box>

          <Typography align="center" variant="h6" sx={{ bgcolor: "#eee", mx: 1, borderRadius: 1 }}>
            {codeBuffer || "—"}
          </Typography>

          <Box sx={{ width: "100%", px: 1, pb: 0.5, flexShrink: 0 }}>
              <RoundNumpad
                keys={["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "OK"]}
                onKey={numpadKey}
                keySize={56}
                sideColumn={
                  <>
                    <RoundActionButton
                      title="Annuler dernier produit"
                      color="warning"
                      disabled={addHistory.length === 0}
                      onClick={handleUndoLastAdd}
                      size={56}
                      fullWidth
                    >
                      <UndoOutlinedIcon sx={{ fontSize: 28 }} />
                    </RoundActionButton>
                    <Tooltip title="Encaisser le panier" placement="left">
                      <span style={{ display: "flex", flex: 1, minHeight: 116, width: "100%" }}>
                        <Button
                          variant="contained"
                          color="secondary"
                          disabled={lineCount === 0}
                          onClick={() => setPaymentOpen(true)}
                          sx={{
                            width: "100%",
                            flex: 1,
                            minHeight: 116,
                            borderRadius: 1,
                            p: 0.5,
                            display: "flex",
                            flexDirection: "column",
                            gap: 0.25,
                            fontSize: 11,
                            fontWeight: 700,
                            lineHeight: 1.1,
                          }}
                        >
                          <PaymentIcon sx={{ fontSize: 28 }} />
                          Paiement
                        </Button>
                      </span>
                    </Tooltip>
                  </>
                }
              />
          </Box>

          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              mx: 1,
              mb: 0.5,
              display: "flex",
              flexDirection: "column",
              bgcolor: "#f2f5f2",
              borderRadius: 1,
              border: "1px solid",
              borderColor: "divider",
              overflow: "hidden",
            }}
          >
            <Box sx={{ flex: 1, overflow: "auto", px: 0.5, py: 0.5, minHeight: 0 }}>
            {cartDisplayRows.map((row) => {
              if (row.type === "category") {
                return (
                  <Typography
                    key={row.key}
                    sx={{
                      fontSize: 10,
                      fontWeight: 700,
                      px: 0.5,
                      py: 0.35,
                      mt: 0.25,
                      bgcolor: "#ddd",
                      borderRadius: 0.5,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {row.label}
                  </Typography>
                );
              }

              const line = row.line;
              const selected = selectedLineId === line.id;
              const isLastAdded = lastAddedLineId === line.id;
              return (
                <Paper
                  key={row.key}
                  onClick={() => openLineEdit(line)}
                  sx={{
                    px: 0.5,
                    py: 0.22,
                    mb: 0.25,
                    cursor: "pointer",
                    border: 2,
                    borderColor: isLastAdded
                      ? "success.main"
                      : selected
                        ? "primary.main"
                        : "divider",
                    bgcolor: isLastAdded ? "rgba(38, 150, 65, 0.18)" : selected ? "action.selected" : "background.paper",
                    boxShadow: isLastAdded ? "0 0 0 1px rgba(38, 150, 65, 0.35)" : "none",
                    "&:hover": {
                      bgcolor: isLastAdded ? "rgba(38, 150, 65, 0.24)" : selected ? "action.selected" : "#f5f5f5",
                    },
                  }}
                >
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) 36px 46px 40px",
                      columnGap: 0.25,
                      alignItems: "center",
                      minWidth: 0,
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: 11,
                        fontWeight: 700,
                        minWidth: 0,
                        lineHeight: 1.2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        pr: 0.25,
                      }}
                    >
                      {line.productName}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: 8,
                        color: "text.secondary",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                      }}
                    >
                      {line.salesUnit === "kg"
                        ? `${formatWeightKgFr(line.qty)} kg`
                        : formatDecimalFr(line.qty, 3)}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: 8,
                        color: "text.secondary",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        pr: 0.25,
                      }}
                    >
                      {line.salesUnit === "kg"
                        ? `${formatMoneyFr(line.unitPrice)} DH/kg`
                        : `${formatMoneyFr(line.unitPrice)} DH/u`}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: 9,
                        fontWeight: 700,
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap",
                        pl: 0.75,
                        ml: 0.35,
                        borderLeft: "1px solid",
                        borderColor: "divider",
                      }}
                    >
                      {formatMoneyFr(line.lineTotal)}
                    </Typography>
                  </Box>
                </Paper>
              );
            })}
            </Box>

            <Paper
              elevation={0}
              square
              sx={{
                px: 0.75,
                py: 0.5,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 0.75,
                flexShrink: 0,
                bgcolor: "#e4ebe4",
                borderTop: "2px solid",
                borderColor: "#b5c0b5",
                borderRadius: 0,
              }}
            >
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 700,
                  lineHeight: 1.2,
                  color: "text.secondary",
                  whiteSpace: "nowrap",
                }}
              >
                Total · {lineCount} art.
              </Typography>
              <Typography
                sx={{
                  fontSize: 26,
                  fontWeight: 800,
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "-0.02em",
                  color: "#000",
                  whiteSpace: "nowrap",
                }}
              >
                {formatMoneyDh(total)}
              </Typography>
            </Paper>
          </Box>
        </Box>
      </Box>

      <PaymentDialog
        open={paymentOpen}
        totalDue={total}
        clientId={cart.clientId}
        onClose={() => setPaymentOpen(false)}
        onValidate={handlePayment}
      />

      <ClientSelectDialog
        open={clientDialogOpen}
        selectedClientId={cart.clientId}
        onClose={() => setClientDialogOpen(false)}
        onValidate={(client) => {
          setCart((prev) => setClient(prev, client));
          if (client.name) setInfo(`Client : ${client.name}`);
        }}
      />

      {selectedLine ? (
        <ProductQtyDialog
          open={lineEditOpen}
          mode="edit"
          line={selectedLine}
          photoUrl={selectedLinePhotoUrl}
          onClose={() => setLineEditOpen(false)}
          onSave={handleLineSave}
          onDelete={handleLineDelete}
        />
      ) : null}

      {manualQtyProduct ? (
        <ProductQtyDialog
          open={manualQtyOpen}
          mode="add"
          product={manualQtyProduct}
          onClose={() => {
            setManualQtyOpen(false);
            setManualQtyProduct(null);
          }}
          onConfirm={(qty) => {
            void handleAddProduct(manualQtyProduct, "grid", qty);
          }}
        />
      ) : null}

      <HoldCartDialog
        open={holdDialogOpen}
        currentCart={cart}
        currentLineCount={lineCount}
        holds={heldCarts}
        onClose={() => setHoldDialogOpen(false)}
        onHoldCurrent={handleHoldCurrentCart}
        onRecall={handleRecallHold}
        onDeleteHold={handleDeleteHold}
      />

      <MenuDialog
        open={menuOpen}
        catalogLoading={catalogLoading}
        saurusSending={saurusSending}
        lastTicketAvailable={lastTicketAvailable}
        onClose={() => setMenuOpen(false)}
        onRefreshPrices={() => void loadCatalog({ showInfo: true })}
        onSendSaurusPrices={() => void handleSendSaurusPrices()}
        onReprintLastTicket={() => void handleReprintLastTicket()}
        onOpenSettings={() => setSettingsOpen(true)}
        onQuitApp={() => {
          setMenuOpen(false);
          setQuitConfirmOpen(true);
        }}
      />

      <Dialog open={quitConfirmOpen} onClose={() => setQuitConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Fermer la caisse ?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">Le logiciel va se fermer. Confirmer la fermeture ?</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 1.5 }}>
          <Button onClick={() => setQuitConfirmOpen(false)}>Annuler</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              setQuitConfirmOpen(false);
              void window.caisseApi?.quitApp();
            }}
          >
            Fermer caisse
          </Button>
        </DialogActions>
      </Dialog>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => {
          void getCaisseRuntimeConfig().then((cfg) => {
            setTicketPrinter(cfg.ticketPrinter);
          });
          setInfo("Paramètres enregistrés");
          void handleReconnectScale();
        }}
      />

      <Dialog open={clearCartConfirmOpen} onClose={() => setClearCartConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Supprimer le panier ?</DialogTitle>
        <DialogActions sx={{ px: 3, pb: 2, pt: 1 }}>
          <Button onClick={() => setClearCartConfirmOpen(false)}>Annuler</Button>
          <Button color="error" variant="contained" onClick={confirmClearCart}>
            Supprimer
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!error} autoHideDuration={4000} onClose={() => setError(null)}>
        <Alert severity="warning" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>

      <Snackbar open={!!info} autoHideDuration={3000} onClose={() => setInfo(null)}>
        <Alert severity="success" onClose={() => setInfo(null)}>
          {info}
        </Alert>
      </Snackbar>
    </Box>
  );
}
