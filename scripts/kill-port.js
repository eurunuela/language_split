#!/usr/bin/env node

/**
 * Script to kill processes running on specific ports
 * Usage: node kill-port.js 5000 5001 ...
 */

const { execSync } = require("child_process");

const ports = process.argv
  .slice(2)
  .map((arg) => parseInt(arg))
  .filter((port) => !isNaN(port));

if (ports.length === 0) {
  console.log("Usage: node kill-port.js PORT [PORT2 PORT3 ...]");
  console.log("Example: node kill-port.js 5000 5001");
  process.exit(0);
}

console.log(`Attempting to kill processes on ports: ${ports.join(", ")}`);

ports.forEach((port) => {
  try {
    if (process.platform === "win32") {
      // Windows
      try {
        const result = execSync(`netstat -ano | findstr :${port}`).toString();
        const lines = result.split("\n");

        lines.forEach((line) => {
          const parts = line.trim().split(/\s+/);
          if (parts.length > 4) {
            const pid = parts[4];
            if (pid) {
              console.log(`Killing process ${pid} on port ${port}`);
              execSync(`taskkill /F /PID ${pid}`);
            }
          }
        });
      } catch (e) {
        console.log(`No process found on port ${port}`);
      }
    } else {
      // Unix-based systems (Linux, macOS)
      try {
        const cmd = `lsof -i :${port} | grep LISTEN | awk '{print $2}' | xargs kill -9`;
        execSync(cmd);
        console.log(`Killed process on port ${port}`);
      } catch (e) {
        console.log(`No process found on port ${port}`);
      }
    }
  } catch (e) {
    console.error(`Error killing process on port ${port}:`, e.message);
  }
});

console.log("Port killing operation completed");
