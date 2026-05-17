import React, { useEffect, useRef, useState } from "react";
import { getProfileFromIdToken } from "../api/auth";
import { deliveryOrdersApi, type DeliveryOrderResponse } from "../api/deliveryOrdersApi";
import { speciesApi, type SpeciesResponse } from "../api/speciesApi";
import { invoicesApi } from "../api/invoicesApi";
import { clientsApi } from "../api/clientsApi";
import { collectionRequestsApi } from "../api/collectionRequestsApi";
import type { CollectionRequestDto } from "../api/collectionRequestsApi";

// ── Types ──────────────────────────────────────────────────────────────────

type PaymentType = "Cash" | "EFT" | "Credit" | "CardMachine" | "Split";
type SplitLine = { method: string; amount: string };
const DELIVERY_SPLIT_METHODS = ["Cash", "EFT", "CardMachine"] as const;

type ReturnLine = {
  speciesId: string;
  orderedQty: number;
  deliveredQty: string;
  returnedDeadQty: string;
  returnedMutilatedQty: string;
  returnedNotWantedQty: string;
};

type CompletionStep = "returns" | "payment" | "receipt" | "done";

// ── Helpers ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, React.CSSProperties> = {
  Open: { background: "rgba(234,179,8,0.12)", color: "#713f12", border: "1px solid rgba(234,179,8,0.4)" },
  OutForDelivery: { background: "rgba(37,99,235,0.1)", color: "#1e3a8a", border: "1px solid rgba(37,99,235,0.3)" },
  Delivered: { background: "rgba(34,197,94,0.1)", color: "#14532d", border: "1px solid rgba(34,197,94,0.3)" },
};

const STATUS_LABELS: Record<string, string> = {
  Open: "Open",
  OutForDelivery: "Out for Delivery",
  Delivered: "Delivered",
};

