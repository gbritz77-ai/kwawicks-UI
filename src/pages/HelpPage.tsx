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
    roles: ["Owner", "Finance", "Admin", "Procurement"],
    steps: [
      { text: 'Click "Clients" in the top menu.' },
      { text: 'Click the "+ Add Client" button in the top-right corner.' },
      { text: "Fill in the client's name and select their client type: COD or Credit." },
      { text: "Enter the delivery address: Street, City, Province, and Postal Code." },
      { text: "Enter the client's WhatsApp / phone number so invoices can be sent automatically.", tip: "Use the international format starting with 27 (e.g. 27821234567) or the local 0 format — the system converts it automatically." },
      { text: 'Click "Save". The client is immediately available when creating delivery orders.' },
    ],
  },

  // ── Species ────────────────────────────────────────────────────────────────
  {
    id: "create-species",
    title: "How to Add a Species / Product",
    icon: "🐔",
    roles: ["Owner", "Admin"],
    steps: [
      { text: 'Click "Species" in the top menu.' },
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
    roles: ["Owner", "Admin"],
    steps: [
      { text: 'Click "Species" in the top menu.' },
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

  // ── Delivery Actual Quantities ─────────────────────────────────────────────
  {
    id: "delivery-actual-qty",
    title: "How the Delivery Summary Shows Actual Quantities",
    icon: "📊",
    roles: ["Owner", "Finance", "Admin", "HubStaff", "Procurement"],
    steps: [
      { text: "When a driver completes a delivery and submits the 'Complete Delivery' form, the system records the exact quantity the client actually received — which may be less than what was originally ordered." },
      { text: "The Delivery Summary table on the collection request card immediately updates to show the actual delivered quantity for that client, replacing the originally planned figure." },
      { text: "Example: if 500 units were planned but the client accepted only 450, the Delivery Summary column for that client will show 450 once the driver submits." },
      { text: "To see the updated figures, open 'Collections' in the nav bar, find the collection request, and expand the card to view the Delivery Allocations table." },
      { tip: "If a driver has not yet submitted their 'Complete Delivery' form, the summary still shows the originally planned quantity. It updates automatically the moment they confirm." },
      { text: "Admin and Finance can also use the '✓ Record Delivery' button directly on a delivery order to manually record the actual quantities — useful if the driver completed the delivery offline." },
    ],
  },

  // ── Hub Tasks ──────────────────────────────────────────────────────────────
  {
    id: "hub-tasks",
    title: "How to Use Hub Tasks",
    icon: "✅",
    roles: ["Owner", "Admin", "HubStaff"],
    steps: [
      { text: 'Click "Species" or "Clients" in the top menu — both are listed individually in the nav bar.' },
      { text: "Hub Tasks are auto-created whenever a new delivery order is placed. A task tracks the order through preparation to dispatch." },
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
      { text: "Select the payment method: Cash, EFT, Card Machine, Credit, or Split.", tip: "Choose Split if the client is paying with a combination — e.g. part Cash and part Card Machine." },
      { text: 'If Split is selected, a breakdown panel appears. Choose the method and amount for each portion. The total must match the invoice amount.', tip: "Allowed split methods for deliveries are Cash, EFT, and Card Machine." },
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
    id: "driver-stock-sales",
    title: "How to Record Walk-in Sales (Stock Sales)",
    icon: "🛍️",
    roles: ["Driver"],
    steps: [
      { text: "If admin has allocated a batch of hub stock to you for walk-in sales, a 'Stock Sales' option will appear in your nav bar." },
      { text: "Tap 'Stock Sales'. Your active allocation is displayed showing each species, the quantity originally allocated, and how many units you still have available to sell." },
      { text: "To record a sale, select the species from the dropdown — only species with remaining stock are shown." },
      { text: "Enter the quantity sold. You cannot enter more than the remaining qty for that species." },
      { text: "The unit price pre-fills with the price set by admin — edit it only if you sold at a different price." },
      { text: "Select the payment method: Cash or EFT." },
      { text: "Optionally enter the customer's name for your records." },
      { text: 'Tap "Record Sale". The sale is saved and the remaining quantity for that species decreases immediately.' },
      { text: "All your sales for this allocation are listed in the Sales History at the bottom of the page.", tip: "Once the admin marks the allocation as Complete or Cancelled, this page will no longer show an active allocation." },
      { text: "When you have finished selling, inform the admin so they can click 'Complete' to close the allocation. Any unsold stock is automatically returned to hub inventory." },
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
    roles: ["Owner", "Finance", "Admin"],
    steps: [
      { text: 'Click "Reports" in the menu.', tip: "Admin users have access to all report tabs." },
      { text: "The Revenue Summary tab shows total revenue, average per invoice, and a breakdown by species." },
      { text: "The Driver Performance tab ranks drivers by revenue and deliveries completed." },
      { text: "The Returns Summary tab shows total dead, mutilated, and not-wanted stock by species." },
      { text: "The Outstanding Payments tab lists all unpaid or partially paid invoices." },
      { text: "The Sales Report tab shows every sale line with date, client, product, qty, payment type, unit price, and cost — filterable by client and date range." },
      { text: "Use the date filter at the top of each tab to change the reporting period." },
    ],
  },
  {
    id: "sales-report",
    title: "How to Use the Sales Report",
    icon: "📋",
    roles: ["Owner", "Finance", "Admin"],
    steps: [
      { text: 'Click "Reports" in the menu, then click the "📋 Sales" tab.' },
      { text: "Set the date range using the From and To date pickers at the top. The default is the last 30 days." },
      { text: 'Click "Apply" to load the report for the selected period.' },
      { text: 'Use the "By Client" and "By Walk-in" tabs to switch between regular client sales and cash/walk-in sales.' },
      { text: "In the By Client view, a Client Summary table at the top ranks all clients by total sales value for the period." },
      { text: "The detail table below shows every sale line: date, client, product, qty, payment type, unit sale price, unit cost, and line total.", tip: "Unit Cost comes from the monthly weighted-average cost record. This lets you see gross margin per line." },
      { text: "Use the Client filter dropdown to drill into a single client's sales history." },
      { text: "KPI cards at the top show total lines, total qty, total sales, total cost, and gross margin for the filtered view." },
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
      { text: "Select their role: Owner, Finance, Admin, HubStaff, Procurement, or Driver.", tip: "Procurement users can manage suppliers and create procurement orders. Drivers only see their assigned deliveries. HubStaff can create orders but cannot access financial data." },
      { text: 'Enter a PIN / password for the user — they will use this to log in immediately. No email is sent.', tip: "Share the PIN with the user directly. They can ask an Admin to change it at any time via the Users page." },
      { text: 'Click "Create". The user account is active straight away.' },
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
    roles: ["Owner", "Admin", "HubStaff", "Procurement", "Finance"],
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
      { text: 'Find the collection request assigned to you — it will show status "Pending".' },
      { text: 'Expand the card and click "Start Loading" to begin loading stock at the supplier.' },
      { text: "Enter the quantity loaded for each species line. Add notes if a species is short or unavailable.", tip: "If you load less than the ordered quantity, a red \"X short\" badge appears on that line to make the shortfall visible at a glance." },
      { text: "Any line where you load less than ordered is automatically flagged as a shortfall — an orange \"Shortfall\" badge will appear on the collection card and the Hub can view the full shortfall report." },
      { text: 'Once the vehicle is loaded, click "Dispatch" — status changes to InTransit and the hub is notified.' },
    ],
  },
  {
    id: "allocate-stock",
    title: "How to Allocate Collection Stock to Clients",
    icon: "🚚",
    roles: ["Owner", "Admin"],
    steps: [
      { text: 'Click "Collections" in the nav bar.' },
      { text: "Find the collection request you want to allocate — it can be in any status from Pending through to HubConfirmed." },
      { text: 'Expand the card and click "+ Allocate Delivery".' },
      { text: "Select the client who will receive part of this collection from the dropdown." },
      { text: "For each species, enter the qty to deliver to this client and the unit price (R, incl. VAT).", tip: "The Available figure shows how many units are still unallocated. Once the driver has loaded, it is based on the loaded qty — not the ordered qty." },
      { text: 'To allocate to more than one client in the same session, click "+ Add Another Client" and fill in the next row.' },
      { text: 'Click "Create Delivery Order(s)". A separate delivery order is created for each client and the collection\'s Delivery Summary table updates immediately.' },
      { text: 'To change a qty or price after allocation, click the "✏️ Edit" button next to any client row in the Delivery Allocations section.', tip: "Editing an allocation updates the linked delivery order automatically. You cannot edit an allocation that has already been delivered." },
    ],
  },
  {
    id: "hub-confirm-receipt",
    title: "How to Confirm Stock Receipt at the Hub",
    icon: "🏠",
    roles: ["Owner", "Admin", "HubStaff", "Procurement", "Finance"],
    steps: [
      { text: 'Log in as Admin or HubStaff and click "Collections" in the nav bar.' },
      { text: "Find the collection with status InTransit." },
      { text: 'Click "Confirm Receipt".' },
      { text: "Enter the actual received quantity for each species line.", tip: "The received quantity may differ from what was dispatched if there were losses in transit." },
      { text: 'Click "Confirm" — the received stock is automatically added to the hub inventory (Qty on Hand). Status changes to HubConfirmed.' },
    ],
  },
  {
    id: "hub-stock-accept",
    title: "How to Accept HUB-Allocated Stock (Hub Staff)",
    icon: "🏠",
    roles: ["Owner", "Finance", "Admin", "HubStaff", "Procurement"],
    steps: [
      { text: "When a collection request includes stock earmarked for the HUB (staying at the hub rather than going out on delivery), hub staff must physically verify and count that stock before it is added to the hub's inventory." },
      { text: "Open 'Collections' in the nav bar and find the collection request. The Delivery Summary table inside the card will include a HUB column." },
      { text: "If the stock has not yet been accepted, you will see a green '✓ Accept' button in the HUB column header." },
      { text: "Click '✓ Accept' to open the acceptance modal. It shows each species allocated to the hub and the planned quantity." },
      { text: "Physically count the stock at the hub. Then, for each species, enter the quantity you actually counted in the 'Received Qty' field." },
      { text: "The Variance column shows the difference between what was allocated and what you counted. A zero variance means the count matches perfectly.", tip: "If there is a discrepancy, investigate before confirming. The quantity you enter here — not the allocated quantity — is what will be added to hub stock." },
      { text: "'Click 'Confirm Receipt'. The accepted quantities are immediately added to Qty on Hand for each species. The HUB column now shows a green '✓ Accepted' badge with the accepted quantities.", tip: "Once accepted, the HUB allocation cannot be accepted again. If a correction is needed, contact your system administrator." },
    ],
  },
  {
    id: "roadside-sales",
    title: "How to Record Roadside Sales",
    icon: "🛣️",
    roles: ["Owner", "Admin"],
    steps: [
      { text: "Roadside sales are stock the driver sold on the way back to the hub — stock that was not pre-allocated to any client delivery." },
      { text: 'Click "Collections" in the nav bar and find the collection request (status InTransit, ArrivedAtHub, or HubConfirmed).' },
      { text: 'Expand the card and click "🛣 Record Roadside Sales" in the action buttons.' },
      { text: "A reference strip at the top of the modal shows how many units per species are available to record (hub return qty)." },
      { text: "For each sale, select the species, enter the qty sold, the unit price charged (R per unit), and the payment type (Cash or EFT)." },
      { text: 'To record the same species at different prices or payment types, click "+ Add Sale Line" and fill in a second row.', tip: "Example: 50 Roosters at R50 Cash, then another row for 50 Roosters at R55 EFT." },
      { text: "A running total by payment type is shown at the bottom of the modal so you can verify the amounts before saving." },
      { text: 'Click "Save Roadside Sales". The Delivery Summary table on the collection card will now show a purple Roadside column and the Hub Return qty will reduce accordingly.' },
      { text: 'To change the entries later, click "🛣 Edit Roadside Sales" — the modal reopens with the existing data pre-filled.', tip: "Saving always replaces the full set of roadside sales — there is no append mode." },
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

  // ── Driver Stock Allocations ────────────────────────────────────────────────
  {
    id: "driver-allocation-create",
    title: "How to Create a Driver Stock Allocation",
    icon: "🧳",
    roles: ["Owner", "Finance", "Admin"],
    steps: [
      { text: "Driver Stock Allocations let you assign a batch of hub stock to a specific driver for walk-in / roadside sales to customers who are not registered clients in the system." },
      { text: "Navigate to 'Driver Allocations' in the Sales section of the nav bar (visible to Admin and Owner only)." },
      { text: 'Click "+ New Allocation".' },
      { text: "Select the driver from the dropdown." },
      { text: 'Click "+ Add Line" for each species to include. Select the species, enter the quantity to allocate, and set the unit price (R per unit). The current Qty on Hand at the hub is shown as a hint.', tip: "Stock is deducted from Qty on Hand immediately when you create the allocation — it physically leaves the hub with the driver. Make sure the driver has physically taken the stock before creating the allocation." },
      { text: 'Click "Create Allocation". The allocation is saved with status Active and the driver can now access the Stock Sales page.' },
      { text: "The allocation card on the Driver Allocations page shows each species with Allocated, Sold, and Remaining quantities. Expand the card to see the full sales history." },
      { text: "When the driver returns and has sold all stock (or you want to close out early), click 'Complete'. Any remaining unsold qty is automatically returned to hub inventory.", tip: "Click 'Cancel' instead if the allocation should be voided entirely — all stock (sold and unsold) will be reviewed and unsold stock returned to inventory." },
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

  // ── WhatsApp Invoices ───────────────────────────────────────────────────────
  {
    id: "whatsapp-invoice",
    title: "How to Send an Invoice via WhatsApp",
    icon: "📱",
    roles: ["Owner", "Finance", "Admin", "HubStaff"],
    steps: [
      { text: 'Click "Invoices" in the menu (Finance/Owner) or find the invoice in the Reports section.' },
      { text: "Expand the invoice row to see the full detail." },
      { text: 'Click the "Send WhatsApp" button (green button with the WhatsApp icon).' },
      { text: "The invoice PDF is generated and sent directly to the client's WhatsApp number on file." },
      { text: "A confirmation message appears if the send was successful, or an error message if it failed.", tip: "Invoices are also sent automatically when a driver confirms a delivery — you only need to use this button to resend or for manually created hub-side invoices." },
      { text: "If the client has no phone number saved, you will see a warning. Update the client's profile with their WhatsApp number first.", tip: "The phone number must be a valid South African mobile number (starting with 0 or 27)." },
    ],
  },

  // ── Invoice Numbers ─────────────────────────────────────────────────────────
  {
    id: "invoice-numbers",
    title: "Understanding Invoice Numbers",
    icon: "🔢",
    roles: ["Owner", "Finance", "Admin", "HubStaff"],
    steps: [
      { text: "Every invoice gets a sequential number in the format INV000001, INV000002, etc." },
      { text: "This number is printed on the invoice PDF and shown in the invoice list." },
      { text: "Invoice numbers are assigned automatically — you cannot change or skip them.", tip: "The sequential counter is shared across all invoice types (delivery invoices and hub direct sales)." },
      { text: "Use the invoice number (e.g. INV000042) when communicating with clients or reconciling payments." },
    ],
  },

  // ── Hub Direct Sales ────────────────────────────────────────────────────────
  {
    id: "hub-direct-sale",
    title: "How to Process a Hub Direct Sale",
    icon: "🏪",
    roles: ["Owner", "Finance", "Admin", "HubStaff"],
    steps: [
      { text: 'Click "Hub Sales" in the nav bar.' },
      { text: "Choose the customer type:", tip: "Existing Client = a client already in the system. Walk-In = a new customer buying once-off. Staff Member = an employee buying on account." },
      { text: "For Existing Client: search for and select the client from the dropdown." },
      { text: "For Walk-In: fill in the customer's name, phone number, and any address details. They are saved to the system with a Walk-In flag for reporting." },
      { text: "For Staff Member: select the staff member from the dropdown. No WhatsApp is sent — the sale is recorded to their account." },
      { text: 'Click "+ Add Item", select a species, adjust the quantity and unit price if needed.' },
      { text: "Add as many items as required. Totals (excluding and including VAT) update live." },
      { text: "Select the payment type: Cash, EFT, Card, or Split.", tip: "Choose Split if the client is paying with a combination of methods — e.g. part Cash and part EFT." },
      { text: 'If Split is selected, a breakdown panel appears. For each method, choose the method (Cash, Card, or EFT) and enter the amount. Add rows as needed with "+ Add method".', tip: "The running total must equal the invoice grand total within R0.05 — the system will warn you if it doesn't balance." },
      { text: 'Click "Process Sale" — an invoice is created instantly and a WhatsApp is sent to the client (non-staff customers).', tip: "Staff member sales are recorded as on-account purchases. They appear in the monthly staff statement." },
    ],
  },

  // ── Split Payments ──────────────────────────────────────────────────────────
  {
    id: "split-payment",
    title: "How to Process a Split Payment",
    icon: "✂️",
    roles: ["Owner", "Finance", "Admin", "HubStaff", "Driver"],
    steps: [
      { text: "Split payment lets a client pay using more than one method — for example, R500 cash and R300 EFT in a single transaction." },
      { text: 'Wherever a payment method is selected (Hub Sales, Driver Sales, or Delivery completion), you will see a "Split" option alongside Cash, EFT, and Card/Card Machine.' },
      { text: 'Select "Split". A breakdown panel appears below the payment buttons.' },
      { text: "Each row in the panel has a method dropdown (choose Cash, Card, or EFT) and an amount field." },
      { text: 'Enter the amount for each method. Click "+ Add method" to add more rows if needed.', tip: "You can remove any row with the ✕ button on the right." },
      { text: "A live running total shows you how much has been allocated and how much is still remaining.", tip: "Green = fully balanced. Red = over- or under-allocated. The total must match the invoice amount within R0.05." },
      { text: "Complete the sale or delivery as normal. The split breakdown is saved on the invoice.", tip: "If the split total doesn't balance, the system will block submission and show an error message." },
    ],
  },

  // ── Collection Shortfall Report ─────────────────────────────────────────────
  {
    id: "collection-shortfall",
    title: "How to View the Collection Shortfall Report",
    icon: "⚠️",
    roles: ["Owner", "Finance", "Admin", "HubStaff", "Procurement"],
    steps: [
      { text: 'Click "Collections" in the nav bar.' },
      { text: "Any collection request where a driver loaded less stock than was ordered will show an orange \"⚠ Shortfall\" badge on the card." },
      { text: 'Click the "⚠ Shortfall Report" button at the top of the page to open the full report.' },
      { text: "The report lists every collection request that has a shortfall, showing the supplier, driver, and collection date." },
      { text: "For each collection, a table shows: species, quantity ordered, quantity loaded, and the shortfall (units not collected)." },
      { text: "If the driver entered notes explaining the shortfall (e.g. \"supplier ran out\"), these are shown below the table.", tip: "The report covers all time. Use the individual card status badges to quickly spot recent shortfalls." },
      { text: 'Click "↻ Refresh" inside the report modal to reload the latest data at any time.' },
    ],
  },

  // ── Staff Members ───────────────────────────────────────────────────────────
  {
    id: "staff-members",
    title: "How to Manage Staff Members",
    icon: "👷",
    roles: ["Owner", "Finance", "Admin"],
    steps: [
      { text: 'Click "Staff" in the nav bar.' },
      { text: "All active and inactive staff members are shown in a card grid." },
      { text: 'To add a new staff member, click "+ Add Staff Member".' },
      { text: "Enter their name, phone number, and department, then click Save." },
      { text: 'To edit a staff member, click "Edit" on their card.' },
      { text: 'To deactivate a staff member, edit their record and toggle "Active" off.', tip: "Inactive staff members cannot be selected in Hub Sales, but their purchase history is preserved." },
      { text: "Staff purchases via Hub Sales are recorded as on-account transactions linked to the staff member for monthly reporting." },
    ],
  },

  // ── Petty Cash ──────────────────────────────────────────────────────────────
  {
    id: "petty-cash-entry",
    title: "How to Record a Petty Cash Entry",
    icon: "💵",
    roles: ["Owner", "Finance", "Admin"],
    steps: [
      { text: 'Click "Petty Cash" in the nav bar.' },
      { text: 'On the "Cash Book" tab, click "+ Add Entry".' },
      { text: "Select the Type: Out (payment made) or In (cash received/returned)." },
      { text: "Enter the amount in Rands." },
      { text: "Select the category: Fuel, Maintenance, Supplies, Driver Expense, or Other." },
      { text: "Enter a description of what the cash was used for (e.g. Diesel for Truck 3)." },
      { text: "Optionally enter the recipient's name (e.g. the driver who received the cash)." },
      { text: 'To assign the entry to a specific driver so they can see it on their dashboard, enter their username in the "Assign to Driver" field.', tip: "Assigned drivers will see the entry on their dashboard and can upload a photo of the petrol slip or expense receipt as proof." },
      { text: 'Click "Save Entry". The balance on the summary cards updates immediately.' },
    ],
  },
  {
    id: "petty-cash-cashup",
    title: "How to Perform a Petty Cash Cashup",
    icon: "🧮",
    roles: ["Owner", "Finance", "Admin"],
    steps: [
      { text: 'Click "Petty Cash" in the nav bar, then click the "Do Cashup" tab.' },
      { text: "The system shows a preview of all open entries since the last cashup: Opening Balance, total Cash In, total Cash Out, and the Expected Balance." },
      { text: "Physically count the cash in the petty cash tin/box." },
      { text: 'Enter the "Actual Cash Count" — the amount you physically counted.' },
      { text: "The Variance is calculated automatically (Actual minus Expected).", tip: "A variance of zero (green) means your cash balances perfectly. A small variance (amber) is a minor discrepancy. A large variance (red) should be investigated." },
      { text: "Add any notes to explain a discrepancy (optional)." },
      { text: 'Click "Confirm Cashup". All open entries are marked as cashed up and the new balance becomes the opening balance for the next period.' },
      { text: 'View past cashups on the "Cashup History" tab.' },
    ],
  },
  {
    id: "petty-cash-driver-slip",
    title: "How to Upload an Expense Slip (Driver)",
    icon: "🧾",
    roles: ["Driver"],
    steps: [
      { text: "When Finance assigns you a petty cash entry (e.g. R500 for diesel), it appears on your driver dashboard under \"My Cash Allocations\"." },
      { text: "The card shows the description, category, and amount allocated to you." },
      { text: 'Tap "Upload Petrol / Expense Slip" on the allocation card.' },
      { text: "Tap the camera button to take a photo of the slip, or select from your gallery." },
      { text: 'Tap "Upload Slip" — the image is saved and linked to the petty cash entry.', tip: "Finance and Owner can see the slip upload status in the Petty Cash module." },
    ],
  },

  // ── Bank Reconciliation ─────────────────────────────────────────────────────
  {
    id: "bank-recon-upload",
    title: "How to Upload and Reconcile a Bank Statement",
    icon: "🏦",
    roles: ["Owner", "Finance", "Admin"],
    steps: [
      { text: 'Click "Bank Recon" in the nav bar.' },
      { text: 'Click the "Upload Statement" tab and select your bank CSV file. The system auto-detects FNB and Standard Bank formats.', tip: "Export the statement as CSV from your online banking. Most banks offer a CSV or Excel export option." },
      { text: 'Click "Upload". The statement is parsed and all transactions appear in the Allocate tab.' },
      { text: 'Switch to the "Allocate" tab. Transactions are grouped into Credits (money in) and Debits (money out).' },
      { text: "Credits are typically client payments. Click the dropdown next to a credit to select the client it belongs to — the system suggests matches based on the amount.", tip: "Smart matching highlights amounts that match an outstanding invoice within 5 cents." },
      { text: "Once you select a client, click \"Allocate to Client Credit\" — the amount is added to the client's credit ledger." },
      { text: "Debits are typically supplier payments. Click the dropdown next to a debit to select the supplier, then click \"Allocate to Supplier\"." },
      { text: "Transactions that don't belong to a client or supplier (e.g. bank charges, petty cash) can be marked as non-client recon entries." },
      { text: 'The "Allocation Report" tab shows a summary of all allocated and unallocated transactions for the uploaded statement.' },
    ],
  },
  {
    id: "client-accounts",
    title: "How to Use Client Accounts (Credit Ledger)",
    icon: "📒",
    roles: ["Owner", "Finance", "Admin"],
    steps: [
      { text: 'Click "Reports" in the menu, then click the "Client Accounts" tab (or navigate via Bank Recon).' },
      { text: "The Client Accounts screen shows each client's current outstanding balance, total invoiced, and total payments received." },
      { text: "Click a client row to see their full ledger: each invoice, each payment allocated, and the running balance." },
      { text: "Use the date range filter to see the account position for a specific period." },
      { text: 'To send a client their statement via WhatsApp, click the "📱 WhatsApp Statement" button on their ledger row.', tip: "The statement PDF is generated automatically and sent to the client's WhatsApp number on file." },
      { text: "Payments allocated via Bank Recon appear automatically in the client's ledger as credits.", tip: "Outstanding balances update in real-time as invoices are created and payments are allocated." },
    ],
  },

  // ── Settings ────────────────────────────────────────────────────────────────
  {
    id: "settings-whatsapp",
    title: "How to Update the Hub WhatsApp Number",
    icon: "⚙️",
    roles: ["Owner"],
    steps: [
      { text: 'Click "Settings" in the top nav bar (visible to Owner only).' },
      { text: 'Find the "Hub WhatsApp Number" section.' },
      { text: 'Click "✏️ Edit".' },
      { text: "Enter the South African mobile number that should receive Hub Request notifications.", tip: "Both formats work: local (0821234567) or international (27821234567). The system normalises them automatically." },
      { text: 'Click "Save". The new number is stored immediately — no restart or redeploy required.' },
      { text: "The last-updated timestamp and username are shown so you always know when the number was last changed.", tip: "This number is used every time a new Hub Request is submitted. If notifications stop arriving, check this setting first." },
    ],
  },

  // ── Hub Requests ────────────────────────────────────────────────────────────
  {
    id: "hub-request-create",
    title: "How to Send a Hub Request",
    icon: "📋",
    roles: ["Owner", "Finance", "Admin"],
    steps: [
      { text: 'Click "Hub Requests" in the nav bar.' },
      { text: 'Click "+ New Request".' },
      { text: "Type a clear description of what you need the hub team to do — e.g. \"Please create a delivery order for Client ABC, 50 boxes of Nile Perch, delivery 2026-04-01, EFT payment\"." },
      { text: 'Click "Send Request".' },
      { text: "A WhatsApp notification is sent automatically to the hub's number.", tip: "Make sure the HUB_WHATSAPP_NUMBER is configured in the system settings. Contact your system administrator if notifications are not being received." },
      { text: "The request appears in the list with status Pending — visible to all hub staff." },
      { text: "Once the hub team creates the order, they will mark the request as Actioned and link it to the order they created." },
    ],
  },
  {
    id: "hub-request-action",
    title: "How to Action a Hub Request",
    icon: "✅",
    roles: ["Owner", "Finance", "Admin", "HubStaff", "Procurement"],
    steps: [
      { text: 'Click "Hub Requests" in the nav bar. You will see all Pending requests.' },
      { text: "Click on a request to expand it and read the full message from the requester." },
      { text: 'Click "Mark as Actioned".' },
      { text: "In the Action Notes field, describe what was done (e.g. \"Created delivery order for Client ABC\")." },
      { text: "Select the Order Type from the dropdown: Delivery Order, Procurement Order, or Other." },
      { text: "Enter the Order Reference so it is clear which order was created (e.g. DO#abc123)." },
      { text: "Optionally paste the order's system ID if you have it.", tip: "The order reference and ID are stored permanently with the request for audit purposes — Finance and the requester can look up the original request and see exactly what was done." },
      { text: 'Click "Confirm Actioned". The request status changes to Actioned and is archived.' },
    ],
  },
  {
    id: "hub-request-audit",
    title: "How to View Hub Request History (Audit)",
    icon: "🔎",
    roles: ["Owner", "Finance", "Admin"],
    steps: [
      { text: 'Click "Hub Requests" in the nav bar.' },
      { text: 'Use the filter tabs to switch between "Pending", "Actioned", and "Cancelled" requests.' },
      { text: "Click any request to expand the full audit trail: who requested it, when, the full message, who actioned it, their notes, and the linked order." },
      { text: "This provides a complete paper trail connecting a verbal or WhatsApp instruction to the actual order created in the system.", tip: "For audits, the Actioned tab shows every request that was fulfilled, who fulfilled it, and which order was created as a result." },
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
