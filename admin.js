const loginView = document.getElementById("login-view");
const inboxView = document.getElementById("inbox-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const pageError = document.getElementById("page-error");
const messageItems = document.getElementById("message-items");
const messageDetail = document.getElementById("message-detail");
const emptyState = document.getElementById("empty-state");
const searchInput = document.getElementById("message-search");
const filterSelect = document.getElementById("message-filter");
const messageCount = document.getElementById("message-count");
const applicationItems = document.getElementById("application-items");
const applicationDetail = document.getElementById("application-detail");
const applicationEmptyState = document.getElementById("application-empty-state");
const applicationSearch = document.getElementById("application-search");
const applicationFilter = document.getElementById("application-filter");
const applicationCount = document.getElementById("application-count");
const messagesView = document.getElementById("messages-view");
const applicationsView = document.getElementById("applications-view");
const viewTitle = document.getElementById("view-title");
const viewCount = document.getElementById("view-count");
const messagesTab = document.getElementById("messages-tab");
const applicationsTab = document.getElementById("applications-tab");
const portalUsersView = document.getElementById("portal-users-view");
const portalUsersTab = document.getElementById("portal-users-tab");
const portalUserCount = document.getElementById("portal-user-count");
const portalUserList = document.getElementById("portal-user-list");
const portalUsersEmpty = document.getElementById("portal-users-empty");
const portalUserForm = document.getElementById("portal-user-form");
const portalUserFormStatus = document.getElementById("portal-user-form-status");

let messages = [];
let applications = [];
let portalUsers = [];
let selectedId = null;
let selectedApplicationId = null;
let activeView = "messages";

async function request(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Request failed. Please try again.");
    return payload;
}

function showLogin() {
    inboxView.hidden = true;
    loginView.hidden = false;
}

function showInbox(username) {
    loginView.hidden = true;
    inboxView.hidden = false;
    document.getElementById("signed-in-as").textContent = `Signed in as ${username}`;
    loadMessages();
    loadApplications();
    loadPortalUsers();
}

function switchView(view) {
    activeView = view;
    const isMessages = view === "messages";
    const isApplications = view === "applications";
    messagesView.hidden = !isMessages;
    applicationsView.hidden = !isApplications;
    portalUsersView.hidden = view !== "portal-users";
    messagesTab.classList.toggle("selected", isMessages);
    applicationsTab.classList.toggle("selected", isApplications);
    portalUsersTab.classList.toggle("selected", view === "portal-users");
    messagesTab.setAttribute("aria-selected", String(isMessages));
    applicationsTab.setAttribute("aria-selected", String(isApplications));
    portalUsersTab.setAttribute("aria-selected", String(view === "portal-users"));
    viewTitle.textContent = isMessages ? "Messages" : isApplications ? "Applications" : "Portal accounts";
    viewCount.textContent = isMessages
        ? `${messages.length} ${messages.length === 1 ? "message" : "messages"}`
        : isApplications
            ? `${applications.length} ${applications.length === 1 ? "application" : "applications"}`
            : `${portalUsers.length} ${portalUsers.length === 1 ? "account" : "accounts"}`;
}

function formatDate(value) {
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(new Date(value));
}

function filteredMessages() {
    const query = searchInput.value.trim().toLowerCase();
    const filter = filterSelect.value;
    return messages.filter((message) => {
        const matchesFilter = filter === "all" || (filter === "unread" ? !message.read : message.read);
        const matchesQuery = !query || [message.name, message.email, message.phone, message.message]
            .some((value) => String(value || "").toLowerCase().includes(query));
        return matchesFilter && matchesQuery;
    });
}

function renderList() {
    messageItems.replaceChildren();
    const visible = filteredMessages();
    emptyState.hidden = visible.length > 0;
    messageCount.textContent = String(messages.length);
    if (activeView === "messages") switchView("messages");

    visible.forEach((message) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = `message-item${message.read ? "" : " unread"}${message.id === selectedId ? " selected" : ""}`;
        item.addEventListener("click", () => openMessage(message.id));

        const top = document.createElement("span");
        top.className = "item-top";
        const name = document.createElement("span");
        name.className = "item-name";
        name.textContent = message.name;
        const date = document.createElement("span");
        date.className = "item-date";
        date.textContent = formatDate(message.createdAt);
        top.append(name, date);

        const email = document.createElement("span");
        email.className = "item-email";
        email.textContent = message.email;
        const preview = document.createElement("span");
        preview.className = "item-preview";
        preview.textContent = message.message;
        item.append(top, email, preview);
        messageItems.append(item);
    });
}

