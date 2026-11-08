function rejectRequest(res, code, message) {
  return res.status(code).json({ status: false, code, message });
}

function validateInput(getInput, validators) {
  return (req, res, next) => {
    const input = getInput(req);
    for (const [name, valid] of Object.entries(validators)) {
      if (!valid(input?.[name])) return rejectRequest(res, 400, `Invalid or missing parameter "${name}".`);
    }
    req.apiInput = input;
    next();
  };
}

function isText(value, maxLength) {
  return typeof value === 'string' && value.length <= maxLength && value.trim().length > 0;
}

function isWebUrl(value, domain, pathPrefix = '/') {
  if (!isText(value, 2048)) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
      url.pathname.startsWith(pathPrefix) &&
      (!domain || (!url.port && (url.hostname === domain || url.hostname.endsWith('.' + domain))));
  } catch {
    return false;
  }
}

module.exports = { isText, isWebUrl, rejectRequest, validateInput };
