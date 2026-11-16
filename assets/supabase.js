/* Blissful Butterfly — SUPABASE CONFIG (fill in after creating your project)
   ============================================================================
   HOW TO SET UP (5 minutes):
   1. Go to https://supabase.com → Create new project → name it "Blissful Butterfly"
   2. Wait for it to be ready, then go to: Project Settings → API
   3. Copy "Project URL" and "anon public key" — paste them below.
   4. Run the SQL in SUPABASE_SETUP.sql (SQL Editor) to create tables.
   5. (Optional) In Supabase: Authentication → Users → Add your admin email.
   6. Refresh index.html — the shop will auto-connect, seed products, and
      orders will sync between customer phones and the admin phone.

   SECURITY:
   • The "anon key" below is SAFE to expose in the frontend — it only has the
     permissions given by Row Level Security (RLS) policies in SUPABASE_SETUP.sql.
   • NEVER paste the "service_role" key here. That key bypasses ALL security.
   • Admin login uses Supabase Auth (email + password, hashed server-side).

   Until you paste your keys, the app runs in LOCAL demo mode (same device only).
   ============================================================================ */
window.BB_SUPABASE_CONFIG = {
  // TODO: paste your Project URL here, e.g. "https://abcdefghijk.supabase.co"
  url: '',
  // TODO: paste your anon public key here (starts with "eyJ...")
  anonKey: '',
  // Admin email for Supabase Auth (create this user in Supabase dashboard)
  adminEmail: '',
};
