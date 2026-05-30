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
      }}
    />
  );
}
