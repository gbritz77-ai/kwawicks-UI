// ✅ HubTasksPage.tsx (FIXED + Sort + Hover)
// Fixes applied:
// 1) ✅ Clients grid had 6 columns in UI but only 5 in gridTemplateColumns -> FIXED
// 2) ✅ Added "Sort by" + Asc/Desc toggle for Clients
// 3) ✅ Added row hover highlight (inline-style safe via hoveredClientId state)

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { speciesApi, type SpeciesResponse } from "../api/speciesApi";
import { clientsApi, type ClientDto, type ClientType } from "../api/clientsApi";
import { hasAnyRole } from "../api/auth";
import { NumericInput } from "../components/NumericInput";

type Tab = "species" | "clients";

// ---------- Species ----------
type SpeciesFormState = {
  speciesId?: string;
  name: string;
  unitCost: string;
  sellPrice: string;

  vat: string;
  qtyOnHandHub: string;
  qtyBookedOutForDelivery: string;

  isActive: boolean;
};

const emptySpeciesForm: SpeciesFormState = {
  name: "",
  unitCost: "",
  sellPrice: "",

  vat: "0.15",
  qtyOnHandHub: "0",
  qtyBookedOutForDelivery: "0",

  isActive: true,
};

// ---------- Clients ----------
type ClientFormState = {
  clientId?: string;
  clientName: string;
  clientAddress: string;
  clientCity: string;
  clientProvince: string;
  clientPostalCode: string;
  clientContactDetails: string;
  clientPhone: string;
  clientType: ClientType;
};

const emptyClientForm: ClientFormState = {
  clientName: "",
  clientAddress: "",
  clientCity: "",
  clientProvince: "",
  clientPostalCode: "",
  clientContactDetails: "",
  clientPhone: "",
  clientType: 0, // 0=COD Cash, 1=COD EFT, 2=Credit
};

// ✅ Sort + Hover types/state (Clients)
type ClientSortKey = "clientName" | "clientId" | "clientType";
type SortDir = "asc" | "desc";

