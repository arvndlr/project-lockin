async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.reason || `Request failed (${res.status})`);
  return data;
}

async function requireRole(role) {
  const { user } = await api("GET", "/api/me");
  if (!user) {
    window.location.href = "/index.html";
    throw new Error("redirecting");
  }
  if (user.role !== role) {
    window.location.href = `/${user.role}.html`;
    throw new Error("redirecting");
  }
  return user;
}

async function logout() {
  await api("POST", "/api/logout");
  window.location.href = "/index.html";
}
