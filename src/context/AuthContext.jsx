import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { USER_STATUS } from "../constants";

export const AuthContext = createContext();

// Handy hook so components can do: const { user, role, status } = useAuth();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null); // { role, status, name, phone }
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("role, status, name, phone")
      .eq("id", userId)
      .single();

    if (!error && data) {
      setProfile(data);
      // If a restored session belongs to a not-yet-approved or disabled
      // account, sign them out so they can't sit inside the app.
      if (data.status !== USER_STATUS.APPROVED) {
        await supabase.auth.signOut();
      }
    }
  };

  useEffect(() => {
    let mounted = true;

    // Get the current session on first load.
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user || null);
      // Fire-and-forget: don't block the loading screen on the profile query.
      if (data.session?.user) fetchProfile(data.session.user.id);
      setLoading(false);
    });

    // React to login / logout happening anywhere in the app.
    // IMPORTANT: never `await` a Supabase query directly in here — it
    // deadlocks the auth client. We defer the profile fetch instead.
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;
        setSession(session);
        setUser(session?.user || null);
        if (session?.user) {
          setTimeout(() => fetchProfile(session.user.id), 0);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        role: profile?.role || null,
        status: profile?.status || null,
        loading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
