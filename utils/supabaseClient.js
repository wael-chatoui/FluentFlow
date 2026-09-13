// Backward-compatible re-export — new code should import from utils/supabase/client.js
// This file is kept so existing code referencing `supabase` still works.
import { createClient } from './supabase/client'

export const supabase = createClient()
