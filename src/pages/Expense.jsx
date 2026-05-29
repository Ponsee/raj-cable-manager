import PageHeader from "../components/ui/PageHeader";

export default function Expense() {
  return (
    <div>
      <PageHeader title="Expense" subtitle="Money going out" />
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-400">
        Expense module — coming in Module 4.
      </div>
    </div>
  );
}
