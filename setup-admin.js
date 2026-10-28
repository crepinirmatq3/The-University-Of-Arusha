const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline/promises");

const PRIVATE_DIR = path.resolve(__dirname, "..", "project-33-private");
const CREDENTIALS_FILE = path.join(PRIVATE_DIR, "admin-credentials.json");

function promptHidden(label) {
    const input = process.stdin;
    if (!input.isTTY || typeof input.setRawMode !== "function") {
        return Promise.reject(new Error("Run setup-admin from an interactive terminal."));
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
                reject(new Error("Setup cancelled."));
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

async function main() {
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    const username = (await prompt.question("Admin username: ")).trim();
    prompt.close();
    if (!username || username.length > 80) {
        throw new Error("Username must be between 1 and 80 characters.");
    }

    const password = await promptHidden("Admin password (minimum 12 characters): ");
    if (password.length < 12) throw new Error("Use a password with at least 12 characters.");
    const confirmation = await promptHidden("Confirm password: ");
    if (password !== confirmation) throw new Error("The passwords do not match.");

    const salt = crypto.randomBytes(16);
    const passwordHash = crypto.scryptSync(password, salt, 64);
    fs.mkdirSync(PRIVATE_DIR, { recursive: true, mode: 0o700 });
    const temporaryFile = path.join(PRIVATE_DIR, `admin-credentials-${process.pid}.tmp`);
    fs.writeFileSync(temporaryFile, JSON.stringify({
        username,
        salt: salt.toString("hex"),
        passwordHash: passwordHash.toString("hex")
    }, null, 2), { mode: 0o600 });
    fs.renameSync(temporaryFile, CREDENTIALS_FILE);
    console.log(`Admin credentials saved to ${CREDENTIALS_FILE}`);
    console.log("The password itself is not stored.");
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});