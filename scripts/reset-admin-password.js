import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../models/user.js";

class RecoveryError extends Error {}

async function readInputs() {
    if (!process.stdin.isTTY || !process.stdout.isTTY || process.argv.length !== 2) {
        throw new RecoveryError("Run this script from an interactive local terminal without arguments.");
    }

    let hideInput = false;
    const output = new Writable({
        write(chunk, encoding, callback) {
            if (hideInput) callback();
            else process.stdout.write(chunk, encoding, callback);
        }
    });
    const terminal = createInterface({ input: process.stdin, output, terminal: true, historySize: 0 });
    const cancelled = new AbortController();
    terminal.once("close", () => cancelled.abort());
    terminal.once("SIGINT", () => terminal.close());
    const options = { signal: cancelled.signal };

    async function readPassword(prompt) {
        process.stdout.write(prompt);
        hideInput = true;
        try {
            return await terminal.question("", options);
        } finally {
            hideInput = false;
            process.stdout.write("\n");
        }
    }

    try {
        const email = (await terminal.question("Existing Admin email: ", options)).trim();
        if (!email) throw new RecoveryError("Enter the existing Admin email.");

        const password = await readPassword("New password (hidden): ");
        if ([...password].length < 15 || Buffer.byteLength(password, "utf8") > 72) {
            throw new RecoveryError("Use at least 15 characters and at most 72 UTF-8 bytes.");
        }
        if (password !== await readPassword("Confirm new password (hidden): ")) {
            throw new RecoveryError("The passwords did not match.");
        }
        if (await terminal.question("Type RESET to apply this password change: ", options) !== "RESET") {
            throw new RecoveryError("Reset cancelled.");
        }
        return { email, password };
    } finally {
        terminal.close();
    }
}

try {
    const { parsed } = dotenv.config({
        path: fileURLToPath(new URL("../.env", import.meta.url)),
        quiet: true
    });
    if (!parsed?.MONGODB_URL) throw new RecoveryError("Set MONGODB_URL in the project's .env file.");

    const { email, password } = await readInputs();
    await mongoose.connect(parsed.MONGODB_URL, {
        autoCreate: false,
        autoIndex: false,
        serverSelectionTimeoutMS: 10000
    });
    if (mongoose.connection.name !== "test") {
        throw new RecoveryError("The configured connection must select the existing test database.");
    }

    const account = await User.findOne({ email }).select("_id role password").lean();
    if (!account || account.role !== "admin") {
        throw new RecoveryError("No existing Admin account matches that email.");
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await User.updateOne(
        { _id: account._id, email, role: "admin", password: account.password },
        { $set: { password: hash } },
        { upsert: false }
    );
    if (result.modifiedCount !== 1) {
        throw new RecoveryError("The account changed before the reset completed. Check the account before retrying.");
    }
    console.log("Admin password updated.");
} catch (error) {
    if (error instanceof RecoveryError) console.error(error.message);
    else if (error.name === "AbortError") console.error("Reset cancelled.");
    else console.error("Could not confirm the password reset. Check the database connection and account permissions.");
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
