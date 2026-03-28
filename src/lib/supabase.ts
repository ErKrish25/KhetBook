import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || 'https://pcjzebgsaxaszgaqzkkh.supabase.co';
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjanplYmdzYXhhc3pnYXF6a2toIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2ODg3ODEsImV4cCI6MjA5MDI2NDc4MX0.4xcfPkUCpTWGACx0V27GWo1BDVIpJ3cncGEqIQoVqg8';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing. Please check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
