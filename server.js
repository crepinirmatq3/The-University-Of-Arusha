const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const ROOT_DIR = __dirname;
const PRIVATE_DIR = path.resolve(ROOT_DIR, "..", "project-33-private");
const INBOX_FILE = path.join(PRIVATE_DIR, "messages.json");
const APPLICATIONS_FILE = path.join(PRIVATE_DIR, "applications.json");
const APPLICATION_FILES_DIR = path.join(PRIVATE_DIR, "application-files");
const CREDENTIALS_FILE = path.join(PRIVATE_DIR, "admin-credentials.json");
const PORTAL_DATABASE_FILE = path.join(PRIVATE_DIR, "portal-users.sqlite");
const PORT = Number(process.env.PORT || 3000);
const SESSION_LIFETIME = 8 * 60 * 60 * 1000;
const sessions = new Map();
const loginAttempts = new Map();
const portalLoginAttempts = new Map();
const adminCredentials = loadAdminCredentials();
const portalDatabase = initializePortalDatabase();
const DUMMY_SALT = Buffer.alloc(16);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

function initializePortalDatabase() {
  fs.mkdirSync(PRIVATE_DIR, { recursive: true, mode: 0o700 });
  const database = new DatabaseSync(PORTAL_DATABASE_FILE);
  database.exec(`
    CREATE TABLE IF NOT EXISTS portal_users (
      id INTEGER PRIMARY KEY,
      role TEXT NOT NULL CHECK (role IN ('student', 'staff')),
      username TEXT NOT NULL COLLATE NOCASE,
      display_name TEXT NOT NULL,
      salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (role, username)
    )
  `);
  fs.chmodSync(PORTAL_DATABASE_FILE, 0o600);
  return database;
}

