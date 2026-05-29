// Consistent button used across the whole app.
export default function Button({
  variant = "primary",
  className = "",
  ...props
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";

  const variants = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700",
    secondary: "border border-gray-300 text-gray-700 hover:bg-gray-50",
    danger: "bg-red-500 text-white hover:bg-red-600",
    ghost: "text-gray-600 hover:bg-gray-100",
  };

  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
