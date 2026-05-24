// A single dashboard metric card with an icon chip and colored accent.
export default function StatCard({ label, value, icon, accent = "indigo", onClick, children }) {
  const accents = {
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
    blue: "bg-blue-100 text-blue-700",
    amber: "bg-amber-100 text-amber-700",
    indigo: "bg-indigo-100 text-indigo-700",
  };

  const isClickable = !!onClick;
  const Component = isClickable ? "button" : "div";

  return (
    <Component
      type={isClickable ? "button" : undefined}
      onClick={onClick}
      className={`relative w-full rounded-xl border border-gray-200 bg-white p-5 shadow-sm text-left${
        onClick ? " transition hover:shadow-md cursor-pointer" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg ${accents[accent]}`}
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold text-gray-900">{value}</p>
      {children}
    </Component>
  );
}