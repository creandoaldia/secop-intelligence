// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — LinkedIn OAuth Types + Mock Client
// No API keys needed — all functions return mock data
// ─────────────────────────────────────────────────────────────

// ─── OAuth Types ────────────────────────────────────────────

export interface LinkedInProfile {
  id: string;
  name: string;
  email: string;
  picture: string;
}

export interface LinkedInAuthUrl {
  url: string;
  state: string;
}

// ─── Mock Client ────────────────────────────────────────────

const MOCK_PROFILE: LinkedInProfile = {
  id: "linkedin-mock-user-001",
  name: "Usuario Demo",
  email: "demo@ejemplo.com",
  picture: "https://media.licdn.com/dms/image/v2/mock",
};

/**
 * Generate a LinkedIn OAuth URL (mock — returns placeholder).
 */
export function getAuthUrl(state: string): LinkedInAuthUrl {
  return {
    url: `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=MOCK_CLIENT_ID&redirect_uri=MOCK_REDIRECT_URI&state=${state}&scope=openid%20profile%20email%20w_member_social`,
    state,
  };
}

/**
 * Exchange authorization code for access token (mock).
 */
export async function exchangeCodeForToken(
  _code: string
): Promise<{ accessToken: string; expiresAt: number }> {
  // Simulate network delay
  await new Promise((r) => setTimeout(r, 500));
  return {
    accessToken: "mock_access_token_" + crypto.randomUUID().replace(/-/g, ""),
    expiresAt: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365, // 1 year mock
  };
}

/**
 * Get LinkedIn profile from access token (mock).
 */
export async function getProfile(_accessToken: string): Promise<LinkedInProfile> {
  await new Promise((r) => setTimeout(r, 300));
  return MOCK_PROFILE;
}

/**
 * Create a LinkedIn post (mock).
 */
export async function createPost(
  _accessToken: string,
  content: string
): Promise<{ postUrn: string }> {
  await new Promise((r) => setTimeout(r, 1000));
  return {
    postUrn: "urn:li:share:" + crypto.randomUUID().replace(/-/g, ""),
  };
}
