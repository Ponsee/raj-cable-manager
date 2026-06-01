import { useEffect, useState } from "react";
import CircularProgress from "@mui/material/CircularProgress";
import { supabase } from "../services/supabase";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { USER_STATUS } from "../constants";

// mode: "login" | "signup" | "forgot"
export default function Login() {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const navigate = useNavigate();
  const { user, status } = useAuth();

  // Only skip the form once we know the account is APPROVED. A pending/disabled
  // user briefly has a session before AuthContext signs them out — we must not
  // redirect them, or the "waiting for approval" message never shows.
  useEffect(() => {
    if (user && status === USER_STATUS.APPROVED) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, status, navigate]);

  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";

  const switchMode = (m) => {
    setMode(m);
    setError("");
    setSuccess("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (isForgot) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSuccess(
          "If that email has an account, a password reset link is on its way. Check your inbox."
        );
        return;
      }

      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;

        let status = USER_STATUS.PENDING;
        if (data.user) {
          // The DB trigger decides role/status; we just send name + phone.
          const { data: prof } = await supabase
            .from("profiles")
            .insert([{ id: data.user.id, email, name, phone }])
            .select("status")
            .single();
          status = prof?.status || USER_STATUS.PENDING;
        }
        // Don't leave them signed in — they log in explicitly afterwards.
        await supabase.auth.signOut();
        setMode("login");
        setSuccess(
          status === USER_STATUS.APPROVED
            ? "Account created! You can log in now."
            : "Account created. An admin needs to approve your account before you can log in."
        );
        return;
      }

      // --- Login ---
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      // Check approval status before letting them in.
      const { data: prof } = await supabase
        .from("profiles")
        .select("status")
        .eq("id", data.user.id)
        .single();

      const status = prof?.status;
      if (status !== USER_STATUS.APPROVED) {
        await supabase.auth.signOut();
        setError(
          status === USER_STATUS.DISABLED
            ? "Your account has been disabled. Please contact an admin."
            : "Your account is waiting for admin approval."
        );
        return;
      }
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const title = isForgot
    ? "Reset password"
    : isSignup
    ? "Create account"
    : "Welcome back";
  const subtitle = isForgot
    ? "We'll email you a link to set a new password"
    : isSignup
    ? "Sign up — an admin approves new accounts"
    : "Login to manage your business";
  const buttonLabel = loading
    ? "Please wait..."
    : isForgot
    ? "Send reset link"
    : isSignup
    ? "Create Account"
    : "Login";

  const inputClass =
    "w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-800 p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="mb-8 text-center">
          <img
            src="/LOGO.png"
            alt="Raj Cable TV & Broadband"
            className="mx-auto mb-4 h-20 w-20 rounded-2xl bg-white object-contain p-1 shadow-lg shadow-indigo-500/30"
          />
          <h1 className="text-2xl font-bold text-white">
            Raj Cable TV &amp; Broadband
          </h1>
          <p className="mt-1 text-sm text-indigo-200">Business Manager</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white p-8 shadow-2xl">
          <h2 className="mb-1 text-xl font-semibold text-gray-900">{title}</h2>
          <p className="mb-6 text-sm text-gray-500">{subtitle}</p>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignup && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Full name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    placeholder="e.g. Ramesh Kumar"
                    className={inputClass}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Mobile number
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    placeholder="e.g. 98765 43210"
                    className={inputClass}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                placeholder="you@example.com"
                className={inputClass}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {!isForgot && (
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">
                    Password
                  </label>
                  {!isSignup && (
                    <button
                      type="button"
                      onClick={() => switchMode("forgot")}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={password}
                    placeholder="••••••••"
                    className={inputClass + " pr-16"}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && <CircularProgress size={16} color="inherit" />}
              {buttonLabel}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-600">
            {isForgot ? (
              <>
                Remembered it?
                <button
                  className="ml-1 font-semibold text-indigo-600 hover:text-indigo-800"
                  onClick={() => switchMode("login")}
                >
                  Back to login
                </button>
              </>
            ) : isSignup ? (
              <>
                Already have an account?
                <button
                  className="ml-1 font-semibold text-indigo-600 hover:text-indigo-800"
                  onClick={() => switchMode("login")}
                >
                  Login
                </button>
              </>
            ) : (
              <>
                Don't have an account?
                <button
                  className="ml-1 font-semibold text-indigo-600 hover:text-indigo-800"
                  onClick={() => switchMode("signup")}
                >
                  Sign up
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
