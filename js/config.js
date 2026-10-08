/* Veridun configuration (public file — ships to every browser).

   backend: 'local'  — the DEMO (Alex Morgan, Boston tour, simulated
                       verification) always stays in this browser's
                       localStorage. Signed in or not, demo data never leaves
                       the device.
   accounts          — real sign-in (email magic link) for YOUR ACCOUNT,
                       stored in Munib's Supabase STAGING project. This is a
                       pre-compliance backend: do not store real PHI or real
                       health records yet (Supabase HIPAA support needs a paid
                       plan with a signed BAA).

   supabaseAnonKey is the PUBLISHABLE key. It is designed to be public:
   row-level security (backend/supabase/migrations) protects the data.
   NEVER put the service_role / secret key here. The store refuses it. */
window.VERIDUN_CONFIG = window.VERIDUN_CONFIG || {
  backend: 'local',
  accounts: {
    provider: 'supabase',
    supabaseUrl: 'https://kiwbasfbiarscalzhopy.supabase.co',
    supabaseAnonKey: 'sb_publishable_-bMTBUIehekRKWnI9ZUVYQ_wvfGz7yw',
    redirectUrl: 'https://munibabid.github.io/cleartrack-mvp/'
  }
};
