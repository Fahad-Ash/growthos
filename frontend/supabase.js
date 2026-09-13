import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL =
  "https://fkjnxtljgbgrvlglykha.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_Dhan8xoP44tIRJ4yJ9vRSQ_2gGd5Kwi";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);


// ============================================
// Get current logged-in user
// ============================================

export async function getCurrentUser() {

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error) {
    console.error("Could not get current user:", error);
    return null;
  }

  return user;
}


// ============================================
// Save Marketing Kit
// ============================================

export async function saveMarketingKit(data) {

  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error: "User is not logged in."
    };
  }

  const { data: savedKit, error } = await supabase
    .from("marketing_kits")
    .insert({
      user_id: user.id,
      business_type: data.type,
      city: data.city || null,
      product_service: data.offer,
      target_customer: data.audience || null,
      result: data.result
    })
    .select()
    .single();

  if (error) {

    console.error(
      "Marketing kit save failed:",
      error
    );

    return {
      success: false,
      error: error.message
    };
  }

  console.log(
    "Marketing kit saved successfully:",
    savedKit
  );

  return {
    success: true,
    data: savedKit
  };
}