const CR_STATUS_COLORS: Record<string, React.CSSProperties> = {
  Pending: { background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1" },
  Loading: { background: "rgba(234,179,8,0.12)", color: "#713f12", border: "1px solid rgba(234,179,8,0.4)" },
  InTransit: { background: "rgba(37,99,235,0.1)", color: "#1e3a8a", border: "1px solid rgba(37,99,235,0.3)" },
};

// ── Component ──────────────────────────────────────────────────────────────

export default function DriverPage() {
  const profile = getProfileFromIdToken();
  const driverId = profile?.username ?? "";

  // Delivery order state
  const [orders, setOrders] = useState<DeliveryOrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Reference data
  const [speciesList, setSpeciesList] = useState<SpeciesResponse[]>([]);

  // Delivery completion flow
  const [completing, setCompleting] = useState<DeliveryOrderResponse | null>(null);
  const [step, setStep] = useState<CompletionStep>("returns");
  const [returnLines, setReturnLines] = useState<ReturnLine[]>([]);
  const [paymentType, setPaymentType] = useState<PaymentType>("Cash");
  const [splitLines, setSplitLines] = useState<SplitLine[]>([{ method: "Cash", amount: "" }, { method: "CardMachine", amount: "" }]);
  const [completionBusy, setCompletionBusy] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [createdInvoiceId, setCreatedInvoiceId] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [receiptDone, setReceiptDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [clientHasPhone, setClientHasPhone] = useState(true);
  const [clientPhone, setClientPhone] = useState("");

  // Pending stock returns state
  const [pendingReturnOrders, setPendingReturnOrders] = useState<DeliveryOrderResponse[]>([]);
  const [loadingReturns, setLoadingReturns] = useState(true);
  const [returningOrder, setReturningOrder] = useState<DeliveryOrderResponse | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<string, string>>({});
  const [returnBusy, setReturnBusy] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);

  // Collection request state
  const [collections, setCollections] = useState<CollectionRequestDto[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(true);
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [expandedCrId, setExpandedCrId] = useState<string | null>(null);
  const [loadingCrItem, setLoadingCrItem] = useState<CollectionRequestDto | null>(null);
  const [loadLines, setLoadLines] = useState<{ speciesId: string; loadedQty: number; loadingNotes: string }[]>([]);
  const [crBusy, setCrBusy] = useState(false);
  const [crError, setCrError] = useState<string | null>(null);

  // ── Loaders ────────────────────────────────────────────────────────────────

  async function loadOrders() {
    if (!driverId) return;
    try {
      setQueueError(null);
      setLoading(true);
      const data = await deliveryOrdersApi.list({ driverId });
      setOrders(data.filter((o) => o.status !== "Delivered" && o.status !== "AwaitingCollection"));
    } catch (e: any) {
      setQueueError(e?.message || "Could not load your deliveries.");
    } finally {
      setLoading(false);
    }
  }

  async function loadSpecies() {
    if (speciesList.length > 0) return;
    try {
      const data = await speciesApi.list();
      setSpeciesList(data);
    } catch {
      // non-fatal
    }
  }

  async function loadPendingReturns() {
    if (!driverId) return;
    try {
      setLoadingReturns(true);
      const data = await deliveryOrdersApi.list({ driverId, status: "Delivered" });
      setPendingReturnOrders(
        data.filter(o => !o.returnSubmitted && o.lines.some(l => l.returnedNotWantedQty > 0))
      );
    } catch {
      // non-fatal
    } finally {
      setLoadingReturns(false);
    }
  }

  async function loadCollections() {
    if (!driverId) return;
    try {
      setCollectionError(null);
      setLoadingCollections(true);
      const data = await collectionRequestsApi.list({ driverId });
      setCollections(data.filter(c => ["Pending", "Loading", "InTransit"].includes(c.status)));
    } catch (e: any) {
      setCollectionError(e?.message || "Could not load your collections.");
    } finally {
      setLoadingCollections(false);
    }
  }

  useEffect(() => {
    loadOrders();
    loadCollections();
    loadPendingReturns();
  }, [driverId]);

  // ── Delivery order actions ─────────────────────────────────────────────────

  async function startDelivery(order: DeliveryOrderResponse) {
    try {
      setUpdatingId(order.deliveryOrderId);
      await deliveryOrdersApi.updateStatus(order.deliveryOrderId, "OutForDelivery");
      setOrders((prev) =>
        prev.map((o) =>
          o.deliveryOrderId === order.deliveryOrderId ? { ...o, status: "OutForDelivery" } : o
        )
      );
      setExpandedId(order.deliveryOrderId);
    } catch (e: any) {
      setQueueError(e?.message || "Could not update status.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function openCompletion(order: DeliveryOrderResponse) {
    await loadSpecies();
    setCompleting(order);
    setStep("returns");
    setCompletionError(null);
    setCreatedInvoiceId(null);
    setReceiptFile(null);
    setReceiptDone(false);
    setPaymentType("Cash");
    setSplitLines([{ method: "Cash", amount: "" }, { method: "CardMachine", amount: "" }]);
    setClientPhone("");
    setReturnLines(
      order.lines.map((l) => ({
        speciesId: l.speciesId,
        orderedQty: l.quantity,
        deliveredQty: String(l.quantity),
        returnedDeadQty: "0",
        returnedMutilatedQty: "0",
        returnedNotWantedQty: "0",
      }))
    );
    // Check if client has a WhatsApp number saved
    try {
      const client = await clientsApi.getById(order.customerId);
      const hasPhone = !!client.clientPhone?.trim() || !!client.clientContactDetails?.trim();
      setClientHasPhone(hasPhone);
      if (hasPhone) setClientPhone(client.clientPhone?.trim() || client.clientContactDetails?.trim() || "");
    } catch {
      setClientHasPhone(true); // non-fatal, don't block completion
    }
  }

  function closeCompletion() {
    setCompleting(null);
    if (step === "done") loadOrders();
  }

  function updateReturnLine(idx: number, field: keyof Omit<ReturnLine, "speciesId" | "orderedQty">, value: string) {
    setReturnLines((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  function validateReturns(): string | null {
    for (let i = 0; i < returnLines.length; i++) {
      const rl = returnLines[i];
      const delivered = parseInt(rl.deliveredQty) || 0;
      const dead = parseInt(rl.returnedDeadQty) || 0;
      const mutilated = parseInt(rl.returnedMutilatedQty) || 0;
      const notWanted = parseInt(rl.returnedNotWantedQty) || 0;
      const total = delivered + dead + mutilated + notWanted;
      if (delivered < 0 || dead < 0 || mutilated < 0 || notWanted < 0)
        return `Line ${i + 1}: quantities cannot be negative.`;
      if (total !== rl.orderedQty)
        return `Line ${i + 1} (${getSpeciesName(rl.speciesId)}): delivered (${delivered}) + returns (${dead + mutilated + notWanted}) must equal ordered quantity (${rl.orderedQty}).`;
    }
    return null;
  }

  async function submitCompletion() {
    if (!completing) return;
    const validationError = validateReturns();
    if (validationError) { setCompletionError(validationError); return; }

    // Validate split payment if selected
    if (paymentType === "Split") {
      const validSplitLines = splitLines.filter(l => parseFloat(l.amount) > 0);
      if (validSplitLines.length === 0) {
        setCompletionError("Enter at least one split payment amount.");
        return;
      }
      const splitAllocated = validSplitLines.reduce((s, l) => s + parseFloat(l.amount), 0);
      // Compute local grand total for validation
      const localTotal = returnLines.reduce((total, rl) => {
        const sp = (speciesList as any[]).find((s: any) => s.speciesId === rl.speciesId);
        const doLine = completing.lines.find(l => l.speciesId === rl.speciesId);
        const delivered = parseInt(rl.deliveredQty) || 0;
        const unitPriceIncl = doLine?.unitPrice ?? sp?.sellPrice ?? 0;
        return total + delivered * unitPriceIncl;
      }, 0);
      if (Math.abs(splitAllocated - localTotal) > 0.05) {
        setCompletionError(`Split payments total R ${splitAllocated.toFixed(2)} must equal invoice total R ${localTotal.toFixed(2)}.`);
        return;
      }
    }

    try {
      setCompletionError(null);
      setCompletionBusy(true);
      const lines = returnLines.map((rl) => {
        const sp = (speciesList as any[]).find((s: any) => s.speciesId === rl.speciesId);
        const doLine = completing.lines.find(l => l.speciesId === rl.speciesId);
        return {
          speciesId: rl.speciesId,
          deliveredQty: parseInt(rl.deliveredQty) || 0,
          returnedDeadQty: parseInt(rl.returnedDeadQty) || 0,
          returnedMutilatedQty: parseInt(rl.returnedMutilatedQty) || 0,
          returnedNotWantedQty: parseInt(rl.returnedNotWantedQty) || 0,
          unitPrice: (doLine?.unitPrice ?? sp?.sellPrice ?? 0) / (1 + (sp?.vat ?? 0)),
          vatRate: sp?.vat ?? 0,
        };
      });
      const result = await invoicesApi.createFromDelivery(completing.deliveryOrderId, {
        createdByDriverId: driverId,
        lines,
        clientPhone: clientPhone.trim() || undefined,
      });
      const invoiceId = result.invoiceId;
      setCreatedInvoiceId(invoiceId);

      // Record payment — pass split breakdown when Split is selected
      const splitPaymentsForApi = paymentType === "Split"
        ? splitLines.filter(l => parseFloat(l.amount) > 0).map(l => ({ method: l.method, amount: parseFloat(l.amount) }))
        : undefined;
      await invoicesApi.recordPayment(invoiceId, paymentType, splitPaymentsForApi);

      // Prompt for receipt if EFT or CardMachine was used (directly or within a split)
      const needsReceipt = paymentType === "EFT" || paymentType === "CardMachine"
        || (paymentType === "Split" && splitLines.some(l => parseFloat(l.amount) > 0 && (l.method === "EFT" || l.method === "CardMachine")));

      if (needsReceipt) {
        setStep("receipt");
      } else {
        setStep("done");
        setOrders((prev) => prev.filter((o) => o.deliveryOrderId !== completing.deliveryOrderId));
      }
    } catch (e: any) {
      setCompletionError(e?.message || "Could not complete delivery.");
    } finally {
      setCompletionBusy(false);
    }
  }

  async function uploadReceipt() {
    if (!createdInvoiceId || !receiptFile) return;
    try {
      setReceiptUploading(true);
      setCompletionError(null);
      const { presignedUrl } = await invoicesApi.getReceiptUploadUrl(createdInvoiceId);
      await fetch(presignedUrl, { method: "PUT", body: receiptFile, headers: { "Content-Type": "image/jpeg" } });
      setReceiptDone(true);
      setStep("done");
      setOrders((prev) => prev.filter((o) => o.deliveryOrderId !== completing?.deliveryOrderId));
    } catch (e: any) {
      setCompletionError(e?.message || "Could not upload receipt.");
    } finally {
      setReceiptUploading(false);
    }
  }

  function skipReceiptUpload() {
    setStep("done");
    setOrders((prev) => prev.filter((o) => o.deliveryOrderId !== completing?.deliveryOrderId));
  }

  function getSpeciesName(speciesId: string) {
    return (speciesList as any[]).find((s: any) => s.speciesId === speciesId)?.name ?? speciesId.slice(0, 8) + "…";
  }

  // ── Collection request actions ─────────────────────────────────────────────

  function openCrLoadModal(cr: CollectionRequestDto) {
    setLoadingCrItem(cr);
    setLoadLines(cr.lines.map(l => ({
      speciesId: l.speciesId,
      loadedQty: l.loadedQty || l.orderedQty,
      loadingNotes: l.loadingNotes || "",
    })));
    setCrError(null);
  }

  async function saveCrLoad(dispatch: boolean) {
    if (!loadingCrItem) return;
    setCrBusy(true);
    try {
      let updated = await collectionRequestsApi.driverLoad(loadingCrItem.collectionRequestId, loadLines);
      if (dispatch) {
        updated = await collectionRequestsApi.dispatch(loadingCrItem.collectionRequestId);
      }
      setCollections(cs =>
        cs.map(c => c.collectionRequestId === updated.collectionRequestId ? updated : c)
          .filter(c => ["Pending", "Loading", "InTransit"].includes(c.status))
      );
      setLoadingCrItem(null);
    } catch (e: any) {
      setCrError(e?.message || "Could not save.");
    } finally {
      setCrBusy(false);
    }
  }

  async function handleCrArrive(id: string) {
    setCrBusy(true);
    try {
      await collectionRequestsApi.arrive(id);
      setCollections(cs => cs.filter(c => c.collectionRequestId !== id));
    } catch (e: any) {
      setCollectionError(e?.message || "Could not update status.");
    } finally {
      setCrBusy(false);
    }
  }

  function openReturnModal(order: DeliveryOrderResponse) {
    const initial: Record<string, string> = {};
    order.lines.forEach(l => {
      if (l.returnedNotWantedQty > 0) initial[l.speciesId] = String(l.returnedNotWantedQty);
    });
    setReturnQtys(initial);
    setReturnError(null);
    setReturningOrder(order);
  }

  async function submitReturn() {
    if (!returningOrder) return;
    const lines = returningOrder.lines
      .filter(l => l.returnedNotWantedQty > 0)
      .map(l => ({ speciesId: l.speciesId, qty: parseInt(returnQtys[l.speciesId] ?? "0") || 0 }))
      .filter(l => l.qty > 0);

    if (lines.length === 0) {
      setReturnError("Enter at least one return quantity.");
      return;
    }

    // Validate qtys don't exceed not-wanted
    for (const line of lines) {
      const ordered = returningOrder.lines.find(l => l.speciesId === line.speciesId)?.returnedNotWantedQty ?? 0;
      if (line.qty > ordered) {
        setReturnError(`Return qty for ${getSpeciesName(line.speciesId)} (${line.qty}) exceeds not-wanted qty (${ordered}).`);
        return;
      }
    }

    setReturnBusy(true);
    setReturnError(null);
    try {
      await deliveryOrdersApi.submitReturn(returningOrder.deliveryOrderId, lines);
      setPendingReturnOrders(prev => prev.filter(o => o.deliveryOrderId !== returningOrder.deliveryOrderId));
      setReturningOrder(null);
    } catch (e: any) {
      setReturnError(e?.message || "Could not submit return.");
    } finally {
      setReturnBusy(false);
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const activeOrders = orders.filter((o) => o.status === "Open" || o.status === "OutForDelivery");
  const outForDelivery = orders.filter((o) => o.status === "OutForDelivery");

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={s.page}>

      {/* ── Header ── */}
      <div style={s.header}>
        <div style={s.title}>My Work</div>
        <button style={s.secondaryBtn} onClick={() => { loadOrders(); loadCollections(); loadPendingReturns(); }} disabled={loading && loadingCollections}>
          Refresh
        </button>
      </div>

      {/* ── Summary pills ── */}
      <div style={s.pillRow}>
        <div style={s.pill}>
          <span style={s.pillNum}>{orders.filter(o => o.status === "Open").length}</span>
          <span style={s.pillLabel}>Open Deliveries</span>
        </div>
        <div style={{ ...s.pill, ...STATUS_COLORS.OutForDelivery }}>
          <span style={s.pillNum}>{outForDelivery.length}</span>
          <span style={s.pillLabel}>Out for Delivery</span>
        </div>
        <div style={{ ...s.pill, background: "rgba(124,58,237,0.08)", color: "#4c1d95", border: "1px solid rgba(124,58,237,0.25)" }}>
          <span style={s.pillNum}>{collections.length}</span>
          <span style={s.pillLabel}>Collections</span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════ DELIVERIES */}
      <div style={s.sectionHeader}>
        <span style={s.sectionIcon}>🚚</span>
        <span style={s.sectionTitle}>My Deliveries</span>
      </div>

      {queueError && <div style={s.error}>{queueError}</div>}

      {loading ? (
        <div style={s.emptyCard}>Loading your deliveries…</div>
      ) : activeOrders.length === 0 ? (
        <div style={s.emptyCard}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>✓</div>
          <div style={{ fontWeight: 900 }}>No active deliveries</div>
          <div style={{ opacity: 0.6, marginTop: 4, fontSize: 14 }}>You're all caught up!</div>
        </div>
      ) : (
        <div style={s.list}>
          {activeOrders.map((order) => {
            const isExpanded = expandedId === order.deliveryOrderId;
            const isOutForDelivery = order.status === "OutForDelivery";
            const isUpdating = updatingId === order.deliveryOrderId;
            return (
              <div key={order.deliveryOrderId} style={s.orderCard}>
                <div style={s.cardHeader} onClick={() => setExpandedId(isExpanded ? null : order.deliveryOrderId)}>
                  <div style={{ flex: 1 }}>
                    <div style={s.cardTitle}>
                      {order.deliveryAddressLine1 || order.city || "Delivery"}
                      <span style={{ ...s.badge, ...STATUS_COLORS[order.status] }}>
                        {STATUS_LABELS[order.status] ?? order.status}
                      </span>
                    </div>
                    <div style={s.cardMeta}>
                      {order.city && <span>{order.city}</span>}
                      {order.city && <span style={s.dot}>·</span>}
                      <span>{order.lines.length} item{order.lines.length !== 1 ? "s" : ""}</span>
                      <span style={s.dot}>·</span>
                      <span style={s.mono}>{order.deliveryOrderId.slice(0, 8)}…</span>
                    </div>
                  </div>
                  <div style={s.chevron}>{isExpanded ? "▲" : "▼"}</div>
                </div>

                {isExpanded && (
                  <div style={s.cardBody}>
                    <div style={s.detailBlock}>
                      <div style={s.detailRow}><span style={s.dk}>Address</span><span style={s.dv}>{order.deliveryAddressLine1 || "—"}</span></div>
                      <div style={s.detailRow}><span style={s.dk}>City</span><span style={s.dv}>{order.city || "—"}</span></div>
                      {order.province && <div style={s.detailRow}><span style={s.dk}>Province</span><span style={s.dv}>{order.province}</span></div>}
                      {order.postalCode && <div style={s.detailRow}><span style={s.dk}>Postal Code</span><span style={s.dv}>{order.postalCode}</span></div>}
                    </div>
                    <div style={s.detailHeading}>Items to deliver</div>
                    {order.lines.map((line, i) => (
                      <div key={i} style={s.lineItem}>
                        <span style={s.lineSpecies}>{getSpeciesName(line.speciesId)}</span>
                        <span style={s.lineQty}>{line.quantity}</span>
                      </div>
                    ))}
                    <div style={s.cardActions}>
                      {!isOutForDelivery && (
                        <button style={s.startBtn} onClick={() => startDelivery(order)} disabled={isUpdating}>
                          {isUpdating ? "Updating…" : "🚚 Start Delivery"}
                        </button>
                      )}
                      {isOutForDelivery && (
                        <button style={s.completeBtn} onClick={() => openCompletion(order)} disabled={isUpdating}>
                          ✓ Complete Delivery
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════ COLLECTIONS */}
      <div style={{ ...s.sectionHeader, marginTop: 28 }}>
        <span style={s.sectionIcon}>📦</span>
        <span style={s.sectionTitle}>My Collections</span>
      </div>

      {collectionError && <div style={s.error}>{collectionError}</div>}

      {loadingCollections ? (
        <div style={s.emptyCard}>Loading your collections…</div>
      ) : collections.length === 0 ? (
        <div style={s.emptyCard}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>📦</div>
          <div style={{ fontWeight: 900 }}>No active collection tasks</div>
          <div style={{ opacity: 0.6, marginTop: 4, fontSize: 14 }}>Nothing to collect right now</div>
        </div>
      ) : (
        <div style={s.list}>
          {collections.map(cr => {
            const isExpanded = expandedCrId === cr.collectionRequestId;
            return (
              <div key={cr.collectionRequestId} style={s.orderCard}>
                <div style={s.cardHeader} onClick={() => setExpandedCrId(isExpanded ? null : cr.collectionRequestId)}>
                  <div style={{ flex: 1 }}>
                    <div style={s.cardTitle}>
                      {cr.supplierName || "Collection"}
                      <span style={{ ...s.badge, ...CR_STATUS_COLORS[cr.status] }}>{cr.status}</span>
                    </div>
                    <div style={s.cardMeta}>
                      <span>{cr.lines.length} species</span>
                      <span style={s.dot}>·</span>
                      <span style={s.mono}>CR-{cr.collectionRequestId.split("-")[0].toUpperCase()}</span>
                      {cr.notes && <><span style={s.dot}>·</span><span style={{ fontStyle: "italic" }}>{cr.notes}</span></>}
                    </div>
                  </div>
                  <div style={s.chevron}>{isExpanded ? "▲" : "▼"}</div>
                </div>

                {isExpanded && (
                  <div style={s.cardBody}>
                    <div style={s.crLinesGrid}>
                      {cr.lines.map(l => (
                        <div key={l.speciesId} style={s.crLineCard}>
                          <div style={s.crLineName}>{l.speciesName || l.speciesId}</div>
                          <div style={s.crLineStats}>
                            <span>
                              <span style={s.crLineStatLabel}>Ordered</span>
                              <span style={s.crLineStatVal}>{l.orderedQty}</span>
                            </span>
                            <span>
                              <span style={s.crLineStatLabel}>Loaded</span>
                              <span style={{ ...s.crLineStatVal, color: l.loadedQty > 0 ? "#16a34a" : "#94a3b8" }}>{l.loadedQty}</span>
                            </span>
                          </div>
                          {l.loadingNotes ? <div style={s.crLineNote}>⚠ {l.loadingNotes}</div> : null}
                        </div>
                      ))}
                    </div>
                    <div style={s.cardActions}>
                      {(cr.status === "Pending" || cr.status === "Loading") && (
                        <button style={s.startBtn} onClick={() => openCrLoadModal(cr)}>
                          {cr.status === "Loading" ? "✏️ Update Loading" : "📦 Start Loading"}
                        </button>
                      )}
                      {cr.status === "InTransit" && (
                        <button style={s.completeBtn} onClick={() => handleCrArrive(cr.collectionRequestId)} disabled={crBusy}>
                          🏠 Mark Arrived at Hub
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Delivery Completion Modal ── */}
      {completing && (
        <div style={s.backdrop}>
          <div style={s.modal}>

            {step === "returns" && (
              <>
                <div style={s.modalTitle}>Complete Delivery</div>
                <div style={s.modalSub}>
                  {completing.deliveryAddressLine1} {completing.city && `· ${completing.city}`}
                </div>
                {completionError && <div style={s.completionError}>{completionError}</div>}
                <div style={s.stepNote}>Enter the actual quantities delivered and any returns.</div>
                {returnLines.map((rl, idx) => {
                  const delivered = parseInt(rl.deliveredQty) || 0;
                  const dead = parseInt(rl.returnedDeadQty) || 0;
                  const mutilated = parseInt(rl.returnedMutilatedQty) || 0;
                  const notWanted = parseInt(rl.returnedNotWantedQty) || 0;
                  const accounted = delivered + dead + mutilated + notWanted;
                  const ok = accounted === rl.orderedQty;
                  return (
                    <div key={rl.speciesId} style={s.returnBlock}>
                      <div style={s.returnSpecies}>
                        {getSpeciesName(rl.speciesId)}
                        <span style={s.returnOrdered}>Ordered: {rl.orderedQty}</span>
                        <span style={ok ? s.returnOk : s.returnBad}>
                          {ok ? `✓ ${accounted}/${rl.orderedQty}` : `${accounted}/${rl.orderedQty}`}
                        </span>
                      </div>
                      <div style={s.returnFields}>
                        <label style={s.returnLabel}>Delivered<input style={s.returnInput} inputMode="numeric" value={rl.deliveredQty} onChange={(e) => updateReturnLine(idx, "deliveredQty", e.target.value)} disabled={completionBusy} /></label>
                        <label style={s.returnLabel}>Dead<input style={s.returnInput} inputMode="numeric" value={rl.returnedDeadQty} onChange={(e) => updateReturnLine(idx, "returnedDeadQty", e.target.value)} disabled={completionBusy} /></label>
                        <label style={s.returnLabel}>Mutilated<input style={s.returnInput} inputMode="numeric" value={rl.returnedMutilatedQty} onChange={(e) => updateReturnLine(idx, "returnedMutilatedQty", e.target.value)} disabled={completionBusy} /></label>
                        <label style={s.returnLabel}>Not Wanted<input style={s.returnInput} inputMode="numeric" value={rl.returnedNotWantedQty} onChange={(e) => updateReturnLine(idx, "returnedNotWantedQty", e.target.value)} disabled={completionBusy} /></label>
                      </div>
                    </div>
                  );
                })}
                <div style={s.paymentSection}>
                  <div style={s.paymentHeading}>Payment Method</div>
                  <div style={s.paymentOptions}>
                    {(["Cash", "EFT", "CardMachine", "Credit", "Split"] as PaymentType[]).map((pt) => (
                      <button key={pt} style={{ ...s.paymentOption, ...(paymentType === pt ? s.paymentOptionActive : {}) }} onClick={() => setPaymentType(pt)} disabled={completionBusy}>
                        {pt === "Cash" && "💵 "}
                        {pt === "EFT" && "📱 "}
                        {pt === "CardMachine" && "💳 "}
                        {pt === "Credit" && "📋 "}
                        {pt === "Split" && "✂️ "}
                        {pt === "CardMachine" ? "Card Machine" : pt}
                      </button>
                    ))}
                  </div>

                  {/* ── Split breakdown panel ── */}
                  {paymentType === "Split" && (() => {
                    const splitAllocated = splitLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
                    const localTotal = returnLines.reduce((total, rl) => {
                      const sp = (speciesList as any[]).find((s: any) => s.speciesId === rl.speciesId);
                      const doLine = completing?.lines.find(l => l.speciesId === rl.speciesId);
                      const delivered = parseInt(rl.deliveredQty) || 0;
                      return total + delivered * (doLine?.unitPrice ?? sp?.sellPrice ?? 0);
                    }, 0);
                    const splitRemaining = localTotal - splitAllocated;
                    return (
                      <div style={s.splitPanel}>
                        <div style={s.splitPanelTitle}>Split Payment Breakdown</div>
                        {splitLines.map((sl, i) => (
                          <div key={i} style={s.splitRow}>
                            <select
                              style={{ flex: 1, padding: "10px 8px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", fontSize: 14, background: "white" }}
                              value={sl.method}
                              onChange={e => setSplitLines(prev => prev.map((x, j) => j === i ? { ...x, method: e.target.value } : x))}
                              disabled={completionBusy}
                            >
                              {DELIVERY_SPLIT_METHODS.map(m => <option key={m} value={m}>{m === "CardMachine" ? "Card Machine" : m}</option>)}
                            </select>
                            <input
                              style={{ width: 110, padding: "10px 8px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", fontSize: 14, textAlign: "right", boxSizing: "border-box" }}
                              type="number" inputMode="decimal"
                              min={0}
                              step={0.01}
                              placeholder="0.00"
                              value={sl.amount}
                              onChange={e => setSplitLines(prev => prev.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                              onFocus={e => e.target.select()}
                              disabled={completionBusy}
                            />
                            <button
                              style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16, padding: "4px 6px" }}
                              disabled={splitLines.length <= 1 || completionBusy}
                              onClick={() => setSplitLines(prev => prev.filter((_, j) => j !== i))}
                            >✕</button>
                          </div>
                        ))}
                        <button
                          style={{ background: "none", border: "1px dashed rgba(0,0,0,0.2)", color: "rgba(0,0,0,0.5)", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 13, width: "100%", marginBottom: 8 }}
                          onClick={() => setSplitLines(prev => [...prev, { method: "Cash", amount: "" }])}
                          disabled={completionBusy}
                        >+ Add method</button>
                        <div style={{
                          fontWeight: 700, fontSize: 13, textAlign: "right",
                          color: Math.abs(splitRemaining) < 0.01 ? "#16a34a" : Math.abs(splitRemaining) > 0.05 ? "#dc2626" : "#92400e",
                          paddingTop: 6, borderTop: "1px solid rgba(0,0,0,0.1)"
                        }}>
                          {Math.abs(splitRemaining) < 0.01
                            ? `✓ Allocated: R ${splitAllocated.toFixed(2)}`
                            : splitRemaining > 0
                              ? `Still to allocate: R ${splitRemaining.toFixed(2)}`
                              : `Over-allocated by: R ${Math.abs(splitRemaining).toFixed(2)}`
                          }
                          {localTotal > 0 && <span style={{ fontWeight: 400, color: "rgba(0,0,0,0.4)", marginLeft: 8 }}>of R {localTotal.toFixed(2)}</span>}
                        </div>
                      </div>
                    );
                  })()}

                  {(paymentType === "EFT" || paymentType === "CardMachine"
                    || (paymentType === "Split" && splitLines.some(l => parseFloat(l.amount) > 0 && (l.method === "EFT" || l.method === "CardMachine")))
                  ) && (
                    <div style={s.eftNote}>You'll be prompted to take a photo of the receipt after confirming.</div>
                  )}
                  {paymentType === "Credit" && (
                    <div style={s.eftNote}>Invoice will be sent to the client's account.</div>
                  )}
                </div>
                {/* WhatsApp phone — required if client has none */}
                <div style={{ marginTop: 14, padding: "10px 12px", background: "rgba(22,163,74,0.07)", border: "1px solid rgba(22,163,74,0.25)", borderRadius: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#15803d", marginBottom: 6 }}>📱 WhatsApp Invoice</div>
                  {clientHasPhone ? (
                    <div style={{ fontSize: 12, color: "#475569" }}>Invoice will be sent to <strong>{clientPhone}</strong> via WhatsApp.</div>
                  ) : (
                    <>
                      <div style={{ fontSize: 12, color: "#92400e", marginBottom: 6 }}>⚠ No WhatsApp number on file. Enter one to send invoice automatically:</div>
                      <input
                        style={{ width: "100%", padding: "7px 10px", border: "1px solid #f59e0b", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
                        placeholder="e.g. 0821234567"
                        value={clientPhone}
                        onChange={e => setClientPhone(e.target.value)}
                      />
                    </>
                  )}
                </div>
                <div style={s.modalBtns}>
                  <button style={s.secondaryBtn} onClick={closeCompletion} disabled={completionBusy}>Cancel</button>
                  <button style={s.completeBtn} onClick={submitCompletion} disabled={completionBusy}>{completionBusy ? "Processing…" : "Confirm Delivery"}</button>
                </div>
              </>
            )}

            {step === "receipt" && (
              <>
                <div style={s.modalTitle}>{paymentType === "CardMachine" ? "Upload Card Machine Slip" : "Upload EFT Receipt"}</div>
                <div style={s.modalSub}>Take a photo of the payment receipt to complete the delivery.</div>
                {completionError && <div style={s.completionError}>{completionError}</div>}
                <div style={s.receiptBox}>
                  {receiptFile ? (
                    <div style={s.receiptPreview}>
                      <img src={URL.createObjectURL(receiptFile)} alt="Receipt" style={{ width: "100%", borderRadius: 10, maxHeight: 280, objectFit: "cover" }} />
                      <button style={s.changePhotoBtn} onClick={() => fileInputRef.current?.click()}>Change Photo</button>
                    </div>
                  ) : (
                    <button style={s.cameraBtn} onClick={() => fileInputRef.current?.click()}>
                      <div style={{ fontSize: 36 }}>📷</div>
                      <div style={{ fontWeight: 900, marginTop: 8 }}>Take Photo of Receipt</div>
                      <div style={{ opacity: 0.6, fontSize: 13, marginTop: 4 }}>Or select from your gallery</div>
                    </button>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)} />
                </div>
                <div style={s.modalBtns}>
                  <button style={s.secondaryBtn} onClick={skipReceiptUpload} disabled={receiptUploading}>Skip for now</button>
                  <button style={s.completeBtn} onClick={uploadReceipt} disabled={!receiptFile || receiptUploading}>{receiptUploading ? "Uploading…" : "Upload & Finish"}</button>
                </div>
              </>
            )}

            {step === "done" && (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
                <div style={s.modalTitle}>Delivery Complete!</div>
                {createdInvoiceId && <div style={{ ...s.modalSub, marginBottom: 4 }}>Invoice created</div>}
                <div style={{ ...s.modalSub, marginBottom: 0, fontFamily: "ui-monospace, monospace", fontSize: 13 }}>{createdInvoiceId}</div>
                {paymentType === "EFT" && receiptDone && <div style={{ marginTop: 8, color: "#16a34a", fontWeight: 700 }}>Receipt uploaded ✓</div>}
                <button style={{ ...s.completeBtn, marginTop: 20 }} onClick={closeCompletion}>Back to deliveries</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ PENDING RETURNS */}
      {(loadingReturns || pendingReturnOrders.length > 0) && (
        <>
          <div style={{ ...s.sectionHeader, marginTop: 28 }}>
            <span style={s.sectionIcon}>🔄</span>
            <span style={s.sectionTitle}>Return Stock to Hub</span>
          </div>

          {loadingReturns ? (
            <div style={s.emptyCard}>Checking for pending returns…</div>
          ) : (
            <div style={s.list}>
              {pendingReturnOrders.map(order => {
                const returnLines = order.lines.filter(l => l.returnedNotWantedQty > 0);
                return (
                  <div key={order.deliveryOrderId} style={s.orderCard}>
                    <div style={s.cardHeader}>
                      <div style={{ flex: 1 }}>
                        <div style={s.cardTitle}>
                          {order.deliveryAddressLine1 || order.city || "Delivery"}
                          <span style={{ ...s.badge, background: "rgba(234,179,8,0.15)", color: "#92400e", border: "1px solid rgba(234,179,8,0.4)" }}>
                            Pending Return
                          </span>
                        </div>
                        <div style={s.cardMeta}>
                          <span>{returnLines.reduce((s, l) => s + l.returnedNotWantedQty, 0)} items to return</span>
                          <span style={s.dot}>·</span>
                          <span style={s.mono}>{order.deliveryOrderId.slice(0, 8)}…</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ padding: "0 14px 14px" }}>
                      {returnLines.map(l => (
                        <div key={l.speciesId} style={s.lineItem}>
                          <span style={s.lineSpecies}>{getSpeciesName(l.speciesId)}</span>
                          <span style={{ ...s.lineQty, color: "#92400e" }}>{l.returnedNotWantedQty} not wanted</span>
                        </div>
                      ))}
                      <button
                        style={{ ...s.completeBtn, marginTop: 10, width: "100%" }}
                        onClick={() => openReturnModal(order)}
                      >
                        📦 Return to Hub
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Return to Hub Modal ── */}
      {returningOrder && (
        <div style={s.backdrop}>
          <div style={s.modal}>
            <div style={s.modalTitle}>Return Stock to Hub</div>
            <div style={s.modalSub}>Enter how many of each species you are physically returning.</div>
            {returnError && <div style={s.completionError}>{returnError}</div>}

            {returningOrder.lines.filter(l => l.returnedNotWantedQty > 0).map(l => (
              <div key={l.speciesId} style={s.returnBlock}>
                <div style={s.returnSpecies}>
                  {getSpeciesName(l.speciesId)}
                  <span style={s.returnOrdered}>Not-wanted: {l.returnedNotWantedQty}</span>
                </div>
                <div style={s.returnFields}>
                  <label style={s.returnLabel}>
                    Returning
                    <input
                      style={s.returnInput}
                      inputMode="numeric"
                      value={returnQtys[l.speciesId] ?? "0"}
                      max={l.returnedNotWantedQty}
                      onChange={e => setReturnQtys(q => ({ ...q, [l.speciesId]: e.target.value }))}
                      disabled={returnBusy}
                    />
                  </label>
                </div>
              </div>
            ))}

            <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: 7, fontSize: 12, color: "#92400e" }}>
              ℹ Hub staff will verify the quantities when you arrive.
            </div>

            <div style={s.modalBtns}>
              <button style={s.secondaryBtn} onClick={() => setReturningOrder(null)} disabled={returnBusy}>Cancel</button>
              <button style={s.completeBtn} onClick={submitReturn} disabled={returnBusy}>
                {returnBusy ? "Submitting…" : "Submit Return"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Collection Loading Modal ── */}
      {loadingCrItem && (
        <div style={s.backdrop}>
          <div style={s.modal}>
            <div style={s.modalTitle}>Load Stock</div>
            <div style={s.modalSub}>{loadingCrItem.supplierName} · {loadingCrItem.lines.length} species</div>
            {crError && <div style={s.completionError}>{crError}</div>}
            <div style={s.stepNote}>Enter the quantity you are loading onto your vehicle for each species.</div>
            {loadLines.map((ll, i) => {
              const orig = loadingCrItem.lines[i];
              const isShort = ll.loadedQty < (orig?.orderedQty ?? 0);
              const shortfallQty = (orig?.orderedQty ?? 0) - ll.loadedQty;
              return (
                <div key={ll.speciesId} style={s.returnBlock}>
                  <div style={s.returnSpecies}>
                    {orig?.speciesName || ll.speciesId}
                    <span style={s.returnOrdered}>Ordered: {orig?.orderedQty}</span>
                    {isShort && ll.loadedQty >= 0 && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#dc2626", background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", padding: "2px 8px", borderRadius: 999 }}>
                        ⚠ {shortfallQty} short
                      </span>
                    )}
                  </div>
                  <div style={s.returnFields}>
                    <label style={s.returnLabel}>
                      Loaded Qty
                      <input
                        style={{ ...s.returnInput, borderColor: isShort ? "#fca5a5" : undefined }}
                        inputMode="numeric" value={ll.loadedQty}
                        onChange={e => setLoadLines(ls => ls.map((x, j) => j === i ? { ...x, loadedQty: parseInt(e.target.value) || 0 } : x))}
                        disabled={crBusy}
                        onFocus={e => e.target.select()}
                      />
                    </label>
                    <label style={s.returnLabel}>
                      Notes (if short)
                      <input style={{ ...s.returnInput, fontSize: 13, textAlign: "left" as const, padding: "10px 8px" }}
                        value={ll.loadingNotes} placeholder="Reason if not full"
                        onChange={e => setLoadLines(ls => ls.map((x, j) => j === i ? { ...x, loadingNotes: e.target.value } : x))}
                        disabled={crBusy}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
            <div style={s.modalBtns}>
              <button style={s.secondaryBtn} onClick={() => setLoadingCrItem(null)} disabled={crBusy}>Cancel</button>
              <button style={{ ...s.secondaryBtn, color: "#16a34a", border: "1px solid #16a34a" }} onClick={() => saveCrLoad(false)} disabled={crBusy}>Save Progress</button>
              <button style={s.completeBtn} onClick={() => saveCrLoad(true)} disabled={crBusy}>{crBusy ? "…" : "Dispatch 🚛"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { padding: "16px", fontFamily: "system-ui", maxWidth: 640, margin: "0 auto" },

  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" },
  title: { fontSize: 22, fontWeight: 900 },

  pillRow: { display: "flex", gap: 10, marginTop: 16, marginBottom: 24, flexWrap: "wrap" },
  pill: {
    display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999,
    background: "rgba(234,179,8,0.12)", color: "#713f12", border: "1px solid rgba(234,179,8,0.4)",
  },
  pillNum: { fontWeight: 900, fontSize: 18 },
  pillLabel: { fontWeight: 700, fontSize: 13 },

  sectionHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12, paddingBottom: 10, borderBottom: "2px solid #e2e8f0" },
  sectionIcon: { fontSize: 22 },
  sectionTitle: { fontSize: 17, fontWeight: 900, color: "#0f172a" },

  error: { marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)", color: "#7f1d1d" },

  emptyCard: { marginTop: 12, padding: 28, borderRadius: 16, border: "1px solid rgba(0,0,0,0.1)", background: "white", textAlign: "center", fontSize: 15, marginBottom: 8 },

  list: { display: "grid", gap: 12, marginTop: 12 },

  orderCard: { borderRadius: 16, border: "1px solid rgba(0,0,0,0.12)", background: "white", overflow: "hidden" },
  cardHeader: { display: "flex", alignItems: "center", gap: 10, padding: "16px 16px", cursor: "pointer" },
  cardTitle: { fontWeight: 900, fontSize: 16, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  badge: { fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999 },
  cardMeta: { marginTop: 4, fontSize: 13, color: "rgba(0,0,0,0.5)", fontWeight: 600, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" },
  dot: { opacity: 0.4 },
  mono: { fontFamily: "ui-monospace, monospace", fontSize: 12 },
  chevron: { fontSize: 12, opacity: 0.4, flexShrink: 0 },

  cardBody: { padding: "0 16px 16px", borderTop: "1px solid rgba(0,0,0,0.07)", paddingTop: 14 },

  detailBlock: { marginBottom: 12 },
  detailRow: { display: "flex", gap: 8, marginTop: 5, fontSize: 14, flexWrap: "wrap" },
  dk: { fontWeight: 800, color: "#111", minWidth: 90 },
  dv: { color: "rgba(0,0,0,0.7)", fontWeight: 600 },

  detailHeading: { fontWeight: 900, fontSize: 12, textTransform: "uppercase" as const, letterSpacing: 0.6, color: "rgba(0,0,0,0.45)", marginBottom: 8, marginTop: 12 },

  lineItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(0,0,0,0.06)", fontSize: 15 },
  lineSpecies: { fontWeight: 700 },
  lineQty: { fontWeight: 900, fontSize: 18, color: "#2563eb" },

  cardActions: { marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" },

  startBtn: { flex: 1, padding: "14px", borderRadius: 12, border: "1px solid rgba(37,99,235,0.3)", background: "rgba(37,99,235,0.08)", color: "#1d4ed8", fontWeight: 900, fontSize: 15, cursor: "pointer" },
  completeBtn: { flex: 1, padding: "14px", borderRadius: 12, border: "none", background: "#16a34a", color: "white", fontWeight: 900, fontSize: 15, cursor: "pointer" },
  secondaryBtn: { padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.15)", cursor: "pointer", fontWeight: 900, background: "white" },

  // Collection line cards
  crLinesGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, marginBottom: 12 },
  crLineCard: { background: "#f8fafc", borderRadius: 8, padding: "8px 10px", border: "1px solid #e2e8f0" },
  crLineName: { fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 4 },
  crLineStats: { display: "flex", gap: 12 },
  crLineStatLabel: { fontSize: 11, color: "#94a3b8", display: "block" as const },
  crLineStatVal: { fontSize: 14, fontWeight: 700 },
  crLineNote: { fontSize: 11, color: "#92400e", marginTop: 4 },

  // Completion modal
  backdrop: { position: "fixed", inset: 0, background: "rgba(248,250,252,0.75)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 16px 40px", zIndex: 100, overflowY: "auto" },
  modal: { width: "100%", maxWidth: 560, background: "white", borderRadius: 20, padding: 20, border: "1px solid rgba(0,0,0,0.1)", marginTop: 8, boxSizing: "border-box" as const },
  modalTitle: { fontSize: 20, fontWeight: 900, marginBottom: 4 },
  modalSub: { fontSize: 14, opacity: 0.6, marginBottom: 14 },
  modalBtns: { display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end", flexWrap: "wrap" },

  stepNote: { fontSize: 13, color: "rgba(0,0,0,0.55)", marginBottom: 12, padding: "10px 12px", background: "rgba(37,99,235,0.05)", borderRadius: 10, border: "1px solid rgba(37,99,235,0.15)" },
  completionError: { padding: 12, borderRadius: 10, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)", color: "#7f1d1d", marginBottom: 12, fontSize: 14 },

  returnBlock: { marginBottom: 14, padding: 14, borderRadius: 12, border: "1px solid rgba(0,0,0,0.1)", background: "#fafafa" },
  returnSpecies: { fontWeight: 900, fontSize: 15, marginBottom: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  returnOrdered: { fontSize: 12, fontWeight: 700, opacity: 0.55, background: "rgba(0,0,0,0.06)", padding: "2px 8px", borderRadius: 999 },
  returnOk: { fontSize: 12, fontWeight: 700, background: "rgba(34,197,94,0.12)", color: "#14532d", border: "1px solid rgba(34,197,94,0.3)", padding: "2px 8px", borderRadius: 999 },
  returnBad: { fontSize: 12, fontWeight: 700, background: "rgba(239,68,68,0.1)", color: "#7f1d1d", border: "1px solid rgba(239,68,68,0.3)", padding: "2px 8px", borderRadius: 999 },
  returnFields: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 },
  returnLabel: { display: "grid", gap: 4, fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: 0.4, color: "rgba(0,0,0,0.55)" },
  returnInput: { width: "100%", boxSizing: "border-box" as const, padding: "10px 8px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", fontSize: 16, fontWeight: 900, textAlign: "center" as const, background: "white" },

  paymentSection: { marginTop: 16 },
  paymentHeading: { fontWeight: 900, fontSize: 13, textTransform: "uppercase" as const, letterSpacing: 0.5, color: "rgba(0,0,0,0.5)", marginBottom: 10 },
  paymentOptions: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8 },
  paymentOption: { padding: "12px 8px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.15)", background: "white", fontWeight: 800, fontSize: 13, cursor: "pointer" },
  paymentOptionActive: { border: "2px solid #2563eb", background: "rgba(37,99,235,0.08)", color: "#1d4ed8" },
  eftNote: { marginTop: 8, fontSize: 13, color: "rgba(0,0,0,0.55)", fontStyle: "italic" },
  splitPanel: { marginTop: 12, padding: "12px 14px", background: "#f8fafc", borderRadius: 12, border: "1px solid rgba(0,0,0,0.1)" },
  splitPanelTitle: { fontSize: 12, fontWeight: 800, color: "rgba(0,0,0,0.5)", textTransform: "uppercase" as const, letterSpacing: 0.4, marginBottom: 10 },
  splitRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },

  receiptBox: { margin: "14px 0" },
  cameraBtn: { width: "100%", padding: "32px 20px", borderRadius: 16, border: "2px dashed rgba(37,99,235,0.3)", background: "rgba(37,99,235,0.04)", cursor: "pointer", textAlign: "center" as const, color: "#1d4ed8" },
  receiptPreview: { display: "grid", gap: 10 },
  changePhotoBtn: { padding: "12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", background: "white", cursor: "pointer", fontWeight: 800, width: "100%" },
};