function filteredApplications() {
    const query = applicationSearch.value.trim().toLowerCase();
    const filter = applicationFilter.value;
    return applications.filter((application) => {
        const matchesFilter = filter === "all" ||
            (filter === "unread" ? !application.read : application.read);
        const matchesQuery = !query || [
            application.fullName, application.email, application.phone,
            application.programme, application.intake, application.country
        ].some((value) => String(value || "").toLowerCase().includes(query));
        return matchesFilter && matchesQuery;
    });
}

function renderApplications() {
    applicationItems.replaceChildren();
    const visible = filteredApplications();
    applicationEmptyState.hidden = visible.length > 0;
    applicationCount.textContent = String(applications.length);

    visible.forEach((application) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = `message-item${application.read ? "" : " unread"}${application.id === selectedApplicationId ? " selected" : ""}`;
        item.addEventListener("click", () => openApplication(application.id));

        const top = document.createElement("span");
        top.className = "item-top";
        const name = document.createElement("span");
        name.className = "item-name";
        name.textContent = application.fullName;
        const date = document.createElement("span");
        date.className = "item-date";
        date.textContent = formatDate(application.createdAt);
        top.append(name, date);

        const email = document.createElement("span");
        email.className = "item-email";
        email.textContent = application.email;
        const preview = document.createElement("span");
        preview.className = "item-preview";
        preview.textContent = `${application.programme}${application.intake ? ` · ${application.intake}` : ""}`;
        item.append(top, email, preview);
        applicationItems.append(item);
    });
    if (activeView === "applications") switchView("applications");
}

function renderApplicationDetail(application) {
    applicationDetail.replaceChildren();
    if (!application) {
        const placeholder = document.createElement("div");
        placeholder.className = "detail-placeholder";
        const mark = document.createElement("span");
        mark.className = "inbox-mark";
        mark.textContent = "▤";
        const heading = document.createElement("h2");
        heading.textContent = "Select an application";
        const text = document.createElement("p");
        text.textContent = "Choose an application to review the applicant details.";
        placeholder.append(mark, heading, text);
        applicationDetail.append(placeholder);
        return;
    }

    const heading = document.createElement("div");
    heading.className = "detail-heading";
    const identity = document.createElement("div");
    const name = document.createElement("h2");
    name.textContent = application.fullName;
    const email = document.createElement("a");
    email.className = "detail-email";
    email.href = `mailto:${encodeURIComponent(application.email)}`;
    email.textContent = application.email;
    identity.append(name, email);
    const date = document.createElement("time");
    date.className = "detail-date";
    date.dateTime = application.createdAt;
    date.textContent = formatDate(application.createdAt);
    heading.append(identity, date);

    const metadata = document.createElement("dl");
    metadata.className = "detail-meta application-meta";
    const details = [
        ["Phone", application.phone],
        ["Programme", application.programme],
        ["Intake", application.intake],
        ["Date of birth", application.dateOfBirth],
        ["Gender", application.gender],
        ["Nationality", application.nationality],
        ["Address", application.address],
        ["Region", application.region],
        ["Country", application.country]
    ];
    details.forEach(([labelText, value]) => {
        if (!value) return;
        const label = document.createElement("dt");
        label.textContent = labelText;
        const content = document.createElement("dd");
        content.textContent = value;
        metadata.append(label, content);
    });

    const content = document.createDocumentFragment();
    content.append(heading, metadata);
    if (application.statement) {
        const statementHeading = document.createElement("h3");
        statementHeading.textContent = "Personal statement";
        statementHeading.className = "application-statement-heading";
        const statement = document.createElement("p");
        statement.className = "detail-message";
        statement.textContent = application.statement;
        content.append(statementHeading, statement);
    }
    if (application.attachment) {
        const attachment = document.createElement("a");
        attachment.className = "attachment-link";
        attachment.href = `/api/applications/${application.id}/attachment`;
        attachment.textContent = `Download ${application.attachment.name} (${Math.ceil(application.attachment.size / 1024)} KB)`;
        content.append(attachment);
    }

    const actions = document.createElement("div");
    actions.className = "detail-actions";
    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete application";
    deleteButton.addEventListener("click", () => deleteApplication(application));
    actions.append(deleteButton);
    content.append(actions);
    applicationDetail.append(content);
}