function loadAdminCredentials() {
  try {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf8"));
    if (typeof credentials.username !== "string" || !credentials.username ||
        !/^[a-f0-9]{32}$/.test(credentials.salt || "") ||
        !/^[a-f0-9]{128}$/.test(credentials.passwordHash || "")) {
      throw new Error("Invalid admin credentials file format.");
    }
    return credentials;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function readBody(request, maxBytes = 20_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > maxBytes) {
        const error = new Error("Request body too large");
        error.statusCode = 413;
        reject(error);
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        if (request.headers["content-type"]?.includes("application/json")) {
          resolve(JSON.parse(body || "{}"));
          return;
        }
        resolve(Object.fromEntries(new URLSearchParams(body)));
      } catch {
        const error = new Error("Invalid request body");
        error.statusCode = 400;
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function readMessages() {
  try {
    const messages = JSON.parse(fs.readFileSync(INBOX_FILE, "utf8"));
    return Array.isArray(messages) ? messages : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function writeMessages(messages) {
  fs.mkdirSync(PRIVATE_DIR, { recursive: true, mode: 0o700 });
  const temporaryFile = path.join(
    PRIVATE_DIR,
    `messages-${process.pid}-${crypto.randomBytes(6).toString("hex")}.tmp`
  );
  fs.writeFileSync(temporaryFile, JSON.stringify(messages, null, 2), {
    mode: 0o600
  });
  fs.renameSync(temporaryFile, INBOX_FILE);
}

function readApplications() {
  try {
    const applications = JSON.parse(fs.readFileSync(APPLICATIONS_FILE, "utf8"));
    return Array.isArray(applications) ? applications : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function writeApplications(applications) {
  fs.mkdirSync(PRIVATE_DIR, { recursive: true, mode: 0o700 });
  const temporaryFile = path.join(
    PRIVATE_DIR,
    `applications-${process.pid}-${crypto.randomBytes(6).toString("hex")}.tmp`
  );
  fs.writeFileSync(temporaryFile, JSON.stringify(applications, null, 2), {
    mode: 0o600
  });
  fs.renameSync(temporaryFile, APPLICATIONS_FILE);
}

function storeApplicationAttachment(applicationId, attachment) {
  if (!attachment || !attachment.data) return null;
  const match = String(attachment.data).match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("Invalid supporting document.");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 5 * 1024 * 1024 ||
      bytes.toString("base64").replace(/=+$/, "") !== match[2].replace(/=+$/, "")) {
    throw new Error("Supporting documents must be no larger than 5 MB.");
  }

  let extension;
  let contentType;
  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") {
    extension = ".pdf";
    contentType = "application/pdf";
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    extension = ".jpg";
    contentType = "image/jpeg";
  } else if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    extension = ".png";
    contentType = "image/png";
  } else {
    throw new Error("Supporting documents must be PDF, JPG, or PNG files.");
  }

  fs.mkdirSync(APPLICATION_FILES_DIR, { recursive: true, mode: 0o700 });
  const storedName = `${applicationId}${extension}`;
  fs.writeFileSync(path.join(APPLICATION_FILES_DIR, storedName), bytes, { mode: 0o600 });
  return {
    name: path.basename(String(attachment.name || `document${extension}`)).slice(0, 160),
    contentType,
    size: bytes.length,
    storedName
  };
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sessionFor(request) {
  const token = sessionToken(request, "admin_session");
  const session = token && sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, ...session };
}

function sessionToken(request, cookieName) {
  const escapedName = cookieName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (request.headers.cookie || "").match(
    new RegExp(`(?:^|;\\s*)${escapedName}=([a-f0-9]+)`)
  )?.[1];
}

function portalSessionFor(request, role) {
  const token = sessionToken(request, `ua_${role}_session`);
  const session = token && sessions.get(token);
  if (!session || session.role !== role) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, ...session };
}

function sameOrigin(request) {
  try {
    return new URL(request.headers.origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function requireAdmin(request, response) {
  if (request.method !== "GET" && !sameOrigin(request)) {
    sendJson(response, 403, { error: "Request origin is not allowed." });
    return null;
  }
  const session = sessionFor(request);
  if (!session) {
    sendJson(response, 401, { error: "Please sign in to continue." });
    return null;
  }
  return session;
}

function requirePortal(request, response, role) {
  if (request.method !== "GET" && !sameOrigin(request)) {
    sendJson(response, 403, { error: "Request origin is not allowed." });
    return null;
  }
  const session = portalSessionFor(request, role);
  if (!session) {
    sendJson(response, 401, { error: "Please sign in to continue." });
    return null;
  }
  return session;
}

function redirect(response, location) {
  response.writeHead(303, {
    "Cache-Control": "no-store",
    Location: location
  });
  response.end();
}

async function handleRequest(request, response) {
  const url = new URL(request.url, "http://localhost");

  if (request.method === "GET" && url.pathname === "/api/portal/session") {
    const role = url.searchParams.get("role");
    if (role !== "student" && role !== "staff") {
      sendJson(response, 400, { error: "A valid portal account type is required." });
      return;
    }
    const session = portalSessionFor(request, role);
    sendJson(response, 200, {
      authenticated: Boolean(session),
      role: session?.role || null,
      username: session?.username || null,
      displayName: session?.displayName || null
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/portal/login") {
    if (!sameOrigin(request)) {
      sendJson(response, 403, { error: "Request origin is not allowed." });
      return;
    }
    const credentials = await readBody(request);
    const role = String(credentials.role || "");
    if (role !== "student" && role !== "staff") {
      sendJson(response, 400, { error: "A valid portal account type is required." });
      return;
    }

    const remoteAddress = request.socket.remoteAddress || "unknown";
    const attemptKey = `${remoteAddress}:${role}`;
    const attempt = portalLoginAttempts.get(attemptKey);
    if (attempt && attempt.until > Date.now() && attempt.count >= 8) {
      sendJson(response, 429, { error: "Too many attempts. Try again in 15 minutes." });
      return;
    }

    const username = String(credentials.username || "").trim();
    const password = String(credentials.password || "");
    const user = username && username.length <= 80 && password.length <= 1024
      ? portalDatabase.prepare(`
          SELECT id, role, username, display_name AS displayName, salt, password_hash AS passwordHash
          FROM portal_users
          WHERE role = ? AND username = ?
        `).get(role, username)
      : undefined;
    const salt = user ? Buffer.from(user.salt, "hex") : DUMMY_SALT;
    const submittedHash = crypto.scryptSync(password.slice(0, 1024), salt, 64);
    const expectedHash = user ? Buffer.from(user.passwordHash, "hex") : Buffer.alloc(64);
    const valid = Boolean(user) && expectedHash.length === submittedHash.length &&
      crypto.timingSafeEqual(submittedHash, expectedHash);

    if (!valid) {
      const current = attempt && attempt.until > Date.now()
        ? attempt
        : { count: 0, until: Date.now() + 15 * 60 * 1000 };
      current.count += 1;
      portalLoginAttempts.set(attemptKey, current);
      sendJson(response, 401, { error: "The username or password is incorrect." });
      return;
    }

    portalLoginAttempts.delete(attemptKey);
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, {
      role,
      username: user.username,
      displayName: user.displayName,
      expiresAt: Date.now() + SESSION_LIFETIME
    });
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    response.setHeader(
      "Set-Cookie",
      `ua_${role}_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_LIFETIME / 1000}${secure}`
    );
    sendJson(response, 200, {
      authenticated: true,
      role,
      username: user.username,
      displayName: user.displayName
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/portal/logout") {
    const body = await readBody(request);
    const role = String(body.role || "");
    if (role !== "student" && role !== "staff") {
      sendJson(response, 400, { error: "A valid portal account type is required." });
      return;
    }
    const session = requirePortal(request, response, role);
    if (!session) return;
    sessions.delete(session.token);
    response.setHeader(
      "Set-Cookie",
      `ua_${role}_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`
    );
    sendJson(response, 200, { authenticated: false });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/session") {
    const session = sessionFor(request);
    const unread = session ? readMessages().filter((message) => !message.read).length : 0;
    const unreadApplications = session
      ? readApplications().filter((application) => !application.read).length
      : 0;
    sendJson(response, 200, {
      authenticated: Boolean(session),
      username: session?.username || null,
      unread,
      unreadApplications
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/login") {
    if (!sameOrigin(request)) {
      sendJson(response, 403, { error: "Request origin is not allowed." });
      return;
    }
    if (!adminCredentials) {
      sendJson(response, 503, { error: "Admin login is not configured. Run npm run setup-admin in the website folder." });
      return;
    }
    const remoteAddress = request.socket.remoteAddress || "unknown";
    const attempt = loginAttempts.get(remoteAddress);
    if (attempt && attempt.until > Date.now() && attempt.count >= 8) {
      sendJson(response, 429, { error: "Too many attempts. Try again in 15 minutes." });
      return;
    }
    const credentials = await readBody(request);
    const submittedHash = crypto.scryptSync(
      String(credentials.password || ""),
      Buffer.from(adminCredentials.salt, "hex"),
      64
    );
    const valid = safeEqual(credentials.username || "", adminCredentials.username) &&
      crypto.timingSafeEqual(submittedHash, Buffer.from(adminCredentials.passwordHash, "hex"));
    if (!valid) {
      const current = attempt && attempt.until > Date.now()
        ? attempt
        : { count: 0, until: Date.now() + 15 * 60 * 1000 };
      current.count += 1;
      loginAttempts.set(remoteAddress, current);
      sendJson(response, 401, { error: "The username or password is incorrect." });
      return;
    }
    loginAttempts.delete(remoteAddress);
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, {
      username: adminCredentials.username,
      expiresAt: Date.now() + SESSION_LIFETIME
    });
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    response.setHeader(
      "Set-Cookie",
      `admin_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_LIFETIME / 1000}${secure}`
    );
    sendJson(response, 200, { authenticated: true, username: adminCredentials.username });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/logout") {
    const session = requireAdmin(request, response);
    if (!session) return;
    sessions.delete(session.token);
    response.setHeader("Set-Cookie", "admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
    sendJson(response, 200, { authenticated: false });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/portal/users") {
    if (!requireAdmin(request, response)) return;
    const users = portalDatabase.prepare(`
      SELECT id, role, username, display_name AS displayName, created_at AS createdAt
      FROM portal_users
      ORDER BY role, username COLLATE NOCASE
    `).all();
    sendJson(response, 200, users);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/portal/users") {
    if (!requireAdmin(request, response)) return;
    const form = await readBody(request);
    const role = String(form.role || "");
    const username = String(form.username || "").trim();
    const displayName = String(form.displayName || "").trim();
    const password = String(form.password || "");
    if ((role !== "student" && role !== "staff") ||
        !username || username.length > 80 ||
        !displayName || displayName.length > 120 ||
        password.length < 12 || password.length > 1024) {
      sendJson(response, 400, {
        error: "Enter a valid account type, username, display name, and password of 12 to 1024 characters."
      });
      return;
    }

    const existingUser = portalDatabase.prepare(
      "SELECT id FROM portal_users WHERE role = ? AND username = ?"
    ).get(role, username);
    const salt = crypto.randomBytes(16);
    const passwordHash = crypto.scryptSync(password, salt, 64);
    portalDatabase.prepare(`
      INSERT INTO portal_users (role, username, display_name, salt, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (role, username) DO UPDATE SET
        display_name = excluded.display_name,
        salt = excluded.salt,
        password_hash = excluded.password_hash
    `).run(
      role,
      username,
      displayName,
      salt.toString("hex"),
      passwordHash.toString("hex"),
      new Date().toISOString()
    );
    for (const [token, session] of sessions) {
      if (session.role === role && session.username.toLowerCase() === username.toLowerCase()) {
        sessions.delete(token);
      }
    }
    fs.chmodSync(PORTAL_DATABASE_FILE, 0o600);
    const user = portalDatabase.prepare(`
      SELECT id, role, username, display_name AS displayName, created_at AS createdAt
      FROM portal_users
      WHERE role = ? AND username = ?
    `).get(role, username);
    sendJson(response, existingUser ? 200 : 201, {
      created: !existingUser,
      user
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/messages") {
    if (!requireAdmin(request, response)) return;
    sendJson(response, 200, readMessages().sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/applications") {
    if (!requireAdmin(request, response)) return;
    sendJson(response, 200, readApplications().sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/applications") {
    const form = await readBody(request, 8 * 1024 * 1024);
    const fields = form.fields || form;
    const fullName = String(fields.fullName || fields.fullname ||
      `${fields.firstName || ""} ${fields.lastName || ""}`).trim();
    const email = String(fields.email || "").trim();
    const program = String(fields.programme || fields.course || "").trim();
    if (form.website || !fullName || fullName.length > 160 || !email || email.length > 254 ||
        !/^\S+@\S+\.\S+$/.test(email) || !program || program.length > 160) {
      sendJson(response, 400, { error: "Please provide a valid name, email address, and programme." });
      return;
    }

    const applicationId = crypto.randomBytes(8).toString("hex");
    let attachment;
    try {
      attachment = storeApplicationAttachment(applicationId, form.attachment);
    } catch (error) {
      sendJson(response, 400, { error: error.message });
      return;
    }

    const application = {
      id: applicationId,
      fullName,
      email,
      phone: String(fields.phone || "").trim().slice(0, 40),
      gender: String(fields.gender || "").trim().slice(0, 40),
      dateOfBirth: String(fields.dob || "").trim().slice(0, 20),
      nationality: String(fields.nationality || "").trim().slice(0, 100),
      programme: program,
      intake: String(fields.intake || "").trim().slice(0, 100),
      address: String(fields.address || "").trim().slice(0, 500),
      region: String(fields.region || "").trim().slice(0, 100),
      country: String(fields.country || "").trim().slice(0, 100),
      statement: String(fields.message || fields.statement || "").trim().slice(0, 5000),
      attachment,
      createdAt: new Date().toISOString(),
      read: false
    };
    try {
      const applications = readApplications();
      applications.push(application);
      writeApplications(applications);
    } catch (error) {
      if (attachment) fs.rmSync(path.join(APPLICATION_FILES_DIR, attachment.storedName), { force: true });
      throw error;
    }
    sendJson(response, 201, { submitted: true, id: applicationId });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/messages") {
    const form = await readBody(request);
    const name = String(form.name || "").trim();
    const email = String(form.email || "").trim();
    const phone = String(form.phone || "").trim();
    const message = String(form.message || "").trim();
    if (form.website || !name || name.length > 120 || !email || email.length > 254 ||
        !/^\S+@\S+\.\S+$/.test(email) || phone.length > 40 ||
        !message || message.length > 10_000) {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Please provide a valid name, email address, and message.");
      return;
    }
    const messages = readMessages();
    messages.push({
      id: crypto.randomBytes(8).toString("hex"),
      name,
      email,
      phone,
      message,
      createdAt: new Date().toISOString(),
      read: false
    });
    writeMessages(messages);
    redirect(response, "/contact.html?sent=1");
    return;
  }

  const readMatch = url.pathname.match(/^\/api\/messages\/([a-f0-9]{16})\/read$/);
  if (request.method === "PATCH" && readMatch) {
    if (!requireAdmin(request, response)) return;
    const messages = readMessages();
    const message = messages.find((entry) => entry.id === readMatch[1]);
    if (!message) {
      sendJson(response, 404, { error: "Message not found." });
      return;
    }
    message.read = true;
    writeMessages(messages);
    sendJson(response, 200, message);
    return;
  }

  const applicationAttachmentMatch = url.pathname.match(/^\/api\/applications\/([a-f0-9]{16})\/attachment$/);
  if (request.method === "GET" && applicationAttachmentMatch) {
    if (!requireAdmin(request, response)) return;
    const application = readApplications().find((entry) => entry.id === applicationAttachmentMatch[1]);
    if (!application?.attachment) {
      sendJson(response, 404, { error: "Supporting document not found." });
      return;
    }
    const storedName = path.basename(application.attachment.storedName);
    const filePath = path.join(APPLICATION_FILES_DIR, storedName);
    const contentTypes = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".png": "image/png" };
    const contentType = contentTypes[path.extname(storedName).toLowerCase()];
    if (!contentType) {
      sendJson(response, 404, { error: "Supporting document not found." });
      return;
    }
    fs.readFile(filePath, (error, contents) => {
      if (error) {
        sendJson(response, 404, { error: "Supporting document not found." });
        return;
      }
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="application-document${path.extname(storedName)}"`,
        "Content-Length": contents.length,
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff"
      });
      response.end(contents);
    });
    return;
  }

  const applicationReadMatch = url.pathname.match(/^\/api\/applications\/([a-f0-9]{16})\/read$/);
  if (request.method === "PATCH" && applicationReadMatch) {
    if (!requireAdmin(request, response)) return;
    const applications = readApplications();
    const application = applications.find((entry) => entry.id === applicationReadMatch[1]);
    if (!application) {
      sendJson(response, 404, { error: "Application not found." });
      return;
    }
    application.read = true;
    writeApplications(applications);
    sendJson(response, 200, application);
    return;
  }

  const deleteMatch = url.pathname.match(/^\/api\/messages\/([a-f0-9]{16})$/);
  if (request.method === "DELETE" && deleteMatch) {
    if (!requireAdmin(request, response)) return;
    const messages = readMessages();
    const remaining = messages.filter((entry) => entry.id !== deleteMatch[1]);
    if (remaining.length === messages.length) {
      sendJson(response, 404, { error: "Message not found." });
      return;
    }
    writeMessages(remaining);
    sendJson(response, 200, { deleted: true });
    return;
  }

  const applicationDeleteMatch = url.pathname.match(/^\/api\/applications\/([a-f0-9]{16})$/);
  if (request.method === "DELETE" && applicationDeleteMatch) {
    if (!requireAdmin(request, response)) return;
    const applications = readApplications();
    const application = applications.find((entry) => entry.id === applicationDeleteMatch[1]);
    if (!application) {
      sendJson(response, 404, { error: "Application not found." });
      return;
    }
    writeApplications(applications.filter((entry) => entry.id !== application.id));
    if (application.attachment) {
      fs.rmSync(path.join(APPLICATION_FILES_DIR, path.basename(application.attachment.storedName)), { force: true });
    }
    sendJson(response, 200, { deleted: true });
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    sendJson(response, 400, { error: "Invalid path." });
    return;
  }
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const segments = relativePath.split(/[\\/]/);
  const extension = path.extname(relativePath).toLowerCase();
  if (segments.some((segment) => segment.startsWith(".")) || !mimeTypes[extension]) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }
  const filePath = path.resolve(ROOT_DIR, relativePath);
  if (!filePath.startsWith(`${ROOT_DIR}${path.sep}`)) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }
  fs.readFile(filePath, (error, contents) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      response.end("Not found.");
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Length": contents.length,
      "Content-Type": mimeTypes[extension],
      "X-Content-Type-Options": "nosniff"
    });
    response.end(request.method === "HEAD" ? undefined : contents);
  });
}

if (!adminCredentials) {
  console.warn("Admin login is not configured. Run npm run setup-admin before signing in.");
}

http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    if (!response.headersSent) {
      sendJson(response, error.statusCode || 500, {
        error: error.statusCode ? error.message : "The server could not complete the request."
      });
    } else {
      response.destroy();
    }
  });
}).listen(PORT, process.env.HOST || "127.0.0.1", () => {
  console.log(`University site and private inbox running at http://localhost:${PORT}`);
  console.log(`Student portal: http://localhost:${PORT}/student-portal.html`);
  console.log(`Staff portal: http://localhost:${PORT}/staff-portal.html`);
  console.log(`Admin dashboard: http://localhost:${PORT}/admin.html`);
});