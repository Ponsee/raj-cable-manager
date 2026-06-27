import LedgerPage from "../components/finance/LedgerPage";
import { EXPENSE_CATEGORIES } from "../constants";

export default function Expense() {
  return (
    <LedgerPage
      config={{
        table: "expenses",
        title: "Expense",
        subtitle: "Money going out",
        addLabel: "+ Add Expense",
        accent: "red",
        totalLabel: "Total Expense",
        categories: EXPENSE_CATEGORIES,
        unifiedAdd: true, // also add worker pay / product purchase from here
        paymentFilter: true, // show Cash / Online / Split filter chips
        // Auto-created rows — delete them from their source (purchase / worker),
        // not here, so stock & worker records stay in sync.
        lockedCategories: [
          "Product purchase",
          "Staff salary",
          "Staff payment",
          "Worker advance",
          "Staff bonus",
          "Worker expense",
          "Contract work",
          "Customer refund",
        ],
        lockedHint: "Added automatically — delete it from the purchase or worker entry.",
      }}
    />
  );
}
