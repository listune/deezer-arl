let accountsData = [];
let activeFilter = "ALL";
let currentActiveArl = null;
let currentView = "PUBLIC"; // "PUBLIC" | "ADMIN_LOGIN" | "ADMIN_DASHBOARD"

function getAdminToken() {
  return localStorage.getItem("deezer_arl_admin_token") || "";
}

function setAdminToken(token) {
  if (token) {
    localStorage.setItem("deezer_arl_admin_token", token);
  } else {
    localStorage.removeItem("deezer_arl_admin_token");
  }
}

function getAdminHeaders() {
  const token = getAdminToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { "x-admin-token": token } : {}),
  };
}

document.addEventListener("DOMContentLoaded", async () => {
  if (window.lucide) window.lucide.createIcons();
  setupEventListeners();
  await handleRouteChange();

  setInterval(async () => {
    await refreshStats();
    if (currentView === "ADMIN_DASHBOARD") {
      await fetchAdminAccounts(false);
    }
  }, 20000);
});

async function handleRouteChange() {
  const path = window.location.pathname;
  const hash = window.location.hash;

  if (path.startsWith("/admin") || hash === "#admin") {
    const token = getAdminToken();
    if (token) {
      try {
        const res = await fetch("/api/admin/verify", {
          headers: getAdminHeaders(),
        });
        const data = await res.json();
        if (data.success) {
          switchView("ADMIN_DASHBOARD");
          await fetchAdminAccounts();
          await refreshStats();
          return;
        }
      } catch {}
      setAdminToken("");
    }
    switchView("ADMIN_LOGIN");
  } else {
    switchView("PUBLIC");
    await refreshStats();
  }
}

function switchView(view) {
  currentView = view;
  const publicView = document.getElementById("publicView");
  const adminLoginView = document.getElementById("adminLoginView");
  const adminDashboardView = document.getElementById("adminDashboardView");
  const btnNavLogout = document.getElementById("btnNavLogout");

  if (publicView) publicView.style.display = view === "PUBLIC" ? "block" : "none";
  if (adminLoginView) adminLoginView.style.display = view === "ADMIN_LOGIN" ? "block" : "none";
  if (adminDashboardView) adminDashboardView.style.display = view === "ADMIN_DASHBOARD" ? "block" : "none";

  if (btnNavLogout) {
    btnNavLogout.style.display = view === "ADMIN_DASHBOARD" ? "inline-flex" : "none";
  }

  if (window.lucide) window.lucide.createIcons();
}

function setupEventListeners() {
  document.getElementById("navBrandLogo")?.addEventListener("click", () => {
    window.history.pushState({}, "", "/");
    handleRouteChange();
  });

  document.getElementById("btnNavAdmin")?.addEventListener("click", () => {
    window.history.pushState({}, "", "/admin");
    handleRouteChange();
  });

  document.getElementById("btnNavLogout")?.addEventListener("click", () => {
    setAdminToken("");
    showToast("Logged out from Admin Portal", "info");
    window.history.pushState({}, "", "/");
    handleRouteChange();
  });

  document.getElementById("btnCancelAdminLogin")?.addEventListener("click", () => {
    window.history.pushState({}, "", "/");
    handleRouteChange();
  });

  document.getElementById("adminLoginForm")?.addEventListener("submit", handleAdminLoginSubmit);

  document.getElementById("btnOpenAddModal")?.addEventListener("click", () => {
    openModal("addAccountModal");
  });

  document.getElementById("btnCloseAddModal")?.addEventListener("click", () => {
    closeModal("addAccountModal");
  });

  document.getElementById("btnCancelAddModal")?.addEventListener("click", () => {
    closeModal("addAccountModal");
  });

  document.getElementById("btnOpenDocs")?.addEventListener("click", () => {
    openModal("docsModal");
  });

  document.getElementById("btnCloseDocs")?.addEventListener("click", () => {
    closeModal("docsModal");
  });

  document.getElementById("btnRefreshAll")?.addEventListener("click", handleRefreshAll);
  
  document.getElementById("btnCopyActiveArl")?.addEventListener("click", () => {
    if (currentActiveArl) {
      copyToClipboard(currentActiveArl, "Active ARL copied to clipboard!");
    } else {
      showToast("No active ARL available to copy", "error");
    }
  });

  document.getElementById("addAccountForm")?.addEventListener("submit", handleAddAccount);

  document.getElementById("searchInput")?.addEventListener("input", (e) => {
    renderAccountsTable(e.target.value);
  });

  document.querySelectorAll(".pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".pill-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeFilter = btn.dataset.filter || "ALL";
      renderAccountsTable(document.getElementById("searchInput")?.value || "");
    });
  });
}

