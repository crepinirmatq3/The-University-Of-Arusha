const role = document.body.dataset.portalRole;
const form = document.getElementById(`${role}-login-form`);
const loginPanel = document.getElementById(`${role}-login-panel`);
const dashboard = document.getElementById(`${role}-dashboard`);
const message = document.getElementById(`${role}-message`);
const dashboardMessage = document.getElementById(`${role}-dashboard-message`);
const logoutButton = document.getElementById(`${role}-logout`);
const nameElement = document.getElementById(`${role}-name`);

function setMessage(element, text, type = "error") {
    element.textContent = text;
    element.className = `portal-message${text ? ` ${type}` : ""}`;
}

function showLogin() {
    dashboard.hidden = true;
    loginPanel.hidden = false;
}

function showDashboard(displayName) {
    nameElement.textContent = displayName;
    loginPanel.hidden = true;
    dashboard.hidden = false;
}

async function request(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...options.headers
        }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload.error || "The request could not be completed.");
    }
    return payload;
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage(message, "");

    const username = document.getElementById(`${role}-id`).value.trim();
    const password = document.getElementById(`${role}-password`).value;
    if (!username || !password) {
        setMessage(message, "Enter both your username and password.");
        return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
        const session = await request("/api/portal/login", {
            method: "POST",
            body: JSON.stringify({ role, username, password })
        });
        showDashboard(session.displayName);
        form.reset();
    } catch (error) {
        setMessage(message, error.message);
    } finally {
        submitButton.disabled = false;
    }
});

logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    setMessage(dashboardMessage, "");
    try {
        await request("/api/portal/logout", {
            method: "POST",
            body: JSON.stringify({ role })
        });
        showLogin();
        form.reset();
    } catch (error) {
        setMessage(dashboardMessage, error.message);
    } finally {
        logoutButton.disabled = false;
    }
});

request(`/api/portal/session?role=${encodeURIComponent(role)}`)
    .then((session) => {
        if (session.authenticated && session.role === role) {
            showDashboard(session.displayName);
        }
    })
    .catch(() => {
        setMessage(message, "Cannot connect to the portal. Start the website server and try again.");
    });