function renderDetail(message) {
    messageDetail.replaceChildren();
    if (!message) {
        const placeholder = document.createElement("div");
        placeholder.className = "detail-placeholder";
        const mark = document.createElement("span");
        mark.className = "inbox-mark";
        mark.textContent = "✉";
        const heading = document.createElement("h2");
        heading.textContent = "Select a message";
        const text = document.createElement("p");
        text.textContent = "Choose a message from the inbox to read its details.";
        placeholder.append(mark, heading, text);
        messageDetail.append(placeholder);
        return;
    }

    const heading = document.createElement("div");
    heading.className = "detail-heading";
    const identity = document.createElement("div");
    const name = document.createElement("h2");
    name.textContent = message.name;
    const email = document.createElement("a");
    email.className = "detail-email";
    email.href = `mailto:${encodeURIComponent(message.email)}`;
    email.textContent = message.email;
    identity.append(name, email);
    const date = document.createElement("time");
    date.className = "detail-date";
    date.dateTime = message.createdAt;
    date.textContent = formatDate(message.createdAt);
    heading.append(identity, date);

    const metadata = document.createElement("dl");
    metadata.className = "detail-meta";
    const phoneLabel = document.createElement("dt");
    phoneLabel.textContent = "Phone";
    const phoneValue = document.createElement("dd");
    phoneValue.textContent = message.phone || "Not provided";
    metadata.append(phoneLabel, phoneValue);

    const body = document.createElement("p");
    body.className = "detail-message";
    body.textContent = message.message;

    const actions = document.createElement("div");
    actions.className = "detail-actions";
    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete message";
    deleteButton.addEventListener("click", () => deleteMessage(message));
    actions.append(deleteButton);
    messageDetail.append(heading, metadata, body, actions);
}

async function loadMessages() {
    pageError.textContent = "";
    try {
        messages = await request("/api/messages");
        if (!messages.some((message) => message.id === selectedId)) selectedId = null;
        renderList();
        renderDetail(messages.find((message) => message.id === selectedId));
    } catch (error) {
        if (error.message.includes("sign in")) showLogin();
        else pageError.textContent = error.message;
    }
}

async function loadApplications() {
    pageError.textContent = "";
    try {
        applications = await request("/api/applications");
        if (!applications.some((application) => application.id === selectedApplicationId)) {
            selectedApplicationId = null;
        }
        renderApplications();
        renderApplicationDetail(applications.find((application) => application.id === selectedApplicationId));
    } catch (error) {
        if (error.message.includes("sign in")) showLogin();
        else pageError.textContent = error.message;
    }
}

function renderPortalUsers() {
    portalUserList.replaceChildren();
    portalUsersEmpty.hidden = portalUsers.length > 0;
    portalUserCount.textContent = String(portalUsers.length);

    portalUsers.forEach((user) => {
        const item = document.createElement("article");
        item.className = "portal-user-item";
        const identity = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = user.displayName;
        const username = document.createElement("p");
        username.textContent = user.username;
        identity.append(name, username);
        const metadata = document.createElement("div");
        metadata.className = "portal-user-meta";
        const role = document.createElement("span");
        role.className = "account-role";
        role.textContent = user.role === "student" ? "Student" : "Staff";
        const created = document.createElement("time");
        created.dateTime = user.createdAt;
        created.textContent = `Created ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(user.createdAt))}`;
        const resetButton = document.createElement("button");
        resetButton.className = "quiet-button portal-user-reset";
        resetButton.type = "button";
        resetButton.textContent = "Reset password";
        resetButton.addEventListener("click", () => {
            portalUserForm.elements.role.value = user.role;
            portalUserForm.elements.username.value = user.username;
            portalUserForm.elements.displayName.value = user.displayName;
            portalUserForm.elements.password.value = "";
            portalUserFormStatus.className = "form-error";
            portalUserFormStatus.textContent = `Enter a new password for ${user.username}.`;
            portalUserForm.elements.password.focus();
        });
        metadata.append(role, created, resetButton);
        item.append(identity, metadata);
        portalUserList.append(item);
    });

    if (activeView === "portal-users") switchView("portal-users");
}

