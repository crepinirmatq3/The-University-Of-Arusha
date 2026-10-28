const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const readline = require("node:readline/promises");

const PRIVATE_DIR = path.resolve(__dirname, "..", "project-33-private");
const DATABASE_FILE = path.join(PRIVATE_DIR, "portal-users.sqlite");

function promptHidden(label) {
    const input = process.stdin;
    if (!input.isTTY || typeof input.setRawMode !== "function") {
        return Promise.reject(new Error("Run setup-portal-user from an interactive terminal."));
    }

    return new Promise((resolve, reject) => {
        let value = "";
        const previousRawMode = input.isRaw;

        function cleanup() {
            input.removeListener("data", onData);
            input.setRawMode(previousRawMode);
            input.pause();
            process.stdout.write("\n");
        }

        function onData(buffer) {
            const character = buffer.toString("utf8");
            if (character === "\u0003") {
                cleanup();
                reject(new Error("Account setup cancelled."));
            } else if (character === "\r" || character === "\n") {
                cleanup();
                resolve(value);
            } else if (character === "\u007f" || character === "\b") {
                value = value.slice(0, -1);
            } else if (!character.startsWith("\u001b") && character >= " ") {
                value += character;
            }
        }

        process.stdout.write(label);
        input.setRawMode(true);
        input.resume();
        input.on("data", onData);
    });
}

function initializeDatabase(database) {
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
}

async function main() {
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    const role = (await prompt.question("Account type (student/staff): ")).trim().toLowerCase();
    const username = (await prompt.question("Username or ID: ")).trim();
    const displayName = (await prompt.question("Display name: ")).trim();
    prompt.close();

    if (role !== "student" && role !== "staff") {
        throw new Error("Account type must be student or staff.");
    }
    if (!username || username.length > 80) {
        throw new Error("Username must be between 1 and 80 characters.");
    }
    if (!displayName || displayName.length > 120) {
        throw new Error("Display name must be between 1 and 120 characters.");
    }

    const password = await promptHidden("Password (minimum 12 characters): ");
    if (password.length < 12) throw new Error("Use a password with at least 12 characters.");
    if (password.length > 1024) throw new Error("Password must be no longer than 1024 characters.");
    const confirmation = await promptHidden("Confirm password: ");
    if (password !== confirmation) throw new Error("The passwords do not match.");

    fs.mkdirSync(PRIVATE_DIR, { recursive: true, mode: 0o700 });
    const database = new DatabaseSync(DATABASE_FILE);
    try {
        initializeDatabase(database);
        const salt = crypto.randomBytes(16);
        const passwordHash = crypto.scryptSync(password, salt, 64);
        database.prepare(`
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
    } finally {
        database.close();
    }
    fs.chmodSync(DATABASE_FILE, 0o600);

    console.log(`${role === "student" ? "Student" : "Staff"} account saved for ${username}.`);
    console.log("The password itself is not stored.");
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
