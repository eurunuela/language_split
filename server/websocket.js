/**
 * Standalone WebSocket server module
 */
const WebSocket = require("ws");

// Store active WebSocket connections
let wss = null;
const clients = new Map();

/**
 * Initialize the WebSocket server on an existing HTTP server
 * @param {Object} httpServer - HTTP server to attach WebSocket server to
 */
function initWebSocketServer(httpServer) {
  // Create WebSocket server
  wss = new WebSocket.Server({
    server: httpServer,
    // Increase timeout to prevent premature disconnections
    clientTracking: true,
    perMessageDeflate: false,
    // Handle path specifically (important for browsers)
    path: "/ws",
  });

  console.log("WebSocket server initialized with path: /ws");

  // Set heartbeat interval - helps keep connections alive
  const heartbeatInterval = setInterval(function ping() {
    if (wss.clients.size > 0) {
      console.log(
        `WebSocket: Sending heartbeat to ${wss.clients.size} clients`
      );
      wss.clients.forEach(function each(ws) {
        if (ws.isAlive === false) {
          // Client didn't respond to previous ping, terminate
          console.log(
            `WebSocket: Terminating inactive client ${ws.clientId || "unknown"}`
          );
          return ws.terminate();
        }

        // Mark as inactive for next round
        ws.isAlive = false;
        // Send ping
        try {
          ws.ping();
        } catch (e) {
          console.error("WebSocket: Error sending ping:", e.message);
        }
      });
    }
  }, 30000); // Check every 30 seconds

  // Handle server shutdown
  wss.on("close", function close() {
    clearInterval(heartbeatInterval);
    console.log("WebSocket server closed");
  });

  // Connection handler
  wss.on("connection", (ws, req) => {
    // Generate unique client ID
    const clientId =
      Date.now().toString() + "-" + Math.random().toString(36).substr(2, 5);
    ws.clientId = clientId;
    ws.isAlive = true;

    // Store client in map
    clients.set(clientId, ws);

    console.log(`WebSocket: Client connected with ID: ${clientId}`);
    console.log(`WebSocket: Total clients connected: ${wss.clients.size}`);

    // Send welcome message with client ID
    try {
      ws.send(
        JSON.stringify({
          type: "connected",
          clientId,
          message: "Connection established",
        })
      );
    } catch (e) {
      console.error(`WebSocket: Error sending welcome message:`, e.message);
    }

    // Handle pong responses
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    // Handle incoming messages
    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message);
        console.log(
          `WebSocket: Received from client ${clientId}:`,
          data.type || "unknown message type"
        );

        // Handle specific message types
        if (data.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
        }
      } catch (e) {
        console.log(
          `WebSocket: Received non-JSON message from ${clientId}:`,
          message.toString()
        );
      }
    });

    // Handle disconnection
    ws.on("close", () => {
      clients.delete(clientId);
      console.log(`WebSocket: Client ${clientId} disconnected`);
      console.log(`WebSocket: Remaining clients: ${wss.clients.size}`);
    });

    // Handle errors
    ws.on("error", (error) => {
      console.error(`WebSocket: Error with client ${clientId}:`, error.message);
      try {
        ws.close();
      } catch (e) {
        // Ignore close errors
      }
      clients.delete(clientId);
    });
  });

  wss.on("error", (error) => {
    console.error("WebSocket server error:", error.message);
  });

  console.log("WebSocket server initialized successfully");
}

/**
 * Send message to specific client
 * @param {string} clientId - Target client ID
 * @param {string} type - Message type
 * @param {Object} data - Message data
 */
function sendToClient(clientId, type, data) {
  const client = clients.get(clientId);

  if (client && client.readyState === WebSocket.OPEN) {
    try {
      client.send(
        JSON.stringify({
          type,
          data,
        })
      );
      return true;
    } catch (error) {
      console.error(
        `WebSocket: Error sending to client ${clientId}:`,
        error.message
      );
      return false;
    }
  }
  return false;
}

/**
 * Send translation update to specific client
 */
function sendTranslationUpdate(
  clientId,
  chunkIndex,
  totalChunks,
  translatedText
) {
  return sendToClient(clientId, "translation_update", {
    chunkIndex,
    totalChunks,
    text: translatedText,
  });
}

/**
 * Send translation start notification
 */
function sendTranslationStart(clientId, totalChunks) {
  return sendToClient(clientId, "translation_start", { totalChunks });
}

/**
 * Send translation complete notification
 */
function sendTranslationComplete(clientId) {
  return sendToClient(clientId, "translation_complete", {
    timestamp: Date.now(),
  });
}

/**
 * Send error notification
 */
function sendError(clientId, message, code) {
  return sendToClient(clientId, "error", { message, code });
}

module.exports = {
  initWebSocketServer,
  sendTranslationUpdate,
  sendTranslationStart,
  sendTranslationComplete,
  sendError,
  sendToClient,
};