async function handleAdminLoginSubmit(e) {
  e.preventDefault();
  const password = document.getElementById("inputAdminPassword")?.value || "";
  const btn = document.getElementById("btnSubmitAdminLogin");

  if (!password) {
    showToast("Please enter the admin password", "error");
    return;
  }

  btn.disabled = true;
  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    const data = await res.json();
    if (data.success && data.token) {
      setAdminToken(data.token);
      showToast("Admin access unlocked!", "success");
      document.getElementById("adminLoginForm")?.reset();
      switchView("ADMIN_DASHBOARD");
      await fetchAdminAccounts();
      await refreshStats();
    } else {
      showToast(data.error || "Incorrect admin password", "error");
    }
  } catch {
    showToast("Network error during login", "error");
  } finally {
    btn.disabled = false;
  }
}

async function refreshStats() {
  try {
    const statsRes = await fetch("/api/stats").then((r) => r.json());
    if (statsRes.success) {
      updateStats(statsRes.data);
    }
  } catch (err) {
    console.error("Stats refresh error:", err);
  }
}

async function fetchAdminAccounts(showLoading = true) {
  const icon = document.getElementById("iconRefreshAll");
  if (showLoading && icon) icon.classList.add("spinning");

  try {
    const accountsRes = await fetch("/api/accounts", {
      headers: getAdminHeaders(),
    }).then((r) => r.json());

    if (accountsRes.success) {
      accountsData = accountsRes.data || [];
      renderAccountsTable(document.getElementById("searchInput")?.value || "");
    } else if (accountsRes.error && accountsRes.error.includes("Admin access required")) {
      setAdminToken("");
      switchView("ADMIN_LOGIN");
    }
  } catch (err) {
    console.error("Fetch accounts error:", err);
  } finally {
    if (icon) icon.classList.remove("spinning");
    if (window.lucide) window.lucide.createIcons();
  }
}

function updateStats(stats) {
  currentActiveArl = stats.activeArl || null;

  const arlCode = document.getElementById("activeArlCode");
  if (arlCode) {
    if (stats.activeArl) {
      arlCode.textContent = `${stats.activeArl.slice(0, 18)}••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••${stats.activeArl.slice(-14)}`;
    } else {
      arlCode.textContent = "No active ARL available (configure accounts in Admin Portal)";
    }
  }
}

