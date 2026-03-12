import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearAuth, getProfileFromIdToken } from "../api/auth";
import { deliveryOrdersApi, type DeliveryOrderResponse } from "../api/deliveryOrdersApi";
import { speciesApi, type SpeciesResponse } from "../api/speciesApi";
import { invoicesApi } from "../api/invoicesApi";

// ── Types ──────────────────────────────────────────────────────────────────

type PaymentType = "Cash" | "EFT" | "Credit";

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

function money(n: number) {
  return `R ${n.toFixed(2)}`;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function DriverPage() {
  const nav = useNavigate();
  const profile = getProfileFromIdToken();
  const driverId = profile?.username ?? "";

  // Queue state
  const [orders, setOrders] = useState<DeliveryOrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Reference data
  const [speciesList, setSpeciesList] = useState<SpeciesResponse[]>([]);

  // Completion flow
  const [completing, setCompleting] = useState<DeliveryOrderResponse | null>(null);
  const [step, setStep] = useState<CompletionStep>("returns");
  const [returnLines, setReturnLines] = useState<ReturnLine[]>([]);
  const [paymentType, setPaymentType] = useState<PaymentType>("Cash");
  const [completionBusy, setCompletionBusy] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [createdInvoiceId, setCreatedInvoiceId] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [receiptDone, setReceiptDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Loaders ────────────────────────────────────────────────────────────────

  async function loadOrders() {
    if (!driverId) return;
    try {
      setQueueError(null);
      setLoading(true);
      const data = await deliveryOrdersApi.list({ driverId });
      // Only show active orders (not already delivered)
      setOrders(data.filter((o) => o.status !== "Delivered"));
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
      // non-fatal — pricing will fall back to 0
    }
  }

  useEffect(() => {
    loadOrders();
  }, [driverId]);

  // ── Actions ────────────────────────────────────────────────────────────────

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

  // ── Invoice preview calculation ────────────────────────────────────────────

  const invoicePreview = useMemo(() => {
    if (!completing) return null;
    let subTotal = 0;
    let vatTotal = 0;
    for (const rl of returnLines) {
      const delivered = parseInt(rl.deliveredQty) || 0;
      if (delivered <= 0) continue;
      const sp = (speciesList as any[]).find((s: any) => s.speciesId === rl.speciesId);
      const price = sp?.sellPrice ?? 0;
      const vatRate = sp?.vat ?? 0;
      const lineNet = delivered * price;
      const lineVat = lineNet * vatRate;
      subTotal += lineNet;
      vatTotal += lineVat;
    }
    return { subTotal, vatTotal, grandTotal: subTotal + vatTotal };
  }, [returnLines, speciesList, completing]);

  // ── Validation ─────────────────────────────────────────────────────────────

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
    if (validationError) {
      setCompletionError(validationError);
      return;
    }

    try {
      setCompletionError(null);
      setCompletionBusy(true);

      const lines = returnLines.map((rl) => {
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

      const result = await invoicesApi.createFromDelivery(completing.deliveryOrderId, {
        createdByDriverId: driverId,
        lines,
      });

      const invoiceId = result.invoiceId;
      setCreatedInvoiceId(invoiceId);

      await invoicesApi.recordPayment(invoiceId, paymentType);

      if (paymentType === "EFT") {
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

      await fetch(presignedUrl, {
        method: "PUT",
        body: receiptFile,
        headers: { "Content-Type": "image/jpeg" },
      });

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

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getSpeciesName(speciesId: string) {
    return (speciesList as any[]).find((s: any) => s.speciesId === speciesId)?.name ?? speciesId.slice(0, 8) + "…";
  }

  const activeOrders = orders.filter((o) => o.status === "Open" || o.status === "OutForDelivery");
  const outForDelivery = orders.filter((o) => o.status === "OutForDelivery");

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.title}>My Deliveries</div>
          {profile?.username && <div style={s.sub}>Logged in as {profile.username}</div>}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={s.secondaryBtn} onClick={loadOrders} disabled={loading}>
            Refresh
          </button>
          <button
            style={s.secondaryBtn}
            onClick={() => { clearAuth(); nav("/login", { replace: true }); }}
          >
            Log out
          </button>
        </div>
      </div>

      {/* Summary pills */}
      {!loading && (
        <div style={s.pillRow}>
          <div style={s.pill}>
            <span style={s.pillNum}>{orders.filter((o) => o.status === "Open").length}</span>
            <span style={s.pillLabel}>Open</span>
          </div>
          <div style={{ ...s.pill, ...STATUS_COLORS.OutForDelivery }}>
            <span style={s.pillNum}>{outForDelivery.length}</span>
            <span style={s.pillLabel}>Out for Delivery</span>
          </div>
        </div>
      )}

      {queueError && <div style={s.error}>{queueError}</div>}

      {/* Order list */}
      {loading ? (
        <div style={s.emptyCard}>Loading your deliveries…</div>
      ) : activeOrders.length === 0 ? (
        <div style={s.emptyCard}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
          <div style={{ fontWeight: 900 }}>No active deliveries</div>
          <div style={{ opacity: 0.6, marginTop: 4 }}>You're all caught up!</div>
        </div>
      ) : (
        <div style={s.list}>
          {activeOrders.map((order) => {
            const isExpanded = expandedId === order.deliveryOrderId;
            const isOutForDelivery = order.status === "OutForDelivery";
            const isUpdating = updatingId === order.deliveryOrderId;
            return (
              <div key={order.deliveryOrderId} style={s.orderCard}>
                {/* Card header */}
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

                {/* Expanded detail */}
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
                        <button
                          style={s.startBtn}
                          onClick={() => startDelivery(order)}
                          disabled={isUpdating}
                        >
                          {isUpdating ? "Updating…" : "🚚 Start Delivery"}
                        </button>
                      )}
                      {isOutForDelivery && (
                        <button
                          style={s.completeBtn}
                          onClick={() => openCompletion(order)}
                          disabled={isUpdating}
                        >
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

      {/* ── Completion Modal ── */}
      {completing && (
        <div style={s.backdrop}>
          <div style={s.modal}>

            {/* ── Step: Returns ── */}
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
                        <label style={s.returnLabel}>
                          Delivered
                          <input
                            style={s.returnInput}
                            inputMode="numeric"
                            value={rl.deliveredQty}
                            onChange={(e) => updateReturnLine(idx, "deliveredQty", e.target.value)}
                            disabled={completionBusy}
                          />
                        </label>
                        <label style={s.returnLabel}>
                          Dead
                          <input
                            style={s.returnInput}
                            inputMode="numeric"
                            value={rl.returnedDeadQty}
                            onChange={(e) => updateReturnLine(idx, "returnedDeadQty", e.target.value)}
                            disabled={completionBusy}
                          />
                        </label>
                        <label style={s.returnLabel}>
                          Mutilated
                          <input
                            style={s.returnInput}
                            inputMode="numeric"
                            value={rl.returnedMutilatedQty}
                            onChange={(e) => updateReturnLine(idx, "returnedMutilatedQty", e.target.value)}
                            disabled={completionBusy}
                          />
                        </label>
                        <label style={s.returnLabel}>
                          Not Wanted
                          <input
                            style={s.returnInput}
                            inputMode="numeric"
                            value={rl.returnedNotWantedQty}
                            onChange={(e) => updateReturnLine(idx, "returnedNotWantedQty", e.target.value)}
                            disabled={completionBusy}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}

                {/* Invoice preview */}
                {invoicePreview && invoicePreview.grandTotal > 0 && (
                  <div style={s.preview}>
                    <div style={s.previewRow}><span>Subtotal</span><span>{money(invoicePreview.subTotal)}</span></div>
                    <div style={s.previewRow}><span>VAT</span><span>{money(invoicePreview.vatTotal)}</span></div>
                    <div style={{ ...s.previewRow, ...s.previewTotal }}><span>Total</span><span>{money(invoicePreview.grandTotal)}</span></div>
                  </div>
                )}

                {/* Payment type */}
                <div style={s.paymentSection}>
                  <div style={s.paymentHeading}>Payment Method</div>
                  <div style={s.paymentOptions}>
                    {(["Cash", "EFT", "Credit"] as PaymentType[]).map((pt) => (
                      <button
                        key={pt}
                        style={{ ...s.paymentOption, ...(paymentType === pt ? s.paymentOptionActive : {}) }}
                        onClick={() => setPaymentType(pt)}
                        disabled={completionBusy}
                      >
                        {pt === "Cash" && "💵 "}
                        {pt === "EFT" && "📱 "}
                        {pt === "Credit" && "📋 "}
                        {pt}
                      </button>
                    ))}
                  </div>
                  {paymentType === "EFT" && (
                    <div style={s.eftNote}>You'll be prompted to upload the EFT receipt after confirming.</div>
                  )}
                  {paymentType === "Credit" && (
                    <div style={s.eftNote}>Invoice will be sent to the client's account.</div>
                  )}
                </div>

                <div style={s.modalBtns}>
                  <button style={s.secondaryBtn} onClick={closeCompletion} disabled={completionBusy}>
                    Cancel
                  </button>
                  <button style={s.completeBtn} onClick={submitCompletion} disabled={completionBusy}>
                    {completionBusy ? "Processing…" : "Confirm Delivery"}
                  </button>
                </div>
              </>
            )}

            {/* ── Step: EFT Receipt ── */}
            {step === "receipt" && (
              <>
                <div style={s.modalTitle}>Upload EFT Receipt</div>
                <div style={s.modalSub}>Take a photo of the payment receipt to complete the delivery.</div>

                {completionError && <div style={s.completionError}>{completionError}</div>}

                <div style={s.receiptBox}>
                  {receiptFile ? (
                    <div style={s.receiptPreview}>
                      <img
                        src={URL.createObjectURL(receiptFile)}
                        alt="Receipt"
                        style={{ width: "100%", borderRadius: 10, maxHeight: 280, objectFit: "cover" }}
                      />
                      <button style={s.changePhotoBtn} onClick={() => fileInputRef.current?.click()}>
                        Change Photo
                      </button>
                    </div>
                  ) : (
                    <button style={s.cameraBtn} onClick={() => fileInputRef.current?.click()}>
                      <div style={{ fontSize: 36 }}>📷</div>
                      <div style={{ fontWeight: 900, marginTop: 8 }}>Take Photo of Receipt</div>
                      <div style={{ opacity: 0.6, fontSize: 13, marginTop: 4 }}>Or select from your gallery</div>
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setReceiptFile(file);
                    }}
                  />
                </div>

                <div style={s.modalBtns}>
                  <button style={s.secondaryBtn} onClick={skipReceiptUpload} disabled={receiptUploading}>
                    Skip for now
                  </button>
                  <button
                    style={s.completeBtn}
                    onClick={uploadReceipt}
                    disabled={!receiptFile || receiptUploading}
                  >
                    {receiptUploading ? "Uploading…" : "Upload & Finish"}
                  </button>
                </div>
              </>
            )}

            {/* ── Step: Done ── */}
            {step === "done" && (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
                <div style={s.modalTitle}>Delivery Complete!</div>
                {createdInvoiceId && (
                  <div style={{ ...s.modalSub, marginBottom: 4 }}>
                    Invoice created
                  </div>
                )}
                <div style={{ ...s.modalSub, marginBottom: 0, fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
                  {createdInvoiceId}
                </div>
                {paymentType === "EFT" && receiptDone && (
                  <div style={{ marginTop: 8, color: "#16a34a", fontWeight: 700 }}>Receipt uploaded ✓</div>
                )}
                <button style={{ ...s.completeBtn, marginTop: 20 }} onClick={closeCompletion}>
                  Back to deliveries
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { padding: 20, fontFamily: "system-ui", maxWidth: 640, margin: "0 auto" },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  title: { fontSize: 22, fontWeight: 900 },
  sub: { fontSize: 13, opacity: 0.6, marginTop: 2 },

  pillRow: { display: "flex", gap: 10, marginTop: 16 },
  pill: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 14px",
    borderRadius: 999,
    background: "rgba(234,179,8,0.12)",
    color: "#713f12",
    border: "1px solid rgba(234,179,8,0.4)",
  },
  pillNum: { fontWeight: 900, fontSize: 18 },
  pillLabel: { fontWeight: 700, fontSize: 13 },

  error: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(239,68,68,0.35)",
    background: "rgba(239,68,68,0.08)",
    color: "#7f1d1d",
  },

  emptyCard: {
    marginTop: 24,
    padding: 32,
    borderRadius: 16,
    border: "1px solid rgba(0,0,0,0.1)",
    background: "white",
    textAlign: "center",
    fontSize: 16,
  },

  list: { display: "grid", gap: 12, marginTop: 16 },

  orderCard: {
    borderRadius: 16,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "white",
    overflow: "hidden",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "16px 16px",
    cursor: "pointer",
  },
  cardTitle: {
    fontWeight: 900,
    fontSize: 16,
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  badge: {
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 10px",
    borderRadius: 999,
  },
  cardMeta: {
    marginTop: 4,
    fontSize: 13,
    color: "rgba(0,0,0,0.5)",
    fontWeight: 600,
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    alignItems: "center",
  },
  dot: { opacity: 0.4 },
  mono: { fontFamily: "ui-monospace, monospace", fontSize: 12 },
  chevron: { fontSize: 12, opacity: 0.4, flexShrink: 0 },

  cardBody: {
    padding: "0 16px 16px",
    borderTop: "1px solid rgba(0,0,0,0.07)",
    paddingTop: 14,
  },

  detailBlock: { marginBottom: 12 },
  detailRow: { display: "flex", gap: 8, marginTop: 5, fontSize: 14, flexWrap: "wrap" },
  dk: { fontWeight: 800, color: "#111", minWidth: 90 },
  dv: { color: "rgba(0,0,0,0.7)", fontWeight: 600 },

  detailHeading: {
    fontWeight: 900,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "rgba(0,0,0,0.45)",
    marginBottom: 8,
    marginTop: 12,
  },

  lineItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 0",
    borderBottom: "1px solid rgba(0,0,0,0.06)",
    fontSize: 15,
  },
  lineSpecies: { fontWeight: 700 },
  lineQty: { fontWeight: 900, fontSize: 18, color: "#2563eb" },

  cardActions: { marginTop: 14, display: "flex", gap: 10 },

  startBtn: {
    flex: 1,
    padding: "14px",
    borderRadius: 12,
    border: "1px solid rgba(37,99,235,0.3)",
    background: "rgba(37,99,235,0.08)",
    color: "#1d4ed8",
    fontWeight: 900,
    fontSize: 15,
    cursor: "pointer",
  },
  completeBtn: {
    flex: 1,
    padding: "14px",
    borderRadius: 12,
    border: "none",
    background: "#16a34a",
    color: "white",
    fontWeight: 900,
    fontSize: 15,
    cursor: "pointer",
  },

  secondaryBtn: {
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.15)",
    cursor: "pointer",
    fontWeight: 900,
    background: "white",
  },

  // Completion modal
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "grid",
    placeItems: "start center",
    padding: "16px 16px 40px",
    zIndex: 100,
    overflowY: "auto",
  },
  modal: {
    width: "min(560px, 96vw)",
    background: "white",
    borderRadius: 20,
    padding: 20,
    border: "1px solid rgba(0,0,0,0.1)",
    marginTop: 24,
  },
  modalTitle: { fontSize: 20, fontWeight: 900, marginBottom: 4 },
  modalSub: { fontSize: 14, opacity: 0.6, marginBottom: 14 },
  modalBtns: { display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" },

  stepNote: {
    fontSize: 13,
    color: "rgba(0,0,0,0.55)",
    marginBottom: 12,
    padding: "10px 12px",
    background: "rgba(37,99,235,0.05)",
    borderRadius: 10,
    border: "1px solid rgba(37,99,235,0.15)",
  },

  completionError: {
    padding: 12,
    borderRadius: 10,
    border: "1px solid rgba(239,68,68,0.35)",
    background: "rgba(239,68,68,0.08)",
    color: "#7f1d1d",
    marginBottom: 12,
    fontSize: 14,
  },

  returnBlock: {
    marginBottom: 14,
    padding: 14,
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.1)",
    background: "#fafafa",
  },
  returnSpecies: {
    fontWeight: 900,
    fontSize: 15,
    marginBottom: 10,
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  returnOrdered: {
    fontSize: 12,
    fontWeight: 700,
    opacity: 0.55,
    background: "rgba(0,0,0,0.06)",
    padding: "2px 8px",
    borderRadius: 999,
  },
  returnOk: {
    fontSize: 12,
    fontWeight: 700,
    background: "rgba(34,197,94,0.12)",
    color: "#14532d",
    border: "1px solid rgba(34,197,94,0.3)",
    padding: "2px 8px",
    borderRadius: 999,
  },
  returnBad: {
    fontSize: 12,
    fontWeight: 700,
    background: "rgba(239,68,68,0.1)",
    color: "#7f1d1d",
    border: "1px solid rgba(239,68,68,0.3)",
    padding: "2px 8px",
    borderRadius: 999,
  },
  returnFields: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr 1fr",
    gap: 8,
  },
  returnLabel: {
    display: "grid",
    gap: 4,
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "rgba(0,0,0,0.55)",
  },
  returnInput: {
    padding: "10px 8px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.15)",
    fontSize: 16,
    fontWeight: 900,
    textAlign: "center",
    background: "white",
  },

  preview: {
    marginTop: 14,
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.1)",
    background: "white",
  },
  previewRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 14,
    fontWeight: 700,
    padding: "4px 0",
    color: "rgba(0,0,0,0.7)",
  },
  previewTotal: {
    fontSize: 16,
    fontWeight: 900,
    color: "#111",
    borderTop: "1px solid rgba(0,0,0,0.1)",
    marginTop: 4,
    paddingTop: 8,
  },

  paymentSection: { marginTop: 16 },
  paymentHeading: {
    fontWeight: 900,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "rgba(0,0,0,0.5)",
    marginBottom: 10,
  },
  paymentOptions: { display: "flex", gap: 10 },
  paymentOption: {
    flex: 1,
    padding: "14px 10px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.15)",
    background: "white",
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
  },
  paymentOptionActive: {
    border: "2px solid #2563eb",
    background: "rgba(37,99,235,0.08)",
    color: "#1d4ed8",
  },
  eftNote: {
    marginTop: 8,
    fontSize: 13,
    color: "rgba(0,0,0,0.55)",
    fontStyle: "italic",
  },

  // Receipt upload
  receiptBox: { margin: "14px 0" },
  cameraBtn: {
    width: "100%",
    padding: "32px 20px",
    borderRadius: 16,
    border: "2px dashed rgba(37,99,235,0.3)",
    background: "rgba(37,99,235,0.04)",
    cursor: "pointer",
    textAlign: "center",
    color: "#1d4ed8",
  },
  receiptPreview: { display: "grid", gap: 10 },
  changePhotoBtn: {
    padding: "12px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.15)",
    background: "white",
    cursor: "pointer",
    fontWeight: 800,
    width: "100%",
  },
};
