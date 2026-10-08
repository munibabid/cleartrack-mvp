/* Veridun backend configuration (public file — ships to every browser).
   Default: the browser-only demo. All data stays in this browser's
   localStorage (LocalStorageAdapter), exactly as before.

   To connect Supabase later (see docs/BACKEND.md), set:
     backend: 'supabase',
     supabaseUrl: 'https://<project-ref>.supabase.co',
     supabaseAnonKey: '<anon / publishable key>'
   The anon/publishable key is designed to be public; row-level security in
   backend/supabase/migrations protects the data.
   NEVER put the service_role / secret key here. The store refuses it. */
window.VERIDUN_CONFIG = window.VERIDUN_CONFIG || { backend: 'local' };
