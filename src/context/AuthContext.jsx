import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../services/supabase";

export const AuthContext = createContext();

// Handy hook so components can do: const { user, role } = useAuth();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Get the current session on first load.
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user || null);
      // Fire-and-forget: don't block the loading screen on the role query.
      if (data.session?.user) fetchRole(data.session.user.id);
      setLoading(false);
    });

    // React to login / logout happening anywhere in the app.
    // IMPORTANT: never `await` a Supabase query directly in here — it
    // deadlocks the auth client. We defer the role fetch instead.
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;
        setSession(session);
        setUser(session?.user || null);
        if (session?.user) {
          setTimeout(() => fetchRole(session.user.id), 0);
        } else {
          setRole(null);
        }
        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const fetchRole = async (userId) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (!error && data) setRole(data.role);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, role, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
