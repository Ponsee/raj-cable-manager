import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import { supabase } from "../services/supabase";
import { useAuth } from "../context/AuthContext";
import { ROLE_LABELS, USER_STATUS_LABELS, ROLES } from "../constants";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

function Card({ title, children }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 font-semibold text-gray-800">{title}</h3>
      {children}
    </div>
  );
}

function Notice({ ok, children }) {
  if (!children) return null;
  return (
    <div
      className={`rounded-lg px-3 py-2 text-sm ${
        ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
      }`}
    >
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-800">{value || "—"}</dd>
    </div>
  );
}

export default function Settings() {
  const { user, profile, role, status, signOut } = useAuth();
  const isAdmin = role === ROLES.ADMIN;

  // --- Profile ---
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");
  const [profileErr, setProfileErr] = useState("");

  useEffect(() => {
    setName(profile?.name || "");
    setPhone(profile?.phone || "");
  }, [profile]);

  const saveProfile = async (e) => {
    e.preventDefault();
    setProfileMsg("");
    setProfileErr("");
    if (!name.trim()) return setProfileErr("Name can't be empty.");
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ name: name.trim(), phone: phone.trim() || null })
        .eq("id", user.id);
      if (error) throw error;
      setProfileMsg("Profile saved. It'll update fully on next refresh.");
    } catch (err) {
      setProfileErr(err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  // --- Password ---
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");

  const savePassword = async (e) => {
    e.preventDefault();
    setPwMsg("");
    setPwErr("");
    if (pw.length < 6) return setPwErr("Password must be at least 6 characters.");
    if (pw !== pw2) return setPwErr("Passwords don't match.");
    setSavingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      setPw("");
      setPw2("");
      setPwMsg("Password updated.");
    } catch (err) {
      setPwErr(err.message);
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div>
      <PageHeader title="Settings" subtitle="Your profile & account" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Profile */}
        <Card title="My profile">
          <form onSubmit={saveProfile} className="space-y-3">
            <Notice>{profileErr}</Notice>
            <Notice ok>{profileMsg}</Notice>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Mobile number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
                placeholder="Optional"
              />
            </div>
            <dl className="space-y-1 rounded-lg bg-gray-50 px-3 py-2 text-sm">
              <Row label="Email" value={user?.email} />
              <Row label="Role" value={ROLE_LABELS[role] || role || "—"} />
              <Row label="Status" value={USER_STATUS_LABELS[status] || status || "—"} />
            </dl>

            <div className="flex justify-end">
              <Button type="submit" loading={savingProfile}>
                {savingProfile ? "Saving..." : "Save profile"}
              </Button>
            </div>
          </form>
        </Card>

        {/* Password */}
        <Card title="Change password">
          <form onSubmit={savePassword} className="space-y-3">
            <Notice>{pwErr}</Notice>
            <Notice ok>{pwMsg}</Notice>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                New password
              </label>
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                className={inputClass}
                placeholder="At least 6 characters"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Confirm new password
              </label>
              <input
                type="password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={savingPw}>
                {savingPw ? "Updating..." : "Update password"}
              </Button>
            </div>
          </form>
        </Card>

        {/* Account */}
        <Card title="Account">
          <div className="space-y-3 text-sm text-gray-600">
            {isAdmin && (
              <p>
                Manage staff and approvals in{" "}
                <Link to="/users" className="font-medium text-indigo-600 hover:underline">
                  Users
                </Link>
                .
              </p>
            )}
            <p>Sign out of this device.</p>
            <Button variant="danger" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </Card>

        {/* About */}
        <Card title="About">
          <dl className="space-y-1 text-sm">
            <Row label="App" value="Raj Cable TV & Broadband — Business Manager" />
            <Row label="Version" value="v0.1" />
          </dl>
        </Card>
      </div>
    </div>
  );
}
