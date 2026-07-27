"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import { useTranslations } from "next-intl";
import AppLink from "@/components/AppLink";
import FormDialog from "@/lib/mui/FormDialog";
import ProductArabicSubtitle from "@/components/ProductArabicSubtitle";
import CommandeFournisseurProductPicker, {
  type ProductPickRow,
} from "@/features/commandes-fournisseur/CommandeFournisseurProductPicker";
import AchatFraisDialog from "@/features/commandes-fournisseur/AchatFraisDialog";
import AchatLignePricingFields, {
  type AchatPricingChanged,
  type AchatPricingCommit,
} from "@/features/commandes-fournisseur/AchatLignePricingFields";
import AchatVendeurFormDialog, {
  type AchatVendeurFormValues,
} from "@/features/commandes-fournisseur/AchatVendeurFormDialog";
import {
  dhToRial,
  parseDeviseAchat,
  type DeviseAchat,
} from "@/lib/commandes-fournisseur/achat-devise";
import {
  ParcoursProductQuantityPanel,
  packArray,
  parcoursShapeFromPickRow,
  useSingleProductParcoursQuantity,
} from "@/features/commandes-fournisseur/parcours-product-quantity";
import { clampQtyToApiRange } from "@/lib/commandes-fournisseur/qty-parse";
import { useRouter } from "next/navigation";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useStatusLabels } from "@/lib/statusLabels/useStatusLabels";
import {
  buildLotProductDisplayInfo,
  buildSoitLine,
  labelFromRef,
  type ProductDisplayInfo,
} from "@/lib/commandes-fournisseur/product-display";
import {
  montantLigneFromPu,
  puFromMontantLigne,
  qtyBaseFromLotLine,
} from "@/lib/commandes-fournisseur/achat-pricing";
import {
  categoryDisplayLabel,
  compareByCategoryThenProductName,
  parseCategoryFromRef,
  type CategoryParsed,
} from "@/lib/commandes-fournisseur/ligne-category-order";

import type { SaisieLigneTarget } from "@/lib/commandes-fournisseur/ligne-saisie-comments";
import { useAppFormat } from "@/lib/i18n/useAppFormat";
import { useBackChevronIcon } from "@/lib/i18n/useBackChevronIcon";

type NestedProduct = {
  id: string;
  name?: string | null;
  name_ar?: string | null;
  code?: string | null;
  vendeur_id?: string | null;
  ref_sales_unit?: unknown;
  ref_purchase_unit?: unknown;
  ref_category?: unknown;
  product_packaging?: unknown;
} | null;

type LotLineApi = {
  id: string;
  product_id: string;
  product_packaging_id: string | null;
  qte_achat: number | string | null;
  qte_besoin_fige?: number | string | null;
  vendeur_id?: string | null;
  marque_achete?: boolean | null;
  prix_achat_unitaire?: number | null;
  montant_ligne_achat?: number | null;
  categoryLabel?: string;
  saisieLigneTargets?: SaisieLigneTarget[];
  commande_fournisseur_lot_ligne_magasin?: {
    magasin_id: string;
    qte?: number;
    magasins?: { code?: string | null; nom?: string | null } | { code?: string | null; nom?: string | null }[] | null;
  }[];
  product?: NestedProduct | NestedProduct[];
};

type LotApi = {
  id: string;
  supplier_id: string;
  status: string;
  commentaire: string | null;
  marque_prete_at: string | null;
  marque_terminee_at: string | null;
  created_at: string;
  ref_supplier: { label?: string; code?: string } | { label?: string; code?: string }[] | null;
};

type VendeurApi = {
  id: string;
  label: string;
  phone?: string | null;
  preferred_locale?: string | null;
  devise_achat?: string | null;
};

type FraisApi = {
  id: string;
  type_code: string;
  label: string | null;
  montant: number | string | null;
  vendeur_id: string | null;
};

/** Frais hors vendeur (`vendeur_id` null). */
type FraisUiLine = { sid: string; id?: string; label: string; montantText: string };

function faisGlobauxApi(rows: FraisApi[]): FraisApi[] {
  return rows.filter((f) => f.vendeur_id == null);
}

