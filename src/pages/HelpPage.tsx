import React, { useState } from "react";
import { hasRole } from "../api/auth";

type Step = { text?: string; tip?: string };
type Guide = { id: string; title: string; icon: string; steps: Step[]; roles: string[] };

const ALL_GUIDES: Guide[] = [
  // ── Dashboard ──────────────────────────────────────────────────────────────
  {
    id: "dashboard",
    title: "Reading the Dashboard",
    icon: "📊",
    roles: ["Owner", "Finance", "Admin", "HubStaff"],
    steps: [
      { text: "After logging in you land on the Dashboard. It shows a live overview of the business." },
      { text: "The Deliveries panel shows how many orders are Open, Out for Delivery, and Delivered this month, plus a donut chart of the status mix." },
      { text: "The Stock panel lists all species, their quantity on hand at the hub, and how many are currently booked out for delivery." },
      { text: "The Finances panel (Owner & Finance only) shows total revenue, number of invoices, outstanding balance, and overdue invoices.", tip: "Only Owner and Finance roles can see the Finances section." },
      { text: "Click any KPI card to jump directly to the relevant page." },
    ],
  },

  // ── Clients ────────────────────────────────────────────────────────────────
  {
    id: "create-client",
    title: "How to Create a Client",
    icon: "🧑‍💼",
    roles: ["Owner", "Admin", "HubStaff"],
    steps: [
      { text: 'Navigate to Hub Tasks using the top menu, then click the "Clients" tab.' },
      { text: 'Click the "Add Client" button in the top-right corner.' },
      { text: "Fill in the client's name and select their payment type: CODCASH, CODEFT, or Credit." },
      { text: "Enter the full delivery address: Street Address, City, Province, and Postal Code." },
      { text: 'Click "Save" to create the client. They will appear in the client list immediately.' },
    ],
  },

  // ── Species ────────────────────────────────────────────────────────────────
  {
    id: "create-species",
    title: "How to Add a Species / Product",
    icon: "🐔",
    roles: ["Owner", "Admin", "HubStaff"],
    steps: [
      { text: 'Navigate to Hub Tasks using the top menu, then click the "Species" tab.' },
      { text: 'Click "Add Species".' },
      { text: "Enter the species name (e.g. Broiler, Layer) and the sell price per unit." },
      { text: "Set the opening quantity on hand at the hub." },
      { text: 'Click "Save". The species is now available when creating delivery orders.' },
    ],
  },
  {
    id: "update-stock",
    title: "How to Update Stock Levels",
    icon: "📦",
    roles: ["Owner", "Admin", "HubStaff"],
    steps: [
      { text: 'Go to Hub Tasks → "Species" tab.' },
      { text: "Click on the species row you want to update." },
      { text: "Edit the Qty on Hand field to reflect the current physical count at the hub." },
      { text: 'Click "Save". Stock availability for new orders updates immediately.' },
      { tip: "Qty Booked Out is managed automatically — it increases when a delivery order is created and decreases when the driver invoices the delivery." },
    ],
  },

  // ── Delivery Orders ────────────────────────────────────────────────────────
  {
    id: "create-order",
    title: "How to Create a Delivery Order",
    icon: "🚚",
    roles: ["Owner", "Finance", "Admin", "HubStaff"],
    steps: [
      { text: 'Click "Delivery Orders" in the top menu.' },
      { text: 'Click "New Order".' },
      { text: "Select the client from the dropdown. The delivery address will auto-populate from the client's profile." },
      { text: "Select the driver who will fulfil the delivery." },
      { text: "Review or edit the delivery address (Street, City, Province, Postal Code)." },
      { text: 'Click "+ Add Line" to add each product. Select a species and enter the quantity.', tip: "The available stock is shown next to each species. You cannot order more than what is available." },
      { text: 'Owner and Finance roles will also see a "Unit Price" field per line to override the default sell price.', tip: "Leave the price blank to use the species default sell price." },
      { text: 'Click "Create Order". Stock is immediately booked out and a Hub Task is created.' },
    ],
  },
  {
    id: "view-order",
    title: "How to View and Track a Delivery Order",
    icon: "🔍",
    roles: ["Owner", "Finance", "Admin", "HubStaff"],
    steps: [
      { text: 'Click "Delivery Orders" in the menu.' },
      { text: "Use the status filter buttons (Open, Out for Delivery, Delivered) to narrow the list." },
      { text: "You can also search by client name or driver name using the search box." },
      { text: "Click on any order row to expand its detail — you will see the order lines, delivery address, driver, and status." },
      { text: "Once a driver completes delivery, the detail will show delivered quantities and any returns." },
    ],
  },

  // ── Hub Tasks ──────────────────────────────────────────────────────────────
  {
    id: "hub-tasks",
    title: "How to Use Hub Tasks",
    icon: "✅",
    roles: ["Owner", "Admin", "HubStaff"],
    steps: [
      { text: 'Click "Hub Tasks" in the menu.' },
      { text: "Hub Tasks shows all pending operational tasks. A Delivery type task is auto-created whenever a new delivery order is placed." },
      { text: "Use the tabs to switch between task types (Delivery, etc.) or view All tasks." },
      { text: "Click a task row to see more detail including which delivery order it relates to." },
      { text: "Tasks close automatically when the driver completes the delivery." },
    ],
  },

  // ── Driver ─────────────────────────────────────────────────────────────────
  {
    id: "driver-start",
    title: "How to Start a Delivery",
    icon: "▶️",
    roles: ["Driver"],
    steps: [
      { text: 'Log in with your driver credentials. You will land on the "My Deliveries" page.' },
      { text: "Your assigned open orders are listed. Each card shows the client, delivery address, and the products to deliver." },
      { text: 'Expand an order and tap "Start Delivery". The order status changes to Out for Delivery and the hub is notified.' },
    ],
  },
  {
    id: "driver-complete",
    title: "How to Complete a Delivery and Confirm",
    icon: "✅",
    roles: ["Driver"],
    steps: [
      { text: 'On the "My Deliveries" page, tap "Complete Delivery" on the order you have finished.' },
      { text: "For each product line, enter the actual quantity delivered." },
      { text: "If any stock is being returned, enter the quantities in the correct return category:", tip: "Dead = perished birds. Mutilated = damaged stock. Not Wanted = client refused delivery." },
      { text: "The system validates that Delivered + Dead + Mutilated + Not Wanted equals the original ordered quantity." },
      { text: "Select the payment method: Cash, EFT, Card Machine, or Credit." },
      { text: 'Tap "Confirm Delivery". The invoice is created automatically.' },
    ],
  },
  {
    id: "driver-payment",
    title: "How to Record Payment and Upload a Receipt",
    icon: "💳",
    roles: ["Driver"],
    steps: [
      { text: 'After confirming delivery, if the payment method is EFT or Card Machine, you will be prompted to upload a receipt photo.' },
      { text: 'Tap the camera button to take a photo or select an image from your gallery.' },
      { text: 'Tap "Upload & Finish" to submit the receipt. The delivery is then marked as complete.' },
      { text: 'If the client pays by Cash, no receipt is required — the delivery is completed immediately after confirmation.', tip: "Credit orders are invoiced to the client's account. No immediate payment is required." },
      { text: 'You can also skip the receipt upload by tapping "Skip". The Hub can follow up with the receipt later.' },
    ],
  },
  {
    id: "driver-history",
    title: "How to View Your Delivery History",
    icon: "📋",
    roles: ["Driver"],
    steps: [
      { text: 'Tap "Delivery History" in the menu.' },
      { text: "This shows all your past completed deliveries with dates, client names, and totals." },
      { text: "Tap any row to expand the detail including what was delivered, any returns, and the payment method." },
    ],
  },

  // ── Reports & Finance ──────────────────────────────────────────────────────
  {
    id: "reports",
    title: "How to View Reports",
    icon: "📈",
    roles: ["Owner", "Finance"],
    steps: [
      { text: 'Click "Reports" in the menu.' },
      { text: "The Revenue Summary tab shows total revenue, average per invoice, and a breakdown by species." },
      { text: "The Driver Performance tab ranks drivers by revenue and deliveries completed." },
      { text: "The Returns Summary tab shows total dead, mutilated, and not-wanted stock by species." },
      { text: "The Outstanding Payments tab lists all unpaid or partially paid invoices." },
      { text: "Use the month/year filter at the top to change the reporting period." },
    ],
  },
  {
    id: "invoices",
    title: "How to Manage Invoices",
    icon: "🧾",
    roles: ["Owner", "Finance"],
    steps: [
      { text: 'Click "Invoices" in the menu (under the Reports section).' },
      { text: "All invoices are listed with their status — Pending, Paid, or Overdue." },
      { text: "Click an invoice to expand it and view the line items, payment method, and receipt (if uploaded)." },
      { text: 'To confirm a payment, click "Confirm Payment" on a pending invoice.', tip: "Only Finance and Owner roles can confirm payments." },
      { text: 'To view an uploaded EFT or Card Machine receipt, click "View Receipt" on the invoice.' },
    ],
  },
  {
    id: "statement",
    title: "How to Generate a Client Statement",
    icon: "📄",
    roles: ["Owner", "Finance"],
    steps: [
      { text: 'Click "Statements" in the menu.' },
      { text: "Select the client and the date range for the statement." },
      { text: "The statement lists all invoices, payments, and the outstanding balance for the selected period." },
      { text: 'Use the "Print" button to print or save the statement as a PDF.' },
    ],
  },

  // ── Users ──────────────────────────────────────────────────────────────────
  {
    id: "create-user",
    title: "How to Create a User",
    icon: "👤",
    roles: ["Owner", "Admin"],
    steps: [
      { text: 'Click "Users" in the top menu.' },
      { text: 'Click "Add User".' },
      { text: "Enter the user's full name, email address, and phone number." },
      { text: "Select their role: Admin, HubStaff, Finance, or Driver.", tip: "Drivers will only see their assigned deliveries. HubStaff can create orders but cannot access financial data." },
      { text: 'Click "Create". The user receives an email with a temporary password to set up their account.' },
    ],
  },
  {
    id: "manage-users",
    title: "How to Manage and Deactivate Users",
    icon: "🔐",
    roles: ["Owner", "Admin"],
    steps: [
      { text: 'Navigate to "Users" in the menu.' },
      { text: "The user list shows all active users, their roles, and contact details." },
      { text: "Click a user row to view their details." },
      { text: 'To reset a password, click "Reset Password". The user will receive an email with a reset link.' },
      { text: 'To deactivate a user, click "Disable". They will no longer be able to log in.', tip: "Disabling a user does not delete their data or history." },
    ],
  },

  // ── Procurement & Stock Collection ─────────────────────────────────────────
  {
    id: "add-supplier",
    title: "How to Add a Supplier",
    icon: "🏭",
    roles: ["Owner", "Admin", "Procurement", "Finance"],
    steps: [
      { text: 'Log in as Procurement, Admin, or Owner. You should see "Suppliers" in the nav bar.' },
      { text: 'Click "Suppliers" in the nav bar.' },
      { text: 'Click "+ Add Supplier".' },
      { text: "Fill in the supplier name, street address, city, province, and postal code." },
      { text: "Add a Contact Person (driver/collections) with their name and phone number." },
      { text: "Add a Finance Contact with name, phone, and email." },
      { text: "Enter the supplier's Bank Details: bank name, account number, branch code, and account type.", tip: "Account type options are Current, Savings, or Transmission." },
      { text: 'Click "Create Supplier". The supplier will appear in the list immediately.' },
    ],
  },
  {
    id: "create-procurement-order",
    title: "How to Create a Procurement Order",
    icon: "🛒",
    roles: ["Owner", "Admin", "Procurement", "Finance"],
    steps: [
      { text: 'Click "Procurement" in the nav bar.' },
      { text: 'Click "+ New Order".' },
      { text: "Select the supplier you want to order from." },
      { text: "Optionally enter the supplier's order reference number (e.g. their invoice or PO number)." },
      { text: 'Click "+ Add line" to add a species. Select the species, enter the quantity, and enter the unit cost (R per unit).' },
      { text: "Add as many species lines as needed.", tip: "All lines require a species, quantity, and unit cost greater than zero before the order can be created." },
      { text: 'Click "Create Order" — the order is saved with status Draft.' },
      { text: 'Expand the order and click "Submit Order" to send it to the collection workflow — status changes to Submitted.' },
    ],
  },
  {
    id: "create-collection-request",
    title: "How to Create a Collection Request",
    icon: "📋",
    roles: ["Owner", "Admin", "Procurement", "Finance"],
    steps: [
      { text: 'Click "Collections" in the nav bar (as Admin or HubStaff).' },
      { text: 'Click "+ New Collection".' },
      { text: "Select the Submitted procurement order from the dropdown.", tip: "Only Submitted orders appear — Draft orders must be submitted first." },
      { text: "Assign a driver who will collect the stock from the supplier." },
      { text: "Add any notes for the driver (e.g. collection time, supplier contact)." },
      { text: 'Click "Create". The procurement order status automatically advances to CollectionScheduled.' },
    ],
  },
  {
    id: "driver-load-stock",
    title: "How to Load and Dispatch Stock (Driver)",
    icon: "🚛",
    roles: ["Owner", "Admin", "Procurement", "Finance", "Driver"],
    steps: [
      { text: 'Log in as the assigned Driver and click "Collections" in the nav bar.' },
      { text: "Find the collection request assigned to you with status CollectionScheduled." },
      { text: 'Click "Start Loading" to begin loading stock at the supplier.' },
      { text: "Enter the quantity loaded for each species line. Add notes if a species is short or unavailable." },
      { text: 'Once the vehicle is loaded, click "Dispatch" — status changes to InTransit and the hub is notified.' },
    ],
  },
  {
    id: "hub-confirm-receipt",
    title: "How to Confirm Stock Receipt at the Hub",
    icon: "🏠",
    roles: ["Owner", "Admin", "Procurement", "Finance"],
    steps: [
      { text: 'Log in as Admin or HubStaff and click "Collections" in the nav bar.' },
      { text: "Find the collection with status InTransit." },
      { text: 'Click "Confirm Receipt".' },
      { text: "Enter the actual received quantity for each species line.", tip: "The received quantity may differ from what was dispatched if there were losses in transit." },
      { text: 'Click "Confirm" — the received stock is automatically added to the hub inventory (Qty on Hand). Status changes to HubConfirmed.' },
    ],
  },
  {
    id: "finance-acknowledge",
    title: "How to Acknowledge and Upload the Supplier Invoice (Finance)",
    icon: "💼",
    roles: ["Owner", "Admin", "Procurement", "Finance"],
    steps: [
      { text: 'Log in as Finance or Owner and click "Collections" in the nav bar.' },
      { text: "Find the collection with status HubConfirmed." },
      { text: 'Click "Upload Invoice & Acknowledge".' },
      { text: "Upload the supplier PDF invoice received for this collection." },
      { text: 'Click "Acknowledge" — the collection status changes to FinanceAcknowledged and the procurement order is automatically marked Completed.', tip: "The uploaded invoice PDF is stored securely and linked to the procurement order for auditing." },
    ],
  },

  // ── Price Override ─────────────────────────────────────────────────────────
  {
    id: "price-override",
    title: "How to Override Prices on an Order",
    icon: "💰",
    roles: ["Owner", "Finance"],
    steps: [
      { text: "When creating a delivery order, each product line shows a Unit Price field (visible only to Owner and Finance)." },
      { text: "The field pre-fills with the species default sell price." },
      { text: "Edit the price to set a custom rate for this specific order." },
      { text: 'Leave the field as-is to use the default price. The override only applies to this order — the species master price is not changed.', tip: "The unit price is stored on the order and will appear on the invoice the driver creates." },
    ],
  },
];

