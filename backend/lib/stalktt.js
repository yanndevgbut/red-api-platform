const BASE = "https://countik.com";

const fail = (code, message) => Object.assign(new Error(message), { code });

const asString = (value) => (typeof value === "string" ? value : null);

const asBoolean = (value) => (typeof value === "boolean" ? value : null);

function normalizeUsername(input) {
  const username =
    typeof input === "string" ? input.trim().replace(/^@/, "") : "";

  if (!/^[A-Za-z0-9._]{1,24}$/.test(username) || username.endsWith(".")) {
    throw fail(
      "INVALID_USERNAME",
      "Masukkan username TikTok, misalnya tiktok atau @tiktok.",
    );
  }

  return username.toLowerCase();
}

function asCount(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    const number = Number(value);

    // Pertahankan string jika angkanya melebihi batas presisi JS.
    return Number.isSafeInteger(number) ? number : value;
  }

  return null;
}

function normalizeProfile(profile, requestedUsername) {
  if (!profile || typeof profile.uniqueId !== "string" || !profile.uniqueId) {
    throw fail(
      "INVALID_RESPONSE",
      "Penyedia tidak mengembalikan profil yang valid.",
    );
  }

  if (profile.uniqueId.toLowerCase() !== requestedUsername.toLowerCase()) {
    throw fail(
      "USERNAME_MISMATCH",
      "Profil yang dikembalikan tidak sesuai username.",
    );
  }

  const stats = {
    followers: asCount(profile.followerCount),
    following: asCount(profile.followingCount),
    likes: asCount(profile.heartCount),
    videos: asCount(profile.videoCount),
  };

  const displayName = asString(profile.nickname);
  const bio = asString(profile.signature);

  const required = {
    display_name: displayName,
    bio,
    ...stats,
  };

  const missingFields = Object.entries(required)
    .filter(([, value]) => value === null)
    .map(([key]) => key);

  const userId =
    typeof profile.id === "string"
      ? profile.id
      : Number.isSafeInteger(profile.id)
        ? String(profile.id)
        : null;

  return {
    provider: "countik.com",
    fetched_at: new Date().toISOString(),
    source_cached: asBoolean(profile.cache),

    username: profile.uniqueId,
    display_name: displayName,
    bio,

    profile_url: `https://www.tiktok.com/@${profile.uniqueId}`,
    user_id: userId,

    sec_uid: asString(profile.sec_uid) ?? asString(profile.secUid),

    language: asString(profile.language),
    country: asString(profile.country),

    private_account: asBoolean(profile.privateAccount),
    verified_reported: asBoolean(profile.verified),

    bio_link:
      typeof profile.bioLink === "string"
        ? profile.bioLink
        : asString(profile.bioLink?.link),

    avatars: {
      large: asString(profile.avatarLarger),
      medium: asString(profile.avatarMedium),
      thumbnail: asString(profile.avatarThumb),
    },

    stats,

    completeness: {
      required_fields_complete: missingFields.length === 0,
      missing_fields: missingFields,
    },
  };
}

async function getTikTokProfile(
  usernameInput,
  {
    fetchImpl = fetch,
    signal,
    browserImpl = (...args) =>
      require("./stalktt-browser").browserProfile(...args),
  } = {},
) {
  const username = normalizeUsername(usernameInput);

  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
    : AbortSignal.timeout(30000);
  let response = await fetchImpl(
    `${BASE}/api/exist/${encodeURIComponent(username)}`,
    {
      method: "GET",
      redirect: "error",
      signal: requestSignal,
      headers: {
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Referer: `${BASE}/`,
        Origin: BASE,
      },
    },
  );

  if (response.status === 403) {
    await response.body?.cancel();
    response = await browserImpl(username, { signal: requestSignal });
  }
  if (response.status === 403) {
    await response.body?.cancel();
    throw fail(
      "PROVIDER_BLOCKED",
      "Countik menolak permintaan dari server ini (HTTP 403).",
    );
  }
  if (response.status === 429) {
    await response.body?.cancel();
    throw fail(
      "RATE_LIMITED",
      "Batas permintaan Countik tercapai. Coba lagi nanti.",
    );
  }

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    await response.body?.cancel();

    throw fail(
      "NON_JSON_RESPONSE",
      `Penyedia mengembalikan respons non-JSON (HTTP ${response.status}).`,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) throw fail("INVALID_RESPONSE", "Respons Countik kosong.");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) {
        await reader.cancel();
        throw fail("INVALID_RESPONSE", "Respons Countik terlalu besar.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let profile;
  try {
    profile = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw fail("INVALID_RESPONSE", "Respons Countik bukan JSON yang valid.");
  }
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    throw fail("INVALID_RESPONSE", "Respons Countik tidak valid.");
  }
  if (!response.ok || profile.status === "error") {
    const message =
      asString(profile.message) ||
      asString(profile.msg) ||
      "Profil gagal diambil.";

    throw fail(
      response.status === 404 || /user not found/i.test(message)
        ? "USER_NOT_FOUND"
        : `HTTP_${response.status}`,
      message.slice(0, 300),
    );
  }

  if (profile.status !== "success") {
    throw fail(
      "INVALID_RESPONSE",
      "Penyedia tidak melaporkan permintaan berhasil.",
    );
  }

  return normalizeProfile(profile, username);
}

function errorResponse(error) {
  const diagnostic = [error.name, error.code, error.cause?.code].filter(
    (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value),
  );
  console.warn(
    "[STALKTT] Provider request failed:",
    diagnostic.join(" / "),
    error.code === "NON_JSON_RESPONSE" ? error.message : "",
  );
  const timeout = ["AbortError", "TimeoutError"].includes(error.name);
  const known = [
    "PROVIDER_BLOCKED",
    "PROVIDER_BUSY",
    "PROVIDER_UNAVAILABLE",
    "PROVIDER_TIMEOUT",
    "RATE_LIMITED",
    "NON_JSON_RESPONSE",
    "INVALID_RESPONSE",
    "USERNAME_MISMATCH",
    "USER_NOT_FOUND",
    "INVALID_USERNAME",
  ];
  const code = timeout
    ? "PROVIDER_TIMEOUT"
    : known.includes(error.code)
      ? error.code
      : "PROVIDER_ERROR";
  const status = [
    "PROVIDER_BLOCKED",
    "PROVIDER_BUSY",
    "PROVIDER_UNAVAILABLE",
  ].includes(code)
    ? 503
    : code === "PROVIDER_TIMEOUT"
      ? 504
      : timeout
        ? 504
        : code === "RATE_LIMITED"
          ? 429
          : code === "USER_NOT_FOUND"
            ? 404
            : code === "INVALID_USERNAME"
              ? 400
              : 502;
  return {
    status,
    body: {
      success: false,
      error: {
        code,
        message: timeout
          ? "Waktu tunggu Countik habis. Coba lagi nanti."
          : known.includes(error.code)
            ? error.message.slice(0, 300)
            : "Profil TikTok belum dapat diambil. Coba lagi nanti.",
      },
    },
  };
}
module.exports = {
  normalizeUsername,
  normalizeProfile,
  asCount,
  getTikTokProfile,
  errorResponse,
};