async function loadPortalUsers() {
    try {
        portalUsers = await request("/api/portal/users");
        renderPortalUsers();
    } catch (error) {
        if (error.message.includes("sign in")) showLogin();
        else pageError.textContent = error.message;
    }
}

async function openApplication(id) {
    selectedApplicationId = id;
    const application = applications.find((entry) => entry.id === id);
    if (application && !application.read) {
        try {
            await request(`/api/applications/${id}/read`, { method: "PATCH" });
            application.read = true;
        } catch (error) {
            pageError.textContent = error.message;
        }
    }
    renderApplications();
    renderApplicationDetail(applications.find((entry) => entry.id === id));
}

async function deleteApplication(application) {
    if (!window.confirm(`Delete the application from ${application.fullName}? This cannot be undone.`)) return;
    try {
        await request(`/api/applications/${application.id}`, { method: "DELETE" });
        applications = applications.filter((entry) => entry.id !== application.id);
        selectedApplicationId = null;
        renderApplications();
        renderApplicationDetail(null);
    } catch (error) {
        pageError.textContent = error.message;
    }
}

async function openMessage(id) {
    selectedId = id;
    const message = messages.find((entry) => entry.id === id);
    if (message && !message.read) {
        try {
            await request(`/api/messages/${id}/read`, { method: "PATCH" });
            message.read = true;
        } catch (error) {
            pageError.textContent = error.message;
        }
    }
    renderList();
    renderDetail(messages.find((entry) => entry.id === id));
}

async function deleteMessage(message) {
    if (!window.confirm(`Delete the message from ${message.name}? This cannot be undone.`)) return;
    try {
        await request(`/api/messages/${message.id}`, { method: "DELETE" });
        messages = messages.filter((entry) => entry.id !== message.id);
        selectedId = null;
        renderList();
        renderDetail(null);
    } catch (error) {
        pageError.textContent = error.message;
    }
}

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginError.textContent = "";
    const formData = new FormData(loginForm);
    try {
        const result = await request("/api/login", {
            method: "POST",
            body: JSON.stringify({
                username: formData.get("username"),
                password: formData.get("password")
            })
        });
        loginForm.reset();
        showInbox(result.username);
    } catch (error) {
        loginError.textContent = error.message;
    }
});

document.getElementById("logout-button").addEventListener("click", async () => {
    try {
        await request("/api/logout", { method: "POST" });
        selectedId = null;
        showLogin();
    } catch (error) {
        pageError.textContent = error.message;
    }
});

searchInput.addEventListener("input", renderList);
filterSelect.addEventListener("change", renderList);
applicationSearch.addEventListener("input", renderApplications);
applicationFilter.addEventListener("change", renderApplications);
messagesTab.addEventListener("click", () => switchView("messages"));
applicationsTab.addEventListener("click", () => switchView("applications"));
portalUsersTab.addEventListener("click", () => switchView("portal-users"));

portalUserForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    portalUserFormStatus.textContent = "";
    const formData = new FormData(portalUserForm);
    const submitButton = portalUserForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
        const result = await request("/api/portal/users", {
            method: "POST",
            body: JSON.stringify({
                role: formData.get("role"),
                username: formData.get("username"),
                displayName: formData.get("displayName"),
                password: formData.get("password")
            })
        });
        portalUserForm.reset();
        portalUserFormStatus.className = "form-success";
        portalUserFormStatus.textContent = result.created
            ? `Account created for ${result.user.username}. The password is not saved in readable form; keep the password you entered safe.`
            : `Account updated for ${result.user.username}. Their previous sessions have been signed out.`;
        await loadPortalUsers();
    } catch (error) {
        portalUserFormStatus.className = "form-error";
        portalUserFormStatus.textContent = error.message;
    } finally {
        submitButton.disabled = false;
    }
});

fetch("/api/session")
    .then((response) => response.json())
    .then((session) => session.authenticated ? showInbox(session.username) : showLogin())
    .catch(() => showLogin());