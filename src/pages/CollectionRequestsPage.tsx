import React, { useEffect, useState } from "react";
import { collectionRequestsApi } from "../api/collectionRequestsApi";
import type { CollectionRequestDto, CollectionRequestLineDto, CollectionShortfallReportItem, CollectionDeliveryAllocationDto, DriverDiscrepancyReportItem } from "../api/collectionRequestsApi";
import { procurementOrdersApi } from "../api/procurementOrdersApi";
import type { ProcurementOrderDto } from "../api/procurementOrdersApi";
import { usersApi } from "../api/usersApi";
import type { DriverDto } from "../api/usersApi";
import { clientsApi } from "../api/clientsApi";
import type { ClientDto } from "../api/clientsApi";
import { hasAnyRole, getProfileFromIdToken } from "../api/auth";
import { NumericInput } from "../components/NumericInput";

function getUsername(): string | undefined {
  return getProfileFromIdToken()?.username;
}

const STATUS_COLORS: Record<string, React.CSSProperties> = {
  Pending: { background: "#f1f5f9", color: "#64748b", border: "1px solid #cbd5e1" },
  Loading: { background: "rgba(234,179,8,0.12)", color: "#713f12", border: "1px solid rgba(234,179,8,0.4)" },
  InTransit: { background: "rgba(37,99,235,0.1)", color: "#1e3a8a", border: "1px solid rgba(37,99,235,0.3)" },
  ArrivedAtHub: { background: "rgba(124,58,237,0.1)", color: "#4c1d95", border: "1px solid rgba(124,58,237,0.3)" },
  HubConfirmed: { background: "rgba(20,184,166,0.1)", color: "#134e4a", border: "1px solid rgba(20,184,166,0.3)" },
  FinanceAcknowledged: { background: "rgba(34,197,94,0.1)", color: "#14532d", border: "1px solid rgba(34,197,94,0.3)" },
};

const isDriver = () => hasAnyRole("Driver") && !hasAnyRole("Owner", "Admin", "HubStaff", "Finance", "Procurement");
const isAdmin = () => hasAnyRole("Owner", "Admin", "HubStaff");
const isFinance = () => hasAnyRole("Owner", "Finance");
const canCreate = () => hasAnyRole("Owner", "Admin", "HubStaff", "Procurement");
const canAllocate = () => hasAnyRole("Owner", "Admin");