function renderAccountsTable(searchQuery = "") {
  const tbody = document.getElementById("accountsTableBody");
  const countBadge = document.getElementById("accountCountBadge");
  if (!tbody) return;

  const q = searchQuery.trim().toLowerCase();

  const filtered = accountsData.filter((acc) => {
    const matchesSearch =
      !q ||
      acc.email.toLowerCase().includes(q) ||
      acc.label.toLowerCase().includes(q) ||
      (acc.user_name && acc.user_name.toLowerCase().includes(q));

    const matchesStatus =
      activeFilter === "ALL" ||
      acc.status === activeFilter ||
      (activeFilter === "BLOCKED" && (acc.status === "BLOCKED" || acc.status === "INVALID_CREDENTIALS"));

    return matchesSearch && matchesStatus;
  });

  if (countBadge) {
    countBadge.textContent = `${filtered.length} of ${accountsData.length} Accounts`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="table-empty">
          ${accountsData.length === 0 ? "No Deezer accounts added yet. Click '+ Add Account' above to get started!" : "No accounts match your search/filter criteria."}
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered
    .map((acc) => {
      const maskedEmail = maskEmail(acc.email);
      const timeFormatted = acc.last_checked_at ? formatRelativeTime(acc.last_checked_at) : "Never";
      const avatarHtml = acc.avatar_url
        ? `<img src="${acc.avatar_url}" alt="${acc.user_name || acc.label}" class="acc-avatar">`
        : `<div class="acc-avatar-placeholder"><i data-lucide="user"></i></div>`;

      return `
        <tr>
          <td>
            <div class="acc-info">
              ${avatarHtml}
              <div class="acc-names">
                <strong>${escapeHtml(acc.label)}</strong>
                <small>${escapeHtml(maskedEmail)}</small>
              </div>
            </div>
          </td>
          <td>
            <div>
              <div>${escapeHtml(acc.user_name || "Unknown User")}</div>
              <small style="color: var(--text-dim);">ID: ${acc.user_id || "N/A"} • ${acc.country || "GLOBAL"}</small>
            </div>
          </td>
          <td>
            <span class="tier-badge ${acc.tier}">${acc.tier}</span>
          </td>
          <td>
            <span class="status-badge status-${acc.status}">
              <span class="pulse-dot" style="${acc.status !== "ACTIVE" ? "background: currentColor; animation: none;" : ""}"></span>
              ${acc.status}
            </span>
          </td>
          <td>
            <small style="color: var(--text-muted);">${timeFormatted}</small>
          </td>
          <td>
            <div class="action-buttons">
              <button class="btn btn-secondary btn-sm" onclick="window.refreshAccount('${acc.id}')" title="Re-check / Auto-Refresh ARL">
                <i data-lucide="rotate-cw"></i>
              </button>
              ${
                acc.arl
                  ? `<button class="btn btn-secondary btn-sm" onclick="window.copyAccountArl('${acc.arl}')" title="Copy ARL Token">
                      <i data-lucide="copy"></i>
                    </button>`
                  : ""
              }
              <button class="btn btn-danger btn-sm" onclick="window.deleteAccount('${acc.id}', '${escapeHtml(acc.label)}')" title="Delete Account">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  if (window.lucide) window.lucide.createIcons();
}

async function handleAddAccount(e) {
  e.preventDefault();
  const btn = document.getElementById("btnSubmitAddAccount");
  const icon = document.getElementById("iconSubmitLogin");

  const label = document.getElementById("inputLabel")?.value || "";
  const email = document.getElementById("inputEmail")?.value || "";
  const password = document.getElementById("inputPassword")?.value || "";

  if (!email || !password) {
    showToast("Please enter both email and password", "error");
    return;
  }

  btn.disabled = true;
  if (icon) icon.classList.add("spinning");
  btn.querySelector("span").textContent = "Logging in & extracting ARL...";

  try {
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: getAdminHeaders(),
      body: JSON.stringify({ label, email, password }),
    });

    const data = await res.json();
    if (data.success) {
      showToast(data.message || "Account added and ARL extracted successfully!", "success");
      closeModal("addAccountModal");
      document.getElementById("addAccountForm")?.reset();
      await fetchAdminAccounts();
      await refreshStats();
    } else {
      showToast(data.error || "Failed to add account", "error");
    }
  } catch (err) {
    showToast("Network error while adding account", "error");
  } finally {
    btn.disabled = false;
    if (icon) icon.classList.remove("spinning");
    btn.querySelector("span").textContent = "Login & Extract ARL";
  }
}

async function handleRefreshAll() {
  showToast("Running health check on all Deezer accounts...", "info");
  try {
    const res = await fetch("/api/accounts/refresh-all", {
      method: "POST",
      headers: getAdminHeaders(),
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, "success");
      await fetchAdminAccounts();
      await refreshStats();
    } else {
      showToast(data.error || "Health check encountered an issue", "error");
    }
  } catch (err) {
    showToast("Failed to connect to health check endpoint", "error");
  }
}

window.refreshAccount = async (id) => {
  showToast("Re-authenticating account...", "info");
  try {
    const res = await fetch(`/api/accounts/${id}/refresh`, {
      method: "POST",
      headers: getAdminHeaders(),
    });
    const data = await res.json();
    if (data.success) {
      showToast("ARL refreshed successfully!", "success");
      await fetchAdminAccounts();
      await refreshStats();
    } else {
      showToast(data.error || `Status: ${data.data?.status || "Failed"}`, "error");
      await fetchAdminAccounts();
      await refreshStats();
    }
  } catch {
    showToast("Failed to refresh account", "error");
  }
};

window.copyAccountArl = (arl) => {
  copyToClipboard(arl, "ARL copied to clipboard!");
};

window.deleteAccount = async (id, label) => {
  if (!confirm(`Are you sure you want to remove account "${label}"?`)) return;

  try {
    const res = await fetch(`/api/accounts/${id}`, {
      method: "DELETE",
      headers: getAdminHeaders(),
    });
    const data = await res.json();
    if (data.success) {
      showToast("Account removed from pool", "success");
      await fetchAdminAccounts();
      await refreshStats();
    } else {
      showToast(data.error || "Failed to delete account", "error");
    }
  } catch {
    showToast("Network error while deleting account", "error");
  }
};

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add("active");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove("active");
}

function copyToClipboard(text, message = "Copied!") {
  console.log("Attempting to copy text, length:", text ? text.length : 0);
  
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => {
      console.log("Copied using navigator.clipboard API");
      showToast(message, "success");
    }).catch((err) => {
      console.error("Clipboard API failed:", err);
      showToast("Failed to copy ARL (Clipboard API Error)", "error");
    });
  } else {
    console.log("Using execCommand fallback for HTTP context");
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    
    textArea.focus();
    textArea.select();
    
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        console.log("Copied using execCommand");
        showToast(message, "success");
      } else {
        console.error("execCommand returned false");
        showToast("Failed to copy ARL (Browser blocked action)", "error");
      }
    } catch (error) {
      console.error("execCommand threw error:", error);
      showToast("Failed to copy ARL", "error");
    } finally {
      document.body.removeChild(textArea);
    }
  }
}

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  const iconName = type === "success" ? "check-circle" : type === "error" ? "alert-circle" : "info";
  toast.innerHTML = `<i data-lucide="${iconName}"></i><span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);
  if (window.lucide) window.lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.2s ease";
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}

function maskEmail(email) {
  if (!email || !email.includes("@")) return email;
  const [name, domain] = email.split("@");
  if (name.length <= 3) return `${name.slice(0, 1)}***@${domain}`;
  return `${name.slice(0, 3)}***${name.slice(-1)}@${domain}`;
}

function formatRelativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
