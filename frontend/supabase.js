import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://fkjnxtljgbgrvlglykha.supabase.co";

const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Dhan8xoP44tIRJ4yJ9vRSQ_2gGd5Kwi";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);
