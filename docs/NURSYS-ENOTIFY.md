# Nursys e-Notify: turning on real license automation

**Status (PR 13, Oct 9, 2026): not connected.** Veridun has no Nursys institution account and no API credentials, so the connector in `backend/supabase/functions/nursys-enotify/` is a stub. It refuses to run without credentials and never invents a result. Today an RN license is verified by hand: a verifier with authenticator 2FA opens the board's lookup page or Nursys QuickConfirm (from the Verification Source Registry), and records what the source showed.

## What Nursys offers (confirmed Oct 2026)

| | QuickConfirm | e-Notify (institution) |
|---|---|---|
| Cost | Free | Free |
| Use | Look up one license and its discipline status on the website | Enroll licenses on a Nurse List, get license data and change notifications |
| API | **None** (NCSBN: "Nursys does not offer an API for Nursys QuickConfirm") | **JSON API**: manage the Nurse List, pull Nurse Report license data, pull license-change notifications, change the API password |
| Test environment | — | **None**, and no sample nurses or licenses |
| Coverage | 58 participating boards: every US jurisdiction except Puerto Rico (RN/PN) | Same participating boards |
| Trust | Nursys data comes from the boards. Nursys meets The Joint Commission's principles for primary-source-equivalent verification | Same, plus monitoring |

In Veridun's registry, QuickConfirm is an **approved** source (manual, primary-source equivalent). e-Notify is **pending** until the steps below are done. Puerto Rico licenses must be checked on the Puerto Rico board's own page (ORCPS). On Oct 9, 2026, Nursys also posted that Alabama data is not current; the registry notes this on the Alabama entry.

## What Munib needs to do

1. **Create a free e-Notify institution account.** Go to https://www.nursys.com/EN/ENDefault.aspx and choose to create an account **"As an Institution"** (not "As a Nurse"). Use the legal name of the organization that will employ or place the nurses. Register once; you can add more administrators later.
2. **Request API credentials.** From the email address of an **Administrator User** on that account, contact NCSBN's Nursys customer experience team and ask for e-Notify **API credentials** for the account. (The support address shown on nursys.com is nursyssupport@ncsbn.org.) NCSBN sends the API user name, password and the API URL.
3. **Download the API specification.** Sign in to the institution account. The API documentation PDF is under **Quick Links** on the dashboard.
4. **Store the credentials as Supabase function secrets** (Dashboard → Edge Functions → Secrets, or `supabase secrets set`). Never put them in `js/config.js`, the repo, or a chat:
   - `NURSYS_ENOTIFY_API_BASE` — the API URL NCSBN sent
   - `NURSYS_ENOTIFY_USERNAME`
   - `NURSYS_ENOTIFY_PASSWORD`
   - `NURSYS_ENOTIFY_PASSWORD_SET` — today's date, `YYYY-MM-DD`
5. **Map the endpoints** (a developer task, next PR after credentials exist): implement `enroll`, `lookup` and `notifications` in `functions/nursys-enotify/index.ts` from the PDF. Until then those actions return `501` and send nothing to Nursys.
6. **Deploy the function** (`supabase functions deploy nursys-enotify`). This needs a Supabase access token, which this build environment does not have.
7. **Approve the source.** Only after a real lookup returns real data: `update public.verification_sources set status = 'APPROVED' where slug = 'nursys-enotify';` Then verifiers can choose "Enrolled in Nursys e-Notify" and licenses become **Continuously Monitored**.
8. **Rotate the API password every 90 days.** The function refuses to run once `NURSYS_ENOTIFY_PASSWORD_SET` is 90 days old.

## Things to know before going live

- **Consent and data.** Enrolling a nurse's license sends their license number and name to Nursys under your institution account. Get the nurse's consent in the app first, and only enroll nurses you employ or place.
- **No test environment.** The first real call uses real nurses. Start with your own license or a consenting colleague's.
- **Not HIPAA-related, but still PII.** License data is public record, but the Supabase project is still pre-compliance staging.
- **Server writes.** `record_source_check()` requires a signed-in verifier at AAL2. When automation is mapped, add a separate server-only function (called by the Edge Function with a function secret) rather than giving the browser any new power.