export default function CollectionRequestsPage() {
  const [items, setItems] = useState<CollectionRequestDto[]>([]);
  const [pos, setPos] = useState<ProcurementOrderDto[]>([]);
  const [drivers, setDrivers] = useState<DriverDto[]>([]);
  const [clients, setClients] = useState<ClientDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus]   = useState("");
  const [filterDriver, setFilterDriver]   = useState("");
  const [filterSearch, setFilterSearch]   = useState("");

  // Allocation modal — supports multiple client slots in one session
  type AllocSlot = {
    clientId: string;
    lines: { speciesId: string; speciesName: string; qty: number; unitPrice: number; orderedQty: number; loadedQty: number }[];
  };
  const [allocItem, setAllocItem] = useState<CollectionRequestDto | null>(null);
  const [allocSlots, setAllocSlots] = useState<AllocSlot[]>([]);
  const [allocError, setAllocError] = useState("");

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ procurementOrderId: "", assignedDriverId: "", assignedDriverName: "", hubId: "hub-001", notes: "", collectionDate: "" });
  const [createError, setCreateError] = useState("");

  // Loading modal (driver)
  const [loadingItem, setLoadingItem] = useState<CollectionRequestDto | null>(null);
  const [loadLines, setLoadLines] = useState<{ speciesId: string; loadedQty: number; loadingNotes: string }[]>([]);

  // Hub confirm modal
  const [confirmItem, setConfirmItem] = useState<CollectionRequestDto | null>(null);
  const [confirmLines, setConfirmLines] = useState<{ speciesId: string; shortQty: number; overQty: number; deadQty: number; discrepancyNotes: string }[]>([]);
  const [confirmError, setConfirmError] = useState("");

  // Finance acknowledge modal
  const [ackItem, setAckItem] = useState<CollectionRequestDto | null>(null);
  const [ackUploading, setAckUploading] = useState(false);
  const [ackFile, setAckFile] = useState<File | null>(null);
  const [ackError, setAckError] = useState("");
  const [deliveryNoteUrl, setDeliveryNoteUrl] = useState<string | null>(null);
  const [deliveryNoteLoading, setDeliveryNoteLoading] = useState(false);

  // Shortfall report
  const [showShortfall, setShowShortfall] = useState(false);
  const [shortfallReport, setShortfallReport] = useState<CollectionShortfallReportItem[] | null>(null);
  const [shortfallLoading, setShortfallLoading] = useState(false);
  const [shortfallError, setShortfallError] = useState("");

  // Driver discrepancy report
  const [showDiscrepancy, setShowDiscrepancy] = useState(false);
  const [discrepancyReport, setDiscrepancyReport] = useState<DriverDiscrepancyReportItem[] | null>(null);
  const [discrepancyLoading, setDiscrepancyLoading] = useState(false);
  const [discrepancyError, setDiscrepancyError] = useState("");

  // Edit allocation modal
  const [editAllocCr, setEditAllocCr] = useState<CollectionRequestDto | null>(null);
  const [editAllocDoId, setEditAllocDoId] = useState<string>("");
  const [editAllocClientName, setEditAllocClientName] = useState<string>("");
  type EditAllocLine = { speciesId: string; speciesName: string; qty: number; unitPrice: number; orderedQty: number; loadedQty: number; otherClientsQty: number };
  const [editAllocLines, setEditAllocLines] = useState<EditAllocLine[]>([]);
  const [editAllocBusy, setEditAllocBusy] = useState(false);
  const [editAllocError, setEditAllocError] = useState("");

  // Roadside sales modal
  type RoadsaleDraftLine = { speciesId: string; speciesName: string; qty: number; unitPrice: number; paymentType: string };
  const [roadsaleItem, setRoadsaleItem] = useState<CollectionRequestDto | null>(null);
  const [roadsaleLines, setRoadsaleLines] = useState<RoadsaleDraftLine[]>([]);
  const [roadsaleBusy, setRoadsaleBusy] = useState(false);
  const [roadsaleError, setRoadsaleError] = useState("");

  // Confirm delivery modal — admin records actual qty delivered to a client
  type ConfirmDeliveryLine = { speciesId: string; speciesName: string; allocatedQty: number; deliveredQty: number; unitPrice: number };
  const [confirmDeliveryCr, setConfirmDeliveryCr]         = useState<CollectionRequestDto | null>(null);
  const [confirmDeliveryDoId, setConfirmDeliveryDoId]     = useState<string>("");
  const [confirmDeliveryClient, setConfirmDeliveryClient] = useState<string>("");
  const [confirmDeliveryLines, setConfirmDeliveryLines]   = useState<ConfirmDeliveryLine[]>([]);
  const [confirmDeliveryPayment, setConfirmDeliveryPayment] = useState<string>("Cash");
  const [confirmDeliveryBusy, setConfirmDeliveryBusy]     = useState(false);
  const [confirmDeliveryError, setConfirmDeliveryError]   = useState("");

  // Hub accept modal — hub staff physically verifies and checks in HUB-allocated stock
  type HubAcceptLine = { speciesId: string; speciesName: string; allocatedQty: number; acceptedQty: number };
  const [hubAcceptCr, setHubAcceptCr]       = useState<CollectionRequestDto | null>(null);
  const [hubAcceptLines, setHubAcceptLines] = useState<HubAcceptLine[]>([]);
  const [hubAcceptBusy, setHubAcceptBusy]   = useState(false);
  const [hubAcceptError, setHubAcceptError] = useState("");

  // Remove allocation confirm
  const [removeAllocTarget, setRemoveAllocTarget] = useState<{ cr: CollectionRequestDto; deliveryOrderId: string; clientName: string } | null>(null);
  const [removeAllocBusy, setRemoveAllocBusy]   = useState(false);
  const [removeAllocError, setRemoveAllocError] = useState("");

  // Change payment type modal (admin/owner correction after delivery)
  type PatchPaymentTarget = { cr: CollectionRequestDto; deliveryOrderId: string; clientName: string; currentPaymentType: string };
  const [patchPaymentTarget, setPatchPaymentTarget] = useState<PatchPaymentTarget | null>(null);
  const [patchPaymentType, setPatchPaymentType]     = useState("Cash");
  const [patchPaymentFile, setPatchPaymentFile]     = useState<File | null>(null);
  const [patchPaymentBusy, setPatchPaymentBusy]     = useState(false);
  const [patchPaymentError, setPatchPaymentError]   = useState("");

  // Per-card delivery note photo (inline view on expanded card)
  const [cardDnUrls, setCardDnUrls] = useState<Record<string, string>>({});
  const [cardDnLoading, setCardDnLoading] = useState<string | null>(null);
  const [cardDnErrors, setCardDnErrors] = useState<Record<string, string>>({});

  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  useEffect(() => {
    load();
    // Auto-refresh every 30 seconds — keeps driver's list current without a manual reload
    const timer = setInterval(() => silentRefresh(), 30_000);
    return () => clearInterval(timer);
  }, []);

  async function load() {
    try {
      setLoading(true);
      const driverId = isDriver() ? getUsername() : undefined;
      const [crs, poList, driverList, clientList] = await Promise.all([
        collectionRequestsApi.list(driverId ? { driverId } : undefined),
        procurementOrdersApi.list().catch(() => [] as ProcurementOrderDto[]),
        usersApi.listDrivers().catch(() => [] as DriverDto[]),
        clientsApi.list().catch(() => [] as ClientDto[]),
      ]);
      setItems(crs);
      setPos(poList.filter(p => p.status === "Submitted"));
      setDrivers(driverList);
      setClients((clientList as ClientDto[]).filter(c => !c.isWalkIn));
      setLastRefresh(new Date());
    } catch { setError("Failed to load collection requests."); }
    finally { setLoading(false); }
  }

  // Silent background refresh — no spinner, preserves open modals
  async function silentRefresh() {
    try {
      const driverId = isDriver() ? getUsername() : undefined;
      const crs = await collectionRequestsApi.list(driverId ? { driverId } : undefined);
      setItems(crs);
      setLastRefresh(new Date());
    } catch { /* non-fatal — just skip this tick */ }
  }

  async function openDiscrepancyReport() {
    setShowDiscrepancy(true);
    setDiscrepancyError("");
    if (discrepancyReport !== null) return;
    setDiscrepancyLoading(true);
    try {
      const data = await collectionRequestsApi.driverDiscrepancyReport();
      setDiscrepancyReport(data);
    } catch (e: any) { setDiscrepancyError(e?.message ?? "Failed to load report."); }
    finally { setDiscrepancyLoading(false); }
  }

  async function openShortfallReport() {
    setShowShortfall(true);
    setShortfallError("");
    if (shortfallReport !== null) return; // already loaded
    setShortfallLoading(true);
    try {
      const data = await collectionRequestsApi.shortfallReport();
      setShortfallReport(data);
    } catch (e: any) { setShortfallError(e?.message ?? "Failed to load shortfall report."); }
    finally { setShortfallLoading(false); }
  }

  async function handleCreate() {
    if (!createForm.procurementOrderId) { setCreateError("Please select a procurement order."); return; }
    if (!createForm.assignedDriverId) { setCreateError("Please assign a driver."); return; }
    setBusy(true); setCreateError("");
    try {
      const created = await collectionRequestsApi.create({
        ...createForm,
        collectionDate: createForm.collectionDate ? createForm.collectionDate : null,
      });
      setItems(i => [created, ...i]);
      setShowCreate(false);
      setCreateForm({ procurementOrderId: "", assignedDriverId: "", assignedDriverName: "", hubId: "hub-001", notes: "", collectionDate: "" });
    } catch (e: any) { setCreateError(e?.message ?? "Failed to create."); }
    finally { setBusy(false); }
  }

  function openLoadModal(item: CollectionRequestDto) {
    setLoadingItem(item);
    setLoadLines(item.lines.map(l => ({ speciesId: l.speciesId, loadedQty: l.loadedQty || l.orderedQty, loadingNotes: l.loadingNotes || "" })));
  }

  async function saveLoad(dispatch: boolean) {
    if (!loadingItem) return;
    setBusy(true);
    try {
      let updated = await collectionRequestsApi.driverLoad(loadingItem.collectionRequestId, loadLines);
      if (dispatch) {
        updated = await collectionRequestsApi.dispatch(loadingItem.collectionRequestId);
      }
      setItems(i => i.map(x => x.collectionRequestId === updated.collectionRequestId ? updated : x));
      setLoadingItem(null);
    } catch (e: any) { setError(e?.message ?? "Failed to save."); }
    finally { setBusy(false); }
  }

  async function handleArrive(id: string) {
    setBusy(true);
    try {
      const updated = await collectionRequestsApi.arrive(id);
      setItems(i => i.map(x => x.collectionRequestId === id ? updated : x));
    } catch (e: any) { setError(e?.message ?? "Failed."); }
    finally { setBusy(false); }
  }

  function openConfirm(item: CollectionRequestDto) {
    setConfirmItem(item);
    setConfirmLines(item.lines.map(l => ({
      speciesId: l.speciesId,
      shortQty: l.shortQty || 0,
      overQty: l.overQty || 0,
      deadQty: l.deadQty || 0,
      discrepancyNotes: l.discrepancyNotes || "",
    })));
    setConfirmError("");
  }

  async function submitConfirm() {
    if (!confirmItem) return;
    setBusy(true); setConfirmError("");
    try {
      const updated = await collectionRequestsApi.hubConfirm(confirmItem.collectionRequestId, confirmLines);
      setItems(i => i.map(x => x.collectionRequestId === updated.collectionRequestId ? updated : x));
      setConfirmItem(null);
    } catch (e: any) { setConfirmError(e?.message ?? "Failed to confirm."); }
    finally { setBusy(false); }
  }

  async function openAckModal(cr: CollectionRequestDto) {
    setAckItem(cr);
    setAckError("");
    setAckFile(null);
    setDeliveryNoteUrl(null);
    if (cr.deliveryNoteS3Key) {
      setDeliveryNoteLoading(true);
      try {
        const { viewUrl } = await collectionRequestsApi.getDeliveryNoteViewUrl(cr.collectionRequestId);
        setDeliveryNoteUrl(viewUrl);
      } catch { /* non-fatal — just won't show the image */ }
      finally { setDeliveryNoteLoading(false); }
    }
  }

  async function toggleCardDn(crId: string) {
    if (cardDnUrls[crId]) {
      setCardDnUrls(u => { const n = { ...u }; delete n[crId]; return n; });
      setCardDnErrors(e => { const n = { ...e }; delete n[crId]; return n; });
      return;
    }
    setCardDnLoading(crId);
    setCardDnErrors(e => { const n = { ...e }; delete n[crId]; return n; });
    try {
      const res = await collectionRequestsApi.getDeliveryNoteViewUrl(crId);
      const url = res.viewUrl;
      if (!url) throw new Error("No URL returned from server.");
      setCardDnUrls(u => ({ ...u, [crId]: url }));
    } catch (e: any) {
      setCardDnErrors(er => ({ ...er, [crId]: e?.message ?? "Could not load photo." }));
    } finally {
      setCardDnLoading(null);
    }
  }

  async function submitAck() {
    if (!ackItem || !ackFile) { setAckError("Please select an invoice file."); return; }
    setBusy(true); setAckUploading(true); setAckError("");
    try {
      const { uploadUrl, s3Key } = await collectionRequestsApi.getInvoiceUploadUrl(ackItem.collectionRequestId);
      await fetch(uploadUrl, { method: "PUT", body: ackFile, headers: { "Content-Type": "application/pdf" } });
      const updated = await collectionRequestsApi.financeAcknowledge(ackItem.collectionRequestId, s3Key);
      setItems(i => i.map(x => x.collectionRequestId === updated.collectionRequestId ? updated : x));
      setAckItem(null);
      setAckFile(null);
    } catch (e: any) { setAckError(e?.message ?? "Failed."); }
    finally { setBusy(false); setAckUploading(false); }
  }

  function openRoadsaleModal(cr: CollectionRequestDto) {
    setRoadsaleItem(cr);
    setRoadsaleError("");
    // Pre-populate from existing roadside sales, or start with one blank row
    if ((cr.roadsideSales ?? []).length > 0) {
      setRoadsaleLines(cr.roadsideSales.map(r => ({
        speciesId: r.speciesId,
        speciesName: r.speciesName,
        qty: r.qty,
        unitPrice: r.unitPrice,
        paymentType: r.paymentType,
      })));
    } else {
      setRoadsaleLines([{ speciesId: cr.lines[0]?.speciesId ?? "", speciesName: cr.lines[0]?.speciesName ?? "", qty: 0, unitPrice: 0, paymentType: "Cash" }]);
    }
  }

  async function submitRoadsale() {
    if (!roadsaleItem) return;
    const valid = roadsaleLines.filter(l => l.speciesId && l.qty > 0);
    if (valid.length === 0) { setRoadsaleError("Please add at least one sale line with a qty greater than 0."); return; }

    // Frontend validation: per-species total <= hub return available
    const crLines = roadsaleItem.lines;
    const allocs  = roadsaleItem.deliveryAllocations ?? [];
    for (const species of [...new Set(valid.map(l => l.speciesId))]) {
      const crLine = crLines.find(l => l.speciesId === species);
      if (!crLine) continue;
      const baseQty = (crLine.loadedQty > 0 ? crLine.loadedQty : crLine.orderedQty);
      const clientAllocated = allocs.flatMap(a => a.lines).filter(l => l.speciesId === species).reduce((s, l) => s + l.qty, 0);
      const hubReturn = baseQty - clientAllocated;
      const roadsaleTotal = valid.filter(l => l.speciesId === species).reduce((s, l) => s + l.qty, 0);
      if (roadsaleTotal > hubReturn) {
        const name = crLine.speciesName || species;
        setRoadsaleError(`${name}: roadside sales (${roadsaleTotal}) exceed hub return available (${hubReturn}).`);
        return;
      }
    }

    setRoadsaleBusy(true); setRoadsaleError("");
    try {
      const updated = await collectionRequestsApi.setRoadsideSales(
        roadsaleItem.collectionRequestId,
        valid.map(l => ({ speciesId: l.speciesId, qty: l.qty, unitPrice: l.unitPrice, paymentType: l.paymentType })),
      );
      setItems(i => i.map(x => x.collectionRequestId === updated.collectionRequestId ? updated : x));
      setRoadsaleItem(null);
    } catch (e: any) { setRoadsaleError(e?.message ?? "Failed to save roadside sales."); }
    finally { setRoadsaleBusy(false); }
  }

  function openConfirmDelivery(cr: CollectionRequestDto, a: CollectionDeliveryAllocationDto) {
    setConfirmDeliveryCr(cr);
    setConfirmDeliveryDoId(a.deliveryOrderId);
    setConfirmDeliveryClient(a.clientName);
    setConfirmDeliveryPayment("Cash");
    setConfirmDeliveryError("");
    setConfirmDeliveryLines(a.lines.map(l => ({
      speciesId:    l.speciesId,
      speciesName:  l.speciesName || l.speciesId,
      allocatedQty: l.qty,
      deliveredQty: l.deliveredQty > 0 ? l.deliveredQty : l.qty, // default = full allocation
      unitPrice:    l.unitPrice,
    })));
  }

  async function submitConfirmDelivery() {
    if (!confirmDeliveryCr) return;
    for (const l of confirmDeliveryLines) {
      if (l.deliveredQty < 0) { setConfirmDeliveryError(`${l.speciesName}: qty cannot be negative.`); return; }
      if (l.deliveredQty > l.allocatedQty) { setConfirmDeliveryError(`${l.speciesName}: delivered (${l.deliveredQty}) cannot exceed allocated (${l.allocatedQty}).`); return; }
    }
    if (!confirmDeliveryPayment) { setConfirmDeliveryError("Please select a payment type."); return; }
    setConfirmDeliveryBusy(true); setConfirmDeliveryError("");
    try {
      const updated = await collectionRequestsApi.confirmDelivery(
        confirmDeliveryCr.collectionRequestId,
        confirmDeliveryDoId,
        {
          lines: confirmDeliveryLines.map(l => ({ speciesId: l.speciesId, deliveredQty: l.deliveredQty, unitPrice: l.unitPrice })),
          paymentType: confirmDeliveryPayment,
        },
      );
      setItems(i => i.map(x => x.collectionRequestId === updated.collectionRequestId ? updated : x));
      setConfirmDeliveryCr(null);
    } catch (e: any) { setConfirmDeliveryError(e?.message ?? "Failed to confirm delivery."); }
    finally { setConfirmDeliveryBusy(false); }
  }

  function openHubAccept(cr: CollectionRequestDto, a: CollectionDeliveryAllocationDto) {
    setHubAcceptCr(cr);
    setHubAcceptError("");
    setHubAcceptLines(a.lines.map(l => ({
      speciesId:    l.speciesId,
      speciesName:  l.speciesName || l.speciesId,
      allocatedQty: l.qty,
      acceptedQty:  l.acceptedQty > 0 ? l.acceptedQty : l.qty, // default = full allocation
    })));
  }

  async function submitHubAccept() {
    if (!hubAcceptCr) return;
    for (const l of hubAcceptLines) {
      if (l.acceptedQty < 0) { setHubAcceptError(`${l.speciesName}: qty cannot be negative.`); return; }
      if (l.acceptedQty > l.allocatedQty) { setHubAcceptError(`${l.speciesName}: accepted (${l.acceptedQty}) cannot exceed allocated (${l.allocatedQty}).`); return; }
    }
    setHubAcceptBusy(true); setHubAcceptError("");
    try {
      const updated = await collectionRequestsApi.hubAccept(
        hubAcceptCr.collectionRequestId,
        hubAcceptLines.map(l => ({ speciesId: l.speciesId, acceptedQty: l.acceptedQty })),
      );
      setItems(i => i.map(x => x.collectionRequestId === updated.collectionRequestId ? updated : x));
      setHubAcceptCr(null);
    } catch (e: any) { setHubAcceptError(e?.message ?? "Failed to accept hub stock."); }
    finally { setHubAcceptBusy(false); }
  }

  function blankSlot(cr: CollectionRequestDto): AllocSlot {
    return {
      clientId: "",
      lines: cr.lines.map(l => ({
        speciesId: l.speciesId,
        speciesName: l.speciesName || l.speciesId,
        qty: 0,
        unitPrice: 0,
        orderedQty: l.orderedQty,
        loadedQty: l.loadedQty,
      })),
    };
  }

  function openAllocModal(cr: CollectionRequestDto) {
    setAllocItem(cr);
    setAllocSlots([blankSlot(cr)]);
    setAllocError("");
  }

  // How many units of a species are still unallocated, excluding the current slot.
  // Uses loadedQty as the cap once the driver has loaded (more accurate than orderedQty when there's a shortfall).
  function allocAvailable(cr: CollectionRequestDto, speciesId: string, excludeSlotIdx: number): number {
    const crLine = cr.lines.find(l => l.speciesId === speciesId);
    const baseQty = (crLine?.loadedQty ?? 0) > 0 ? (crLine?.loadedQty ?? 0) : (crLine?.orderedQty ?? 0);
    const existingAlloc = (cr.deliveryAllocations ?? [])
      .flatMap(a => a.lines)
      .filter(l => l.speciesId === speciesId)
      .reduce((sum, l) => sum + l.qty, 0);
    const otherSlots = allocSlots
      .filter((_, j) => j !== excludeSlotIdx)
      .reduce((sum, slot) => sum + (slot.lines.find(l => l.speciesId === speciesId)?.qty ?? 0), 0);
    return baseQty - existingAlloc - otherSlots;
  }

  async function submitAllocation() {
    if (!allocItem) return;
    const activeSlots = allocSlots.filter(s => s.clientId && s.lines.some(l => l.qty > 0));
    if (activeSlots.length === 0) { setAllocError("Add at least one client with a quantity."); return; }
    for (const [i, slot] of activeSlots.entries()) {
      if (!slot.clientId) { setAllocError(`Slot ${i + 1}: please select a client.`); return; }
      for (const l of slot.lines.filter(sl => sl.qty > 0)) {
        const available = allocAvailable(allocItem, l.speciesId, allocSlots.indexOf(slot));
        if (l.qty > available) {
          setAllocError(`${l.speciesName}: ${l.qty} allocated but only ${available} available.`);
          return;
        }
      }
    }
    setBusy(true); setAllocError("");
    try {
      let updated = allocItem;
      for (const slot of activeSlots) {
        updated = await collectionRequestsApi.addAllocation(allocItem.collectionRequestId, {
          clientId: slot.clientId,
          lines: slot.lines
            .filter(l => l.qty > 0)
            .map(l => ({ speciesId: l.speciesId, qty: l.qty, unitPrice: l.unitPrice || undefined })),
        });
      }
      setItems(i => i.map(x => x.collectionRequestId === updated.collectionRequestId ? updated : x));
      setAllocItem(null);
    } catch (e: any) { setAllocError(e?.message ?? "Failed to add allocation."); }
    finally { setBusy(false); }
  }

  function openEditAllocModal(cr: CollectionRequestDto, alloc: CollectionDeliveryAllocationDto) {
    setEditAllocCr(cr);
    setEditAllocDoId(alloc.deliveryOrderId);
    setEditAllocClientName(alloc.clientName);
    setEditAllocError("");
    setEditAllocLines(cr.lines.map(l => {
      const existingLine = alloc.lines.find(al => al.speciesId === l.speciesId);
      const otherClientsQty = (cr.deliveryAllocations ?? [])
        .filter(a => a.deliveryOrderId !== alloc.deliveryOrderId)
        .flatMap(a => a.lines)
        .filter(al => al.speciesId === l.speciesId)
        .reduce((sum, al) => sum + al.qty, 0);
      return {
        speciesId: l.speciesId,
        speciesName: l.speciesName || l.speciesId,
        qty: existingLine?.qty ?? 0,
        unitPrice: existingLine?.unitPrice ?? 0,
        orderedQty: l.orderedQty,
        loadedQty: l.loadedQty,
        otherClientsQty,
      };
    }));
  }

  async function submitEditAlloc() {
    if (!editAllocCr) return;
    // Only send lines with qty > 0 — backend rejects zero-qty lines
    const linesToSend = editAllocLines.filter(l => l.qty > 0);
    if (linesToSend.length === 0) { setEditAllocError("Please enter a qty greater than 0 for at least one item."); return; }
    for (const l of linesToSend) {
      const effectiveQty = l.loadedQty > 0 ? l.loadedQty : l.orderedQty;
      const maxQty = effectiveQty - l.otherClientsQty;
      if (l.qty > maxQty) {
        const label = l.loadedQty > 0 ? "loaded" : "ordered";
        setEditAllocError(`${l.speciesName}: ${l.qty} entered but only ${maxQty} available (${label} ${effectiveQty}, other clients have ${l.otherClientsQty}).`);
        return;
      }
    }
    setEditAllocBusy(true); setEditAllocError("");
    try {
      const updated = await collectionRequestsApi.editAllocation(
        editAllocCr.collectionRequestId,
        editAllocDoId,
        linesToSend.map(l => ({ speciesId: l.speciesId, qty: l.qty, unitPrice: l.unitPrice })),
      );
      setItems(i => i.map(x => x.collectionRequestId === updated.collectionRequestId ? updated : x));
      setEditAllocCr(null);
    } catch (e: any) { setEditAllocError(e?.message ?? "Failed to update allocation."); }
    finally { setEditAllocBusy(false); }
  }

  async function submitRemoveAlloc() {
    if (!removeAllocTarget) return;
    setRemoveAllocBusy(true); setRemoveAllocError("");
    try {
      const updated = await collectionRequestsApi.removeAllocation(
        removeAllocTarget.cr.collectionRequestId,
        removeAllocTarget.deliveryOrderId,
      );
      setItems(i => i.map(x => x.collectionRequestId === updated.collectionRequestId ? updated : x));
      setRemoveAllocTarget(null);
    } catch (e: any) { setRemoveAllocError(e?.message ?? "Failed to remove allocation."); }
    finally { setRemoveAllocBusy(false); }
  }

  async function submitPatchPayment() {
    if (!patchPaymentTarget) return;
    setPatchPaymentBusy(true); setPatchPaymentError("");
    try {
      let receiptS3Key: string | undefined;

      if (patchPaymentFile) {
        const urlRes = await collectionRequestsApi.getAllocationPopUploadUrl(
          patchPaymentTarget.cr.collectionRequestId,
          patchPaymentTarget.deliveryOrderId,
        );
        await fetch(urlRes.uploadUrl, {
          method: "PUT",
          body: patchPaymentFile,
          headers: { "Content-Type": patchPaymentFile.type || "application/octet-stream" },
        });
        receiptS3Key = urlRes.s3Key;
      }

      const updated = await collectionRequestsApi.patchAllocationPayment(
        patchPaymentTarget.cr.collectionRequestId,
        patchPaymentTarget.deliveryOrderId,
        { paymentType: patchPaymentType, receiptS3Key },
      );
      setItems(i => i.map(x => x.collectionRequestId === updated.collectionRequestId ? updated : x));
      setPatchPaymentTarget(null);
      setPatchPaymentFile(null);
    } catch (e: any) { setPatchPaymentError(e?.message ?? "Failed to update payment type."); }
    finally { setPatchPaymentBusy(false); }
  }

  const shortId = (id: string) => id.split("-")[0].toUpperCase();

  function renderLine(line: CollectionRequestLineDto, cr: CollectionRequestDto) {
    const hasDiscrepancy = line.loadedQty !== line.orderedQty || line.receivedQty !== line.loadedQty;
    const confirmed = cr.status === "HubConfirmed" || cr.status === "FinanceAcknowledged";
    return (
      <div key={line.speciesId} style={s.lineCard}>
        <div style={s.lineName}>{line.speciesName || line.speciesId}</div>
        <div style={s.lineStats}>
          <span style={s.lineStat}><span style={s.lineStatLabel}>Ordered</span> {line.orderedQty}</span>
          <span style={{ ...s.lineStat, color: line.loadedQty < line.orderedQty ? "#dc2626" : "#16a34a" }}>
            <span style={s.lineStatLabel}>Loaded</span> {line.loadedQty}
          </span>
          {confirmed && (
            <span style={{ ...s.lineStat, color: line.receivedQty < line.loadedQty ? "#dc2626" : "#16a34a" }}>
              <span style={s.lineStatLabel}>Received</span> {line.receivedQty}
            </span>
          )}
          {confirmed && line.deadQty > 0 && (
            <span style={{ ...s.lineStat, color: "#dc2626" }}>
              <span style={s.lineStatLabel}>Dead</span> {line.deadQty}
            </span>
          )}
          {confirmed && line.shortQty > 0 && (
            <span style={{ ...s.lineStat, color: "#f59e0b" }}>
              <span style={s.lineStatLabel}>Short</span> {line.shortQty}
            </span>
          )}
          {confirmed && line.overQty > 0 && (
            <span style={{ ...s.lineStat, color: "#22c55e" }}>
              <span style={s.lineStatLabel}>Over</span> {line.overQty}
            </span>
          )}
        </div>
        {hasDiscrepancy && line.loadingNotes && <div style={s.lineNote}>⚠ {line.loadingNotes}</div>}
        {hasDiscrepancy && line.discrepancyNotes && <div style={s.lineNote}>📝 {line.discrepancyNotes}</div>}
      </div>
    );
  }

  function renderDeliverySummary(cr: CollectionRequestDto) {
    const allocations = cr.deliveryAllocations ?? [];
    if (allocations.length === 0) return null;
    if (!["InTransit", "ArrivedAtHub", "HubConfirmed", "FinanceAcknowledged"].includes(cr.status)) return null;

    const roadsales = cr.roadsideSales ?? [];

    // Helper: use loadedQty when it has been recorded, fall back to orderedQty before loading
    const effectiveQty = (line: { loadedQty: number; orderedQty: number }) =>
      line.loadedQty > 0 ? line.loadedQty : line.orderedQty;

    // Helper: use delivered qty when the driver has invoiced, else allocated qty
    const effectiveDelivered = (l: { qty: number; deliveredQty: number }) =>
      l.deliveredQty > 0 ? l.deliveredQty : l.qty;

    // Per-species rows
    const rows = cr.lines.map(line => {
      const clientQtys = allocations.map(a => {
        const allocLine = a.lines.find(l => l.speciesId === line.speciesId);
        return {
          doId:                a.deliveryOrderId,
          clientName:          a.clientName,
          paymentType:         a.paymentType ?? "",
          deliveryStatus:      a.deliveryStatus ?? "",
          hubAcceptanceStatus: a.hubAcceptanceStatus ?? "",
          qty:                 allocLine?.qty          ?? 0,  // allocated (planned)
          deliveredQty:        allocLine?.deliveredQty ?? 0,  // actual (0 = not yet invoiced)
          acceptedQty:         allocLine?.acceptedQty  ?? 0,  // hub accepted (0 = not yet accepted)
          unitPrice:           allocLine?.unitPrice    ?? 0,
        };
      });
      const effQty         = effectiveQty(line);
      const totalDelivered = clientQtys.reduce((s, c) => s + effectiveDelivered(c), 0);
      const roadsaleQty    = roadsales.filter(r => r.speciesId === line.speciesId).reduce((s, r) => s + r.qty, 0);
      const hubReturn      = effQty - totalDelivered - roadsaleQty;
      return { line, effQty, clientQtys, totalDelivered, roadsaleQty, hubReturn };
    });

    // Client column totals
    const clientTotals = allocations.map(a => ({
      doId:           a.deliveryOrderId,
      clientName:     a.clientName,
      paymentType:    a.paymentType ?? "",
      deliveryStatus: a.deliveryStatus ?? "",
      totalQty:       a.lines.reduce((s, l) => s + effectiveDelivered(l), 0),
      allocQty:       a.lines.reduce((s, l) => s + l.qty, 0),
      totalValue:     a.lines.reduce((s, l) => s + effectiveDelivered(l) * l.unitPrice, 0),
    }));

    const totalLoaded       = cr.lines.reduce((s, l) => s + effectiveQty(l), 0);
    const loadedLabel       = cr.lines.every(l => l.loadedQty > 0) ? "Loaded" : "Loaded / Ordered";
    const totalDeliveredAll = clientTotals.reduce((s, c) => s + c.totalQty, 0);
    const totalRoadsale     = roadsales.reduce((s, r) => s + r.qty, 0);
    const totalHubReturn    = totalLoaded - totalDeliveredAll - totalRoadsale;
    const allAccountedFor   = totalHubReturn === 0;

    // Roadside detail: group by paymentType for the summary strip
    const roadsaleByPay = roadsales.reduce<Record<string, { qty: number; value: number }>>((acc, r) => {
      const key = r.paymentType || "Other";
      if (!acc[key]) acc[key] = { qty: 0, value: 0 };
      acc[key].qty   += r.qty;
      acc[key].value += r.qty * r.unitPrice;
      return acc;
    }, {});

    // Combined payment summary: client invoices + roadside sales grouped by payment type.
    // Split sales are broken out into their actual Cash/EFT/Card components rather than
    // lumped under one "Split" bucket, so the strip reflects what was physically collected.
    const paymentSummary = (() => {
      const map: Record<string, { qty: number; value: number }> = {};
      const addTo = (pt: string, qty: number, value: number) => {
        if (!map[pt]) map[pt] = { qty: 0, value: 0 };
        map[pt].qty   += qty;
        map[pt].value += value;
      };
      // Client invoices (only when paymentType is set, i.e. invoice exists)
      allocations.forEach(a => {
        if (!a.paymentType) return;
        const totalQty   = a.lines.reduce((s, l) => s + (l.deliveredQty > 0 ? l.deliveredQty : l.qty), 0);
        const totalValue = a.lines.reduce((s, l) => s + (l.deliveredQty > 0 ? l.deliveredQty : l.qty) * l.unitPrice, 0);

        if (a.paymentType === "Split" && a.splitPayments?.length > 0) {
          a.splitPayments.forEach(sp => {
            const ratio = totalValue > 0 ? sp.amount / totalValue : 0;
            addTo(sp.method, totalQty * ratio, sp.amount);
          });
        } else {
          addTo(a.paymentType, totalQty, totalValue);
        }
      });
      // Roadside sales
      roadsales.forEach(r => {
        const pt = r.paymentType || "Other";
        if (!map[pt]) map[pt] = { qty: 0, value: 0 };
        map[pt].qty   += r.qty;
        map[pt].value += r.qty * r.unitPrice;
      });
      return map;
    })();
    const hasPaymentSummary = Object.keys(paymentSummary).length > 0;

    return (
      <div style={s.summarySection}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <div style={s.summarySectionTitle}>📊 Delivery Summary</div>
          <div style={{
            fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20,
            background: allAccountedFor ? "rgba(22,163,74,0.1)" : "rgba(180,83,9,0.1)",
            color: allAccountedFor ? "#15803d" : "#92400e",
            border: `1px solid ${allAccountedFor ? "rgba(22,163,74,0.3)" : "rgba(180,83,9,0.3)"}`,
          }}>
            {allAccountedFor
              ? "✓ All stock accounted for"
              : totalHubReturn < 0
                ? `⚠ Over-allocated by ${Math.abs(totalHubReturn).toLocaleString()} units`
                : `⚠ ${totalHubReturn.toLocaleString()} units returned to hub`}
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 380 }}>
            <thead>
              <tr style={{ background: "#f1f5f9", borderRadius: 6 }}>
                <th style={s.thLeft}>Species</th>
                <th style={s.thRight}>{loadedLabel}</th>
                {allocations.map(a => {
                  const isHub = a.clientId === "HUB" || a.deliveryOrderId === "HUB";
                  if (isHub) {
                    const accepted = a.hubAcceptanceStatus === "Accepted";
                    const canAccept = isAdmin() && !accepted;
                    return (
                      <th key="HUB" style={{ ...s.thRight, color: "#15803d" }}>
                        🏠 Hub Stock
                        {accepted ? (
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#15803d",
                            background: "rgba(22,163,74,0.1)", borderRadius: 10, padding: "0px 6px",
                            display: "inline-block", marginTop: 2 }}>
                            ✓ Accepted
                          </div>
                        ) : canAccept ? (
                          <div>
                            <button
                              onClick={() => openHubAccept(cr, a)}
                              style={{ fontSize: 10, fontWeight: 700, color: "#15803d",
                                background: "rgba(22,163,74,0.1)", border: "1px solid rgba(22,163,74,0.4)",
                                borderRadius: 10, padding: "0px 6px", cursor: "pointer", marginTop: 2 }}>
                              ✓ Accept
                            </button>
                          </div>
                        ) : (
                          <div style={{ fontSize: 10, fontWeight: 500, color: "#86efac" }}>Pending acceptance</div>
                        )}
                      </th>
                    );
                  }
                  const ptColor =
                    a.paymentType === "Cash"   ? "#15803d" :
                    a.paymentType === "EFT"    ? "#1d4ed8" :
                    a.paymentType === "Credit" ? "#7c3aed" : "#64748b";
                  const ptBg =
                    a.paymentType === "Cash"   ? "rgba(22,163,74,0.1)"   :
                    a.paymentType === "EFT"    ? "rgba(37,99,235,0.1)"   :
                    a.paymentType === "Credit" ? "rgba(124,58,237,0.1)"  : "rgba(100,116,139,0.1)";
                  const canRecord = canAllocate() && a.deliveryStatus !== "Delivered" && a.deliveryStatus !== "MarkedAtHub";
                  return (
                    <th key={a.deliveryOrderId} style={s.thRight}>
                      {a.clientName}
                      {a.paymentType ? (
                        canAllocate() ? (
                          <button
                            title="Click to change payment type"
                            onClick={() => {
                              setPatchPaymentTarget({ cr, deliveryOrderId: a.deliveryOrderId, clientName: a.clientName, currentPaymentType: a.paymentType });
                              setPatchPaymentType(a.paymentType);
                              setPatchPaymentError("");
                              setPatchPaymentFile(null);
                            }}
                            style={{ fontSize: 10, fontWeight: 700, color: ptColor, background: ptBg,
                              borderRadius: 10, padding: "1px 8px", display: "inline-block", marginTop: 2,
                              border: `1px solid ${ptColor}`, cursor: "pointer" }}>
                            ✎ {a.paymentType}
                          </button>
                        ) : (
                          <div style={{ fontSize: 10, fontWeight: 700, color: ptColor,
                            background: ptBg, borderRadius: 10, padding: "0px 6px",
                            display: "inline-block", marginTop: 2 }}>
                            ✓ {a.paymentType}
                          </div>
                        )
                      ) : canRecord ? (
                        <div>
                          <button
                            onClick={() => openConfirmDelivery(cr, a)}
                            style={{ fontSize: 10, fontWeight: 700, color: "#15803d", background: "rgba(22,163,74,0.1)",
                              border: "1px solid rgba(22,163,74,0.4)", borderRadius: 10, padding: "0px 6px",
                              cursor: "pointer", marginTop: 2 }}>
                            ✓ Record
                          </button>
                        </div>
                      ) : a.deliveryStatus ? (
                        <div style={{ fontSize: 10, fontWeight: 500, color: "#94a3b8" }}>{a.deliveryStatus}</div>
                      ) : null}
                      {a.paymentType === "Split" && a.splitPayments?.length > 0 && (
                        <div style={{ fontSize: 9, color: "#475569", marginTop: 2, lineHeight: 1.5 }}>
                          {a.splitPayments.map((sp, i) => (
                            <div key={i}>{sp.method}: R{sp.amount.toFixed(2)}</div>
                          ))}
                        </div>
                      )}
                      <div style={{ fontSize: 10, fontWeight: 500, color: "#94a3b8" }}>DO-{a.deliveryOrderId.split("-")[0].toUpperCase()}</div>
                    </th>
                  );
                })}
                {totalRoadsale > 0 && <th style={{ ...s.thRight, color: "#7c3aed" }}>🛣 Roadside</th>}
                <th style={{ ...s.thRight, color: "#92400e" }}>Hub Return</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ line, effQty, clientQtys, roadsaleQty, hubReturn }) => (
                <tr key={line.speciesId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "7px 8px", fontWeight: 600, color: "#0f172a" }}>{line.speciesName || line.speciesId}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 600 }}>
                    {effQty.toLocaleString()}
                    {line.loadedQty === 0 && <div style={{ fontSize: 10, color: "#94a3b8" }}>ordered</div>}
                  </td>
                  {clientQtys.map(cq => {
                    const hubCell = cq.doId === "HUB";
                    // For HUB: show acceptedQty once accepted, else allocated qty
                    const shownQty = hubCell
                      ? (cq.acceptedQty > 0 ? cq.acceptedQty : cq.qty)
                      : (cq.deliveredQty > 0 ? cq.deliveredQty : cq.qty);
                    const hasDiscrepancy = hubCell
                      ? (cq.acceptedQty > 0 && cq.acceptedQty !== cq.qty)
                      : (cq.deliveredQty > 0 && cq.deliveredQty !== cq.qty);
                    return (
                      <td key={cq.doId} style={{ padding: "7px 8px", textAlign: "right",
                        ...(hubCell ? { color: "#15803d", fontWeight: 700, background: "rgba(22,163,74,0.04)" } : {}) }}>
                        {shownQty > 0
                          ? <>
                              <span>{shownQty.toLocaleString()}</span>
                              {hasDiscrepancy && (
                                <div style={{ fontSize: 10, color: "#f59e0b", fontWeight: 600 }}>
                                  alloc: {cq.qty.toLocaleString()}
                                </div>
                              )}
                              {!hubCell && shownQty > 0 && cq.unitPrice > 0 && (
                                <div style={{ fontSize: 10, color: "#64748b" }}>R{(shownQty * cq.unitPrice).toFixed(2)}</div>
                              )}
                            </>
                          : <span style={{ color: "#cbd5e1" }}>—</span>
                        }
                      </td>
                    );
                  })}
                  {totalRoadsale > 0 && (
                    <td style={{ padding: "7px 8px", textAlign: "right", color: "#7c3aed", fontWeight: 600 }}>
                      {roadsaleQty > 0 ? roadsaleQty.toLocaleString() : <span style={{ color: "#cbd5e1" }}>—</span>}
                      {roadsaleQty > 0 && (() => {
                        const val = roadsales.filter(r => r.speciesId === line.speciesId).reduce((s, r) => s + r.qty * r.unitPrice, 0);
                        return val > 0 ? <div style={{ fontSize: 10, color: "#7c3aed" }}>R{val.toFixed(2)}</div> : null;
                      })()}
                    </td>
                  )}
                  <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 700, color: hubReturn > 0 ? "#b45309" : "#16a34a" }}>
                    {hubReturn > 0 ? hubReturn.toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid #e2e8f0", background: "#f8fafc" }}>
                <td style={{ padding: "7px 8px", fontWeight: 800, fontSize: 12, color: "#374151", textTransform: "uppercase", letterSpacing: "0.03em" }}>Total</td>
                <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 800 }}>{totalLoaded.toLocaleString()}</td>
                {clientTotals.map(ct => (
                  <td key={ct.doId} style={{ padding: "7px 8px", textAlign: "right", fontWeight: 800,
                    ...(ct.doId === "HUB" ? { color: "#15803d", background: "rgba(22,163,74,0.04)" } : {}) }}>
                    {ct.totalQty.toLocaleString()}
                    {ct.allocQty !== ct.totalQty && (
                      <div style={{ fontSize: 10, color: "#f59e0b", fontWeight: 600 }}>alloc: {ct.allocQty.toLocaleString()}</div>
                    )}
                    {ct.doId !== "HUB" && ct.totalValue > 0 && (
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#15803d" }}>R{ct.totalValue.toFixed(2)}</div>
                    )}
                  </td>
                ))}
                {totalRoadsale > 0 && (
                  <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 800, color: "#7c3aed" }}>
                    {totalRoadsale.toLocaleString()}
                    {(() => {
                      const val = roadsales.reduce((s, r) => s + r.qty * r.unitPrice, 0);
                      return val > 0 ? <div style={{ fontSize: 10, fontWeight: 700, color: "#7c3aed" }}>R{val.toFixed(2)}</div> : null;
                    })()}
                  </td>
                )}
                <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 800, color: totalHubReturn > 0 ? "#b45309" : "#16a34a" }}>
                  {totalHubReturn > 0 ? totalHubReturn.toLocaleString() : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Roadside sales breakdown by payment type */}
        {roadsales.length > 0 && (
          <div style={{ marginTop: 10, padding: "8px 10px", background: "rgba(124,58,237,0.05)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#6d28d9", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 6 }}>
              🛣 Roadside Sales Detail
            </div>
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
              {roadsales.map((r, i) => (
                <span key={i} style={{ fontSize: 12, padding: "2px 10px", borderRadius: 20, fontWeight: 600,
                  background: r.paymentType === "Cash" ? "rgba(22,163,74,0.1)" : "rgba(37,99,235,0.1)",
                  color: r.paymentType === "Cash" ? "#15803d" : "#1d4ed8",
                  border: `1px solid ${r.paymentType === "Cash" ? "rgba(22,163,74,0.3)" : "rgba(37,99,235,0.3)"}`,
                }}>
                  {r.speciesName}: {r.qty.toLocaleString()} × R{r.unitPrice.toFixed(2)} {r.paymentType}
                  {" "}= <strong>R{(r.qty * r.unitPrice).toFixed(2)}</strong>
                </span>
              ))}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#6d28d9", fontWeight: 700 }}>
              Total Roadside: R{roadsales.reduce((s, r) => s + r.qty * r.unitPrice, 0).toFixed(2)}
              {Object.entries(roadsaleByPay).map(([pt, v]) => (
                <span key={pt} style={{ marginLeft: 12, fontWeight: 600, color: "#64748b" }}>
                  {pt}: R{v.value.toFixed(2)} ({v.qty} units)
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Combined payment type summary (client invoices + roadside) */}
        {hasPaymentSummary && (
          <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(15,23,42,0.03)", border: "1px solid #e2e8f0", borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#374151", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 8 }}>
              💳 Payment Summary
            </div>
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
              {Object.entries(paymentSummary).map(([pt, v]) => {
                const color = pt === "Cash" ? "#15803d" : pt === "EFT" ? "#1d4ed8" : pt === "Credit" ? "#7c3aed" : "#64748b";
                const bg    = pt === "Cash" ? "rgba(22,163,74,0.08)" : pt === "EFT" ? "rgba(37,99,235,0.08)" : pt === "Credit" ? "rgba(124,58,237,0.08)" : "rgba(100,116,139,0.08)";
                const bdr   = pt === "Cash" ? "rgba(22,163,74,0.3)"  : pt === "EFT" ? "rgba(37,99,235,0.3)"  : pt === "Credit" ? "rgba(124,58,237,0.3)"  : "rgba(100,116,139,0.3)";
                return (
                  <div key={pt} style={{ padding: "6px 14px", borderRadius: 10, background: bg, border: `1px solid ${bdr}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>{pt}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color }}>R{v.value.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div style={{ fontSize: 10, color: "#64748b" }}>{v.qty.toLocaleString()} units</div>
                  </div>
                );
              })}
              <div style={{ padding: "6px 14px", borderRadius: 10, background: "rgba(15,23,42,0.04)", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Total</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
                  R{Object.values(paymentSummary).reduce((s, v) => s + v.value, 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: 10, color: "#64748b" }}>
                  {Object.values(paymentSummary).reduce((s, v) => s + v.qty, 0).toLocaleString()} units
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.headerRow}>
        <div>
          <div style={s.pageTitle}>Collection Requests</div>
          <div style={s.pageSub}>{isDriver() ? "Your collection assignments" : "Manage stock collections from suppliers"}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, alignItems: "center" }}>
          {lastRefresh && (
            <span style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" as const }}>
              ↻ {lastRefresh.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
          <button style={s.refreshBtn} onClick={silentRefresh} title="Refresh now">↻</button>
          {!isDriver() && <button style={s.shortfallBtn} onClick={openShortfallReport}>⚠ Shortfall Report</button>}
          {!isDriver() && <button style={s.discrepancyBtn} onClick={openDiscrepancyReport}>📋 Driver Discrepancy</button>}
          {canCreate() && <button style={s.primaryBtn} onClick={() => { setCreateError(""); setShowCreate(true); }}>+ New Collection</button>}
        </div>
      </div>

      {error && <div style={s.errorBanner}>{error}</div>}

      {/* Filter bar */}
      {!loading && items.length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const, marginBottom: 16, alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Status</div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={s.filterSelect}>
              <option value="">All Statuses</option>
              {Object.keys(STATUS_COLORS).map(st => <option key={st} value={st}>{st}</option>)}
            </select>
          </div>
          {!isDriver() && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Driver</div>
              <select value={filterDriver} onChange={e => setFilterDriver(e.target.value)} style={s.filterSelect}>
                <option value="">All Drivers</option>
                {[...new Set(items.map(i => i.assignedDriverName).filter(Boolean))].sort().map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Supplier</div>
            <input
              type="text"
              placeholder="Search supplier…"
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              style={s.filterSelect}
            />
          </div>
          {(filterStatus || filterDriver || filterSearch) && (
            <button
              onClick={() => { setFilterStatus(""); setFilterDriver(""); setFilterSearch(""); }}
              style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#f8fafc", cursor: "pointer", fontSize: 13, alignSelf: "flex-end", color: "#64748b" }}>
              ✕ Clear
            </button>
          )}
          <div style={{ fontSize: 13, color: "#64748b", alignSelf: "flex-end", paddingBottom: 2 }}>
            {(() => {
              const count = items.filter(cr =>
                (!filterStatus || cr.status === filterStatus) &&
                (!filterDriver || cr.assignedDriverName === filterDriver) &&
                (!filterSearch || (cr.supplierName ?? "").toLowerCase().includes(filterSearch.toLowerCase()))
              ).length;
              return `${count} of ${items.length}`;
            })()}
          </div>
        </div>
      )}

      {loading ? <div style={s.loading}>Loading…</div> : items.length === 0 ? (
        <div style={s.empty}>No collection requests found.</div>
      ) : (
        <div style={s.list}>
          {items.filter(cr =>
            (!filterStatus || cr.status === filterStatus) &&
            (!filterDriver || cr.assignedDriverName === filterDriver) &&
            (!filterSearch || (cr.supplierName ?? "").toLowerCase().includes(filterSearch.toLowerCase()))
          ).map(cr => (
            <div key={cr.collectionRequestId} style={s.card}>
              <div style={s.cardHeader} onClick={() => setExpanded(expanded === cr.collectionRequestId ? null : cr.collectionRequestId)}>
                <div style={s.cardLeft}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={s.orderId}>CR-{shortId(cr.collectionRequestId)}</span>
                    <span style={{ ...s.badge, ...STATUS_COLORS[cr.status] }}>{cr.status}</span>
                    {cr.shortfallFlagged && (
                      <span style={{ ...s.badge, background: "rgba(234,88,12,0.12)", color: "#9a3412", border: "1px solid rgba(234,88,12,0.4)" }}>⚠ Shortfall</span>
                    )}
                  </div>
                  <div style={s.cardMeta}>
                    <span>{cr.supplierName}</span>
                    <span> · {cr.assignedDriverName}</span>
                    <span> · {cr.lines.length} species</span>
                    <span> · {new Date(cr.createdAt).toLocaleDateString("en-ZA")}</span>
                    {cr.collectionDate && <span style={{ color: "#0891b2", fontWeight: 600 }}> · 📅 {new Date(cr.collectionDate).toLocaleDateString("en-ZA")}</span>}
                  </div>
                </div>
                <span style={s.chevron}>{expanded === cr.collectionRequestId ? "▲" : "▼"}</span>
              </div>

              {expanded === cr.collectionRequestId && (
                <div style={s.cardBody}>
                  {cr.notes && <div style={s.notes}>📝 {cr.notes}</div>}
                  {cr.deliveryNoteS3Key && isFinance() && (
                    <div style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        style={{ ...s.dnBadge, cursor: "pointer", border: "1px solid rgba(3,105,161,0.4)", background: cardDnUrls[cr.collectionRequestId] ? "rgba(8,145,178,0.15)" : "rgba(3,105,161,0.08)" }}
                        onClick={() => toggleCardDn(cr.collectionRequestId)}
                        disabled={cardDnLoading === cr.collectionRequestId}
                      >
                        {cardDnLoading === cr.collectionRequestId
                          ? "⏳ Loading photo…"
                          : cardDnUrls[cr.collectionRequestId]
                            ? "🖼 Hide Delivery Note Photo"
                            : "📷 View Delivery Note Photo"}
                      </button>
                      {cardDnErrors[cr.collectionRequestId] && (
                        <div style={{ fontSize: 12, color: "#dc2626", marginTop: 6 }}>
                          ⚠ {cardDnErrors[cr.collectionRequestId]}
                        </div>
                      )}
                      {cardDnUrls[cr.collectionRequestId] && (
                        <div style={{ marginTop: 8 }}>
                          <img
                            src={cardDnUrls[cr.collectionRequestId]}
                            alt="Delivery note"
                            style={{ display: "block", width: "100%", maxHeight: 360, objectFit: "contain", borderRadius: 8, border: "1px solid #e2e8f0", background: "#f8fafc" }}
                            onError={e => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                              const msg = e.currentTarget.nextElementSibling as HTMLElement | null;
                              if (msg) msg.style.display = "block";
                            }}
                          />
                          <div style={{ display: "none", fontSize: 12, color: "#dc2626", marginTop: 6 }}>
                            Could not display image. <a href={cardDnUrls[cr.collectionRequestId]} target="_blank" rel="noreferrer" style={{ color: "#0891b2", fontWeight: 700 }}>Open in new tab</a>
                          </div>
                          <a href={cardDnUrls[cr.collectionRequestId]} target="_blank" rel="noreferrer" style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 4, textAlign: "right" }}>
                            ↗ Open full size
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                  <div style={s.linesGrid}>{cr.lines.map(l => renderLine(l, cr))}</div>

                  {/* Delivery allocations */}
                  {(cr.deliveryAllocations ?? []).length > 0 && (
                    <div style={s.allocSection}>
                      <div style={s.allocSectionTitle}>🚚 En-Route Delivery Allocations</div>
                      {(cr.deliveryAllocations ?? []).map(a => {
                        const isHubAlloc = a.clientId === "HUB" || a.deliveryOrderId === "HUB";
                        return (
                          <div key={a.deliveryOrderId}
                            style={{ ...s.allocCard, ...(isHubAlloc ? { borderColor: "rgba(22,163,74,0.4)", background: "rgba(22,163,74,0.04)" } : {}) }}>
                            <div style={s.allocClientRow}>
                              <span style={{ ...s.allocClientName, ...(isHubAlloc ? { color: "#15803d" } : {}) }}>
                                {isHubAlloc ? "🏠 " : ""}{a.clientName}
                              </span>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                {isHubAlloc
                                  ? <span style={{ fontSize: 11, color: "#15803d", fontWeight: 600 }}>Hub Direct</span>
                                  : <span style={s.allocDoId}>DO-{a.deliveryOrderId.split("-")[0].toUpperCase()}</span>
                                }
                                {canAllocate() && cr.status !== "FinanceAcknowledged" && (
                                  <button
                                    style={s.editAllocBtn}
                                    onClick={() => openEditAllocModal(cr, a)}
                                  >✏️ Edit</button>
                                )}
                                {canAllocate() && cr.status !== "FinanceAcknowledged" &&
                                  !(a.hubAcceptanceStatus === "Accepted") &&
                                  !(a.deliveryStatus === "Delivered" || a.deliveryStatus === "MarkedAtHub") &&
                                  !a.paymentType && (
                                  <button
                                    style={s.removeAllocBtn}
                                    onClick={() => setRemoveAllocTarget({ cr, deliveryOrderId: a.deliveryOrderId, clientName: a.clientName })}
                                  >🗑 Remove</button>
                                )}
                              </div>
                            </div>
                            <div style={s.allocLines}>
                              {a.lines.map(l => (
                                <span key={l.speciesId} style={s.allocLinePill}>
                                  {l.speciesName || l.speciesId}: <strong>{l.qty.toLocaleString()}</strong>
                                  {!isHubAlloc && l.unitPrice > 0 && <span style={{ color: "#64748b" }}> @ R{l.unitPrice.toFixed(2)}</span>}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {renderDeliverySummary(cr)}

                  <div style={s.cardActions}>
                    {/* Driver actions */}
                    {isDriver() && (cr.status === "Pending" || cr.status === "Loading") && (
                      <button style={s.primaryBtn} onClick={() => openLoadModal(cr)}>
                        {cr.status === "Loading" ? "Update Loading" : "Start Loading"}
                      </button>
                    )}
                    {isDriver() && cr.status === "InTransit" && (
                      <button style={s.primaryBtn} onClick={() => handleArrive(cr.collectionRequestId)} disabled={busy}>Mark Arrived at Hub</button>
                    )}
                    {/* Allocation action */}
                    {canAllocate() && (cr.status === "Pending" || cr.status === "Loading" || cr.status === "InTransit" || cr.status === "ArrivedAtHub" || cr.status === "HubConfirmed") && (
                      <button style={s.allocBtn} onClick={() => openAllocModal(cr)}>+ Allocate Delivery</button>
                    )}
                    {/* Hub admin actions */}
                    {isAdmin() && (cr.status === "ArrivedAtHub" || cr.status === "InTransit") && (
                      <button style={s.primaryBtn} onClick={() => openConfirm(cr)}>Confirm Receipt</button>
                    )}
                    {/* Roadside sales — Admin records stock sold by driver before returning */}
                    {canAllocate() && ["InTransit", "ArrivedAtHub", "HubConfirmed"].includes(cr.status) && (
                      <button style={s.roadsaleBtn} onClick={() => openRoadsaleModal(cr)}>
                        🛣 {(cr.roadsideSales ?? []).length > 0 ? "Edit Roadside Sales" : "Record Roadside Sales"}
                      </button>
                    )}
                    {/* Finance actions */}
                    {isFinance() && cr.status === "HubConfirmed" && (
                      <button style={s.primaryBtn} onClick={() => openAckModal(cr)}>Upload Invoice & Acknowledge</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div style={s.backdrop} onClick={() => !busy && setShowCreate(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>New Collection Request</div>
            {createError && <div style={s.formError}>{createError}</div>}
            <label style={s.label}>Procurement Order *
              <select style={s.input} value={createForm.procurementOrderId} onChange={e => setCreateForm(p => ({ ...p, procurementOrderId: e.target.value }))} disabled={busy}>
                <option value="">— Select order —</option>
                {pos.map(p => <option key={p.procurementOrderId} value={p.procurementOrderId}>PO-{p.procurementOrderId.split("-")[0].toUpperCase()} · {p.supplierName} · {p.lines.reduce((a, l) => a + l.orderedQty, 0)} units</option>)}
              </select>
            </label>
            <label style={s.label}>Assign Driver *
              <select style={s.input} value={createForm.assignedDriverId}
                onChange={e => {
                  const d = drivers.find(x => x.userId === e.target.value);
                  setCreateForm(p => ({ ...p, assignedDriverId: e.target.value, assignedDriverName: d?.name || e.target.value }));
                }} disabled={busy}>
                <option value="">— Select driver —</option>
                {drivers.map(d => <option key={d.userId} value={d.userId}>{d.name} {d.email ? `(${d.email})` : ""}</option>)}
              </select>
            </label>
            {/* Stock & cost preview when PO is selected */}
            {createForm.procurementOrderId && (() => {
              const selectedPo = pos.find(p => p.procurementOrderId === createForm.procurementOrderId);
              if (!selectedPo) return null;
              const totalCost = selectedPo.lines.reduce((sum, l) => sum + l.orderedQty * l.unitCost, 0);
              return (
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, marginBottom: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Stock &amp; Cost Allocation
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#15803d", background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.3)", borderRadius: 6, padding: "2px 8px" }}>
                      ✓ All prices inclusive of VAT
                    </div>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <th style={{ textAlign: "left", padding: "4px 6px", color: "#64748b", fontWeight: 600 }}>Species</th>
                        <th style={{ textAlign: "right", padding: "4px 6px", color: "#64748b", fontWeight: 600 }}>Qty</th>
                        <th style={{ textAlign: "right", padding: "4px 6px", color: "#64748b", fontWeight: 600 }}>Unit Cost</th>
                        <th style={{ textAlign: "right", padding: "4px 6px", color: "#64748b", fontWeight: 600 }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPo.lines.map(l => (
                        <tr key={l.speciesId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "4px 6px", fontWeight: 600 }}>{l.speciesName || l.speciesId}</td>
                          <td style={{ padding: "4px 6px", textAlign: "right" }}>{l.orderedQty.toLocaleString()}</td>
                          <td style={{ padding: "4px 6px", textAlign: "right" }}>R {l.unitCost.toFixed(2)}</td>
                          <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600 }}>R {(l.orderedQty * l.unitCost).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: "2px solid #e2e8f0" }}>
                        <td colSpan={3} style={{ padding: "6px 6px", fontWeight: 700, fontSize: 13 }}>Total Order Value</td>
                        <td style={{ padding: "6px 6px", textAlign: "right", fontWeight: 800, color: "#15803d", fontSize: 14 }}>R {totalCost.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })()}
            <label style={s.label}>Collection Date
              <input type="date" style={s.input} value={createForm.collectionDate}
                onChange={e => setCreateForm(p => ({ ...p, collectionDate: e.target.value }))} disabled={busy}
                min={new Date().toISOString().slice(0, 10)} />
              <span style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Leave blank for today. Future dates will appear on the driver's dashboard but remain inactive until due.</span>
            </label>
            <label style={s.label}>Notes
              <input style={s.input} value={createForm.notes} onChange={e => setCreateForm(p => ({ ...p, notes: e.target.value }))} disabled={busy} />
            </label>
            <div style={s.modalBtns}>
              <button style={s.secondaryBtn} onClick={() => setShowCreate(false)} disabled={busy}>Cancel</button>
              <button style={s.primaryBtn} onClick={handleCreate} disabled={busy}>{busy ? "Creating…" : "Create"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Driver loading modal */}
      {loadingItem && (
        <div style={s.backdrop} onClick={() => !busy && setLoadingItem(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>Load Stock — {loadingItem.supplierName}</div>
            <div style={s.modalSub}>Record quantities loaded onto your vehicle</div>
            {loadLines.map((ll, i) => {
              const origLine = loadingItem.lines[i];
              return (
                <div key={ll.speciesId} style={s.loadLineCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                    <div style={s.loadLineName}>{origLine?.speciesName || ll.speciesId}</div>
                    {ll.loadedQty < (origLine?.orderedQty ?? 0) && ll.loadedQty >= 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 20, padding: "1px 8px" }}>
                        ⚠ {(origLine?.orderedQty ?? 0) - ll.loadedQty} short
                      </span>
                    )}
                  </div>
                  <div style={s.loadLineOrdered}>Ordered: {origLine?.orderedQty}</div>
                  <div style={s.loadLineInputs}>
                    <label style={s.label}>Loaded Qty
                      <NumericInput style={{ ...s.input, borderColor: ll.loadedQty < (origLine?.orderedQty ?? 0) ? "#fca5a5" : undefined }} allowDecimal={false}  value={ll.loadedQty}
                        onChange={e => setLoadLines(ls => ls.map((x, j) => j === i ? { ...x, loadedQty: parseInt(e.target.value) || 0 } : x))} disabled={busy} onFocus={e => e.target.select()} />
                    </label>
                    <label style={s.label}>Notes (if short)
                      <input style={s.input} value={ll.loadingNotes} placeholder="Reason if not full quantity"
                        onChange={e => setLoadLines(ls => ls.map((x, j) => j === i ? { ...x, loadingNotes: e.target.value } : x))} disabled={busy} />
                    </label>
                  </div>
                </div>
              );
            })}
            <div style={s.modalBtns}>
              <button style={s.secondaryBtn} onClick={() => setLoadingItem(null)} disabled={busy}>Cancel</button>
              <button style={{ ...s.secondaryBtn, color: "#16a34a", borderColor: "#16a34a" }} onClick={() => saveLoad(false)} disabled={busy}>Save Progress</button>
              <button style={s.primaryBtn} onClick={() => saveLoad(true)} disabled={busy}>{busy ? "…" : "Dispatch 🚛"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Hub confirm modal */}
      {confirmItem && (
        <div style={s.backdrop} onClick={() => !busy && setConfirmItem(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>Confirm Receipt — {confirmItem.supplierName}</div>
            <div style={s.modalSub}>Record short, over, and dead quantities per species. Received stock is calculated automatically.</div>
            {confirmError && <div style={s.formError}>{confirmError}</div>}
            {confirmLines.map((cl, i) => {
              const origLine = confirmItem.lines[i];
              const loaded = origLine?.loadedQty ?? 0;
              const receivedAlive = Math.max(0, loaded - cl.shortQty + cl.overQty - cl.deadQty);
              return (
                <div key={cl.speciesId} style={s.loadLineCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                    <div style={s.loadLineName}>{origLine?.speciesName || cl.speciesId}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", background: "#f1f5f9", borderRadius: 8, padding: "2px 10px" }}>
                      Received: <span style={{ color: receivedAlive < loaded ? "#dc2626" : receivedAlive > loaded ? "#16a34a" : "#0f172a" }}>{receivedAlive}</span>
                    </div>
                  </div>
                  <div style={s.loadLineOrdered}>Loaded: {loaded} · Ordered: {origLine?.orderedQty}</div>
                  <div style={s.loadLineInputs}>
                    <label style={s.label}>Short Qty
                      <NumericInput
                        style={{ ...s.input, borderColor: cl.shortQty > 0 ? "#fca5a5" : undefined }}
                        allowDecimal={false} value={cl.shortQty}
                        onChange={e => setConfirmLines(ls => ls.map((x, j) => j === i ? { ...x, shortQty: Math.max(0, parseInt(e.target.value) || 0) } : x))}
                        disabled={busy} onFocus={e => e.target.select()} />
                    </label>
                    <label style={s.label}>Over Qty
                      <NumericInput
                        style={{ ...s.input, borderColor: cl.overQty > 0 ? "#bbf7d0" : undefined }}
                        allowDecimal={false} value={cl.overQty}
                        onChange={e => setConfirmLines(ls => ls.map((x, j) => j === i ? { ...x, overQty: Math.max(0, parseInt(e.target.value) || 0) } : x))}
                        disabled={busy} onFocus={e => e.target.select()} />
                    </label>
                    <label style={s.label}>Dead Qty
                      <NumericInput
                        style={{ ...s.input, borderColor: cl.deadQty > 0 ? "#fed7aa" : undefined }}
                        allowDecimal={false} value={cl.deadQty}
                        onChange={e => setConfirmLines(ls => ls.map((x, j) => j === i ? { ...x, deadQty: Math.max(0, parseInt(e.target.value) || 0) } : x))}
                        disabled={busy} onFocus={e => e.target.select()} />
                    </label>
                    <label style={s.label}>Notes
                      <input style={s.input} value={cl.discrepancyNotes} placeholder="Optional notes"
                        onChange={e => setConfirmLines(ls => ls.map((x, j) => j === i ? { ...x, discrepancyNotes: e.target.value } : x))} disabled={busy} />
                    </label>
                  </div>
                </div>
              );
            })}
            <div style={s.modalBtns}>
              <button style={s.secondaryBtn} onClick={() => setConfirmItem(null)} disabled={busy}>Cancel</button>
              <button style={s.primaryBtn} onClick={submitConfirm} disabled={busy}>{busy ? "Confirming…" : "Confirm Receipt ✓"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delivery allocation modal — multi-client */}
      {allocItem && (
        <div style={s.backdrop} onClick={() => !busy && setAllocItem(null)}>
          <div style={{ ...s.modal, maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>Allocate Deliveries</div>
            <div style={s.modalSub}>
              {allocItem.assignedDriverName} · {allocItem.supplierName}. Add one row per client — each becomes a separate delivery order.
            </div>
            {allocError && <div style={s.formError}>{allocError}</div>}

            {allocSlots.map((slot, si) => {
              const clientName = clients.find(c => c.clientId === slot.clientId)?.clientName;
              return (
                <div key={si} style={s.allocSlotCard}>
                  {/* Slot header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>
                      Client {si + 1}{clientName ? ` — ${clientName}` : ""}
                    </div>
                    {allocSlots.length > 1 && (
                      <button
                        style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 13, fontWeight: 700, padding: "2px 6px" }}
                        onClick={() => setAllocSlots(ss => ss.filter((_, j) => j !== si))}
                        disabled={busy}
                      >✕ Remove</button>
                    )}
                  </div>

                  <label style={s.label}>Allocate To *
                    <select style={s.input} value={slot.clientId}
                      onChange={e => setAllocSlots(ss => ss.map((x, j) => j === si ? { ...x, clientId: e.target.value } : x))}
                      disabled={busy}>
                      <option value="">— Select destination —</option>
                      <option value="HUB">🏠 Hub Stock (stays at hub)</option>
                      <option disabled>──────────────</option>
                      {clients.map(c => (
                        <option key={c.clientId} value={c.clientId}>{c.clientName}{c.clientCity ? ` · ${c.clientCity}` : ""}</option>
                      ))}
                    </select>
                  </label>

                  {slot.lines.map((l, li) => {
                    const available = allocAvailable(allocItem, l.speciesId, si);
                    const existingAlloc = (allocItem.deliveryAllocations ?? [])
                      .flatMap(a => a.lines).filter(x => x.speciesId === l.speciesId)
                      .reduce((s, x) => s + x.qty, 0);
                    const baseQty   = l.loadedQty > 0 ? l.loadedQty : l.orderedQty;
                    const baseLabel = l.loadedQty > 0 ? "Loaded" : "Ordered";
                    return (
                      <div key={l.speciesId} style={{ ...s.loadLineCard, marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                          <div style={s.loadLineName}>{l.speciesName}</div>
                          <div style={{ fontSize: 11, color: "#64748b" }}>
                            {baseLabel}: {baseQty.toLocaleString()}
                            {existingAlloc > 0 && <span style={{ color: "#b45309" }}> · Prev.allocated: {existingAlloc.toLocaleString()}</span>}
                            <span style={{ color: available > 0 ? "#16a34a" : "#dc2626", fontWeight: 700 }}> · Available: {available.toLocaleString()}</span>
                          </div>
                        </div>
                        <div style={s.loadLineInputs}>
                          <label style={s.label}>{slot.clientId === "HUB" ? "Qty for Hub" : "Qty to Deliver"}
                            <NumericInput style={s.input} allowDecimal={false}
                              value={l.qty || ""} placeholder="0"
                              onChange={e => setAllocSlots(ss => ss.map((x, j) => j !== si ? x : {
                                ...x, lines: x.lines.map((ll, k) => k !== li ? ll : { ...ll, qty: parseInt(e.target.value) || 0 })
                              }))} disabled={busy} onFocus={e => e.target.select()} />
                          </label>
                          {slot.clientId !== "HUB" && (
                            <label style={s.label}>Unit Price (R, incl. VAT)
                              <NumericInput style={s.input}
                                value={l.unitPrice || ""} placeholder="0.00"
                                onChange={e => setAllocSlots(ss => ss.map((x, j) => j !== si ? x : {
                                  ...x, lines: x.lines.map((ll, k) => k !== li ? ll : { ...ll, unitPrice: parseFloat(e.target.value) || 0 })
                                }))} disabled={busy} onFocus={e => e.target.select()} />
                            </label>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            <button
              style={{ ...s.secondaryBtn, width: "100%", marginBottom: 16, color: "#0891b2", borderColor: "#0891b2", borderStyle: "dashed" }}
              onClick={() => setAllocSlots(ss => [...ss, blankSlot(allocItem)])}
              disabled={busy}
            >+ Add Another Client</button>

            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
              ℹ️ Only enter quantities you want to allocate. Unallocated stock returns to hub.
            </div>

            <div style={s.modalBtns}>
              <button style={s.secondaryBtn} onClick={() => setAllocItem(null)} disabled={busy}>Cancel</button>
              <button style={s.primaryBtn} onClick={submitAllocation} disabled={busy}>
                {busy ? "Saving…" : (() => {
                  const active = allocSlots.filter(s => s.clientId && s.lines.some(l => l.qty > 0));
                  const hubSlots = active.filter(s => s.clientId === "HUB").length;
                  const clientSlots = active.filter(s => s.clientId !== "HUB").length;
                  if (clientSlots > 0 && hubSlots > 0) return `Save Allocations (${clientSlots} delivery + Hub) ✓`;
                  if (hubSlots > 0) return "Allocate to Hub 🏠";
                  return `Create ${clientSlots || ""} Delivery Order${clientSlots === 1 ? "" : "s"} 🚚`;
                })()}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Driver discrepancy report modal */}
      {showDiscrepancy && (
        <div style={s.backdrop} onClick={() => setShowDiscrepancy(false)}>
          <div style={{ ...s.modal, maxWidth: 720 }} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>📋 Driver Receipt Discrepancy Report</div>
            <div style={s.modalSub}>Short, over and dead quantities recorded per driver on hub confirmation</div>
            {discrepancyError && <div style={s.formError}>{discrepancyError}</div>}
            {discrepancyLoading ? (
              <div style={{ textAlign: "center", padding: 32, color: "#64748b" }}>Loading report…</div>
            ) : discrepancyReport && discrepancyReport.length === 0 ? (
              <div style={{ textAlign: "center", padding: 24, color: "#16a34a", fontWeight: 700, fontSize: 15 }}>✓ No discrepancies recorded</div>
            ) : discrepancyReport ? (
              <div style={{ maxHeight: 520, overflowY: "auto" }}>
                {discrepancyReport.map(driver => (
                  <div key={driver.driverId} style={{ border: "1px solid #e2e8f0", borderRadius: 12, marginBottom: 16, overflow: "hidden" }}>
                    {/* Driver header */}
                    <div style={{ background: "#f8fafc", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>🚛 {driver.driverName}</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {driver.totalShort > 0 && (
                          <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 20, background: "rgba(220,38,38,0.1)", color: "#dc2626", border: "1px solid rgba(220,38,38,0.3)" }}>
                            Short: {driver.totalShort}
                          </span>
                        )}
                        {driver.totalOver > 0 && (
                          <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 20, background: "rgba(22,163,74,0.1)", color: "#16a34a", border: "1px solid rgba(22,163,74,0.3)" }}>
                            Over: {driver.totalOver}
                          </span>
                        )}
                        {driver.totalDead > 0 && (
                          <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 20, background: "rgba(234,88,12,0.1)", color: "#c2410c", border: "1px solid rgba(234,88,12,0.3)" }}>
                            Dead: {driver.totalDead}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Collections */}
                    {driver.collections.map(col => (
                      <div key={col.collectionRequestId} style={{ padding: "10px 16px", borderTop: "1px solid #f1f5f9" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 4 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>
                            CR-{col.collectionRequestId.split("-")[0].toUpperCase()} · {col.supplierName}
                          </div>
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>
                            {col.collectionDate && <span>📅 {new Date(col.collectionDate).toLocaleDateString("en-ZA")} · </span>}
                            Confirmed {new Date(col.confirmedAt).toLocaleDateString("en-ZA")}
                          </div>
                        </div>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: "#f8fafc" }}>
                              <th style={{ textAlign: "left", padding: "3px 8px", color: "#64748b", fontWeight: 600 }}>Species</th>
                              <th style={{ textAlign: "right", padding: "3px 8px", color: "#64748b", fontWeight: 600 }}>Loaded</th>
                              <th style={{ textAlign: "right", padding: "3px 8px", color: "#dc2626", fontWeight: 700 }}>Short</th>
                              <th style={{ textAlign: "right", padding: "3px 8px", color: "#16a34a", fontWeight: 700 }}>Over</th>
                              <th style={{ textAlign: "right", padding: "3px 8px", color: "#c2410c", fontWeight: 700 }}>Dead</th>
                            </tr>
                          </thead>
                          <tbody>
                            {col.lines.map((line, li) => (
                              <tr key={li} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                <td style={{ padding: "4px 8px", fontWeight: 600 }}>{line.speciesName}</td>
                                <td style={{ padding: "4px 8px", textAlign: "right" }}>{line.loadedQty}</td>
                                <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 700, color: line.shortQty > 0 ? "#dc2626" : "#cbd5e1" }}>
                                  {line.shortQty > 0 ? line.shortQty : "—"}
                                </td>
                                <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 700, color: line.overQty > 0 ? "#16a34a" : "#cbd5e1" }}>
                                  {line.overQty > 0 ? line.overQty : "—"}
                                </td>
                                <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 700, color: line.deadQty > 0 ? "#c2410c" : "#cbd5e1" }}>
                                  {line.deadQty > 0 ? line.deadQty : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {col.lines.some(l => l.notes) && (
                          <div style={{ marginTop: 4 }}>
                            {col.lines.filter(l => l.notes).map((l, i) => (
                              <div key={i} style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                                {l.speciesName}: {l.notes}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
            <div style={s.modalBtns}>
              <button style={s.secondaryBtn} onClick={() => setShowDiscrepancy(false)}>Close</button>
              <button style={s.secondaryBtn} onClick={() => { setDiscrepancyReport(null); openDiscrepancyReport(); }}>↻ Refresh</button>
            </div>
          </div>
        </div>
      )}

      {/* Shortfall report modal */}
      {showShortfall && (
        <div style={s.backdrop} onClick={() => setShowShortfall(false)}>
          <div style={{ ...s.modal, maxWidth: 680 }} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>⚠ Loading Shortfall Report</div>
            <div style={s.modalSub}>Collection requests where the driver loaded less stock than ordered</div>
            {shortfallError && <div style={s.formError}>{shortfallError}</div>}
            {shortfallLoading ? (
              <div style={{ textAlign: "center", padding: 32, color: "#64748b" }}>Loading report…</div>
            ) : shortfallReport && shortfallReport.length === 0 ? (
              <div style={{ textAlign: "center", padding: 24, color: "#16a34a", fontWeight: 700, fontSize: 15 }}>✓ No shortfalls recorded</div>
            ) : shortfallReport ? (
              <div style={{ maxHeight: 480, overflowY: "auto" }}>
                {shortfallReport.map(item => (
                  <div key={item.collectionRequestId} style={{ background: "#fff7ed", border: "1px solid rgba(234,88,12,0.3)", borderRadius: 10, padding: 14, marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>
                          CR-{item.collectionRequestId.split("-")[0].toUpperCase()} · {item.supplierName}
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                          {item.assignedDriverName}
                          {item.collectionDate && <span> · 📅 {new Date(item.collectionDate).toLocaleDateString("en-ZA")}</span>}
                          <span> · Created {new Date(item.createdAt).toLocaleDateString("en-ZA")}</span>
                        </div>
                      </div>
                      <span style={{ ...s.badge, ...STATUS_COLORS[item.status] }}>{item.status}</span>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid rgba(234,88,12,0.2)" }}>
                          <th style={{ textAlign: "left", padding: "4px 6px", color: "#64748b", fontWeight: 600 }}>Species</th>
                          <th style={{ textAlign: "right", padding: "4px 6px", color: "#64748b", fontWeight: 600 }}>Ordered</th>
                          <th style={{ textAlign: "right", padding: "4px 6px", color: "#64748b", fontWeight: 600 }}>Loaded</th>
                          <th style={{ textAlign: "right", padding: "4px 6px", color: "#dc2626", fontWeight: 700 }}>Shortfall</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.shortfallLines.map(line => (
                          <tr key={line.speciesId} style={{ borderBottom: "1px solid rgba(234,88,12,0.1)" }}>
                            <td style={{ padding: "4px 6px", fontWeight: 600 }}>{line.speciesName || line.speciesId}</td>
                            <td style={{ padding: "4px 6px", textAlign: "right" }}>{line.orderedQty.toLocaleString()}</td>
                            <td style={{ padding: "4px 6px", textAlign: "right" }}>{line.loadedQty.toLocaleString()}</td>
                            <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 800, color: "#dc2626" }}>
                              -{line.shortfallQty.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {item.shortfallLines.some(l => l.loadingNotes) && (
                      <div style={{ marginTop: 8 }}>
                        {item.shortfallLines.filter(l => l.loadingNotes).map(l => (
                          <div key={l.speciesId} style={{ fontSize: 12, color: "#92400e", marginTop: 3 }}>
                            {l.speciesName}: {l.loadingNotes}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
            <div style={s.modalBtns}>
              <button style={s.secondaryBtn} onClick={() => setShowShortfall(false)}>Close</button>
              <button style={s.secondaryBtn} onClick={() => { setShortfallReport(null); openShortfallReport(); }}>↻ Refresh</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit allocation modal */}
      {editAllocCr && (
        <div style={s.backdrop} onClick={() => !editAllocBusy && setEditAllocCr(null)}>
          <div style={{ ...s.modal, maxWidth: 580 }} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>Edit Allocation — {editAllocClientName}</div>
            <div style={s.modalSub}>
              DO-{editAllocDoId.split("-")[0].toUpperCase()} · {editAllocCr.supplierName} · {editAllocCr.assignedDriverName}
            </div>
            <div style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.4)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#713f12", marginBottom: 14 }}>
              ⚠ Editing will update qty and price on the linked delivery order. Stock booked to other clients is preserved.
            </div>
            {editAllocError && <div style={s.formError}>{editAllocError}</div>}

            {editAllocLines.map((l, i) => {
              const effectiveQty   = l.loadedQty > 0 ? l.loadedQty : l.orderedQty;
              const effectiveLabel = l.loadedQty > 0 ? "Loaded" : "Ordered";
              const maxQty = effectiveQty - l.otherClientsQty;
              const overAllocated = l.qty > maxQty;
              return (
                <div key={l.speciesId} style={{ ...s.loadLineCard, borderColor: overAllocated ? "#fca5a5" : undefined }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                    <div style={s.loadLineName}>{l.speciesName}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>
                      {effectiveLabel}: {effectiveQty.toLocaleString()}
                      {l.otherClientsQty > 0 && <span style={{ color: "#b45309" }}> · Other clients: {l.otherClientsQty.toLocaleString()}</span>}
                      <span style={{ color: maxQty > 0 ? "#16a34a" : "#dc2626", fontWeight: 700 }}> · Max: {maxQty.toLocaleString()}</span>
                    </div>
                  </div>
                  <div style={s.loadLineInputs}>
                    <label style={s.label}>Qty
                      <NumericInput
                        style={{ ...s.input, borderColor: overAllocated ? "#fca5a5" : undefined }}
                        allowDecimal={false} 
                        value={l.qty}
                        onChange={e => setEditAllocLines(ls => ls.map((x, j) => j === i ? { ...x, qty: parseInt(e.target.value) || 0 } : x))}
                        disabled={editAllocBusy}
                        onFocus={e => e.target.select()}
                      />
                    </label>
                    <label style={s.label}>Unit Price (R, incl. VAT)
                      <NumericInput
                        style={s.input}
                        
                        value={l.unitPrice || ""}
                        placeholder="0.00"
                        onChange={e => setEditAllocLines(ls => ls.map((x, j) => j === i ? { ...x, unitPrice: parseFloat(e.target.value) || 0 } : x))}
                        disabled={editAllocBusy}
                        onFocus={e => e.target.select()}
                      />
                    </label>
                  </div>
                  {overAllocated && (
                    <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4, fontWeight: 600 }}>
                      ✕ Exceeds available qty by {l.qty - maxQty}
                    </div>
                  )}
                </div>
              );
            })}

            <div style={s.modalBtns}>
              <button style={s.secondaryBtn} onClick={() => setEditAllocCr(null)} disabled={editAllocBusy}>Cancel</button>
              <button style={s.primaryBtn} onClick={submitEditAlloc} disabled={editAllocBusy}>
                {editAllocBusy ? "Saving…" : "Save Changes ✓"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Roadside sales modal */}
      {roadsaleItem && (
        <div style={s.backdrop} onClick={() => !roadsaleBusy && setRoadsaleItem(null)}>
          <div style={{ ...s.modal, maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>🛣 Roadside Sales</div>
            <div style={s.modalSub}>
              {roadsaleItem.assignedDriverName} · {roadsaleItem.supplierName} — record stock the driver sold before returning to hub
            </div>

            {/* Hub return reference strip */}
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8, marginBottom: 14, padding: "8px 10px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
              {roadsaleItem.lines.map(l => {
                const baseQty = l.loadedQty > 0 ? l.loadedQty : l.orderedQty;
                const clientAllocated = (roadsaleItem.deliveryAllocations ?? []).flatMap(a => a.lines).filter(x => x.speciesId === l.speciesId).reduce((s, x) => s + x.qty, 0);
                const hubReturn = baseQty - clientAllocated;
                const label = l.loadedQty > 0 ? "loaded" : "ordered";
                return hubReturn > 0 ? (
                  <span key={l.speciesId} style={{ fontSize: 12, color: "#374151" }}>
                    <strong>{l.speciesName || l.speciesId}</strong>: {hubReturn} available ({label})
                  </span>
                ) : null;
              })}
            </div>

            {roadsaleError && <div style={s.formError}>{roadsaleError}</div>}

            {roadsaleLines.map((line, i) => (
              <div key={i} style={{ ...s.loadLineCard, marginBottom: 8, display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
                <label style={s.label}>Species
                  <select style={s.input} value={line.speciesId} disabled={roadsaleBusy}
                    onChange={e => {
                      const sp = roadsaleItem.lines.find(l => l.speciesId === e.target.value);
                      setRoadsaleLines(ls => ls.map((x, j) => j !== i ? x : { ...x, speciesId: e.target.value, speciesName: sp?.speciesName ?? e.target.value }));
                    }}>
                    <option value="">— Select —</option>
                    {roadsaleItem.lines.map(l => <option key={l.speciesId} value={l.speciesId}>{l.speciesName || l.speciesId}</option>)}
                  </select>
                </label>
                <label style={s.label}>Qty
                  <NumericInput style={s.input} allowDecimal={false} value={line.qty || ""} placeholder="0" disabled={roadsaleBusy}
                    onChange={e => setRoadsaleLines(ls => ls.map((x, j) => j !== i ? x : { ...x, qty: parseInt(e.target.value) || 0 }))}
                    onFocus={e => e.target.select()} />
                </label>
                <label style={s.label}>Unit Price (R)
                  <NumericInput style={s.input} value={line.unitPrice || ""} placeholder="0.00" disabled={roadsaleBusy}
                    onChange={e => setRoadsaleLines(ls => ls.map((x, j) => j !== i ? x : { ...x, unitPrice: parseFloat(e.target.value) || 0 }))}
                    onFocus={e => e.target.select()} />
                </label>
                <label style={s.label}>Payment
                  <select style={s.input} value={line.paymentType} disabled={roadsaleBusy}
                    onChange={e => setRoadsaleLines(ls => ls.map((x, j) => j !== i ? x : { ...x, paymentType: e.target.value }))}>
                    <option value="Cash">Cash</option>
                    <option value="EFT">EFT</option>
                  </select>
                </label>
                <button
                  style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, padding: "0 4px", alignSelf: "center" as const, marginTop: 18 }}
                  onClick={() => setRoadsaleLines(ls => ls.filter((_, j) => j !== i))}
                  disabled={roadsaleBusy}
                >✕</button>
              </div>
            ))}

            <button
              style={{ ...s.secondaryBtn, width: "100%", marginBottom: 4, color: "#7c3aed", borderColor: "#7c3aed", borderStyle: "dashed" }}
              onClick={() => setRoadsaleLines(ls => [...ls, { speciesId: roadsaleItem.lines[0]?.speciesId ?? "", speciesName: roadsaleItem.lines[0]?.speciesName ?? "", qty: 0, unitPrice: 0, paymentType: "Cash" }])}
              disabled={roadsaleBusy}
            >+ Add Sale Line</button>

            {/* Running total */}
            {roadsaleLines.filter(l => l.qty > 0 && l.unitPrice > 0).length > 0 && (
              <div style={{ fontSize: 13, color: "#374151", marginTop: 8, marginBottom: 4 }}>
                Total:{" "}
                {["Cash", "EFT"].map(pt => {
                  const v = roadsaleLines.filter(l => l.paymentType === pt && l.qty > 0).reduce((s, l) => s + l.qty * l.unitPrice, 0);
                  return v > 0 ? (
                    <span key={pt} style={{ marginRight: 12, fontWeight: 700,
                      color: pt === "Cash" ? "#15803d" : "#1d4ed8",
                    }}>
                      {pt}: R{v.toFixed(2)}
                    </span>
                  ) : null;
                })}
              </div>
            )}

            <div style={s.modalBtns}>
              <button style={s.secondaryBtn} onClick={() => setRoadsaleItem(null)} disabled={roadsaleBusy}>Cancel</button>
              <button style={s.primaryBtn} onClick={submitRoadsale} disabled={roadsaleBusy}>
                {roadsaleBusy ? "Saving…" : "Save Roadside Sales ✓"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delivery modal — admin records actual qty + payment type */}
      {confirmDeliveryCr && (
        <div style={s.backdrop} onClick={() => !confirmDeliveryBusy && setConfirmDeliveryCr(null)}>
          <div style={{ ...s.modal, maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>Confirm Delivery</div>
            <div style={s.modalSub}>{confirmDeliveryClient}</div>

            <div style={{ overflowX: "auto", marginBottom: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f1f5f9" }}>
                    <th style={s.thLeft}>Species</th>
                    <th style={{ ...s.thRight, minWidth: 70 }}>Allocated</th>
                    <th style={{ ...s.thRight, minWidth: 90 }}>Delivered ✎</th>
                    <th style={{ ...s.thRight, minWidth: 70 }}>Returns</th>
                  </tr>
                </thead>
                <tbody>
                  {confirmDeliveryLines.map((l, i) => (
                    <tr key={l.speciesId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "7px 8px", fontWeight: 600 }}>{l.speciesName}</td>
                      <td style={{ padding: "7px 8px", textAlign: "right", color: "#64748b" }}>{l.allocatedQty.toLocaleString()}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right" }}>
                        <NumericInput
                          style={{ ...s.input, width: 80, textAlign: "right" as const, margin: 0, padding: "4px 6px" }}
                          allowDecimal={false}
                          value={l.deliveredQty}
                          onFocus={e => e.target.select()}
                          onChange={e => setConfirmDeliveryLines(ls => ls.map((x, j) =>
                            j === i ? { ...x, deliveredQty: parseInt(e.target.value) || 0 } : x
                          ))}
                          disabled={confirmDeliveryBusy}
                        />
                      </td>
                      <td style={{ padding: "7px 8px", textAlign: "right",
                        color: l.allocatedQty - l.deliveredQty > 0 ? "#b45309" : "#64748b", fontWeight: 600 }}>
                        {(l.allocatedQty - l.deliveredQty).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <label style={s.label}>Payment Type *
              <select style={s.input} value={confirmDeliveryPayment}
                onChange={e => setConfirmDeliveryPayment(e.target.value)}
                disabled={confirmDeliveryBusy}>
                <option value="Cash">Cash</option>
                <option value="EFT">EFT</option>
                <option value="Credit">Credit</option>
              </select>
            </label>

            {confirmDeliveryError && <div style={s.errorText}>{confirmDeliveryError}</div>}

            <div style={s.modalBtns}>
              <button style={s.secondaryBtn} onClick={() => setConfirmDeliveryCr(null)} disabled={confirmDeliveryBusy}>Cancel</button>
              <button style={s.primaryBtn} onClick={submitConfirmDelivery} disabled={confirmDeliveryBusy}>
                {confirmDeliveryBusy ? "Saving…" : "Confirm Delivery ✓"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hub accept modal — hub staff verifies and checks in HUB-allocated stock */}
      {hubAcceptCr && (
        <div style={s.backdrop} onClick={() => !hubAcceptBusy && setHubAcceptCr(null)}>
          <div style={{ ...s.modal, maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>🏠 Accept Hub Stock</div>
            <div style={s.modalSub}>{hubAcceptCr.supplierName} · {hubAcceptCr.assignedDriverName}</div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
              Verify the quantity physically received at the hub. Stock will be added to inventory.
            </div>

            <div style={{ overflowX: "auto", marginBottom: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f1f5f9" }}>
                    <th style={s.thLeft}>Species</th>
                    <th style={{ ...s.thRight, minWidth: 70 }}>Allocated</th>
                    <th style={{ ...s.thRight, minWidth: 90 }}>Received ✎</th>
                    <th style={{ ...s.thRight, minWidth: 70 }}>Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {hubAcceptLines.map((l, i) => (
                    <tr key={l.speciesId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "7px 8px", fontWeight: 600 }}>{l.speciesName}</td>
                      <td style={{ padding: "7px 8px", textAlign: "right", color: "#64748b" }}>{l.allocatedQty.toLocaleString()}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right" }}>
                        <NumericInput
                          style={{ ...s.input, width: 80, textAlign: "right" as const, margin: 0, padding: "4px 6px" }}
                          allowDecimal={false}
                          value={l.acceptedQty}
                          onFocus={e => e.target.select()}
                          onChange={e => setHubAcceptLines(ls => ls.map((x, j) =>
                            j === i ? { ...x, acceptedQty: parseInt(e.target.value) || 0 } : x
                          ))}
                          disabled={hubAcceptBusy}
                        />
                      </td>
                      <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 600,
                        color: l.allocatedQty - l.acceptedQty !== 0 ? "#b45309" : "#15803d" }}>
                        {l.allocatedQty - l.acceptedQty !== 0
                          ? (l.allocatedQty - l.acceptedQty > 0 ? "-" : "+") + Math.abs(l.allocatedQty - l.acceptedQty).toLocaleString()
                          : "✓"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {hubAcceptError && <div style={s.errorText}>{hubAcceptError}</div>}

            <div style={s.modalBtns}>
              <button style={s.secondaryBtn} onClick={() => setHubAcceptCr(null)} disabled={hubAcceptBusy}>Cancel</button>
              <button style={{ ...s.primaryBtn, background: "#15803d" }} onClick={submitHubAccept} disabled={hubAcceptBusy}>
                {hubAcceptBusy ? "Saving…" : "✓ Confirm Receipt"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Finance acknowledge modal */}
      {ackItem && (
        <div style={s.backdrop} onClick={() => !busy && setAckItem(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>Acknowledge Delivery</div>
            <div style={s.modalSub}>{ackItem.supplierName} · {ackItem.assignedDriverName}</div>

            {/* Driver's delivery note photo */}
            {ackItem.deliveryNoteS3Key && (
              <div style={s.dnSection}>
                <div style={s.dnSectionTitle}>📷 Driver's Delivery Note</div>
                {deliveryNoteLoading ? (
                  <div style={s.dnLoading}>Loading image…</div>
                ) : deliveryNoteUrl ? (
                  <div>
                    <img
                      src={deliveryNoteUrl}
                      alt="Delivery note"
                      style={{ width: "100%", borderRadius: 8, maxHeight: 320, objectFit: "contain", background: "#f1f5f9" }}
                      onError={e => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                        const msg = e.currentTarget.nextElementSibling as HTMLElement | null;
                        if (msg) msg.style.display = "block";
                      }}
                    />
                    <div style={{ display: "none", fontSize: 12, color: "#dc2626", marginTop: 6 }}>
                      Could not display image inline. <a href={deliveryNoteUrl} target="_blank" rel="noreferrer" style={{ color: "#0891b2", fontWeight: 700 }}>Open in new tab</a>
                    </div>
                    <a href={deliveryNoteUrl} target="_blank" rel="noreferrer" style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 4, textAlign: "right" }}>
                      ↗ Open full size
                    </a>
                  </div>
                ) : (
                  <div style={s.dnLoading}>Could not load delivery note image.</div>
                )}
              </div>
            )}

            {ackError && <div style={s.formError}>{ackError}</div>}
            <label style={s.label}>Supplier Invoice (PDF)
              <input type="file" accept="application/pdf" onChange={e => setAckFile(e.target.files?.[0] ?? null)} disabled={busy} style={{ fontSize: 14 }} />
            </label>
            <div style={s.modalBtns}>
              <button style={s.secondaryBtn} onClick={() => setAckItem(null)} disabled={busy}>Cancel</button>
              <button style={s.primaryBtn} onClick={submitAck} disabled={busy || ackUploading}>{ackUploading ? "Uploading…" : "Upload & Acknowledge"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Change payment type modal */}
      {patchPaymentTarget && (
        <div style={s.backdrop} onClick={() => !patchPaymentBusy && (setPatchPaymentTarget(null), setPatchPaymentFile(null), setPatchPaymentError(""))}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>Change Payment Type</div>
            <div style={s.modalSub}>
              {patchPaymentTarget.clientName} — currently <strong>{patchPaymentTarget.currentPaymentType}</strong>
            </div>
            {patchPaymentError && <div style={s.formError}>{patchPaymentError}</div>}
            <label style={s.label}>
              Payment Type
              <select
                value={patchPaymentType}
                onChange={e => setPatchPaymentType(e.target.value)}
                style={s.input}
                disabled={patchPaymentBusy}>
                <option value="Cash">Cash</option>
                <option value="EFT">EFT</option>
                <option value="Credit">Credit</option>
                <option value="CardMachine">Card Machine</option>
              </select>
            </label>
            <label style={s.label}>
              Proof of Payment (optional)
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={e => setPatchPaymentFile(e.target.files?.[0] ?? null)}
                disabled={patchPaymentBusy}
                style={{ fontSize: 13, color: "#374151" }} />
            </label>
            {patchPaymentFile && (
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>📎 {patchPaymentFile.name}</div>
            )}
            <div style={s.modalBtns}>
              <button
                style={s.secondaryBtn}
                onClick={() => { setPatchPaymentTarget(null); setPatchPaymentFile(null); setPatchPaymentError(""); }}
                disabled={patchPaymentBusy}>
                Cancel
              </button>
              <button style={s.primaryBtn} onClick={submitPatchPayment} disabled={patchPaymentBusy}>
                {patchPaymentBusy ? "Saving…" : "💾 Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove allocation confirm modal */}
      {removeAllocTarget && (
        <div style={s.backdrop} onClick={() => !removeAllocBusy && setRemoveAllocTarget(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>Remove Allocation?</div>
            <div style={s.modalSub}>
              {removeAllocTarget.deliveryOrderId === "HUB"
                ? "Remove the HUB stock allocation?"
                : `Remove delivery allocation for ${removeAllocTarget.clientName}?`}
            </div>
            <p style={{ fontSize: 13, color: "#374151", marginBottom: 16 }}>
              This will reverse all stock bookings and permanently delete the delivery order.
              This action cannot be undone.
            </p>
            {removeAllocError && <div style={s.formError}>{removeAllocError}</div>}
            <div style={s.modalBtns}>
              <button style={s.secondaryBtn} onClick={() => { setRemoveAllocTarget(null); setRemoveAllocError(""); }} disabled={removeAllocBusy}>Cancel</button>
              <button style={{ ...s.primaryBtn, background: "#dc2626" }} onClick={submitRemoveAlloc} disabled={removeAllocBusy}>
                {removeAllocBusy ? "Removing…" : "🗑 Yes, Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: "20px 24px", fontFamily: "system-ui", background: "#f1f5f9", minHeight: "100vh" },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 24 },
  pageTitle: { fontSize: 22, fontWeight: 800, color: "#0f172a" },
  pageSub: { fontSize: 13, color: "#64748b", marginTop: 2 },
  loading: { textAlign: "center", padding: 40, color: "#64748b" },
  empty: { textAlign: "center", padding: 40, color: "#94a3b8", fontSize: 15 },
  errorBanner: { background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 14 },
  list: { display: "flex", flexDirection: "column", gap: 10 },
  filterSelect: { padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13, background: "#fff", minWidth: 160 },
  card: { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" },
  cardHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", cursor: "pointer" },
  cardLeft: { flex: 1, minWidth: 0 },
  orderId: { fontSize: 15, fontWeight: 700, color: "#0f172a" },
  badge: { fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20 },
  cardMeta: { fontSize: 13, color: "#64748b", marginTop: 4 },
  chevron: { fontSize: 12, color: "#94a3b8", marginLeft: 12 },
  cardBody: { padding: "0 18px 16px", borderTop: "1px solid #f1f5f9" },
  notes: { fontSize: 13, color: "#374151", marginTop: 12 },
  linesGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8, marginTop: 12 },
  lineCard: { background: "#f8fafc", borderRadius: 8, padding: 10, border: "1px solid #e2e8f0" },
  lineName: { fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 6 },
  lineStats: { display: "flex", gap: 12 },
  lineStat: { fontSize: 13, fontWeight: 600 },
  lineStatLabel: { fontSize: 11, color: "#94a3b8", display: "block" as const },
  lineNote: { fontSize: 12, color: "#92400e", marginTop: 4 },
  cardActions: { display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end", flexWrap: "wrap" },
  backdrop: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto", zIndex: 300 },
  modal: { background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 560, boxSizing: "border-box", marginTop: 32 },
  modalTitle: { fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 4 },
  modalSub: { fontSize: 13, color: "#64748b", marginBottom: 16 },
  formError: { background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13 },
  label: { display: "grid", gap: 4, fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 },
  input: { width: "100%", minWidth: 0, padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box", background: "#f9fafb", color: "#111827", outline: "none" },
  loadLineCard: { background: "#f8fafc", borderRadius: 10, padding: 12, border: "1px solid #e2e8f0", marginBottom: 10 },
  loadLineName: { fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 2 },
  loadLineOrdered: { fontSize: 12, color: "#64748b", marginBottom: 8 },
  loadLineInputs: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  modalBtns: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20, flexWrap: "wrap" },
  primaryBtn: { padding: "10px 20px", borderRadius: 8, background: "#16a34a", color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  secondaryBtn: { padding: "10px 18px", borderRadius: 8, background: "#fff", border: "1px solid #d1d5db", color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer" },

  dnBadge: {
    marginTop: 10,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    color: "#0369a1",
    background: "rgba(3,105,161,0.08)",
    border: "1px solid rgba(3,105,161,0.2)",
    borderRadius: 999,
    padding: "3px 10px",
  },
  dnSection: {
    marginBottom: 16,
    padding: 12,
    background: "#f8fafc",
    borderRadius: 10,
    border: "1px solid #e2e8f0",
  },
  dnSectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#334155",
    marginBottom: 10,
  },
  dnLoading: {
    textAlign: "center" as const,
    padding: "20px 0",
    color: "#94a3b8",
    fontSize: 13,
  },
  allocBtn: {
    padding: "10px 18px",
    borderRadius: 8,
    background: "rgba(37,99,235,0.08)",
    border: "1px solid rgba(37,99,235,0.4)",
    color: "#1d4ed8",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  shortfallBtn: { padding: "10px 18px", borderRadius: 8, background: "rgba(234,88,12,0.08)", border: "1px solid rgba(234,88,12,0.4)", color: "#9a3412", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  discrepancyBtn: { padding: "10px 18px", borderRadius: 8, background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.4)", color: "#1e3a8a", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  roadsaleBtn: { padding: "10px 18px", borderRadius: 8, background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.4)", color: "#6d28d9", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  refreshBtn: { padding: "8px 12px", borderRadius: 8, background: "#f1f5f9", border: "1px solid #cbd5e1", color: "#64748b", fontWeight: 700, fontSize: 15, cursor: "pointer", lineHeight: 1 },
  editAllocBtn: { padding: "2px 10px", borderRadius: 6, background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.35)", color: "#6d28d9", fontWeight: 700, fontSize: 11, cursor: "pointer" },
  removeAllocBtn: { padding: "2px 10px", borderRadius: 6, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.35)", color: "#dc2626", fontWeight: 700, fontSize: 11, cursor: "pointer" },
  summarySection: { marginTop: 14, padding: "12px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10 },
  summarySectionTitle: { fontSize: 12, fontWeight: 800, color: "#334155", textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  thLeft: { padding: "6px 8px", textAlign: "left" as const, color: "#64748b", fontWeight: 700, fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.04em" },
  thRight: { padding: "6px 8px", textAlign: "right" as const, color: "#64748b", fontWeight: 700, fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.04em" },
  allocSlotCard: { background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: 14, marginBottom: 14 },
  allocSection: {
    marginTop: 14,
    padding: "10px 12px",
    background: "rgba(37,99,235,0.04)",
    border: "1px solid rgba(37,99,235,0.15)",
    borderRadius: 10,
  },
  allocSectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: "#1e40af",
    marginBottom: 8,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  allocCard: {
    background: "#fff",
    borderRadius: 8,
    padding: "8px 12px",
    border: "1px solid rgba(37,99,235,0.15)",
    marginBottom: 6,
  },
  allocClientRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  allocClientName: {
    fontSize: 13,
    fontWeight: 700,
    color: "#1e3a8a",
  },
  allocDoId: {
    fontSize: 11,
    fontWeight: 700,
    color: "#64748b",
    background: "#f1f5f9",
    border: "1px solid #e2e8f0",
    borderRadius: 6,
    padding: "1px 7px",
  },
  allocLines: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
  },
  allocLinePill: {
    fontSize: 12,
    color: "#374151",
    background: "rgba(37,99,235,0.06)",
    border: "1px solid rgba(37,99,235,0.2)",
    borderRadius: 20,
    padding: "2px 10px",
  },
};
