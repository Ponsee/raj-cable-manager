// Admin-only calls for managing user accounts (the profiles table).
import { supabase } from "./supabase";
import { USER_STATUS } from "../constants";

// All user profiles, newest first. (RLS: only admins can read everyone.)
export async function getProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email, phone, role, status, created_at, approved_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// Approve a pending user and give them a role.
export async function approveUser(id, role, approvedBy) {
  const { error } = await supabase
    .from("profiles")
    .update({
      role,
      status: USER_STATUS.APPROVED,
      approved_at: new Date().toISOString(),
      approved_by: approvedBy || null,
    })
    .eq("id", id);
  if (error) throw error;
}

// Change an already-approved user's role.
export async function setUserRole(id, role) {
  const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
  if (error) throw error;
}

// Disable (block login) or re-enable an account.
export async function setUserStatus(id, status) {
  const { error } = await supabase
    .from("profiles")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}

// How many accounts are waiting for approval (for the nav badge).
export async function getPendingCount() {
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("status", USER_STATUS.PENDING);
  if (error) return 0;
  return count || 0;
}