function roleMatches(guide: Guide): boolean {
  return guide.roles.some((r) => hasRole(r));
}

export default function HelpPage() {
  const guides = ALL_GUIDES.filter(roleMatches);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.headerIcon}>❓</div>
        <div>
          <div style={s.title}>Help & How-To Guides</div>
          <div style={s.subtitle}>Step-by-step instructions for everything in KwaWicks</div>
        </div>
      </div>

      <div style={s.grid}>
        {guides.map((guide) => {
          const isOpen = openId === guide.id;
          return (
            <div key={guide.id} style={s.card}>
              <button
                style={s.cardHeader}
                onClick={() => setOpenId(isOpen ? null : guide.id)}
                aria-expanded={isOpen}
              >
                <span style={s.cardIcon}>{guide.icon}</span>
                <span style={s.cardTitle}>{guide.title}</span>
                <span style={{ ...s.chevron, transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
              </button>

              {isOpen && (
                <div style={s.steps}>
                  {guide.steps.map((step, i) => (
                    <div key={i} style={s.stepRow}>
                      {step.text && (
                        <div style={s.stepContent}>
                          <span style={s.stepNum}>{i + 1}</span>
                          <span style={s.stepText}>{step.text}</span>
                        </div>
                      )}
                      {step.tip && (
                        <div style={s.tip}>
                          <span style={s.tipIcon}>💡</span>
                          <span>{step.tip}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    padding: "24px 20px",
    maxWidth: 900,
    margin: "0 auto",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginBottom: 28,
  },
  headerIcon: {
    fontSize: 40,
    flexShrink: 0,
  },
  title: {
    fontSize: 26,
    fontWeight: 800,
    color: "#0f172a",
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 4,
  },
  grid: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  card: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    overflow: "hidden",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  },
  cardHeader: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "16px 18px",
    background: "none",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    transition: "background 0.15s",
  },
  cardIcon: {
    fontSize: 22,
    flexShrink: 0,
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: 700,
    color: "#0f172a",
  },
  chevron: {
    fontSize: 18,
    color: "#94a3b8",
    transition: "transform 0.2s",
    flexShrink: 0,
  },
  steps: {
    borderTop: "1px solid #f1f5f9",
    padding: "4px 18px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  stepRow: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    paddingTop: 10,
  },
  stepContent: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
  },
  stepNum: {
    flexShrink: 0,
    width: 24,
    height: 24,
    borderRadius: "50%",
    background: "#1e293b",
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: {
    fontSize: 14,
    color: "#334155",
    lineHeight: 1.6,
    paddingTop: 2,
  },
  tip: {
    display: "flex",
    gap: 8,
    alignItems: "flex-start",
    background: "#fefce8",
    border: "1px solid #fde68a",
    borderRadius: 8,
    padding: "8px 12px",
    marginLeft: 36,
    fontSize: 13,
    color: "#78350f",
    lineHeight: 1.5,
  },
  tipIcon: {
    flexShrink: 0,
    fontSize: 14,
  },
};
