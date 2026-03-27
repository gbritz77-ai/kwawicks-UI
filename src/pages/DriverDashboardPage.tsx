import React, { useEffect, useRef, useState } from "react";
import { getProfileFromIdToken } from "../api/auth";
import { deliveryOrdersApi, type DeliveryOrderResponse } from "../api/deliveryOrdersApi";
import { speciesApi, type SpeciesResponse } from "../api/speciesApi";
import { invoicesApi } from "../api/invoicesApi";
import { clientsApi } from "../api/clientsApi";
import { collectionRequestsApi } from "../api/collectionRequestsApi";
import type { CollectionRequestDto } from "../api/collectionRequestsApi";
import { pettyCashApi } from "../api/pettyCashApi";
import type { PettyCashEntryDto } from "../api/pettyCashApi";

// ── Types ─────────────────────────────────────────────────────────────────────

type PaymentType = "Cash" | "EFT" | "Credit" | "CardMachine";

type ReturnLine = {
  speciesId: string;
  orderedQty: number;
  deliveredQty: string;
  returnedDeadQty: string;
  returnedMutilatedQty: string;
  returnedNotWantedQty: string;
};

type CompletionStep = "returns" | "receipt" | "done";

// ── Helpers ───────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const DELIVERY_COLORS: Record<string, React.CSSProperties> = {
  Open:           { background: "rgba(234,179,8,0.12)",  color: "#713f12", border: "1px solid rgba(234,179,8,0.4)" },
  OutForDelivery: { background: "rgba(37,99,235,0.1)",  color: "#1e3a8a", border: "1px solid rgba(37,99,235,0.3)" },
  Delivered:      { background: "rgba(34,197,94,0.1)",  color: "#14532d", border: "1px solid rgba(34,197,94,0.3)" },
};

