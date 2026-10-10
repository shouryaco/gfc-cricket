import { randomBytes, scryptSync } from "node:crypto";

if (!process.stdin.isTTY) {
  console.error("Run this script in an interactive terminal.");
  process.exit(1);
}
process.stdout.write("Choose an admin password (16+ characters): ");
process.stdin.setRawMode(true);
process.stdin.resume();
let password = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  for (const char of chunk) {
    if (char === "\u0003") { process.stdout.write("\n"); process.exit(1); }
    if (char === "\r" || char === "\n") {
      process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write("\n");
      if (password.length < 16) { console.error("Password must be at least 16 characters."); process.exitCode = 1; return; }
      const salt = randomBytes(24);
      console.log(`ADMIN_PASSWORD_HASH=scrypt$${salt.toString("hex")}$${scryptSync(password,salt,64).toString("hex")}`);
      console.log(`SESSION_SECRET=${randomBytes(48).toString("hex")}`);
      password = "";
      return;
    }
    if (char === "\u007f" || char === "\b") { password = password.slice(0,-1); continue; }
    password += char;
  }
});