function montantNombreDepuisTxt(txt: string): number {
  const n = Number(String(txt ?? "").trim().replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function montantTextFrancais(brut: unknown): string {
  const n =
    typeof brut === "number"
      ? brut
      : typeof brut === "string"
        ? Number(brut.replace(",", "."))
        : Number(brut ?? 0);
  if (!Number.isFinite(n)) return "";
  return String(n).replace(".", ",");
}

function fraisGlobauxVersUi(fr: FraisApi[]): FraisUiLine[] {
  return faisGlobauxApi(fr).map((f) => ({
    sid: String(f.id),
    id: String(f.id),
    label: typeof f.label === "string" ? f.label : "",
    montantText: montantTextFrancais(f.montant),
  }));
}

function serialiserEtatFrais(rows: FraisUiLine[], suppressionIds: string[]): string {
  const rowsNorm = rows.filter((r) => {
    if (r.id) return true;
    return r.label.trim().length > 0 || montantNombreDepuisTxt(r.montantText) > 0;
  });
  return JSON.stringify({
    dels: [...suppressionIds].sort(),
    rows: [...rowsNorm]
      .map((r) => ({
        sid: r.sid,
        id: r.id ?? "",
        lb: r.label.trim(),
        m: montantNombreDepuisTxt(r.montantText),
      }))
      .sort((a, b) => a.sid.localeCompare(b.sid)),
  });
}

/** Applique la liste serveur ; ignore les ids encore en suppression locale. */
function fraisDepuisServeur(
  apiFrais: FraisApi[],
  pendingDeleteIds: string[],
): FraisUiLine[] {
  const pending = new Set(pendingDeleteIds);
  return fraisGlobauxVersUi(apiFrais).filter((r) => !r.id || !pending.has(r.id));
}

type DraftRow = {
  vendeur_id: string | null;
  marque_achete: boolean;
  qte_achat: number;
  puText: string;
  /** Total ligne (DH), saisi ou dérivé — hors snapshot autosave jusqu’à sync PU/qté. */
  totalText: string;
  product_packaging_id: string | null;
};

function montantLigneDh(L: LotLineApi, d: DraftRow | undefined): number {
  const totalNum = parsePuText(d?.totalText ?? "");
  if (totalNum != null) return totalNum;
  const pr = one(L.product);
  const pkgId = (d?.product_packaging_id ?? L.product_packaging_id) ?? null;
  const display = buildLotProductDisplayInfo(pr ?? null, pkgId);
  const qa = coerceQty(d?.qte_achat ?? L.qte_achat, 0);
  const puNum = parsePuText(d?.puText ?? "");
  const qtyBase = qtyBaseFromLotLine(qa, display);
  const m = montantLigneFromPu(puNum, qtyBase);
  return m === null ? 0 : m;
}

type LignePatch = {
  lotLigneId: string;
  vendeur_id?: string | null;
  marque_achete?: boolean;
  qte_achat?: number;
  prix_achat_unitaire?: number | null;
  product_packaging_id?: string | null;
};

function one<T>(raw: T | T[] | null | undefined): T | null {
  if (raw == null) return null;
  return (Array.isArray(raw) ? raw[0] : raw) as T;
}

function puToText(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "";
  const r = Math.round(n * 100) / 100;
  return String(r).replace(".", ",");
}

function montantToText(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "";
  const r = Math.round(n * 100) / 100;
  return String(r).replace(".", ",");
}

function parsePuText(txt: string): number | null {
  const trimmed = txt.trim().replace(",", ".");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function displayForDraftLine(L: LotLineApi, d: DraftRow): ProductDisplayInfo {
  const pr = one(L.product);
  const pkgId = (d.product_packaging_id ?? L.product_packaging_id) ?? null;
  return buildLotProductDisplayInfo(pr ?? null, pkgId);
}

/**
 * - saisie total (+ qté) → prix d’achat
 * - saisie prix d’achat (+ qté) → total
 * - changement qté : si prix d’achat présent (y compris les trois remplis) → total ;
 *   sinon si total présent → prix d’achat
 */
function syncPricingDraft(
  row: DraftRow,
  display: ProductDisplayInfo,
  changed: AchatPricingChanged,
): DraftRow {
  const qa = coerceQty(row.qte_achat, 0);
  if (qa <= 0) return row;
  const qtyBase = qtyBaseFromLotLine(qa, display);
  if (qtyBase <= 0) return row;

  const total = parsePuText(row.totalText);
  const pu = parsePuText(row.puText);

  if (changed === "total") {
    if (total == null) return row;
    return { ...row, puText: puToText(puFromMontantLigne(total, qtyBase)) };
  }

  if (changed === "pu") {
    if (pu == null) return row;
    return { ...row, totalText: montantToText(montantLigneFromPu(pu, qtyBase)) };
  }

  // changed === "qte"
  if (pu != null) {
    return { ...row, totalText: montantToText(montantLigneFromPu(pu, qtyBase)) };
  }
  if (total != null) {
    return { ...row, puText: puToText(puFromMontantLigne(total, qtyBase)) };
  }
  return row;
}

function supplierHeading(raw: LotApi["ref_supplier"]): string {
  if (raw == null) return "—";
  const o = one(raw as { label?: string; code?: string } | null);
  if (!o) return "—";
  const lb = typeof o.label === "string" ? o.label.trim() : "";
  const code = typeof o.code === "string" ? o.code.trim() : "";
  if (lb.length > 0) return lb;
  if (code.length > 0) return code;
  return "—";
}

function coerceQty(n: unknown, fallback = 0): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return clampQtyToApiRange(v);
}

function draftSnapshot(d: DraftRow): string {
  return JSON.stringify({
    vendeur_id: d.vendeur_id,
    marque_achete: d.marque_achete,
    qte_achat: d.qte_achat,
    puText: d.puText.trim().replace(",", "."),
    product_packaging_id: d.product_packaging_id,
  });
}

function computeDirtyPatches(
  lignesRows: LotLineApi[],
  draftByLine: Record<string, DraftRow>,
  baseline: Record<string, string>,
): LignePatch[] {
  const patches: LignePatch[] = [];
  for (const L of lignesRows) {
    const id = String(L.id);
    const d = draftByLine[id];
    if (!d) continue;
    if (draftSnapshot(d) === baseline[id]) continue;
    const pu = parsePuText(d.puText);
    patches.push({
      lotLigneId: id,
      vendeur_id: d.vendeur_id ?? null,
      marque_achete: d.marque_achete,
      qte_achat: d.qte_achat,
      prix_achat_unitaire: pu,
      product_packaging_id: d.product_packaging_id,
    });
  }
  return patches;
}

function sortLinesAchat(rows: LotLineApi[]): LotLineApi[] {
  return [...rows].sort((a, b) => {
    const pa = one(a.product);
    const pb = one(b.product);
    const ca: CategoryParsed = pa ? parseCategoryFromRef(pa.ref_category) : { label: "", sort_order: null };
    const cb: CategoryParsed = pb ? parseCategoryFromRef(pb.ref_category) : { label: "", sort_order: null };
    return compareByCategoryThenProductName(
      ca,
      cb,
      pa?.name ?? "",
      pb?.name ?? "",
      String(a.id),
      String(b.id),
    );
  });
}

function hasVendeurDraft(d: DraftRow | undefined): boolean {
  if (!d) return false;
  return d.vendeur_id != null && String(d.vendeur_id).length > 0;
}

/** Clé UI : fournisseur sans marchands (ex. Station) = vendeur unique. */
const SUPPLIER_SOLE_VENDEUR_KEY = "__supplier_sole__";

/** Retrait du vendeur : remise à zéro des saisies achat (qté, prix, marque). */
function draftAfterVendeurRemoved(): Partial<DraftRow> {
  return {
    vendeur_id: null,
    marque_achete: false,
    qte_achat: 0,
    puText: "",
    totalText: "",
  };
}

function productVendeurIdFromLine(L: LotLineApi): string | null {
  const pr = one(L.product);
  const vid = pr?.vendeur_id;
  return vid != null && String(vid).length > 0 ? String(vid) : null;
}

function effectiveVendeurId(L: LotLineApi): string | null {
  if (L.vendeur_id != null && String(L.vendeur_id).length > 0) {
    return String(L.vendeur_id);
  }
  return productVendeurIdFromLine(L);
}

function draftsFromLines(lignesRows: LotLineApi[]): {
  drafts: Record<string, DraftRow>;
  baseline: Record<string, string>;
} {
  const drafts: Record<string, DraftRow> = {};
  const baseline: Record<string, string> = {};

  for (const L of lignesRows) {
    const id = String(L.id);
    const qte = coerceQty(L.qte_achat, 0);
    const puText = puToText(L.prix_achat_unitaire ?? null);
    const pr = one(L.product);
    const display = buildLotProductDisplayInfo(pr ?? null, L.product_packaging_id ?? null);
    const qtyBase = qtyBaseFromLotLine(qte, display);
    const puNum = parsePuText(puText);
    const computed = qte > 0 ? montantLigneFromPu(puNum, qtyBase) : null;
    const stored =
      L.montant_ligne_achat != null && Number.isFinite(Number(L.montant_ligne_achat))
        ? Number(L.montant_ligne_achat)
        : null;
    const totalSource = stored != null ? stored : computed;
    const row: DraftRow = {
      vendeur_id: effectiveVendeurId(L),
      marque_achete: Boolean(L.marque_achete),
      qte_achat: qte,
      puText,
      totalText: totalSource != null && (qte > 0 || (stored != null && stored !== 0)) ? montantToText(totalSource) : "",
      product_packaging_id: L.product_packaging_id ?? null,
    };
    drafts[id] = row;
    baseline[id] = draftSnapshot(row);
  }

  return { drafts, baseline };
}

function productName(p: NestedProduct): string {
  const o = one(p);
  if (!o) return "—";
  return typeof o.name === "string" && o.name.length > 0 ? o.name : "—";
}

function ProductNameCell({ p }: { p: NestedProduct }) {
  const o = one(p);
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        variant="body2"
        className="!font-medium"
        sx={{ lineHeight: 1.25, wordBreak: "break-word", overflowWrap: "anywhere" }}
      >
        {productName(p)}
      </Typography>
      <ProductArabicSubtitle nameAr={o?.name_ar} matchNameLine />
    </Box>
  );
}

/** Libellé court UdV (aligné UX : Kg vs Unité pour le reste). */
function etiquetteUdvCourte(uniteVenteBrute: string): string {
  const t = uniteVenteBrute.trim().toLowerCase();
  if (
    t === "kg" ||
    t === "kilogramme" ||
    t === "kilogrammes" ||
    t.includes(" kg") ||
    t.endsWith("kg") ||
    t.startsWith("kg")
  ) {
    return "Kg";
  }
  return "UdV";
}

/** Ligne récap besoin (compact) : « Besoin : n », puis UdV/colissage ; « Soit … » résolument sous ces lignes pour rester lisible. */
function BesoinEtUdVCoteACote({
  display,
  qtePourSoit,
  needLabel,
  formattedNeed,
}: {
  display: ProductDisplayInfo;
  qtePourSoit: number;
  needLabel: string;
  formattedNeed: string;
}) {
  const soitLigneBesoin = qtePourSoit > 0 ? buildSoitLine(display, qtePourSoit) : null;

  return (
    <Box sx={{ width: "100%", textAlign: "left", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 0.35 }}>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ fontWeight: 500, lineHeight: 1.3 }}>
        {`${needLabel} : ${formattedNeed}`}
      </Typography>
      {display.isCond && display.condTitre ? (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ lineHeight: 1.3 }}>
          {display.condTitre}
        </Typography>
      ) : (
        <Typography variant="caption" color="text.secondary" component="div">
          {etiquetteUdvCourte(display.uniteVente)}
        </Typography>
      )}
      {display.isCond && display.condTitre && soitLigneBesoin ? (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ lineHeight: 1.3 }}>
          {soitLigneBesoin}
        </Typography>
      ) : null}
    </Box>
  );
}

/** Colonne UdV : unité courte seule ; si conditionnement, libellé colis (+ « Soit » conversion si showConversionSoit). */
function CelluleUdV({
  display,
  qtePourSoit,
  showConversionSoit = true,
}: {
  display: ProductDisplayInfo;
  /** Quantité « ligne » au même sens que buildSoitLine (colis ou UdV selon display). */
  qtePourSoit: number;
  /** Faux lorsque « Soit … » pour la qté achat est affiché sous le champ qté (écrans ≥ sm). */
  showConversionSoit?: boolean;
}) {
  const soitLigne = showConversionSoit && qtePourSoit > 0 ? buildSoitLine(display, qtePourSoit) : null;

  if (display.isCond && display.condTitre) {
    return (
      <div>
        <Typography variant="body2" color="text.secondary">
          {display.condTitre}
        </Typography>
        {soitLigne ? (
          <Typography variant="caption" color="text.secondary" component="div">
            {soitLigne}
          </Typography>
        ) : null}
      </div>
    );
  }

  return (
    <Typography variant="body2" color="text.secondary">
      {etiquetteUdvCourte(display.uniteVente)}
    </Typography>
  );
}

type ApiPayload = {
  lot: LotApi;
  lignes: LotLineApi[];
  frais: FraisApi[];
  vendeurs: VendeurApi[];
};

async function fetchLotPayload(lotId: string): Promise<
  { ok: true; data: ApiPayload } | { ok: false; error: string; status: number }
> {
  const res = await fetch(`/api/commandes-fournisseur/achat/lots/${encodeURIComponent(lotId)}`);
  const json = (await res.json()) as {
    lot?: LotApi;
    lignes?: LotLineApi[];
    frais?: FraisApi[];
    vendeurs?: VendeurApi[];
    error?: string;
  };

  if (!res.ok || !json.lot || !Array.isArray(json.lignes)) {
    return {
      ok: false,
      error: typeof json.error === "string" ? json.error : "LOT_NOT_FOUND",
      status: res.status,
    };
  }

  return {
    ok: true,
    data: {
      lot: json.lot,
      lignes: json.lignes,
      frais: json.frais ?? [],
      vendeurs: json.vendeurs ?? [],
    },
  };
}