const CR_COLORS: Record<string, React.CSSProperties> = {
  Pending:   { background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1" },
  Loading:   { background: "rgba(234,179,8,0.12)", color: "#713f12", border: "1px solid rgba(234,179,8,0.4)" },
  InTransit: { background: "rgba(37,99,235,0.1)", color: "#1e3a8a", border: "1px solid rgba(37,99,235,0.3)" },
};

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, color, sub }: {
  icon: string; label: string; value: number | string; color: string; sub?: string;
}) {
  return (
    <div style={{ ...s.kpiCard, borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 32, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={s.kpiLabel}>{label}</div>
      {sub && <div style={s.kpiSub}>{sub}</div>}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHead({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={s.sectionHead}>
      <span style={{ fontSize: 22 }}>{icon}</span>
      <span style={s.sectionTitle}>{title}</span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DriverDashboardPage() {
  const profile = getProfileFromIdToken();
  const driverId = profile?.username ?? "";

  // ── Delivery order state ──────────────────────────────────────────────────

  const [orders, setOrders] = useState<DeliveryOrderResponse[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [speciesList, setSpeciesList] = useState<SpeciesResponse[]>([]);

  // Completion flow
  const [completing, setCompleting] = useState<DeliveryOrderResponse | null>(null);
  const [step, setStep] = useState<CompletionStep>("returns");
  const [returnLines, setReturnLines] = useState<ReturnLine[]>([]);
  const [paymentType, setPaymentType] = useState<PaymentType>("Cash");
  const [completionBusy, setCompletionBusy] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [createdInvoiceId, setCreatedInvoiceId] = useState<string | null>(null);
  const [whatsAppError, setWhatsAppError] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [receiptDone, setReceiptDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [clientHasPhone, setClientHasPhone] = useState(true);
  const [clientPhone, setClientPhone] = useState("");

  // ── Petty cash state ─────────────────────────────────────────────────────

  const [pettyCashEntries, setPettyCashEntries] = useState<PettyCashEntryDto[]>([]);
  const [loadingPettyCash, setLoadingPettyCash] = useState(true);
  const [slipUploadEntry, setSlipUploadEntry] = useState<PettyCashEntryDto | null>(null);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipUploading, setSlipUploading] = useState(false);
  const [slipDone, setSlipDone] = useState(false);
  const [slipError, setSlipError] = useState<string | null>(null);
  const slipInputRef = useRef<HTMLInputElement>(null);

  // ── Collection request state ──────────────────────────────────────────────

  const [collections, setCollections] = useState<CollectionRequestDto[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(true);
  const [collectionsError, setCollectionsError] = useState<string | null>(null);
  const [expandedCrId, setExpandedCrId] = useState<string | null>(null);
  const [loadingCrItem, setLoadingCrItem] = useState<CollectionRequestDto | null>(null);
  const [loadLines, setLoadLines] = useState<{ speciesId: string; loadedQty: number; loadingNotes: string }[]>([]);
  const [crBusy, setCrBusy] = useState(false);
  const [crError, setCrError] = useState<string | null>(null);
  const [deliveryNoteFile, setDeliveryNoteFile] = useState<File | null>(null);
  const deliveryNoteInputRef = useRef<HTMLInputElement>(null);

  // ── Data loading ─────────────────────────────────────────────────────────

  async function loadOrders() {
    if (!driverId) return;
    setOrdersError(null);
    setLoadingOrders(true);
    try {
      const data = await deliveryOrdersApi.list({ driverId });
      setOrders(data.filter(o => o.status !== "Delivered"));
    } catch (e: any) {
      setOrdersError(e?.message || "Could not load deliveries.");
    } finally {
      setLoadingOrders(false);
    }
  }

  async function loadPettyCash() {
    if (!driverId) return;
    setLoadingPettyCash(true);
    try {
      const entries = await pettyCashApi.getMyEntries();
      setPettyCashEntries(entries.filter(e => !e.cashupId));
    } catch { /* non-fatal */ }
    finally { setLoadingPettyCash(false); }
  }

  async function loadCollections() {
    if (!driverId) return;
    setCollectionsError(null);
    setLoadingCollections(true);
    try {
      const data = await collectionRequestsApi.list({ driverId });
      setCollections(data.filter(c => ["Pending", "Loading", "InTransit"].includes(c.status)));
    } catch (e: any) {
      setCollectionsError(e?.message || "Could not load collections.");
    } finally {
      setLoadingCollections(false);
    }
  }

  async function loadSpecies() {
    if (speciesList.length > 0) return;
    try { setSpeciesList(await speciesApi.list()); } catch { /* non-fatal */ }
  }

  useEffect(() => {
    loadOrders();
    loadCollections();
    loadPettyCash();
  }, [driverId]);

  // ── Delivery actions ─────────────────────────────────────────────────────

  async function startDelivery(order: DeliveryOrderResponse) {
    setUpdatingId(order.deliveryOrderId);
    try {
      await deliveryOrdersApi.updateStatus(order.deliveryOrderId, "OutForDelivery");
      setOrders(prev => prev.map(o => o.deliveryOrderId === order.deliveryOrderId ? { ...o, status: "OutForDelivery" } : o));
      setExpandedId(order.deliveryOrderId);
    } catch (e: any) {
      setOrdersError(e?.message || "Could not update status.");
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
    setClientPhone("");
    setReturnLines(order.lines.map(l => ({
      speciesId: l.speciesId, orderedQty: l.quantity,
      deliveredQty: String(l.quantity), returnedDeadQty: "0",
      returnedMutilatedQty: "0", returnedNotWantedQty: "0",
    })));
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
    setReturnLines(prev => { const n = [...prev]; n[idx] = { ...n[idx], [field]: value }; return n; });
  }

  function validateReturns(): string | null {
    for (let i = 0; i < returnLines.length; i++) {
      const rl = returnLines[i];
      const del = parseInt(rl.deliveredQty) || 0;
      const dead = parseInt(rl.returnedDeadQty) || 0;
      const mut = parseInt(rl.returnedMutilatedQty) || 0;
      const nw = parseInt(rl.returnedNotWantedQty) || 0;
      if (del < 0 || dead < 0 || mut < 0 || nw < 0) return `Line ${i + 1}: quantities cannot be negative.`;
      if (del + dead + mut + nw !== rl.orderedQty)
        return `Line ${i + 1} (${speciesName(rl.speciesId)}): total must equal ordered (${rl.orderedQty}).`;
    }
    return null;
  }

  async function submitCompletion() {
    if (!completing) return;
    const err = validateReturns();
    if (err) { setCompletionError(err); return; }
    setCompletionError(null);
    setCompletionBusy(true);
    try {
      const lines = returnLines.map(rl => {
        const sp = (speciesList as any[]).find((s: any) => s.speciesId === rl.speciesId);
        return {
          speciesId: rl.speciesId,
          deliveredQty: parseInt(rl.deliveredQty) || 0,
          returnedDeadQty: parseInt(rl.returnedDeadQty) || 0,
          returnedMutilatedQty: parseInt(rl.returnedMutilatedQty) || 0,
          returnedNotWantedQty: parseInt(rl.returnedNotWantedQty) || 0,
          unitPrice: sp?.sellPrice ?? 0,
          vatRate: sp?.vat ?? 0,
        };
      });
      const result = await invoicesApi.createFromDelivery(completing.deliveryOrderId, { createdByDriverId: driverId, lines, clientPhone: clientPhone.trim() || undefined });
      setCreatedInvoiceId(result.invoiceId);
      setWhatsAppError((result as any).whatsAppError ?? null);
      await invoicesApi.recordPayment(result.invoiceId, paymentType);
      if (paymentType === "EFT" || paymentType === "CardMachine") {
        setStep("receipt");
      } else {
        setStep("done");
        setOrders(prev => prev.filter(o => o.deliveryOrderId !== completing.deliveryOrderId));
      }
    } catch (e: any) {
      setCompletionError(e?.message || "Could not complete delivery.");
    } finally {
      setCompletionBusy(false);
    }
  }

  async function uploadReceipt() {
    if (!createdInvoiceId || !receiptFile) return;
    setReceiptUploading(true);
    setCompletionError(null);
    try {
      const { presignedUrl } = await invoicesApi.getReceiptUploadUrl(createdInvoiceId);
      await fetch(presignedUrl, { method: "PUT", body: receiptFile, headers: { "Content-Type": "image/jpeg" } });
      setReceiptDone(true);
      setStep("done");
      setOrders(prev => prev.filter(o => o.deliveryOrderId !== completing?.deliveryOrderId));
    } catch (e: any) {
      setCompletionError(e?.message || "Could not upload receipt.");
    } finally {
      setReceiptUploading(false);
    }
  }

  function skipReceipt() {
    setStep("done");
    setOrders(prev => prev.filter(o => o.deliveryOrderId !== completing?.deliveryOrderId));
  }

  function speciesName(id: string) {
    return (speciesList as any[]).find((s: any) => s.speciesId === id)?.name ?? id.slice(0, 8) + "…";
  }

  // ── Petty cash slip upload ────────────────────────────────────────────────

  async function uploadSlip() {
    if (!slipUploadEntry || !slipFile) return;
    setSlipUploading(true);
    setSlipError(null);
    try {
      const { uploadUrl, s3Key } = await pettyCashApi.getSlipUploadUrl(slipUploadEntry.entryId);
      await fetch(uploadUrl, { method: "PUT", body: slipFile, headers: { "Content-Type": "image/jpeg" } });
      const updated = await pettyCashApi.confirmSlipUploaded(slipUploadEntry.entryId, s3Key);
      setPettyCashEntries(prev => prev.map(e => e.entryId === updated.entryId ? updated : e));
      setSlipDone(true);
    } catch (e: any) {
      setSlipError(e?.message || "Could not upload slip.");
    } finally {
      setSlipUploading(false);
    }
  }

  // ── Collection actions ───────────────────────────────────────────────────

  function openCrLoadModal(cr: CollectionRequestDto) {
    setLoadingCrItem(cr);
    setLoadLines(cr.lines.map(l => ({
      speciesId: l.speciesId,
      loadedQty: l.loadedQty || l.orderedQty,
      loadingNotes: l.loadingNotes || "",
    })));
    setCrError(null);
    setDeliveryNoteFile(null);
  }

  async function saveCrLoad(dispatch: boolean) {
    if (!loadingCrItem) return;
    setCrBusy(true);
    try {
      // Upload delivery note photo first if one was selected
      if (deliveryNoteFile) {
        const { uploadUrl } = await collectionRequestsApi.getDeliveryNoteUploadUrl(loadingCrItem.collectionRequestId);
        await fetch(uploadUrl, {
          method: "PUT",
          body: deliveryNoteFile,
          headers: { "Content-Type": "image/jpeg" },
        });
      }
      let updated = await collectionRequestsApi.driverLoad(loadingCrItem.collectionRequestId, loadLines);
      if (dispatch) updated = await collectionRequestsApi.dispatch(loadingCrItem.collectionRequestId);
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

  async function handleArrive(id: string) {
    setCrBusy(true);
    try {
      await collectionRequestsApi.arrive(id);
      setCollections(cs => cs.filter(c => c.collectionRequestId !== id));
    } catch (e: any) {
      setCollectionsError(e?.message || "Could not update status.");
    } finally {
      setCrBusy(false);
    }
  }

  // ── Derived KPI values ───────────────────────────────────────────────────

  function isFutureCollection(cr: CollectionRequestDto): boolean {
    if (!cr.collectionDate) return false;
    const due = new Date(cr.collectionDate);
    due.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return due > now;
  }

  const openDeliveries    = orders.filter(o => o.status === "Open").length;
  const outForDelivery    = orders.filter(o => o.status === "OutForDelivery").length;
  const pendingCollections = collections.filter(c => c.status === "Pending" && !isFutureCollection(c)).length;
  const inProgressCollections = collections.filter(c => c.status === "Loading" || c.status === "InTransit").length;
  const activeOrders = orders.filter(o => o.status === "Open" || o.status === "OutForDelivery");
  const today = new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={s.page}>

      {/* ── Page header ── */}
      <div style={s.pageHeader}>
        <div style={s.pageTitle}>{greeting()}{profile?.username ? `, ${profile.username}` : ""} 👋</div>
        <div style={s.pageSub}>{today}</div>
        <button style={s.refreshBtn} onClick={() => { loadOrders(); loadCollections(); loadPettyCash(); }}>
          Refresh
        </button>
      </div>

      {/* ── KPI cards ── */}
      <div style={s.kpiGrid}>
        <KpiCard icon="📋" label="Open Deliveries"    value={openDeliveries}         color="#f59e0b" />
        <KpiCard icon="🚚" label="Out for Delivery"   value={outForDelivery}          color="#2563eb" />
        <KpiCard icon="📦" label="Pending Collections" value={pendingCollections}     color="#7c3aed" />
        <KpiCard icon="🔄" label="In Progress"        value={inProgressCollections}   color="#0891b2"
          sub="Loading / In Transit" />
      </div>

      {/* ══════════════════════════════════════════ DELIVERIES */}
      <SectionHead icon="🚚" title="My Deliveries" />

      {ordersError && <div style={s.error}>{ordersError}</div>}

      {loadingOrders ? (
        <div style={s.emptyCard}>Loading deliveries…</div>
      ) : activeOrders.length === 0 ? (
        <div style={s.emptyCard}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>✓</div>
          <div style={{ fontWeight: 900 }}>No active deliveries</div>
          <div style={{ color: "#64748b", marginTop: 4, fontSize: 14 }}>You're all caught up!</div>
        </div>
      ) : (
        <div style={s.list}>
          {activeOrders.map(order => {
            const expanded = expandedId === order.deliveryOrderId;
            const isOFD = order.status === "OutForDelivery";
            const busy = updatingId === order.deliveryOrderId;
            return (
              <div key={order.deliveryOrderId} style={s.card}>
                <div style={s.cardHead} onClick={() => setExpandedId(expanded ? null : order.deliveryOrderId)}>
                  <div style={{ flex: 1 }}>
                    <div style={s.cardTitle}>
                      {order.deliveryAddressLine1 || order.city || "Delivery"}
                      <span style={{ ...s.badge, ...DELIVERY_COLORS[order.status] }}>
                        {order.status === "OutForDelivery" ? "Out for Delivery" : order.status}
                      </span>
                    </div>
                    <div style={s.cardMeta}>
                      {order.city && <><span>{order.city}</span><span style={s.dot}>·</span></>}
                      <span>{order.lines.length} item{order.lines.length !== 1 ? "s" : ""}</span>
                      <span style={s.dot}>·</span>
                      <span style={s.mono}>{order.deliveryOrderId.slice(0, 8)}…</span>
                    </div>
                  </div>
                  <span style={s.chevron}>{expanded ? "▲" : "▼"}</span>
                </div>

                {expanded && (
                  <div style={s.cardBody}>
                    {order.deliveryAddressLine1 && (
                      <div style={s.detailRow}><span style={s.dk}>Address</span><span>{order.deliveryAddressLine1}</span></div>
                    )}
                    {order.city && (
                      <div style={s.detailRow}><span style={s.dk}>City</span><span>{order.city}</span></div>
                    )}
                    <div style={s.itemsHead}>Items</div>
                    {order.lines.map((l, i) => (
                      <div key={i} style={s.lineRow}>
                        <span style={{ fontWeight: 700 }}>{speciesName(l.speciesId)}</span>
                        <span style={s.lineQty}>{l.quantity}</span>
                      </div>
                    ))}
                    <div style={s.actions}>
                      {!isOFD && (
                        <button style={s.startBtn} onClick={() => startDelivery(order)} disabled={busy}>
                          {busy ? "Updating…" : "🚚 Start Delivery"}
                        </button>
                      )}
                      {isOFD && (
                        <button style={s.completeBtn} onClick={() => openCompletion(order)} disabled={busy}>
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

      {/* ══════════════════════════════════════════ COLLECTIONS */}
      <SectionHead icon="📦" title="My Collections" />

      {collectionsError && <div style={s.error}>{collectionsError}</div>}

      {loadingCollections ? (
        <div style={s.emptyCard}>Loading collections…</div>
      ) : collections.length === 0 ? (
        <div style={s.emptyCard}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>📦</div>
          <div style={{ fontWeight: 900 }}>No active collections</div>
          <div style={{ color: "#64748b", marginTop: 4, fontSize: 14 }}>Nothing to collect right now</div>
        </div>
      ) : (
        <div style={s.list}>
          {collections.map(cr => {
            const expanded = expandedCrId === cr.collectionRequestId;
            const future = isFutureCollection(cr);
            const dueDateStr = cr.collectionDate ? new Date(cr.collectionDate).toLocaleDateString("en-ZA") : null;
            return (
              <div key={cr.collectionRequestId} style={{ ...s.card, ...(future ? { opacity: 0.6, background: "#f8fafc" } : {}) }}>
                <div style={s.cardHead} onClick={() => setExpandedCrId(expanded ? null : cr.collectionRequestId)}>
                  <div style={{ flex: 1 }}>
                    <div style={s.cardTitle}>
                      {cr.supplierName || "Collection"}
                      {future ? (
                        <span style={{ ...s.badge, background: "rgba(100,116,139,0.12)", color: "#475569", border: "1px solid #cbd5e1" }}>
                          📅 Due {dueDateStr}
                        </span>
                      ) : (
                        <span style={{ ...s.badge, ...CR_COLORS[cr.status] }}>{cr.status}</span>
                      )}
                    </div>
                    <div style={s.cardMeta}>
                      <span>{cr.lines.length} species</span>
                      <span style={s.dot}>·</span>
                      <span style={s.mono}>CR-{cr.collectionRequestId.split("-")[0].toUpperCase()}</span>
                      {future && <><span style={s.dot}>·</span><span style={{ color: "#64748b" }}>Not yet available</span></>}
                      {!future && cr.notes && <><span style={s.dot}>·</span><span style={{ fontStyle: "italic" }}>{cr.notes}</span></>}
                    </div>
                  </div>
                  <span style={s.chevron}>{expanded ? "▲" : "▼"}</span>
                </div>

                {expanded && (
                  <div style={s.cardBody}>
                    {future && (
                      <div style={{ background: "rgba(100,116,139,0.08)", border: "1px solid #cbd5e1", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#475569" }}>
                        🔒 This collection is scheduled for <strong>{dueDateStr}</strong> and will become active on that date.
                      </div>
                    )}
                    <div style={s.crGrid}>
                      {cr.lines.map(l => (
                        <div key={l.speciesId} style={s.crLineCard}>
                          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{l.speciesName || l.speciesId}</div>
                          <div style={{ display: "flex", gap: 16 }}>
                            <span><span style={s.crStat}>Ordered</span><br /><strong>{l.orderedQty}</strong></span>
                            <span>
                              <span style={s.crStat}>Loaded</span><br />
                              <strong style={{ color: l.loadedQty > 0 ? "#16a34a" : "#94a3b8" }}>{l.loadedQty}</strong>
                            </span>
                          </div>
                          {l.loadingNotes ? <div style={{ fontSize: 11, color: "#92400e", marginTop: 4 }}>⚠ {l.loadingNotes}</div> : null}
                        </div>
                      ))}
                    </div>
                    {!future && (
                      <div style={s.actions}>
                        {(cr.status === "Pending" || cr.status === "Loading") && (
                          <button style={s.startBtn} onClick={() => openCrLoadModal(cr)}>
                            {cr.status === "Loading" ? "✏️ Update Loading" : "📦 Start Loading"}
                          </button>
                        )}
                        {cr.status === "InTransit" && (
                          <button style={s.completeBtn} onClick={() => handleArrive(cr.collectionRequestId)} disabled={crBusy}>
                            🏠 Mark Arrived at Hub
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════ DELIVERY COMPLETION MODAL */}
      {completing && (
        <div style={s.backdrop}>
          <div style={s.modal}>
            {step === "returns" && (
              <>
                <div style={s.modalTitle}>Complete Delivery</div>
                <div style={s.modalSub}>{completing.deliveryAddressLine1}{completing.city ? ` · ${completing.city}` : ""}</div>
                {completionError && <div style={s.modalError}>{completionError}</div>}
                <div style={s.stepNote}>Enter actual quantities delivered and any returns.</div>
                {returnLines.map((rl, idx) => {
                  const del = parseInt(rl.deliveredQty) || 0;
                  const dead = parseInt(rl.returnedDeadQty) || 0;
                  const mut = parseInt(rl.returnedMutilatedQty) || 0;
                  const nw = parseInt(rl.returnedNotWantedQty) || 0;
                  const acc = del + dead + mut + nw;
                  const ok = acc === rl.orderedQty;
                  return (
                    <div key={rl.speciesId} style={s.returnBlock}>
                      <div style={s.returnSpecies}>
                        {speciesName(rl.speciesId)}
                        <span style={s.returnOrdered}>Ordered: {rl.orderedQty}</span>
                        <span style={ok ? s.returnOk : s.returnBad}>{ok ? `✓ ${acc}/${rl.orderedQty}` : `${acc}/${rl.orderedQty}`}</span>
                      </div>
                      <div style={s.returnFields}>
                        {(["deliveredQty", "returnedDeadQty", "returnedMutilatedQty", "returnedNotWantedQty"] as const).map((field, fi) => (
                          <label key={field} style={s.returnLabel}>
                            {["Delivered", "Dead", "Mutilated", "Not Wanted"][fi]}
                            <input style={s.returnInput} inputMode="numeric"
                              value={(rl as any)[field]}
                              onChange={e => updateReturnLine(idx, field, e.target.value)}
                              disabled={completionBusy}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <div style={s.paySection}>
                  <div style={s.payHead}>Payment Method</div>
                  <div style={s.payGrid}>
                    {(["Cash", "EFT", "CardMachine", "Credit"] as PaymentType[]).map(pt => (
                      <button key={pt}
                        style={{ ...s.payBtn, ...(paymentType === pt ? s.payBtnActive : {}) }}
                        onClick={() => setPaymentType(pt)} disabled={completionBusy}
                      >
                        {pt === "Cash" ? "💵 Cash" : pt === "EFT" ? "📱 EFT" : pt === "CardMachine" ? "💳 Card Machine" : "📋 Credit"}
                      </button>
                    ))}
                  </div>
                  {(paymentType === "EFT" || paymentType === "CardMachine") && (
                    <div style={s.payNote}>You'll be prompted to take a photo of the receipt.</div>
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
                  <button style={s.completeBtn} onClick={submitCompletion} disabled={completionBusy}>
                    {completionBusy ? "Processing…" : "Confirm Delivery"}
                  </button>
                </div>
              </>
            )}

            {step === "receipt" && (
              <>
                <div style={s.modalTitle}>{paymentType === "CardMachine" ? "Upload Card Machine Slip" : "Upload EFT Receipt"}</div>
                <div style={s.modalSub}>Take a photo of the payment receipt.</div>
                {completionError && <div style={s.modalError}>{completionError}</div>}
                <div style={{ margin: "14px 0" }}>
                  {receiptFile ? (
                    <div style={{ display: "grid", gap: 10 }}>
                      <img src={URL.createObjectURL(receiptFile)} alt="Receipt" style={{ width: "100%", borderRadius: 10, maxHeight: 280, objectFit: "cover" }} />
                      <button style={s.secondaryBtn} onClick={() => fileInputRef.current?.click()}>Change Photo</button>
                    </div>
                  ) : (
                    <button style={s.cameraBtn} onClick={() => fileInputRef.current?.click()}>
                      <div style={{ fontSize: 36 }}>📷</div>
                      <div style={{ fontWeight: 900, marginTop: 8 }}>Take Photo of Receipt</div>
                      <div style={{ opacity: 0.6, fontSize: 13, marginTop: 4 }}>Or select from gallery</div>
                    </button>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
                    style={{ display: "none" }} onChange={e => setReceiptFile(e.target.files?.[0] ?? null)} />
                </div>
                <div style={s.modalBtns}>
                  <button style={s.secondaryBtn} onClick={skipReceipt} disabled={receiptUploading}>Skip for now</button>
                  <button style={s.completeBtn} onClick={uploadReceipt} disabled={!receiptFile || receiptUploading}>
                    {receiptUploading ? "Uploading…" : "Upload & Finish"}
                  </button>
                </div>
              </>
            )}

            {step === "done" && (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
                <div style={s.modalTitle}>Delivery Complete!</div>
                {createdInvoiceId && <div style={{ ...s.modalSub, marginBottom: 4 }}>Invoice created</div>}
                <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, color: "#64748b" }}>{createdInvoiceId}</div>
                {paymentType === "EFT" && receiptDone && <div style={{ marginTop: 8, color: "#16a34a", fontWeight: 700 }}>Receipt uploaded ✓</div>}
                {whatsAppError
                  ? <div style={{ marginTop: 8, fontSize: 12, color: "#dc2626" }}>⚠ WhatsApp not sent: {whatsAppError}</div>
                  : <div style={{ marginTop: 8, fontSize: 12, color: "#16a34a", fontWeight: 600 }}>📱 Invoice sent via WhatsApp ✓</div>
                }
                <button style={{ ...s.completeBtn, marginTop: 20 }} onClick={closeCompletion}>Back to dashboard</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════ PETTY CASH */}
      {!loadingPettyCash && pettyCashEntries.length > 0 && (
        <>
          <SectionHead icon="💵" title="My Cash Allocations" />
          <div style={s.list}>
            {pettyCashEntries.map(e => (
              <div key={e.entryId} style={s.card}>
                <div style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a", marginBottom: 4 }}>{e.description}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{e.category} · {e.entryDate}</div>
                      {e.recordedBy && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Issued by: {e.recordedBy}</div>}
                    </div>
                    <div style={{ textAlign: "right" as const }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color: "#ef4444" }}>R {e.amount.toFixed(2)}</div>
                      {e.slipS3Key ? (
                        <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>✓ Slip Uploaded</span>
                      ) : (
                        <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 600 }}>Slip Required</span>
                      )}
                    </div>
                  </div>
                  {!e.slipS3Key && (
                    <button
                      style={{ ...s.startBtn, marginTop: 10, width: "100%", fontSize: 14 }}
                      onClick={() => { setSlipUploadEntry(e); setSlipFile(null); setSlipDone(false); setSlipError(null); }}
                    >
                      📷 Upload Petrol / Expense Slip
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════ SLIP UPLOAD MODAL */}
      {slipUploadEntry && (
        <div style={s.backdrop}>
          <div style={s.modal}>
            {slipDone ? (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                <div style={s.modalTitle}>Slip Uploaded!</div>
                <div style={s.modalSub}>{slipUploadEntry.description}</div>
                <button style={{ ...s.completeBtn, marginTop: 20 }} onClick={() => setSlipUploadEntry(null)}>
                  Done
                </button>
              </div>
            ) : (
              <>
                <div style={s.modalTitle}>Upload Expense Slip</div>
                <div style={s.modalSub}>{slipUploadEntry.description} · R {slipUploadEntry.amount.toFixed(2)}</div>
                {slipError && <div style={s.modalError}>{slipError}</div>}
                <div style={{ margin: "14px 0" }}>
                  {slipFile ? (
                    <div style={{ display: "grid", gap: 10 }}>
                      <img src={URL.createObjectURL(slipFile)} alt="Slip" style={{ width: "100%", borderRadius: 10, maxHeight: 280, objectFit: "cover" }} />
                      <button style={s.secondaryBtn} onClick={() => slipInputRef.current?.click()}>Change Photo</button>
                    </div>
                  ) : (
                    <button style={s.cameraBtn} onClick={() => slipInputRef.current?.click()}>
                      <div style={{ fontSize: 36 }}>📷</div>
                      <div style={{ fontWeight: 900, marginTop: 8 }}>Take Photo of Slip</div>
                      <div style={{ opacity: 0.6, fontSize: 13, marginTop: 4 }}>Petrol / expense receipt</div>
                    </button>
                  )}
                  <input
                    ref={slipInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: "none" }}
                    onChange={e => setSlipFile(e.target.files?.[0] ?? null)}
                  />
                </div>
                <div style={s.modalBtns}>
                  <button style={s.secondaryBtn} onClick={() => setSlipUploadEntry(null)} disabled={slipUploading}>Cancel</button>
                  <button style={s.completeBtn} onClick={uploadSlip} disabled={!slipFile || slipUploading}>
                    {slipUploading ? "Uploading…" : "Upload Slip"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════ CR LOADING MODAL */}
      {loadingCrItem && (
        <div style={s.backdrop}>
          <div style={s.modal}>
            <div style={s.modalTitle}>Load Stock</div>
            <div style={s.modalSub}>{loadingCrItem.supplierName} · {loadingCrItem.lines.length} species</div>
            {crError && <div style={s.modalError}>{crError}</div>}
            <div style={s.stepNote}>Enter the quantity you are loading onto your vehicle for each species.</div>
            {loadLines.map((ll, i) => {
              const orig = loadingCrItem.lines[i];
              return (
                <div key={ll.speciesId} style={s.returnBlock}>
                  <div style={s.returnSpecies}>
                    {orig?.speciesName || ll.speciesId}
                    <span style={s.returnOrdered}>Ordered: {orig?.orderedQty}</span>
                  </div>
                  <div style={s.returnFields}>
                    <label style={s.returnLabel}>
                      Loaded Qty
                      <input style={s.returnInput} inputMode="numeric" value={ll.loadedQty}
                        onChange={e => setLoadLines(ls => ls.map((x, j) => j === i ? { ...x, loadedQty: parseInt(e.target.value) || 0 } : x))}
                        disabled={crBusy}
                      />
                    </label>
                    <label style={s.returnLabel}>
                      Notes (if short)
                      <input style={{ ...s.returnInput, fontSize: 13, textAlign: "left" as const, padding: "10px 8px" }}
                        value={ll.loadingNotes} placeholder="Reason if not full qty"
                        onChange={e => setLoadLines(ls => ls.map((x, j) => j === i ? { ...x, loadingNotes: e.target.value } : x))}
                        disabled={crBusy}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
              {/* Delivery note / invoice photo upload */}
            <div style={s.dnSection}>
              <div style={s.dnLabel}>📄 Delivery Note / Supplier Invoice <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></div>
              {deliveryNoteFile ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <img
                    src={URL.createObjectURL(deliveryNoteFile)}
                    alt="Delivery note"
                    style={{ width: "100%", borderRadius: 10, maxHeight: 220, objectFit: "cover" }}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={{ ...s.secondaryBtn, flex: 1, fontSize: 13 }} onClick={() => deliveryNoteInputRef.current?.click()} disabled={crBusy}>
                      📷 Retake
                    </button>
                    <button style={{ ...s.secondaryBtn, flex: 1, fontSize: 13, color: "#ef4444" }} onClick={() => setDeliveryNoteFile(null)} disabled={crBusy}>
                      ✕ Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button style={s.dnCameraBtn} onClick={() => deliveryNoteInputRef.current?.click()} disabled={crBusy}>
                  <div style={{ fontSize: 28 }}>📷</div>
                  <div style={{ fontWeight: 700, marginTop: 6, fontSize: 14 }}>Take Photo of Delivery Note</div>
                  <div style={{ opacity: 0.55, fontSize: 12, marginTop: 3 }}>Or select from gallery</div>
                </button>
              )}
              <input
                ref={deliveryNoteInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={e => setDeliveryNoteFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div style={s.modalBtns}>
              <button style={s.secondaryBtn} onClick={() => setLoadingCrItem(null)} disabled={crBusy}>Cancel</button>
              <button style={{ ...s.secondaryBtn, color: "#16a34a", border: "1px solid #16a34a" }}
                onClick={() => saveCrLoad(false)} disabled={crBusy}>Save Progress</button>
              <button style={s.completeBtn} onClick={() => saveCrLoad(true)} disabled={crBusy}>
                {crBusy ? "…" : "Dispatch 🚛"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { padding: "20px 16px", fontFamily: "system-ui, -apple-system, sans-serif", maxWidth: 720, margin: "0 auto" },

  pageHeader: { marginBottom: 24, position: "relative" },
  pageTitle:  { fontSize: 22, fontWeight: 900, color: "#0f172a" },
  pageSub:    { fontSize: 13, color: "#64748b", marginTop: 3 },
  refreshBtn: {
    position: "absolute", top: 0, right: 0,
    padding: "8px 16px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)",
    background: "white", fontWeight: 700, cursor: "pointer", fontSize: 13,
  },

  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 12,
    marginBottom: 28,
  },
  kpiCard: {
    background: "#ffffff",
    borderRadius: 12,
    padding: "16px 18px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  },
  kpiLabel: { fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginTop: 6 },
  kpiSub:   { fontSize: 11, color: "#94a3b8", marginTop: 3 },

  sectionHead: {
    display: "flex", alignItems: "center", gap: 10,
    marginBottom: 12, paddingBottom: 10, borderBottom: "2px solid #e2e8f0",
    marginTop: 4,
  },
  sectionTitle: { fontSize: 17, fontWeight: 900, color: "#0f172a" },

  error: { padding: 12, borderRadius: 10, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)", color: "#7f1d1d", marginBottom: 10 },

  emptyCard: {
    padding: 28, borderRadius: 14, border: "1px solid rgba(0,0,0,0.1)",
    background: "white", textAlign: "center", fontSize: 15, marginBottom: 20,
  },

  list: { display: "grid", gap: 12, marginBottom: 24 },

  card:     { borderRadius: 14, border: "1px solid rgba(0,0,0,0.12)", background: "white", overflow: "hidden" },
  cardHead: { display: "flex", alignItems: "center", gap: 10, padding: "16px", cursor: "pointer" },
  cardTitle: { fontWeight: 900, fontSize: 15, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  badge:    { fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999 },
  cardMeta: { marginTop: 4, fontSize: 13, color: "rgba(0,0,0,0.5)", fontWeight: 600, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" },
  dot:      { opacity: 0.4 },
  mono:     { fontFamily: "ui-monospace, monospace", fontSize: 12 },
  chevron:  { fontSize: 12, opacity: 0.4, flexShrink: 0 },

  cardBody:  { padding: "12px 16px 16px", borderTop: "1px solid rgba(0,0,0,0.07)" },
  detailRow: { display: "flex", gap: 8, marginBottom: 4, fontSize: 14 },
  dk:        { fontWeight: 800, minWidth: 80 },
  itemsHead: { fontWeight: 900, fontSize: 11, textTransform: "uppercase" as const, letterSpacing: 0.6, color: "rgba(0,0,0,0.45)", marginTop: 10, marginBottom: 8 },
  lineRow:   { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,0.06)", fontSize: 14 },
  lineQty:   { fontWeight: 900, fontSize: 16, color: "#2563eb" },
  actions:   { marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" },

  startBtn:    { flex: 1, padding: "13px", borderRadius: 10, border: "1px solid rgba(37,99,235,0.3)", background: "rgba(37,99,235,0.08)", color: "#1d4ed8", fontWeight: 900, fontSize: 14, cursor: "pointer" },
  completeBtn: { flex: 1, padding: "13px", borderRadius: 10, border: "none", background: "#16a34a", color: "white", fontWeight: 900, fontSize: 14, cursor: "pointer" },
  secondaryBtn:{ padding: "11px 14px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", cursor: "pointer", fontWeight: 700, background: "white", fontSize: 13 },

  // Collection line cards
  crGrid:     { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, marginBottom: 12 },
  crLineCard: { background: "#f8fafc", borderRadius: 8, padding: "8px 10px", border: "1px solid #e2e8f0" },
  crStat:     { fontSize: 10, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 0.4 },

  // Modals
  backdrop: { position: "fixed", inset: 0, background: "rgba(248,250,252,0.8)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 16px 40px", zIndex: 100, overflowY: "auto" },
  modal:    { width: "100%", maxWidth: 560, background: "white", borderRadius: 20, padding: 20, border: "1px solid rgba(0,0,0,0.1)", marginTop: 8, boxSizing: "border-box" as const },
  modalTitle: { fontSize: 20, fontWeight: 900, marginBottom: 4 },
  modalSub:   { fontSize: 14, color: "#64748b", marginBottom: 14 },
  modalError: { padding: 12, borderRadius: 10, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)", color: "#7f1d1d", marginBottom: 12, fontSize: 14 },
  modalBtns:  { display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end", flexWrap: "wrap" },

  stepNote: { fontSize: 13, color: "rgba(0,0,0,0.55)", marginBottom: 12, padding: "10px 12px", background: "rgba(37,99,235,0.05)", borderRadius: 10, border: "1px solid rgba(37,99,235,0.15)" },

  returnBlock:   { marginBottom: 14, padding: 14, borderRadius: 12, border: "1px solid rgba(0,0,0,0.1)", background: "#fafafa" },
  returnSpecies: { fontWeight: 900, fontSize: 14, marginBottom: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  returnOrdered: { fontSize: 11, fontWeight: 700, opacity: 0.55, background: "rgba(0,0,0,0.06)", padding: "2px 8px", borderRadius: 999 },
  returnOk:  { fontSize: 11, fontWeight: 700, background: "rgba(34,197,94,0.12)", color: "#14532d", border: "1px solid rgba(34,197,94,0.3)", padding: "2px 8px", borderRadius: 999 },
  returnBad: { fontSize: 11, fontWeight: 700, background: "rgba(239,68,68,0.1)", color: "#7f1d1d", border: "1px solid rgba(239,68,68,0.3)", padding: "2px 8px", borderRadius: 999 },
  returnFields: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 },
  returnLabel:  { display: "grid", gap: 4, fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: 0.4, color: "rgba(0,0,0,0.55)" },
  returnInput:  { width: "100%", boxSizing: "border-box" as const, padding: "10px 8px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", fontSize: 16, fontWeight: 900, textAlign: "center" as const, background: "white" },

  paySection: { marginTop: 16 },
  payHead:    { fontWeight: 900, fontSize: 12, textTransform: "uppercase" as const, letterSpacing: 0.5, color: "rgba(0,0,0,0.5)", marginBottom: 10 },
  payGrid:    { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 },
  payBtn:     { padding: "14px 10px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.15)", background: "white", fontWeight: 800, fontSize: 14, cursor: "pointer" },
  payBtnActive: { border: "2px solid #2563eb", background: "rgba(37,99,235,0.08)", color: "#1d4ed8" },
  payNote:    { marginTop: 8, fontSize: 13, color: "rgba(0,0,0,0.55)", fontStyle: "italic" },

  cameraBtn: { width: "100%", padding: "32px 20px", borderRadius: 16, border: "2px dashed rgba(37,99,235,0.3)", background: "rgba(37,99,235,0.04)", cursor: "pointer", textAlign: "center" as const, color: "#1d4ed8" },

  // Delivery note upload
  dnSection: {
    marginTop: 16,
    padding: "14px",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
  },
  dnLabel: {
    fontSize: 13,
    fontWeight: 800,
    color: "#334155",
    marginBottom: 10,
  },
  dnCameraBtn: {
    width: "100%",
    padding: "20px",
    borderRadius: 12,
    border: "2px dashed #cbd5e1",
    background: "white",
    cursor: "pointer",
    textAlign: "center" as const,
    color: "#475569",
  },
};
