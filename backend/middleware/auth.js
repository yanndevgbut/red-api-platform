const supabase = require('../config/supabase');
const { rejectRequest } = require('./validate');

const denials = {
  USER_BANNED: [403, 'Account is suspended.'],
  PLAN_REQUIRED: [403, 'Your plan does not include this endpoint.'],
  QUOTA_EXCEEDED: [429, 'Daily request quota exceeded. Resets at 00:00 WIB.'],
  ENDPOINT_UNAVAILABLE: [404, 'Endpoint is unavailable.'],
  ENDPOINT_MAINTENANCE: [503, 'Endpoint is under maintenance.'],
};

function readApiKey(req) {
  const key = req.get('x-api-key') || req.query.apikey;
  return typeof key === 'string' && key.length <= 128 && /^[a-z0-9_-]+$/i.test(key) ? key : null;
}

function authorize(minimumPlan = 'free') {
  return async (req, res, next) => {
    const key = readApiKey(req);
    if (!key) return rejectRequest(res, 401, 'Provide a valid API key in the x-api-key header.');

    const { data, error } = await supabase.rpc('authorize_api_request', {
      user_key: key,
      request_method: req.method === 'HEAD' ? 'GET' : req.method,
      request_path: `${req.baseUrl}${req.route.path}`.toLowerCase(),
      required_plan: minimumPlan,
    }).single();

    if (error) {
      console.error('[RPC_QUOTA_ERROR]', error.code);
      return rejectRequest(res, 503, 'Authentication service unavailable.');
    }

    if (data?.user_id) req.apiUser = { id: data.user_id, plan: data.plan, remaining: data.remaining };
    if (!data?.valid) {
      const [status, message] = denials[data?.reason] || [401, 'Invalid or inactive API key.'];
      return rejectRequest(res, status, message);
    }
    next();
  };
}

module.exports = { authorize, readApiKey };
