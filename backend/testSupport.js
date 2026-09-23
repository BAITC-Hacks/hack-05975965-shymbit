import assert from "node:assert/strict";

export async function register(baseUrl, role, suffix = role) {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Тестовый пользователь", email: `${suffix}@example.test`,
      password: "test-password-12345", role })
  });
  const data = await response.json();
  assert.equal(response.status, 201, JSON.stringify(data));
  return data;
}

export async function versionHeaders(baseUrl, route, token) {
  const entityRoute = route.endsWith("/answers") ? route.slice(0, -8) : route;
  const response = await fetch(`${baseUrl}${entityRoute}`, { headers: { Authorization: `Bearer ${token}` } });
  return { "If-Match": response.headers.get("etag") || '"unknown"' };
}
