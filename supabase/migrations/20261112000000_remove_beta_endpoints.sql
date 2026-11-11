-- Remove only the seven retired beta endpoints; preserve other registrations.
DELETE FROM public.endpoints
WHERE path IN (
  '/api/ai/chat',
  '/api/ai/gpt',
  '/api/download/tiktok',
  '/api/download/instagram',
  '/api/stalk/ml',
  '/api/tools/ssweb',
  '/api/whatsapp/chinfo'
);
