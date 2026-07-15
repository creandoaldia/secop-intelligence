// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — LinkedIn OAuth + API Client
// Real OAuth 2.0 flow + API calls with config guard
// Falls back to mock when not configured
// ─────────────────────────────────────────────────────────────

// ─── Config ────────────────────────────────────────────────

const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;

function isConfigured(): boolean {
  return !!(LINKEDIN_CLIENT_ID && LINKEDIN_CLIENT_SECRET);
}

function isMockMode(): boolean {
  return !isConfigured();
}

// ─── Types ─────────────────────────────────────────────────

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

export interface LinkedInTokenResponse {
  accessToken: string;
  expiresAt: number; // unix timestamp
}

// ─── OAuth URLs ────────────────────────────────────────────

const OAUTH_AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const OAUTH_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const API_BASE = "https://api.linkedin.com/v2";

const SCOPES = ["openid", "profile", "email", "w_member_social"].join(" ");

function getRedirectUri(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/linkedin/callback`;
}

// ─── Mock Data ─────────────────────────────────────────────

const MOCK_PROFILE: LinkedInProfile = {
  id: "linkedin-mock-user-001",
  name: "Usuario Demo",
  email: "demo@ejemplo.com",
  picture: "https://media.licdn.com/dms/image/v2/mock",
};

// ─── Public Functions ──────────────────────────────────────

/**
 * Generate a LinkedIn OAuth URL.
 * In mock mode, returns a placeholder URL that simulates the flow.
 */
export function getAuthUrl(state: string): LinkedInAuthUrl {
  if (isMockMode()) {
    return {
      url: `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=MOCK_CLIENT_ID&redirect_uri=${encodeURIComponent(getRedirectUri())}&state=${state}&scope=${encodeURIComponent(SCOPES)}`,
      state,
    };
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: LINKEDIN_CLIENT_ID!,
    redirect_uri: getRedirectUri(),
    state,
    scope: SCOPES,
  });

  return {
    url: `${OAUTH_AUTHORIZE_URL}?${params.toString()}`,
    state,
  };
}

/**
 * Exchange authorization code for access token.
 * In mock mode, returns a fake token.
 */
export async function exchangeCodeForToken(
  code: string
): Promise<LinkedInTokenResponse> {
  if (isMockMode()) {
    await new Promise((r) => setTimeout(r, 500));
    return {
      accessToken: "mock_access_token_" + crypto.randomUUID().replace(/-/g, ""),
      expiresAt: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
    };
  }

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: LINKEDIN_CLIENT_ID!,
    client_secret: LINKEDIN_CLIENT_SECRET!,
    redirect_uri: getRedirectUri(),
  });

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`LinkedIn token exchange failed: ${response.status} ${errorBody}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
  };
}

/**
 * Get LinkedIn profile from access token.
 * In mock mode, returns a fake profile.
 */
export async function getProfile(accessToken: string): Promise<LinkedInProfile> {
  if (isMockMode()) {
    await new Promise((r) => setTimeout(r, 300));
    return MOCK_PROFILE;
  }

  // LinkedIn OpenID Connect userinfo endpoint
  const response = await fetch(`${API_BASE}/userinfo`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`LinkedIn profile fetch failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    sub: string;
    name?: string;
    email?: string;
    picture?: string;
  };

  return {
    id: data.sub,
    name: data.name ?? "LinkedIn User",
    email: data.email ?? "",
    picture: data.picture ?? "",
  };
}

/**
 * Create a LinkedIn post (text share).
 * In mock mode, returns a fake post URN.
 */
export async function createPost(
  accessToken: string,
  content: string
): Promise<{ postUrn: string }> {
  if (isMockMode()) {
    await new Promise((r) => setTimeout(r, 1000));
    return {
      postUrn: "urn:li:share:" + crypto.randomUUID().replace(/-/g, ""),
    };
  }

  // First, get the user's LinkedIn ID (sub from userinfo)
  const profile = await getProfile(accessToken);

  const response = await fetch(`${API_BASE}/ugcPosts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: `urn:li:person:${profile.id}`,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text: content.slice(0, 3000), // LinkedIn max 3000 chars
          },
          shareMediaCategory: "NONE",
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`LinkedIn post creation failed: ${response.status} ${errorBody}`);
  }

  // Extract post URN from the response headers (x-restli-id)
  const postId = response.headers.get("x-restli-id") ?? "";
  return {
    postUrn: postId || `urn:li:share:${crypto.randomUUID()}`,
  };
}

/**
 * Revoke LinkedIn access token (disconnect).
 */
export async function revokeToken(accessToken: string): Promise<void> {
  if (isMockMode()) {
    await new Promise((r) => setTimeout(r, 200));
    return;
  }

  await fetch(`${OAUTH_TOKEN_URL}/revocation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: LINKEDIN_CLIENT_ID!,
      client_secret: LINKEDIN_CLIENT_SECRET!,
      token: accessToken,
    }),
  }).catch(() => {
    // Revocation failure is non-critical
    console.warn("[LinkedIn] Token revocation failed (non-critical)");
  });
}