const AUTOSAVE_MS = 500;

export default function AchatLotDetailClient({ lotId }: { lotId: string }) {
  const router = useRouter();
  const t = useTranslations("backoffice.commandes.achat.detail");
  const tCommonOrder = useTranslations("backoffice.commandes.common");
  const tErrors = useTranslations("backoffice.commandes.errors");
  const tCommon = useTranslations("common");
  const { labelFor } = useStatusLabels();
  const { formatDate, formatNumber, compareStrings } = useAppFormat();
  const BackChevron = useBackChevronIcon();
  const {
    loading: permLoading,
    can,
    canCommandesFournisseurVendeursRenommer,
  } = useSessionPermissions();

  const theme = useTheme();
  /** Petit écran : lignes besoin+UdV sous les champs qté/PU ; marges réduites */
  const compactTable = useMediaQuery(theme.breakpoints.down("sm"), { noSsr: true });

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lot, setLot] = useState<LotApi | null>(null);
  const [lignes, setLignes] = useState<LotLineApi[]>([]);
  const [fraisLines, setFraisLines] = useState<FraisUiLine[]>([]);
  const fraisLinesRef = useRef<FraisUiLine[]>(fraisLines);
  fraisLinesRef.current = fraisLines;
  const fraisBaselineSnap = useRef<string>("");
  const fraisDeletesPending = useRef<string[]>([]);
  const [vendeurs, setVendeurs] = useState<VendeurApi[]>([]);

  const [draftByLine, setDraftByLine] = useState<Record<string, DraftRow>>({});
  const lignesRef = useRef(lignes);
  lignesRef.current = lignes;
  const draftByLineRef = useRef(draftByLine);
  draftByLineRef.current = draftByLine;
  const baselineRef = useRef<Record<string, string>>({});

  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [confirmReopenOpen, setConfirmReopenOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const [vendeurDlg, setVendeurDlg] = useState<null | { mode: "create" } | { mode: "edit"; id: string }>(
    null,
  );
  const [vendeurDlgBusy, setVendeurDlgBusy] = useState(false);

  const [confirmZeroOpen, setConfirmZeroOpen] = useState(false);

  const [fraisDlg, setFraisDlg] = useState<null | {
    mode: "add" | "edit";
    sid?: string;
    initialLabel: string;
    initialMontantText: string;
  }>(null);
  const [fraisDlgBusy, setFraisDlgBusy] = useState(false);

  const [selectedSansVendeur, setSelectedSansVendeur] = useState<Set<string>>(() => new Set());
  const [bulkVendeurId, setBulkVendeurId] = useState("");

  const [pickerOpen, setPickerOpen] = useState(false);
  const [condDialogOpen, setCondDialogOpen] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<ProductPickRow | null>(null);
  const [productPickerBusy, setProductPickerBusy] = useState(false);

  const parcoursPending = pendingProduct ? parcoursShapeFromPickRow(pendingProduct) : null;
  const { panelProps: condPanelProps, packRoute } = useSingleProductParcoursQuantity(
    parcoursPending,
    condDialogOpen,
    lot?.supplier_id ?? null,
  );

  const editable = Boolean(lot && lot.status === "prete");
  const emDash = tCommon("emDash");
  const formatQty = useCallback(
    (value: number) =>
      formatNumber(value, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }),
    [formatNumber],
  );
  const formatDh = useCallback(
    (value: number) =>
      t("amountDh", {
        amount: formatNumber(value, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      }),
    [formatNumber, t],
  );
  const formatRial = useCallback(
    (value: number) =>
      t("amountRial", {
        amount: formatNumber(value, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      }),
    [formatNumber, t],
  );
  const formatSoitDh = useCallback(
    (amountDh: number) => t("soitDh", { amount: formatDh(amountDh) }),
    [formatDh, t],
  );

  const vendeurDlgInitial = useMemo((): AchatVendeurFormValues => {
    if (vendeurDlg?.mode === "edit") {
      const v = vendeurs.find((x) => x.id === vendeurDlg.id);
      return {
        label: v?.label ?? "",
        phone: typeof v?.phone === "string" ? v.phone : "",
        preferred_locale: v?.preferred_locale === "ar-MA" ? "ar-MA" : "fr",
        devise_achat: parseDeviseAchat(v?.devise_achat),
      };
    }
    return {
      label: "",
      phone: "",
      preferred_locale: "fr",
      devise_achat: "dirham",
    };
  }, [vendeurDlg, vendeurs]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSeq = useRef(0);
  /** Enfile les PATCH pour éviter les sauvegardes concurrentes (ex. lignes sans id après insert frais → doublons). */
  const persistTailRef = useRef(Promise.resolve(true));

  useEffect(() => {
    if (!permLoading && !can("commandes_fournisseur.achat")) {
      void router.replace("/access-refuse");
    }
  }, [permLoading, can, router]);

  const applyPayload = useCallback((payload: ApiPayload) => {
    const { drafts, baseline } = draftsFromLines(payload.lignes);
    baselineRef.current = baseline;
    setLot(payload.lot);
    setLignes(payload.lignes);
    const fl = fraisGlobauxVersUi(payload.frais ?? []);
    setFraisLines(fl);
    fraisDeletesPending.current = [];
    fraisBaselineSnap.current = serialiserEtatFrais(fl, []);
    setVendeurs(payload.vendeurs);
    setDraftByLine(drafts);
    setSelectedSansVendeur(new Set());
  }, []);

  const reloadFromServer = useCallback(async (): Promise<boolean> => {
    setErr(null);
    const fetched = await fetchLotPayload(lotId);
    if (!fetched.ok) {
      setErr(fetched.error === "LOT_NOT_FOUND" ? tErrors("lotNotFound") : fetched.error);
      setLot(null);
      setLignes([]);
      return false;
    }
    applyPayload(fetched.data);
    return true;
  }, [applyPayload, lotId, tErrors]);

  const postAchatLotProduct = useCallback(
    async (productId: string, productPackagingId: string | null) => {
      if (!editable) return;
      setErr(null);
      setProductPickerBusy(true);
      try {
        const res = await fetch(
          `/api/commandes-fournisseur/achat/lots/${encodeURIComponent(lotId)}/produits`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId, productPackagingId }),
          },
        );
        const j = (await res.json()) as { error?: string };
        if (!res.ok) {
          setErr(typeof j.error === "string" ? j.error : tErrors("generic"));
          return;
        }
        await reloadFromServer();
      } catch {
        setErr(tErrors("networkUnavailableDot"));
      } finally {
        setProductPickerBusy(false);
      }
    },
    [editable, lotId, reloadFromServer],
  );

  const handleProductChosenFromPicker = useCallback(
    (picked: ProductPickRow) => {
      if (!editable) return;
      const packs = packArray(parcoursShapeFromPickRow(picked).product_packaging);
      if (packs.length > 0) {
        setPendingProduct(picked);
        setCondDialogOpen(true);
        return;
      }
      void postAchatLotProduct(picked.id, null);
    },
    [editable, postAchatLotProduct],
  );

  const handleCondLotDialogConfirm = useCallback(() => {
    const p = pendingProduct;
    if (!p) {
      return;
    }
    const packagingId = packRoute === "unit" ? null : packRoute;
    setCondDialogOpen(false);
    setPendingProduct(null);
    void postAchatLotProduct(p.id, packagingId);
  }, [pendingProduct, packRoute, postAchatLotProduct]);

  const handleCondLotDialogClose = useCallback(() => {
    setCondDialogOpen(false);
    setPendingProduct(null);
  }, []);

  useEffect(() => {
    if (permLoading) return;
    if (!can("commandes_fournisseur.achat")) return;

    let cancelled = false;
    async function run() {
      setLoading(true);
      setErr(null);
      const fetched = await fetchLotPayload(lotId);
      if (cancelled) return;
      if (!fetched.ok) {
        setErr(fetched.error === "LOT_NOT_FOUND" ? tErrors("lotNotFound") : fetched.error);
        setLot(null);
        setLignes([]);
        setLoading(false);
        return;
      }
      applyPayload(fetched.data);
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [permLoading, can, lotId, applyPayload, tErrors]);

  /** Met à jour la baseline après sauvegarde sans recharger tout le lot. */
  function commitBaselineForPatches(patches: LignePatch[]) {
    const base = { ...baselineRef.current };
    const drafts = draftByLineRef.current;
    for (const p of patches) {
      const row = drafts[p.lotLigneId];
      if (!row) continue;
      base[p.lotLigneId] = draftSnapshot(row);
    }
    baselineRef.current = base;
  }

  const rechargerFraisDepuisApi = useCallback(async (): Promise<boolean> => {
    const res = await fetch(`/api/commandes-fournisseur/achat/lots/${encodeURIComponent(lotId)}`);
    const json = (await res.json()) as { frais?: FraisApi[]; error?: string };
    if (!res.ok) {
      setErr(typeof json.error === "string" ? json.error : tErrors("reloadFeesFailed"));
      return false;
    }
    const fr = json.frais ?? [];
    const fl = fraisDepuisServeur(fr, fraisDeletesPending.current);
    setFraisLines(fl);
    fraisLinesRef.current = fl;
    fraisBaselineSnap.current = serialiserEtatFrais(fl, fraisDeletesPending.current);
    return true;
  }, [lotId, tErrors]);

  const persistAll = useCallback(
    (opts?: { silent?: boolean; lignesOnly?: boolean }) => {
      const runOne = async (): Promise<boolean> => {
        const patches = computeDirtyPatches(
          lignesRef.current,
          draftByLineRef.current,
          baselineRef.current,
        );
        const delIds = [...fraisDeletesPending.current];
        const flNow = fraisLinesRef.current;
        const statutFrais = serialiserEtatFrais(flNow, delIds);

        const aFrais = statutFrais !== fraisBaselineSnap.current;
        const aLignes = patches.length > 0;
        const sendFrais = aFrais && !opts?.lignesOnly;

        if (!aLignes && !sendFrais) return true;

        const corps: Record<string, unknown> = {};
        if (aLignes) {
          corps.ligneUpdates = patches;
        }
        if (sendFrais) {
          if (delIds.length > 0) {
            corps.fraisDeleteIds = delIds;
          }

          const upserts: Array<{ id?: string; label: string; montant: number }> = [];
          for (const r of flNow) {
            const lbl = typeof r.label === "string" ? r.label.trim() : "";
            if (lbl.length === 0) continue;
            const montant = montantNombreDepuisTxt(r.montantText);
            const u: { id?: string; label: string; montant: number } = { label: lbl, montant };
            if (r.id !== undefined && r.id.length > 0) {
              u.id = r.id;
            }
            upserts.push(u);
          }
          if (upserts.length > 0) {
            corps.fraisUpserts = upserts;
          }
        }

        if (Object.keys(corps).length === 0) {
          if (sendFrais) {
            const sentDel = new Set(delIds);
            fraisDeletesPending.current = fraisDeletesPending.current.filter((id) => !sentDel.has(id));
            fraisBaselineSnap.current = serialiserEtatFrais(flNow, fraisDeletesPending.current);
          }
          return true;
        }

        const seq = ++saveSeq.current;
        setSaving(true);
        if (!opts?.silent) {
          setErr(null);
        }
        try {
          const res = await fetch(`/api/commandes-fournisseur/achat/lots/${encodeURIComponent(lotId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(corps),
          });
          const json = (await res.json()) as { error?: string; frais?: FraisApi[] };
          if (!res.ok) {
            setErr(typeof json.error === "string" ? json.error : tErrors("saveRegistrationFailed"));
            return false;
          }

          if (saveSeq.current !== seq) return true;

          if (aLignes) {
            commitBaselineForPatches(patches);
          }
          if (sendFrais) {
            const sentDel = new Set(delIds);
            fraisDeletesPending.current = fraisDeletesPending.current.filter((id) => !sentDel.has(id));
            if (Array.isArray(json.frais)) {
              const fl = fraisDepuisServeur(json.frais, fraisDeletesPending.current);
              setFraisLines(fl);
              fraisLinesRef.current = fl;
              fraisBaselineSnap.current = serialiserEtatFrais(fl, fraisDeletesPending.current);
            } else {
              const okFr = await rechargerFraisDepuisApi();
              if (!okFr) return false;
            }
          }
          if (!opts?.silent) {
            setInfo(t("savedSuccess"));
          }
          return true;
        } catch {
          setErr(tErrors("networkSaveFailed"));
          return false;
        } finally {
          if (saveSeq.current === seq) {
            setSaving(false);
          }
        }
      };

      const chained = persistTailRef.current.then(runOne).catch(() => false);
      persistTailRef.current = chained;
      return chained;
    },
    [lotId, rechargerFraisDepuisApi, t, tErrors],
  );

  /** Sauvegarde automatique des lignes produit (debounced, `lignesOnly`). */
  useEffect(() => {
    if (!editable || loading) return;

    const dirtyLignes = computeDirtyPatches(
      lignesRef.current,
      draftByLine,
      baselineRef.current,
    );
    if (dirtyLignes.length === 0) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void persistAll({ silent: true, lignesOnly: true });
    }, AUTOSAVE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [draftByLine, editable, loading, persistAll]);

  const changeDraft = useCallback((lineId: string, patch: Partial<DraftRow>) => {
    setDraftByLine((prev) => {
      const row = prev[lineId];
      if (!row) return prev;
      return {
        ...prev,
        [lineId]: {
          ...row,
          ...patch,
        },
      };
    });
  }, []);

  const applyPricingEdit = useCallback(
    (lineId: string, changed: AchatPricingChanged, patch: AchatPricingCommit) => {
      setDraftByLine((prev) => {
        const row = prev[lineId];
        if (!row) return prev;
        const L = lignesRef.current.find((x) => String(x.id) === lineId);
        const next: DraftRow = {
          ...row,
          ...(patch.qte_achat !== undefined ? { qte_achat: coerceQty(patch.qte_achat, 0) } : {}),
          ...(patch.puText !== undefined ? { puText: patch.puText } : {}),
          ...(patch.totalText !== undefined ? { totalText: patch.totalText } : {}),
        };
        if (!L) return { ...prev, [lineId]: next };
        const display = displayForDraftLine(L, next);
        return { ...prev, [lineId]: syncPricingDraft(next, display, changed) };
      });
    },
    [],
  );

  /** Fournisseur sans marchands (ex. Station) : saisie achat directe, sans attribution. */
  const supplierAsSoleVendor = vendeurs.length === 0;

  const lignesSansVendeurSorted = useMemo(() => {
    const rows = lignes.filter((L) => !hasVendeurDraft(draftByLine[String(L.id)]));
    return sortLinesAchat(rows);
  }, [draftByLine, lignes]);

  const vendeurIdsSorted = useMemo(() => {
    if (supplierAsSoleVendor) {
      return [SUPPLIER_SOLE_VENDEUR_KEY];
    }
    const ids = new Set<string>();
    for (const L of lignes) {
      const d = draftByLine[String(L.id)];
      if (hasVendeurDraft(d)) ids.add(String(d!.vendeur_id));
    }
    const list = [...ids];
    list.sort((a, b) => {
      const la = vendeurs.find((v) => v.id === a)?.label ?? a;
      const lb = vendeurs.find((v) => v.id === b)?.label ?? b;
      return compareStrings(la, lb);
    });
    return list;
  }, [compareStrings, draftByLine, lignes, supplierAsSoleVendor, vendeurs]);

  function lignesPourVendeur(vendeurKey: string): LotLineApi[] {
    if (vendeurKey === SUPPLIER_SOLE_VENDEUR_KEY) {
      return sortLinesAchat(lignes);
    }
    const rows = lignes.filter((L) => {
      const d = draftByLine[String(L.id)];
      return hasVendeurDraft(d) && String(d!.vendeur_id) === vendeurKey;
    });
    return sortLinesAchat(rows);
  }

  function toggleSelectSans(ligneId: string) {
    setSelectedSansVendeur((prev) => {
      const next = new Set(prev);
      if (next.has(ligneId)) next.delete(ligneId);
      else next.add(ligneId);
      return next;
    });
  }

  function attribuerVendeurSelection() {
    if (!bulkVendeurId) return;
    const vid = bulkVendeurId;
    setDraftByLine((prev) => {
      const next = { ...prev };
      for (const lid of selectedSansVendeur) {
        const row = next[lid];
        if (!row) continue;
        next[lid] = { ...row, vendeur_id: vid };
      }
      return next;
    });
    setSelectedSansVendeur(new Set());
  }

  const totauxAchat = useMemo(() => {
    let lignesSansVendeurDh = 0;
    const parVendeur: Record<string, number> = {};

    for (const L of lignes) {
      const d = draftByLine[String(L.id)];
      const m = montantLigneDh(L, d);
      if (!hasVendeurDraft(d)) {
        lignesSansVendeurDh += m;
      } else {
        const vk = String(d!.vendeur_id);
        parVendeur[vk] = (parVendeur[vk] ?? 0) + m;
      }
    }

    let totalFrais = 0;
    for (const r of fraisLines) {
      if (!r.label.trim()) continue;
      totalFrais += montantNombreDepuisTxt(r.montantText);
    }

    const totalProduits = Object.values(parVendeur).reduce((acc, x) => acc + x, 0) + lignesSansVendeurDh;

    return {
      parVendeur,
      lignesSansVendeurDh,
      totalProduits,
      totalFrais,
      cumul: totalProduits + totalFrais,
    };
  }, [draftByLine, lignes, fraisLines]);

  function openAddFraisDlg() {
    if (!editable || fraisDlgBusy) return;
    setFraisDlg({ mode: "add", initialLabel: "", initialMontantText: "" });
  }

  function openEditFraisDlg(sid: string) {
    if (!editable || fraisDlgBusy) return;
    const row = fraisLinesRef.current.find((r) => r.sid === sid);
    if (!row) return;
    setFraisDlg({
      mode: "edit",
      sid,
      initialLabel: row.label,
      initialMontantText: row.montantText,
    });
  }

  function closeFraisDlg() {
    if (fraisDlgBusy) return;
    setFraisDlg(null);
  }

  async function saveFraisDlg(payload: { label: string; montantText: string }) {
    if (!fraisDlg || !editable || fraisDlgBusy) return;
    const label = payload.label.trim();
    if (label.length === 0) return;
    setFraisDlgBusy(true);
    setErr(null);
    try {
      let next: FraisUiLine[];
      if (fraisDlg.mode === "add") {
        const sid =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        next = [...fraisLinesRef.current, { sid, label, montantText: payload.montantText }];
      } else {
        const editSid = fraisDlg.sid;
        if (!editSid) return;
        next = fraisLinesRef.current.map((r) =>
          r.sid === editSid ? { ...r, label, montantText: payload.montantText } : r,
        );
      }
      fraisLinesRef.current = next;
      setFraisLines(next);
      const ok = await persistAll({ silent: true });
      if (!ok) return;
      setFraisDlg(null);
      setInfo(t("savedSuccess"));
    } finally {
      setFraisDlgBusy(false);
    }
  }

  function supprimerLigneFraisGlobaux(sid: string) {
    setFraisLines((prev) => {
      const hit = prev.find((r) => r.sid === sid);
      if (hit?.id) {
        const idRm = hit.id;
        fraisDeletesPending.current = [...new Set([...fraisDeletesPending.current, idRm])];
      }
      const next = prev.filter((r) => r.sid !== sid);
      fraisLinesRef.current = next;
      return next;
    });
    void persistAll({ silent: true });
  }

  async function cloturer(forceConfirmZeros: boolean): Promise<boolean> {
    setClosing(true);
    setErr(null);
    try {
      const okFlush = await persistAll({ silent: true });
      if (!okFlush) return false;

      let patches = computeDirtyPatches(lignes, draftByLine, baselineRef.current);

      const body: Record<string, unknown> = { status: "terminee" as const };
      if (patches.length > 0) {
        body.ligneUpdates = patches;
      }
      if (forceConfirmZeros) {
        body.confirmZeroQtyLines = true;
      }

      const res = await fetch(`/api/commandes-fournisseur/achat/lots/${encodeURIComponent(lotId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        code?: string;
      };

      if (res.ok) {
        setInfo(t("lotClosedSuccess"));
        setConfirmZeroOpen(false);
        await reloadFromServer();
        return true;
      }

      if (res.status === 409 && json.code === "NEED_CONFIRM_ZERO_QTY") {
        setConfirmZeroOpen(true);
        return false;
      }

      setErr(typeof json.error === "string" ? json.error : tErrors("closeFailed"));
      setConfirmZeroOpen(false);
      return false;
    } catch {
      setErr(tErrors("networkCloseFailed"));
      return false;
    } finally {
      setClosing(false);
    }
  }

  async function rouvrirLot(): Promise<void> {
    setReopening(true);
    setErr(null);
    try {
      const res = await fetch(`/api/commandes-fournisseur/achat/lots/${encodeURIComponent(lotId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "prete" as const }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : tErrors("reopenFailed"));
        return;
      }
      setConfirmReopenOpen(false);
      setInfo(t("lotReopenedSuccess"));
      await reloadFromServer();
    } catch {
      setErr(tErrors("networkReopenFailed"));
    } finally {
      setReopening(false);
    }
  }

  async function imprimerRapportPdf(): Promise<void> {
    setPdfBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/commandes-fournisseur/achat/lots/${encodeURIComponent(lotId)}/pdf`,
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => undefined)) as { error?: string } | undefined;
        setErr(typeof json?.error === "string" ? json.error : tErrors("pdfFailed"));
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/i.exec(cd);
      const filename =
        match?.[1] && match[1].trim().length > 0
          ? match[1].trim()
          : `rapport-achat-${lotId.slice(0, 8)}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setErr(tErrors("networkPdfFailed"));
    } finally {
      setPdfBusy(false);
    }
  }

  function normalizeVendeurApi(raw: Record<string, unknown>, fallbackLabel: string): VendeurApi | null {
    const id = raw.id;
    if (typeof id !== "string" || id.length === 0) return null;
    return {
      id,
      label: typeof raw.label === "string" ? raw.label : fallbackLabel,
      phone: typeof raw.phone === "string" ? raw.phone : null,
      preferred_locale: raw.preferred_locale === "ar-MA" ? "ar-MA" : "fr",
      devise_achat: parseDeviseAchat(raw.devise_achat),
    };
  }

  async function saveVendeurDlg(values: AchatVendeurFormValues): Promise<void> {
    if (!lot?.supplier_id || vendeurDlg == null) return;
    setVendeurDlgBusy(true);
    setErr(null);
    try {
      const body = {
        label: values.label,
        phone: values.phone,
        preferred_locale: values.preferred_locale,
        devise_achat: values.devise_achat,
      };

      if (vendeurDlg.mode === "create") {
        const res = await fetch(
          `/api/commandes-fournisseur/achat/suppliers/${encodeURIComponent(lot.supplier_id)}/vendeurs`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        const json = ((await res.json().catch(() => undefined)) ?? undefined) as
          | Record<string, unknown>
          | undefined;
        if (!res.ok) {
          setErr(typeof json?.error === "string" ? json.error : tErrors("createVendorFailed"));
          return;
        }
        if (!json) {
          setErr(tErrors("invalidVendorResponse"));
          return;
        }
        const created = normalizeVendeurApi(json, values.label);
        if (!created) {
          setErr(tErrors("invalidVendorResponse"));
          return;
        }
        setVendeurs((prev) =>
          [...prev, created].sort((a, b) => compareStrings(a.label, b.label)),
        );
        setVendeurDlg(null);
        return;
      }

      const res = await fetch(
        `/api/commandes-fournisseur/achat/suppliers/${encodeURIComponent(lot.supplier_id)}/vendeurs/${encodeURIComponent(vendeurDlg.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const json = ((await res.json().catch(() => undefined)) ?? undefined) as
        | Record<string, unknown>
        | undefined;
      if (!res.ok) {
        setErr(typeof json?.error === "string" ? json.error : tErrors("updateVendorFailed"));
        return;
      }
      if (!json) {
        setErr(tErrors("invalidVendorResponse"));
        return;
      }
      const updated = normalizeVendeurApi(json, values.label);
      if (!updated) {
        setErr(tErrors("invalidVendorResponse"));
        return;
      }
      setVendeurs((prev) =>
        prev
          .map((x) => (x.id === vendeurDlg.id ? updated : x))
          .sort((a, b) => compareStrings(a.label, b.label)),
      );
      setVendeurDlg(null);
    } catch {
      setErr(tErrors("networkUnavailableDot"));
    } finally {
      setVendeurDlgBusy(false);
    }
  }

  if (permLoading) {
    return <p className="px-4 py-6">{tCommon("loading")}</p>;
  }

  if (!can("commandes_fournisseur.achat")) {
    return null;
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-2 py-4 sm:px-4 sm:py-6">
      <Button
        component={AppLink}
        href="/commandes-fournisseur/achat"
        color="inherit"
        size="small"
        startIcon={<BackChevron fontSize="small" />}
        sx={{
          textTransform: "none",
          mb: 1,
          alignSelf: "flex-start",
          pl: 0,
          minHeight: 36,
          fontWeight: 500,
        }}
      >
        {t("backToLots")}
      </Button>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-600">
          <CircularProgress size={22} /> {tCommonOrder("loading")}
        </div>
      ) : null}

      {err ? (
        <Alert severity="error" className="!mb-3">
          {err}
        </Alert>
      ) : null}
      {info ? (
        <Alert severity="success" className="!mb-3" onClose={() => setInfo(null)}>
          {info}
        </Alert>
      ) : null}

      {editable && saving ? (
        <Typography variant="caption" color="text.secondary" className="!mb-2 inline-block">
          {t("saving")}
        </Typography>
      ) : null}

      {lot ? (
        <>
          <Typography variant="h5" className="!mb-2" sx={{ fontWeight: 600 }}>
            {supplierHeading(lot.ref_supplier)}
          </Typography>
          <Typography variant="body2" color="text.secondary" className="!mb-2">
            {t("statusLine", {
              status: labelFor("commande_fournisseur_lot", lot.status),
              readyDate: lot.marque_prete_at ? formatDate(lot.marque_prete_at) : emDash,
              closedDate: lot.marque_terminee_at ? formatDate(lot.marque_terminee_at) : emDash,
            })}
          </Typography>
          {!editable ? (
            <Alert severity="info" className="!mb-3">
              {t("readOnlyNotice")}
            </Alert>
          ) : null}

          <Box className="!mb-3 flex flex-wrap items-center gap-2">
            {editable ? (
              <Button
                variant="outlined"
                size="small"
                disabled={closing || saving || reopening || pdfBusy}
                onClick={() => void cloturer(false)}
                sx={{ textTransform: "none" }}
              >
                {closing ? t("closing") : t("close")}
              </Button>
            ) : null}
            {lot.status === "terminee" ? (
              <Button
                variant="outlined"
                size="small"
                color="primary"
                startIcon={<EditOutlinedIcon fontSize="small" />}
                disabled={reopening || closing || pdfBusy}
                onClick={() => setConfirmReopenOpen(true)}
                sx={{ textTransform: "none" }}
              >
                {reopening ? t("reopening") : t("edit")}
              </Button>
            ) : null}
            <Button
              variant="contained"
              size="small"
              color="primary"
              startIcon={
                pdfBusy ? (
                  <CircularProgress size={14} color="inherit" />
                ) : (
                  <PictureAsPdfOutlinedIcon fontSize="small" />
                )
              }
              disabled={pdfBusy || closing || reopening}
              onClick={() => void imprimerRapportPdf()}
              sx={{ textTransform: "none" }}
            >
              {pdfBusy ? t("printingPdf") : t("printPdf")}
            </Button>
          </Box>

          {!supplierAsSoleVendor ? (
            <>
              <Box className="!mb-2 flex flex-row flex-wrap items-center justify-between gap-2">
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 0 }}>
                  {t("productsWithoutVendor")}
                </Typography>
                {editable ? (
                  <Button
                    type="button"
                    variant="outlined"
                    size="small"
                    disabled={saving || closing || productPickerBusy}
                    onClick={() => setPickerOpen(true)}
                    sx={{ textTransform: "none" }}
                  >
                    {tCommonOrder("addProduct")}
                  </Button>
                ) : null}
              </Box>

              <div className="mb-6 min-w-0 w-full">
                <Table
                  size="small"
                  sx={{
                    width: "100%",
                    minWidth: 0,
                    tableLayout: "fixed",
                  }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell
                        padding="checkbox"
                        sx={{ width: "8%", py: { xs: 0.75, sm: 1 }, px: { xs: 0.5, sm: 1 }, minWidth: 40, maxWidth: 48 }}
                      >
                        <Checkbox
                          size="small"
                          disabled={!editable || lignesSansVendeurSorted.length === 0}
                          checked={
                            lignesSansVendeurSorted.length > 0 &&
                            lignesSansVendeurSorted.every((L) => selectedSansVendeur.has(String(L.id)))
                          }
                          indeterminate={
                            lignesSansVendeurSorted.some((L) => selectedSansVendeur.has(String(L.id))) &&
                            !lignesSansVendeurSorted.every((L) => selectedSansVendeur.has(String(L.id)))
                          }
                          onChange={() => {
                            const allIds = lignesSansVendeurSorted.map((L) => String(L.id));
                            const allOn = allIds.length > 0 && allIds.every((id) => selectedSansVendeur.has(id));
                            setSelectedSansVendeur(allOn ? new Set() : new Set(allIds));
                          }}
                        />
                      </TableCell>
                      <TableCell
                        sx={{
                          py: { xs: 0.75, sm: 1 },
                          fontSize: { xs: "0.8rem", sm: "inherit" },
                          width: "56%",
                          minWidth: 0,
                          overflow: "hidden",
                        }}
                      >
                        {tCommonOrder("product")}
                      </TableCell>
                      <TableCell align="center" sx={{ py: { xs: 0.75, sm: 1 }, whiteSpace: "nowrap", width: "18%" }}>
                        {tCommonOrder("quantityShort")}
                      </TableCell>
                      <TableCell align="center" sx={{ py: { xs: 0.75, sm: 1 }, whiteSpace: "nowrap", width: "18%" }}>
                        {t("columnUdc")}
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {lignesSansVendeurSorted.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4}>
                          <Typography variant="body2" color="text.secondary">
                            {t("allProductsHaveVendor")}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      lignesSansVendeurSorted.map((L, i) => {
                        const lid = String(L.id);
                        const pr = one(L.product);
                        const dRow = draftByLine[lid];
                        const pkgId = (dRow?.product_packaging_id ?? L.product_packaging_id) ?? null;
                        const display = buildLotProductDisplayInfo(pr ?? null, pkgId);
                        const besoinN = coerceQty(L.qte_besoin_fige ?? null, 0);

                        const pa = pr ? parseCategoryFromRef(pr.ref_category) : { label: "", sort_order: null };
                        const catKey = categoryDisplayLabel(pa);
                        const prev = i > 0 ? lignesSansVendeurSorted[i - 1] : null;
                        const pp = prev ? one(prev.product) : null;
                        const prevCat =
                          prev &&
                          categoryDisplayLabel(
                            pp ? parseCategoryFromRef(pp.ref_category) : { label: "", sort_order: null },
                          );
                        const showCat = i === 0 || catKey !== prevCat;

                        return (
                          <Fragment key={lid}>
                            {showCat ? (
                              <TableRow>
                                <TableCell
                                  colSpan={4}
                                  sx={{
                                    py: 0.85,
                                    px: 1.25,
                                    bgcolor: (t) =>
                                      t.palette.mode === "dark"
                                        ? alpha(t.palette.success.main, 0.18)
                                        : alpha(t.palette.success.main, 0.1),
                                  }}
                                >
                                  <Typography
                                    variant="subtitle2"
                                    color="success"
                                    sx={{ fontWeight: 700, letterSpacing: "0.02em" }}
                                  >
                                    {catKey}
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            ) : null}
                            <TableRow>
                              <TableCell
                                padding="checkbox"
                                sx={{ py: { xs: 0.5, sm: 1 }, px: { xs: 0.5, sm: 1 } }}
                              >
                                <Checkbox
                                  size="small"
                                  disabled={!editable}
                                  checked={selectedSansVendeur.has(lid)}
                                  onChange={() => toggleSelectSans(lid)}
                                />
                              </TableCell>
                              <TableCell sx={{ py: { xs: 0.5, sm: 1 }, minWidth: 0, overflow: "hidden" }}>
                                <ProductNameCell p={pr} />
                              </TableCell>
                              <TableCell align="center" sx={{ py: { xs: 0.5, sm: 1 }, verticalAlign: "top" }}>
                                <Typography variant="body2" component="div" sx={{ fontWeight: 500 }}>
                                  {formatQty(besoinN)}
                                </Typography>
                              </TableCell>
                              <TableCell align="center" sx={{ py: { xs: 0.5, sm: 1 }, verticalAlign: "top" }}>
                                <CelluleUdV display={display} qtePourSoit={besoinN} />
                              </TableCell>
                            </TableRow>
                          </Fragment>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {editable && lignesSansVendeurSorted.length > 0 ? (
                <Box
                  className="!mb-8"
                  sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "flex-end",
                    justifyContent: "space-between",
                    gap: 2,
                  }}
                >
                  <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 2, flex: "1 1 auto" }}>
                    <Select
                      size="small"
                      displayEmpty
                      value={bulkVendeurId}
                      onChange={(e) => setBulkVendeurId(String(e.target.value))}
                      sx={{
                        width: "100%",
                        minWidth: { xs: "100%", sm: 220 },
                        maxWidth: { sm: "min(440px, 100%)" },
                      }}
                    >
                      <MenuItem value="">
                        <em>{t("chooseVendor")}</em>
                      </MenuItem>
                      {vendeurs.map((v) => (
                        <MenuItem key={v.id} value={v.id}>
                          {v.label}
                        </MenuItem>
                      ))}
                    </Select>
                    <Button
                      variant="contained"
                      size="small"
                      disabled={
                        bulkVendeurId.length === 0 || selectedSansVendeur.size === 0 || saving || closing
                      }
                      onClick={() => attribuerVendeurSelection()}
                      sx={{ textTransform: "none" }}
                    >
                      {t("assignVendorToSelection", { count: selectedSansVendeur.size })}
                    </Button>
                  </Box>
                  <Button
                    variant="text"
                    size="small"
                    disabled={!editable}
                    onClick={() => setVendeurDlg({ mode: "create" })}
                    sx={{ textTransform: "none", alignSelf: "center" }}
                  >
                    {t("newVendor")}
                  </Button>
                </Box>
              ) : editable ? (
                <Box className="!mb-6 flex justify-end">
                  <Button
                    variant="text"
                    size="small"
                    disabled={!editable}
                    onClick={() => setVendeurDlg({ mode: "create" })}
                    sx={{ textTransform: "none" }}
                  >
                    {t("newVendor")}
                  </Button>
                </Box>
              ) : null}
            </>
          ) : null}

          {vendeurIdsSorted.map((vid) => {
            const isSoleSupplierVendor = vid === SUPPLIER_SOLE_VENDEUR_KEY;
            const vLabel = isSoleSupplierVendor
              ? supplierHeading(lot.ref_supplier)
              : (vendeurs.find((v) => v.id === vid)?.label ?? vid);
            const rows = lignesPourVendeur(vid);
            const vendorTotalDh = isSoleSupplierVendor
              ? totauxAchat.lignesSansVendeurDh
              : (totauxAchat.parVendeur[vid] ?? 0);
            const vendorDevise: DeviseAchat = isSoleSupplierVendor
              ? "dirham"
              : parseDeviseAchat(vendeurs.find((v) => v.id === vid)?.devise_achat);
            const colCount = isSoleSupplierVendor ? 7 : 8;
            return (
              <Fragment key={vid}>
                <Box
                  className={isSoleSupplierVendor ? "!mb-0" : "!mt-4 !mb-0"}
                  sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 1,
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, m: 0 }}>
                      {vLabel}
                    </Typography>
                    {editable &&
                    !isSoleSupplierVendor &&
                    canCommandesFournisseurVendeursRenommer &&
                    !vendeurDlgBusy ? (
                      <IconButton
                        aria-label={t("editVendorAria", { label: vLabel })}
                        size="small"
                        onClick={() => setVendeurDlg({ mode: "edit", id: vid })}
                      >
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                    ) : null}
                  </Box>
                  {isSoleSupplierVendor && editable ? (
                    <Button
                      type="button"
                      variant="outlined"
                      size="small"
                      disabled={saving || closing || productPickerBusy}
                      onClick={() => setPickerOpen(true)}
                      sx={{ textTransform: "none" }}
                    >
                      {tCommonOrder("addProduct")}
                    </Button>
                  ) : null}
                </Box>
                {vendorDevise === "rial" ? (
                  <Box className="!mb-2">
                    <Typography variant="body2" color="text.secondary">
                      {t("vendorTotal", { amount: formatRial(dhToRial(vendorTotalDh)) })}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                      {formatSoitDh(vendorTotalDh)}
                    </Typography>
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary" className="!mb-2">
                    {t("vendorTotal", { amount: formatDh(vendorTotalDh) })}
                  </Typography>
                )}
                <div className="mb-6 min-w-0 w-full">
                  <Table
                    size="small"
                    sx={{
                      width: "100%",
                      minWidth: 0,
                      tableLayout: "fixed",
                      "& td, & th": {
                        px: { xs: 0.55, sm: 1 },
                        py: { xs: 0.45, sm: 0.65 },
                      },
                    }}
                  >
                    <TableHead>
                      <TableRow>
                        <TableCell
                          sx={{
                            width: { xs: "36%", sm: "28%" },
                            minWidth: 0,
                            overflow: "hidden",
                          }}
                        >
                          {tCommonOrder("product")}
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            display: { xs: "none", sm: "table-cell" },
                            whiteSpace: "nowrap",
                            width: { sm: "9%" },
                          }}
                        >
                          {tCommonOrder("quantityNeed")}
                        </TableCell>
                        <TableCell
                          sx={{
                            display: { xs: "none", sm: "table-cell" },
                            width: { sm: "10%" },
                            overflow: "hidden",
                          }}
                        >
                          {t("columnUdc")}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap", width: { xs: "16%", sm: "11%" } }}>
                          {t("quantityPurchased")}
                        </TableCell>
                        <TableCell
                          align="center"
                          sx={{ whiteSpace: "nowrap", width: { xs: "10%", sm: "8%" } }}
                        >
                          {t("columnUda")}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap", width: { xs: "18%", sm: "12%" } }}>
                          {t("purchasePrice")}
                        </TableCell>
                        <TableCell align="center" sx={{ whiteSpace: "nowrap", width: { xs: "13%", sm: "14%" } }}>
                          {tCommonOrder("total")}
                        </TableCell>
                        {!isSoleSupplierVendor ? (
                          <TableCell
                            align="center"
                            sx={{
                              whiteSpace: "nowrap",
                              px: { xs: 0.35, sm: 1 },
                              width: { xs: "13%", sm: "13%" },
                            }}
                          >
                            {tCommonOrder("remove")}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={colCount}>
                            <Typography variant="body2" color="text.secondary">
                              {tCommonOrder("noLines")}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        rows.map((L, i) => {
                          const lid = String(L.id);
                          const pr = one(L.product);
                          const dRow = draftByLine[lid];

                          const pkgId = (dRow?.product_packaging_id ?? L.product_packaging_id) ?? null;
                          const display = buildLotProductDisplayInfo(pr ?? null, pkgId);
                          const qa = coerceQty(dRow?.qte_achat ?? L.qte_achat, 0);

                          const pa = pr ? parseCategoryFromRef(pr.ref_category) : { label: "", sort_order: null };
                          const catKey = categoryDisplayLabel(pa);
                          const prev = rows[i - 1];
                          const pb = prev ? one(prev.product) : null;
                          const prevCat =
                            prev &&
                            categoryDisplayLabel(
                              pb ? parseCategoryFromRef(pb.ref_category) : { label: "", sort_order: null },
                            );
                          const showCat = i === 0 || catKey !== prevCat;

                          const besoinN = coerceQty(L.qte_besoin_fige ?? null, 0);

                          return (
                            <Fragment key={lid}>
                              {showCat ? (
                                <TableRow>
                                  <TableCell
                                    colSpan={colCount}
                                    sx={{
                                      py: 0.85,
                                      px: 1.25,
                                      bgcolor: (t) =>
                                        t.palette.mode === "dark"
                                          ? alpha(t.palette.success.main, 0.18)
                                          : alpha(t.palette.success.main, 0.1),
                                    }}
                                  >
                                    <Typography
                                      variant="subtitle2"
                                      color="success"
                                      sx={{ fontWeight: 700, letterSpacing: "0.02em" }}
                                    >
                                      {catKey}
                                    </Typography>
                                  </TableCell>
                                </TableRow>
                              ) : null}
                              <TableRow
                                sx={
                                  compactTable
                                    ? {
                                        "& > .MuiTableCell-root": { borderBottom: "none" },
                                      }
                                    : undefined
                                }
                              >
                                <TableCell
                                  sx={{
                                    verticalAlign: "middle",
                                    textAlign: "left",
                                    minWidth: 0,
                                    overflow: "hidden",
                                  }}
                                >
                                  <ProductNameCell p={pr} />
                                </TableCell>
                                <TableCell
                                  align="right"
                                  sx={{
                                    display: { xs: "none", sm: "table-cell" },
                                    verticalAlign: "top",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {formatQty(besoinN)}
                                </TableCell>
                                <TableCell
                                  sx={{
                                    display: { xs: "none", sm: "table-cell" },
                                    verticalAlign: "top",
                                  }}
                                >
                                  <CelluleUdV
                                    display={display}
                                    qtePourSoit={qa}
                                    showConversionSoit={compactTable}
                                  />
                                </TableCell>
                                <AchatLignePricingFields
                                  lineId={lid}
                                  qte={qa}
                                  puText={dRow?.puText ?? ""}
                                  totalText={dRow?.totalText ?? ""}
                                  editable={editable}
                                  udaLabel={labelFromRef(pr?.ref_purchase_unit)}
                                  qtyAria={tCommonOrder("quantityPurchaseAria")}
                                  pricePlaceholder={tCommonOrder("price")}
                                  totalPlaceholder={tCommonOrder("pricePlaceholder")}
                                  totalAria={tCommonOrder("total")}
                                  deviseAchat={vendorDevise}
                                  formatSoitDh={formatSoitDh}
                                  onCommit={applyPricingEdit}
                                />
                                {!isSoleSupplierVendor ? (
                                  <TableCell align="center" sx={{ whiteSpace: "nowrap", verticalAlign: "middle" }}>
                                    <Button
                                      type="button"
                                      size="small"
                                      variant="text"
                                      color="error"
                                      disabled={!editable || saving || closing}
                                      onClick={() => changeDraft(lid, draftAfterVendeurRemoved())}
                                      sx={{
                                        textTransform: "none",
                                        minWidth: 0,
                                        px: { xs: 0.35, sm: 1 },
                                        fontSize: { xs: "0.72rem", sm: "inherit" },
                                      }}
                                    >
                                      {tCommonOrder("remove")}
                                    </Button>
                                  </TableCell>
                                ) : null}
                              </TableRow>
                              {compactTable ? (
                                <TableRow>
                                  <TableCell
                                    colSpan={colCount}
                                    sx={{
                                      py: 0.5,
                                      pt: 0.25,
                                      borderTop: 0,
                                    }}
                                  >
                                    <BesoinEtUdVCoteACote
                                      display={display}
                                      qtePourSoit={besoinN}
                                      needLabel={tCommonOrder("quantityNeed")}
                                      formattedNeed={formatQty(besoinN)}
                                    />
                                  </TableCell>
                                </TableRow>
                              ) : null}
                            </Fragment>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Fragment>
            );
          })}

          <Typography variant="h6" className="!mt-6 !mb-2" sx={{ fontWeight: 700 }}>
            {t("feesSection")}
          </Typography>
          <Typography variant="body2" color="text.secondary" className="!mb-2">
            {editable ? t("feesHintEditable") : t("feesHintReadOnly")}
          </Typography>
          <div className="!mb-2 overflow-x-auto">
            <Table
              size="small"
              sx={{
                width: "100%",
                maxWidth: 720,
                tableLayout: { xs: "fixed", sm: "auto" },
                "& td": { py: { xs: 0.5, sm: 1 } },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: { xs: "50%", sm: "auto" } }}>{tCommonOrder("label")}</TableCell>
                  <TableCell align="right" sx={{ width: { xs: "28%", sm: "auto" } }}>
                    {tCommonOrder("amount")}
                  </TableCell>
                  {editable ? (
                    <TableCell align="right" sx={{ width: { xs: "22%", sm: "auto" }, whiteSpace: "nowrap" }}>
                      {""}
                    </TableCell>
                  ) : null}
                </TableRow>
              </TableHead>
              <TableBody>
                {fraisLines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={editable ? 3 : 2}>
                      <Typography variant="body2" color="text.secondary">
                        {t("noFees")}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  fraisLines.map((lf) => {
                    const montantN = montantNombreDepuisTxt(lf.montantText);
                    const labelAffiche = lf.label.trim().length > 0 ? lf.label.trim() : emDash;
                    return (
                      <TableRow key={lf.sid}>
                        <TableCell>
                          <Typography variant="body2">{labelAffiche}</Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                          <Typography variant="body2">{formatDh(montantN)}</Typography>
                        </TableCell>
                        {editable ? (
                          <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                            <IconButton
                              aria-label={t("editFeeLineAria", { label: labelAffiche })}
                              size="small"
                              disabled={fraisDlgBusy || saving || closing}
                              onClick={() => openEditFraisDlg(lf.sid)}
                            >
                              <EditOutlinedIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              aria-label={tCommonOrder("removeFeeLineAria")}
                              size="small"
                              disabled={fraisDlgBusy || saving || closing}
                              onClick={() => supprimerLigneFraisGlobaux(lf.sid)}
                              color="error"
                            >
                              <DeleteOutlineOutlinedIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            {editable ? (
              <Button
                type="button"
                size="small"
                variant="outlined"
                className="!mt-2"
                disabled={fraisDlgBusy || saving || closing}
                onClick={openAddFraisDlg}
                sx={{ textTransform: "none" }}
              >
                {t("addFeeLine")}
              </Button>
            ) : null}
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }} className="!mt-3">
              {t("totalFees", { amount: formatDh(totauxAchat.totalFrais) })}
            </Typography>
          </div>

          <Typography variant="h6" className="!mt-8 !mb-2" sx={{ fontWeight: 700 }}>
            {t("summarySection")}
          </Typography>
          <Box
            className="!mb-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700 sm:p-4"
            sx={{ maxWidth: 520 }}
          >
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                columnGap: 2,
                rowGap: 1,
                alignItems: "baseline",
              }}
            >
              {totauxAchat.lignesSansVendeurDh > 0 ? (
                <>
                  <Typography variant="body2" component="span">
                    {vendeurs.length === 0
                      ? t("summarySupplierLines", { supplier: supplierHeading(lot.ref_supplier) })
                      : t("summaryNoVendorLines")}
                    &nbsp;:
                  </Typography>
                  <Typography
                    variant="body2"
                    component="span"
                    sx={{ fontVariantNumeric: "tabular-nums", textAlign: "right", minWidth: "6.75rem" }}
                  >
                    {formatDh(totauxAchat.lignesSansVendeurDh)}
                  </Typography>
                </>
              ) : null}
              {vendeurIdsSorted.flatMap((vid2) => {
                const lbl = vendeurs.find((v) => v.id === vid2)?.label ?? vid2;
                const tv = totauxAchat.parVendeur[vid2] ?? 0;
                if (tv <= 0) return [];
                return [
                  <Typography key={`syn-l-${vid2}`} variant="body2" component="span">
                    {lbl}&nbsp;:
                  </Typography>,
                  <Typography
                    key={`syn-m-${vid2}`}
                    variant="body2"
                    component="span"
                    sx={{ fontVariantNumeric: "tabular-nums", textAlign: "right", minWidth: "6.75rem" }}
                  >
                    {formatDh(tv)}
                  </Typography>,
                ];
              })}
              <Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>
                {t("summaryTotalProducts")}
              </Typography>
              <Typography
                variant="body2"
                component="span"
                sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", textAlign: "right", minWidth: "6.75rem" }}
              >
                {formatDh(totauxAchat.totalProduits)}
              </Typography>
              <Typography variant="body2" component="span">
                {t("summaryFees")}
              </Typography>
              <Typography
                variant="body2"
                component="span"
                sx={{ fontVariantNumeric: "tabular-nums", textAlign: "right", minWidth: "6.75rem" }}
              >
                {formatDh(totauxAchat.totalFrais)}
              </Typography>
            </Box>
            <Box
              sx={(t) => ({
                mt: 2,
                py: 2,
                px: { xs: 2, sm: 2.5 },
                borderWidth: 2,
                borderStyle: "solid",
                borderRadius: 2,
                borderColor:
                  t.palette.mode === "dark" ? alpha(t.palette.common.white, 0.12) : alpha(t.palette.primary.main, 0.35),
                bgcolor:
                  t.palette.mode === "dark" ? alpha(t.palette.primary.main, 0.08) : alpha(t.palette.primary.main, 0.04),
              })}
            >
              <Typography variant="h5" sx={{ fontWeight: 900, letterSpacing: "0.01em" }}>
                {t("summaryGrandTotal", { amount: formatDh(totauxAchat.cumul) })}
              </Typography>
            </Box>
          </Box>
        </>
      ) : null}

      {lot ? (
        <>
          <CommandeFournisseurProductPicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            supplierId={lot.supplier_id}
            alreadyPresentLabel={tCommonOrder("alreadyInLot")}
            onSelect={handleProductChosenFromPicker}
          />
          <FormDialog open={condDialogOpen} onClose={handleCondLotDialogClose} fullWidth maxWidth="sm">
            <DialogTitle sx={{ pb: 0.5 }}>{t("condDialogTitle")}</DialogTitle>
            <DialogContent>
              {pendingProduct ? (
                <>
                  <Typography variant="subtitle2" className="!mb-2 !font-semibold">
                    {pendingProduct.name}
                  </Typography>
                  <ProductArabicSubtitle nameAr={pendingProduct.name_ar} matchNameLine />
                  <Typography variant="body2" color="text.secondary" className="!mb-3">
                    {t("condDialogHint")}
                  </Typography>
                  {condPanelProps ? (
                    <ParcoursProductQuantityPanel {...condPanelProps} hideQuantityControls />
                  ) : null}
                </>
              ) : null}
            </DialogContent>
            <DialogActions className="!px-3 !pb-2">
              <Button type="button" color="inherit" onClick={handleCondLotDialogClose} sx={{ textTransform: "none" }}>
                {tCommon("cancel")}
              </Button>
              <Button
                type="button"
                variant="contained"
                color="success"
                disabled={productPickerBusy}
                onClick={() => void handleCondLotDialogConfirm()}
                sx={{ textTransform: "none" }}
              >
                {t("addToLot")}
              </Button>
            </DialogActions>
          </FormDialog>
        </>
      ) : null}

      <Dialog open={confirmZeroOpen} onClose={() => setConfirmZeroOpen(false)}>
        <DialogTitle>{t("confirmZeroDialog.title")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" className="!mb-2">
            {t("confirmZeroDialog.body1")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("confirmZeroDialog.body2")}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmZeroOpen(false)} sx={{ textTransform: "none" }}>
            {tCommon("cancel")}
          </Button>
          <Button variant="contained" onClick={() => void cloturer(true)} sx={{ textTransform: "none" }}>
            {t("confirmZeroDialog.confirm")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={confirmReopenOpen}
        onClose={() => {
          if (!reopening) setConfirmReopenOpen(false);
        }}
      >
        <DialogTitle>{t("confirmReopenDialog.title")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t("confirmReopenDialog.body")}</Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmReopenOpen(false)}
            disabled={reopening}
            sx={{ textTransform: "none" }}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            variant="contained"
            disabled={reopening}
            onClick={() => void rouvrirLot()}
            sx={{ textTransform: "none" }}
          >
            {reopening ? t("reopening") : t("confirmReopenDialog.confirm")}
          </Button>
        </DialogActions>
      </Dialog>

      <AchatFraisDialog
        open={fraisDlg != null}
        mode={fraisDlg?.mode === "edit" ? "edit" : "add"}
        initialLabel={fraisDlg?.initialLabel ?? ""}
        initialMontantText={fraisDlg?.initialMontantText ?? ""}
        busy={fraisDlgBusy}
        onClose={closeFraisDlg}
        onSave={(payload) => void saveFraisDlg(payload)}
      />

      <AchatVendeurFormDialog
        key={
          vendeurDlg == null
            ? "closed"
            : vendeurDlg.mode === "edit"
              ? `edit-${vendeurDlg.id}`
              : "create"
        }
        open={vendeurDlg != null}
        mode={vendeurDlg?.mode === "edit" ? "edit" : "create"}
        busy={vendeurDlgBusy}
        initial={vendeurDlgInitial}
        onClose={() => {
          if (!vendeurDlgBusy) setVendeurDlg(null);
        }}
        onSave={(values) => void saveVendeurDlg(values)}
      />
    </main>
  );
}
