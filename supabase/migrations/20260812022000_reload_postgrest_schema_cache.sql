-- Make newly deployed API v1 functions immediately visible to PostgREST.
-- This is intentionally a separate migration so the notification is emitted
-- after all preceding governance contracts have committed successfully.
notify pgrst, 'reload schema';