export default function HubTasksPage() {
  const navigate = useNavigate();
  const canManageSpecies  = hasAnyRole("Owner", "Admin");
  const canManageClients  = hasAnyRole("Owner", "Finance", "Admin", "Procurement");

  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>((searchParams.get("tab") as Tab) ?? "species");

  // Sync tab with URL search param whenever navigation changes it
  useEffect(() => {
    const t = searchParams.get("tab") as Tab;
    if (t === "species" || t === "clients") setTab(t);
  }, [searchParams]);

  // ---------- Species state ----------
  const [items, setItems] = useState<SpeciesResponse[]>([]);
  const [loading, setLoading] = useState(true);

  // ---------- Clients state ----------
  const [clients, setClients] = useState<ClientDto[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");

  // modals
  const [showSpeciesForm, setShowSpeciesForm] = useState(false);
  const [speciesForm, setSpeciesForm] = useState<SpeciesFormState>(emptySpeciesForm);

  const [showClientForm, setShowClientForm] = useState(false);
  const [clientForm, setClientForm] = useState<ClientFormState>(emptyClientForm);

  // ✅ Clients sort + hover state
  const [clientSortBy, setClientSortBy] = useState<ClientSortKey>("clientName");
  const [clientSortDir, setClientSortDir] = useState<SortDir>("asc");
  const [hoveredClientId, setHoveredClientId] = useState<string | null>(null);
  const [hoveredSpeciesId, setHoveredSpeciesId] = useState<string | null>(null);

  // Confirm-delete modal
  const [confirmDelete, setConfirmDelete] = useState<{ type: "species" | "client"; id: string; label: string } | null>(null);

  // ---------- Loaders ----------
  async function loadSpecies() {
    try {
      setError(null);
      setLoading(true);
      const data = await speciesApi.list();
      setItems(data);
    } catch (e: any) {
      setError(e?.message || "Could not load Hub Tasks.");
    } finally {
      setLoading(false);
    }
  }

  async function loadClients() {
    if (!canManageClients) return;
    try {
      setError(null);
      setLoadingClients(true);
      const data = await clientsApi.list(1000);
      setClients(data.filter((c: ClientDto) => !c.isWalkIn));
    } catch (e: any) {
      setError(e?.message || "Could not load Clients.");
    } finally {
      setLoadingClients(false);
    }
  }

  useEffect(() => {
    loadSpecies();
  }, []);

  useEffect(() => {
    if (tab === "clients" && canManageClients) loadClients();
  }, [tab, canManageClients]);

  // ---------- Filters ----------
  const filteredSpecies = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (x: any) =>
        (x?.name ?? "").toLowerCase().includes(q) ||
        (x?.speciesId ?? "").toLowerCase().includes(q)
    );
  }, [items, query]);

  // ✅ Clients: filter + sort
  const filteredClients = useMemo(() => {
    const q = query.trim().toLowerCase();

    const base = !q
      ? clients
      : clients.filter(
          (c) =>
            c.clientName.toLowerCase().includes(q) ||
            c.clientId.toLowerCase().includes(q)
        );

    const sorted = [...base].sort((a, b) => {
      let cmp = 0;

      if (clientSortBy === "clientName") {
        cmp = a.clientName.localeCompare(b.clientName);
      } else if (clientSortBy === "clientId") {
        cmp = a.clientId.localeCompare(b.clientId);
      } else if (clientSortBy === "clientType") {
        cmp = (a.clientType ?? 0) - (b.clientType ?? 0);
      }

      return clientSortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [clients, query, clientSortBy, clientSortDir]);

  // ---------- Species actions ----------
  function openCreateSpecies() {
    setError(null);
    setSpeciesForm(emptySpeciesForm);
    setShowSpeciesForm(true);
  }

  function openEditSpecies(s: SpeciesResponse) {
    setError(null);
    setSpeciesForm({
      speciesId: (s as any).speciesId,
      name: (s as any).name ?? "",
      unitCost: String((s as any).unitCost ?? ""),
      sellPrice: (s as any).sellPrice == null ? "" : String((s as any).sellPrice),

      vat: String((s as any).vat ?? "0.15"),
      qtyOnHandHub: String((s as any).qtyOnHandHub ?? 0),
      qtyBookedOutForDelivery: String((s as any).qtyBookedOutForDelivery ?? 0),

      isActive: (s as any).isActive ?? true,
    });
    setShowSpeciesForm(true);
  }

  async function saveSpecies() {
    if (!canManageSpecies) return;

    const name = speciesForm.name.trim();
    if (!name) return setError("Name is required.");

    const unitCost = Number(speciesForm.unitCost);
    if (!Number.isFinite(unitCost) || unitCost <= 0)
      return setError("Unit Cost must be greater than R 0.");

    const sellPrice = speciesForm.sellPrice.trim() === "" ? null : Number(speciesForm.sellPrice);
    if (sellPrice !== null && (!Number.isFinite(sellPrice) || sellPrice <= 0))
      return setError("Sell Price must be greater than R 0.");

    const vat = Number(speciesForm.vat);
    if (!Number.isFinite(vat) || vat < 0)
      return setError("Vat must be 0 or more (e.g. 0.15).");

    const qtyOnHandHub = Number(speciesForm.qtyOnHandHub);
    if (!Number.isInteger(qtyOnHandHub) || qtyOnHandHub < 0)
      return setError("Qty on hand must be 0 or more.");

    const qtyBookedOutForDelivery = Number(speciesForm.qtyBookedOutForDelivery);
    if (!Number.isInteger(qtyBookedOutForDelivery) || qtyBookedOutForDelivery < 0)
      return setError("Qty booked out must be 0 or more.");
    if (qtyBookedOutForDelivery > qtyOnHandHub)
      return setError("Qty booked out cannot exceed Qty on hand.");

    try {
      setError(null);
      setBusy(true);

      const payload = {
        name,
        unitCost,
        sellPrice,
        vat,
        qtyOnHandHub,
        qtyBookedOutForDelivery,
      };

      if (!speciesForm.speciesId) {
        const created = await speciesApi.create(payload as any);
        setItems((prev) => [created, ...prev]);
      } else {
        const updated = await speciesApi.update(speciesForm.speciesId, {
          ...(payload as any),
          isActive: speciesForm.isActive,
        });
        setItems((prev) =>
          prev.map((x: any) => ((x as any).speciesId === (updated as any).speciesId ? updated : x))
        );
      }

      setShowSpeciesForm(false);
      setSpeciesForm(emptySpeciesForm);
    } catch (e: any) {
      setError(e?.message || "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  function deleteSpecies(speciesId: string, name: string) {
    if (!canManageSpecies) return;
    setConfirmDelete({ type: "species", id: speciesId, label: name });
  }

  async function doDeleteSpecies(speciesId: string): Promise<boolean> {
    try {
      setError(null);
      setBusy(true);
      await speciesApi.delete(speciesId);
      setItems((prev) => prev.filter((x: any) => x.speciesId !== speciesId));
      return true;
    } catch (e: any) {
      setError(e?.message || "Delete failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  // ---------- Client actions ----------
  function openCreateClient() {
    if (!canManageClients) return;
    setError(null);
    setClientForm(emptyClientForm);
    setShowClientForm(true);
  }

  function openEditClient(c: ClientDto) {
    if (!canManageClients) return;
    setError(null);
    setClientForm({
      clientId: c.clientId,
      clientName: c.clientName,
      clientAddress: c.clientAddress,
      clientCity: c.clientCity ?? "",
      clientProvince: c.clientProvince ?? "",
      clientPostalCode: c.clientPostalCode ?? "",
      clientContactDetails: c.clientContactDetails,
      clientPhone: c.clientPhone,
      clientType: c.clientType,
    });
    setShowClientForm(true);
  }

  async function saveClient() {
    if (!canManageClients) return;

    const clientName = clientForm.clientName.trim();
    if (!clientName) return setError("Client Name is required.");

    try {
      setError(null);
      setBusy(true);

      const payload = {
        clientName,
        clientAddress: clientForm.clientAddress.trim(),
        clientCity: clientForm.clientCity.trim(),
        clientProvince: clientForm.clientProvince.trim(),
        clientPostalCode: clientForm.clientPostalCode.trim(),
        clientContactDetails: clientForm.clientContactDetails.trim(),
        clientPhone: clientForm.clientPhone.trim(),
        clientType: clientForm.clientType,
      };

      if (!clientForm.clientId) {
        const created = await clientsApi.create(payload);
        setClients((prev) => [created, ...prev]);
      } else {
        const updated = await clientsApi.update(clientForm.clientId, payload);
        // Use clientForm.clientId (known-good) not updated.clientId (could be undefined on edge cases)
        setClients((prev) => prev.map((x) => (x.clientId === clientForm.clientId ? updated : x)));
      }

      setShowClientForm(false);
      setClientForm(emptyClientForm);
    } catch (e: any) {
      setError(e?.message || "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  function deleteClient(clientId: string) {
    if (!canManageClients) return;
    const client = clients.find((c) => c.clientId === clientId);
    setConfirmDelete({ type: "client", id: clientId, label: client?.clientName ?? clientId });
  }

  async function doDeleteClient(clientId: string): Promise<boolean> {
    try {
      setError(null);
      setBusy(true);
      await clientsApi.remove(clientId);
      setClients((prev) => prev.filter((x) => x.clientId !== clientId));
      return true;
    } catch (e: any) {
      setError(e?.message || "Delete failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  // ---------- Header helpers ----------
  const headerSub = tab === "species" ? "Manage Species (inventory master list)" : "Manage Clients";
  const isLoading = tab === "species" ? loading : loadingClients;

  async function refreshActiveTab() {
    if (tab === "species") return loadSpecies();
    if (tab === "clients") return loadClients();
  }

  return (
    <div style={s.page}>
      <div style={s.headerRow}>
        <div>
          <div style={s.title}>Hub Tasks</div>
          <div style={s.sub}>{headerSub}</div>
        </div>

        <div style={s.headerActions}>
          <button style={s.secondaryBtn} onClick={() => navigate("/app")} disabled={busy}>
            ← Back
          </button>

          <button style={s.secondaryBtn} onClick={refreshActiveTab} disabled={isLoading || busy}>
            Refresh
          </button>

          {canManageSpecies && tab === "species" && (
            <button style={s.primaryBtn} onClick={openCreateSpecies} disabled={busy}>
              + Add Species
            </button>
          )}

          {canManageClients && tab === "clients" && (
            <button style={s.primaryBtn} onClick={openCreateClient} disabled={busy}>
              + Add Client
            </button>
          )}
        </div>
      </div>

      <div style={s.tabsRow}>
        <button style={tab === "species" ? s.tabActive : s.tab} onClick={() => setTab("species")} disabled={busy}>
          Species
        </button>

        {canManageClients && (
          <button style={tab === "clients" ? s.tabActive : s.tab} onClick={() => setTab("clients")} disabled={busy}>
            Clients
          </button>
        )}
      </div>

      <div style={s.searchRow}>
        <input
          style={s.search}
          placeholder="Search by name or ID..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={isLoading}
        />
      </div>

      {/* Sort controls (Clients only) */}
      {tab === "clients" && canManageClients && (
        <div style={s.sortRow}>
          <div style={s.sortLabel}>Sort by</div>

          <select
            style={s.sortSelect}
            value={clientSortBy}
            onChange={(e) => setClientSortBy(e.target.value as ClientSortKey)}
            disabled={loadingClients || busy}
          >
            <option value="clientName">Client Name</option>
            <option value="clientId">Client ID</option>
            <option value="clientType">Client Type</option>
          </select>

          <button
            style={s.sortDirBtn}
            onClick={() => setClientSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            disabled={loadingClients || busy}
            title="Toggle sort direction"
          >
            {clientSortDir === "asc" ? "↑ Asc" : "↓ Desc"}
          </button>
        </div>
      )}

      {error && <div style={s.error}>{error}</div>}

      {/* ===== SPECIES TAB ===== */}
      {tab === "species" && (
        <>
          {loading ? (
            <div style={s.card}>Loading…</div>
          ) : filteredSpecies.length === 0 ? (
            <div style={s.card}>No items found.</div>
          ) : (
            <div style={s.gridWrap}>
              {/* Header row */}
              <div style={{ ...s.speciesRow, ...s.gridHeader }}>
                <div>Name</div>
                <div>Unit Cost</div>
                <div>Sell Price</div>
                <div>VAT</div>
                <div>Qty on Hand</div>
                <div>Qty Booked</div>
                <div>Available</div>
                <div>Status</div>
                {canManageSpecies && <div style={{ textAlign: "right" }}>Actions</div>}
              </div>

              {/* Data rows */}
              {filteredSpecies.map((x: any, idx: number) => {
                const baseRow = idx % 2 === 0 ? s.gridRowEven : s.gridRowOdd;
                const isHover = hoveredSpeciesId === x.speciesId;
                return (
                  <div
                    key={x.speciesId}
                    style={{ ...s.speciesRow, ...baseRow, ...(isHover ? s.gridRowHover : null) }}
                    onMouseEnter={() => setHoveredSpeciesId(x.speciesId)}
                    onMouseLeave={() => setHoveredSpeciesId(null)}
                  >
                    <div style={s.gridName}>{x.name}</div>
                    <div style={s.gridCell}>{money(x.unitCost)}</div>
                    <div style={s.gridCell}>{x.sellPrice == null ? "—" : money(x.sellPrice)}</div>
                    <div style={s.gridCell}>{x.vat}</div>
                    <div style={s.gridCell}>{x.qtyOnHandHub}</div>
                    <div style={s.gridCell}>{x.qtyBookedOutForDelivery}</div>
                    <div style={s.gridCell}>{x.qtyAvailable ?? x.qtyOnHandHub - x.qtyBookedOutForDelivery}</div>
                    <div style={s.gridCell}>{x.isActive ? "Active" : "Inactive"}</div>
                    {canManageSpecies && (
                      <div style={s.gridActions}>
                        <button style={s.gridEditBtn} onClick={() => openEditSpecies(x)} disabled={busy}>
                          Edit
                        </button>
                        <button style={s.gridDeleteBtn} onClick={() => deleteSpecies((x as any).speciesId, (x as any).name)} disabled={busy}>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {showSpeciesForm && (
            <div style={s.modalBackdrop} onClick={() => !busy && setShowSpeciesForm(false)}>
              <div style={s.modal} onClick={(e) => e.stopPropagation()}>
                <div style={s.modalTitle}>{speciesForm.speciesId ? "Edit Species" : "Add Species"}</div>

                <label style={s.label}>
                  Name
                  <input
                    style={s.input}
                    value={speciesForm.name}
                    onChange={(e) => setSpeciesForm((p) => ({ ...p, name: e.target.value }))}
                    disabled={busy}
                  />
                </label>

                <label style={s.label}>
                  Unit Cost (incl. VAT)
                  <NumericInput
                    style={s.input}
                    
                    value={speciesForm.unitCost}
                    onChange={(e) => setSpeciesForm((p) => ({ ...p, unitCost: e.target.value }))}
                    disabled={busy}
                  />
                </label>

                <label style={s.label}>
                  Sell Price (incl. VAT, optional)
                  <NumericInput
                    style={s.input}
                    
                    value={speciesForm.sellPrice}
                    onChange={(e) => setSpeciesForm((p) => ({ ...p, sellPrice: e.target.value }))}
                    disabled={busy}
                  />
                </label>

                <label style={s.label}>
                  VAT Rate (e.g. 0.15 for 15%)
                  <NumericInput
                    style={s.input}
                    
                    value={speciesForm.vat}
                    onChange={(e) => setSpeciesForm((p) => ({ ...p, vat: e.target.value }))}
                    disabled={busy}
                  />
                  <span style={{ fontSize: 11, color: "#64748b" }}>Used to extract the VAT portion during invoicing</span>
                </label>

                <label style={s.label}>
                  Qty on hand at Hub
                  <NumericInput
                    style={s.input}
                    allowDecimal={false} 
                    value={speciesForm.qtyOnHandHub}
                    onChange={(e) => setSpeciesForm((p) => ({ ...p, qtyOnHandHub: e.target.value }))}
                    disabled={busy}
                  />
                </label>

                <label style={s.label}>
                  Qty booked out for delivery
                  <NumericInput
                    style={s.input}
                    allowDecimal={false} 
                    value={speciesForm.qtyBookedOutForDelivery}
                    onChange={(e) => setSpeciesForm((p) => ({ ...p, qtyBookedOutForDelivery: e.target.value }))}
                    disabled={busy}
                  />
                </label>

                {speciesForm.speciesId && (
                  <label style={s.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={speciesForm.isActive}
                      onChange={(e) => setSpeciesForm((p) => ({ ...p, isActive: e.target.checked }))}
                      disabled={busy}
                    />
                    Active
                  </label>
                )}

                <div style={s.modalBtns}>
                  <button style={s.secondaryBtn} onClick={() => setShowSpeciesForm(false)} disabled={busy}>
                    Cancel
                  </button>
                  <button style={s.primaryBtn} onClick={saveSpecies} disabled={busy || !canManageSpecies}>
                    {busy ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== CLIENTS TAB ===== */}
      {tab === "clients" && canManageClients && (
        <>
          {loadingClients ? (
            <div style={s.card}>Loading…</div>
          ) : filteredClients.length === 0 ? (
            <div style={s.card}>No clients found.</div>
          ) : (
            <div style={s.gridWrap}>
              {/* Header row */}
              <div style={{ ...s.gridRow, ...s.gridHeader }}>
                <div>Name</div>
                <div>Client ID</div>
                <div>Address</div>
                <div>Contact Nr</div>
                <div>Type</div>
                <div style={{ textAlign: "right" }}>Actions</div>
              </div>

              {/* Data rows (alternating + hover) */}
              {filteredClients.map((c, idx) => {
                const baseRow = idx % 2 === 0 ? s.gridRowEven : s.gridRowOdd;
                const isHover = hoveredClientId === c.clientId;

                return (
                  <div
                    key={c.clientId}
                    style={{
                      ...s.gridRow,
                      ...baseRow,
                      ...(isHover ? s.gridRowHover : null),
                    }}
                    onMouseEnter={() => setHoveredClientId(c.clientId)}
                    onMouseLeave={() => setHoveredClientId(null)}
                  >
                    <div style={s.gridName} title={c.clientName}>
                      {c.clientName}
                    </div>

                    <div style={s.gridMono} title={c.clientId}>
                      {c.clientId}
                    </div>

                    <div style={s.gridCell} title={c.clientAddress || ""}>
                      {c.clientAddress || "—"}
                    </div>

                    <div style={s.gridCell}>
                      {c.clientPhone || "—"}
                      {c.clientContactDetails && c.clientContactDetails !== c.clientPhone && (
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{c.clientContactDetails}</div>
                      )}
                    </div>

                    <div style={s.gridCell}>
                      {c.clientType === 0 ? "COD Cash" : c.clientType === 1 ? "COD EFT" : "Credit"}
                      {c.clientType === 2 && (c.creditBalance ?? 0) > 0 && (
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", marginTop: 2 }}>
                          Outstanding: R{(c.creditBalance ?? 0).toFixed(2)}
                        </div>
                      )}
                    </div>

                    <div style={s.gridActions}>
                      <button style={s.gridEditBtn} onClick={() => openEditClient(c)} disabled={busy}>
                        Edit
                      </button>
                      <button style={s.gridDeleteBtn} onClick={() => deleteClient(c.clientId)} disabled={busy}>
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {showClientForm && (
            <div style={s.modalBackdrop} onClick={() => !busy && setShowClientForm(false)}>
              <div style={s.modal} onClick={(e) => e.stopPropagation()}>
                <div style={s.modalTitle}>{clientForm.clientId ? "Edit Client" : "Add Client"}</div>

                <label style={s.label}>
                  Client Name
                  <input
                    style={s.input}
                    value={clientForm.clientName}
                    onChange={(e) => setClientForm((p) => ({ ...p, clientName: e.target.value }))}
                    disabled={busy}
                  />
                </label>

                <label style={s.label}>
                  Street Address
                  <input
                    style={s.input}
                    value={clientForm.clientAddress}
                    onChange={(e) => setClientForm((p) => ({ ...p, clientAddress: e.target.value }))}
                    disabled={busy}
                    placeholder="e.g. 12 Main Road"
                  />
                </label>

                <label style={s.label}>
                  City
                  <input
                    style={s.input}
                    value={clientForm.clientCity}
                    onChange={(e) => setClientForm((p) => ({ ...p, clientCity: e.target.value }))}
                    disabled={busy}
                    placeholder="e.g. Durban"
                  />
                </label>

                <label style={s.label}>
                  Province
                  <input
                    style={s.input}
                    value={clientForm.clientProvince}
                    onChange={(e) => setClientForm((p) => ({ ...p, clientProvince: e.target.value }))}
                    disabled={busy}
                    placeholder="e.g. KwaZulu-Natal"
                  />
                </label>

                <label style={s.label}>
                  Postal Code
                  <input
                    style={s.input}
                    value={clientForm.clientPostalCode}
                    onChange={(e) => setClientForm((p) => ({ ...p, clientPostalCode: e.target.value }))}
                    disabled={busy}
                    placeholder="e.g. 4001"
                  />
                </label>

                <label style={s.label}>
                  Client Contact Details
                  <input
                    style={s.input}
                    value={clientForm.clientContactDetails}
                    onChange={(e) => setClientForm((p) => ({ ...p, clientContactDetails: e.target.value }))}
                    disabled={busy}
                  />
                </label>

                <label style={s.label}>
                  WhatsApp / Phone Number
                  <input
                    style={s.input}
                    placeholder="e.g. 27821234567"
                    value={clientForm.clientPhone}
                    onChange={(e) => setClientForm((p) => ({ ...p, clientPhone: e.target.value }))}
                    inputMode="tel"
                  />
                </label>

                <label style={s.label}>
                  Client Type
                  <select
                    style={s.input}
                    value={clientForm.clientType}
                    onChange={(e) =>
                      setClientForm((p) => ({
                        ...p,
                        clientType: Number(e.target.value) as ClientType,
                      }))
                    }
                    disabled={busy}
                  >
                    <option value={0}>COD Cash</option>
                    <option value={1}>COD EFT</option>
                    <option value={2}>Credit</option>
                  </select>
                </label>

                {error && <div style={s.modalError}>{error}</div>}

                <div style={s.modalBtns}>
                  <button style={s.secondaryBtn} onClick={() => { setShowClientForm(false); setError(null); }} disabled={busy}>
                    Cancel
                  </button>
                  <button style={s.primaryBtn} onClick={saveClient} disabled={busy || !canManageClients}>
                    {busy ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "clients" && !canManageClients && <div style={s.card}>Clients management is available to Owner, Finance, Admin, and Procurement users.</div>}

      {/* ===== CONFIRM DELETE MODAL ===== */}
      {confirmDelete && (
        <div style={s.modalBackdrop} onClick={() => !busy && setConfirmDelete(null)}>
          <div style={{ ...s.modal, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={s.deleteModalIcon}>🗑️</div>
            <div style={s.deleteModalTitle}>Delete {confirmDelete.type === "species" ? "Species" : "Client"}?</div>
            <div style={s.deleteModalBody}>
              You are about to permanently delete{" "}
              <strong>"{confirmDelete.label}"</strong>.{" "}
              This action cannot be undone.
            </div>
            {error && <p style={{ color: "#ef4444", fontSize: 13, margin: "8px 0 0" }}>{error}</p>}
            <div style={s.deleteModalActions}>
              <button
                style={s.secondaryBtn}
                onClick={() => setConfirmDelete(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                style={s.deleteConfirmBtn}
                disabled={busy}
                onClick={async () => {
                  const ok = confirmDelete.type === "species"
                    ? await doDeleteSpecies(confirmDelete.id)
                    : await doDeleteClient(confirmDelete.id);
                  if (ok) setConfirmDelete(null);
                }}
              >
                {busy ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function money(n: number) {
  return `R ${Number(n).toFixed(2)}`;
}

// ✅ Styles (FIXED gridTemplateColumns + added sort + hover)
const s: Record<string, React.CSSProperties> = {
  page: { padding: "20px 24px", fontFamily: "system-ui" },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" },
  headerActions: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  title: { fontSize: 22, fontWeight: 900 },
  sub: { opacity: 0.75, marginTop: 4 },

  tabsRow: { display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" },

  tab: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.15)",
    cursor: "pointer",
    fontWeight: 900,
    background: "white",
  },
  tabActive: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(37,99,235,0.8)",
    cursor: "pointer",
    fontWeight: 900,
    background: "rgba(37,99,235,0.08)",
  },

  searchRow: { marginTop: 14, marginBottom: 10 },
  search: {
    width: "min(520px, 100%)",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.15)",
    fontSize: 16,
  },

  // ✅ Sort UI
  sortRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  sortLabel: { fontWeight: 900, opacity: 0.75 },
  sortSelect: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.15)",
    background: "white",
    fontSize: 14,
    fontWeight: 800,
  },
  sortDirBtn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.15)",
    background: "white",
    cursor: "pointer",
    fontWeight: 900,
  },

  card: {
    marginTop: 10,
    padding: 14,
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "rgba(0,0,0,0.02)",
  },

  dangerBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(239,68,68,0.35)",
    cursor: "pointer",
    fontWeight: 900,
    background: "rgba(239,68,68,0.08)",
  },

  primaryBtn: {
    padding: "12px 14px",
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    fontWeight: 900,
    background: "#2563eb",
    color: "white",
  },
  secondaryBtn: {
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.15)",
    cursor: "pointer",
    fontWeight: 900,
    background: "white",
  },

  error: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(239,68,68,0.35)",
    background: "rgba(239,68,68,0.08)",
    color: "#7f1d1d",
  },

  // ✅ Clients GRID styles
  gridWrap: {
    marginTop: 10,
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 12,
    overflowX: "auto",
    background: "white",
  },

  // Species grid: Name | Unit Cost | Sell Price | VAT | Qty on Hand | Qty Booked | Available | Status | Actions
  speciesRow: {
    display: "grid",
    gridTemplateColumns: "1.8fr 1fr 1fr 0.6fr 1fr 1fr 1fr 0.8fr 0.8fr",
    gap: 12,
    padding: "14px 14px",
    alignItems: "center",
    fontSize: 14,
    minWidth: 900,
  },

  // ✅ FIX: 6 columns because we render 6 cells (Name, ID, Address, Contact, Type, Actions)
  gridRow: {
    display: "grid",
    gridTemplateColumns: "1.2fr 1.6fr 2fr 1.2fr 0.7fr 1.1fr",
    gap: 12,
    padding: "14px 14px",
    alignItems: "center",
    fontSize: 14,
    minWidth: 700,
  },

  gridHeader: {
    background: "#f3f4f6",
    fontWeight: 900,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "rgba(0,0,0,0.6)",
    borderBottom: "1px solid rgba(0,0,0,0.08)",
  },

  gridRowEven: { background: "#ffffff", borderBottom: "1px solid rgba(0,0,0,0.06)" },
  gridRowOdd: { background: "#f9fafb", borderBottom: "1px solid rgba(0,0,0,0.06)" },

  // ✅ Hover highlight
  gridRowHover: {
    background: "rgba(37,99,235,0.08)",
  },

  gridName: {
    fontWeight: 900,
    color: "#2563eb",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  gridMono: {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    fontSize: 12,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    color: "rgba(0,0,0,0.65)",
  },

  gridCell: {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    color: "rgba(0,0,0,0.75)",
    fontWeight: 700,
  },

  gridActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
  },

  gridEditBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.15)",
    cursor: "pointer",
    fontWeight: 800,
    background: "white",
  },

  gridDeleteBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(239,68,68,0.35)",
    cursor: "pointer",
    fontWeight: 900,
    background: "rgba(239,68,68,0.08)",
    color: "#7f1d1d",
  },

  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.4)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 200,
    overflowY: "auto",
  },
  modal: {
    width: "100%",
    maxWidth: 520,
    boxSizing: "border-box" as const,
    background: "white",
    borderRadius: 16,
    padding: 18,
    border: "1px solid rgba(0,0,0,0.12)",
  },
  modalTitle: { fontSize: 18, fontWeight: 900, marginBottom: 10 },
  deleteModalIcon: { fontSize: 40, textAlign: "center", marginBottom: 10 },
  deleteModalTitle: { fontSize: 20, fontWeight: 900, textAlign: "center", marginBottom: 8, color: "#0f172a" },
  deleteModalBody: { fontSize: 14, color: "#475569", textAlign: "center", lineHeight: 1.6, marginBottom: 24 },
  deleteModalActions: { display: "flex", gap: 12, justifyContent: "center" },
  deleteConfirmBtn: {
    background: "#ef4444",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "10px 24px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  },
  modalError: {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(239,68,68,0.35)",
    background: "rgba(239,68,68,0.08)",
    color: "#7f1d1d",
    fontSize: 13,
  },
  label: { display: "grid", gap: 6, fontWeight: 800, marginTop: 10 },
  input: {
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.15)",
    fontSize: 16,
  },
  checkboxRow: { display: "flex", gap: 10, alignItems: "center", marginTop: 12, fontWeight: 800 },
  modalBtns: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 },
};