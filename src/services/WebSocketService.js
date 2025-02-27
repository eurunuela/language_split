/**
 * WebSocket service for real-time translations
 * with improved error handling
 */
class WebSocketService {
  constructor() {
    this.socket = null;
    this.clientId = null;
    this.listeners = {};
    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimeout = null;
    this.heartbeatInterval = null;
    this.connectionState = "disconnected";

    // Try to load clientId from localStorage
    this.clientId = localStorage.getItem("ws_client_id");
  }

  connect() {
    if (this.isConnected || this.isConnecting) return Promise.resolve();

    this.connectionState = "connecting";

    return new Promise((resolve, reject) => {
      this.isConnecting = true;

      // Try to determine API port from the current connection
      let apiPort = this._getStoredPort() || 5000;

      // Determine WebSocket URL based on current location with correct path
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.hostname;
      const wsUrl = `${protocol}//${host}:${apiPort}/ws`; // Note the /ws path!

      console.log(`Connecting to WebSocket at ${wsUrl}`);

      try {
        this.socket = new WebSocket(wsUrl);
      } catch (e) {
        console.error("Error creating WebSocket connection:", e);
        this.isConnecting = false;
        this.connectionState = "failed";
        reject(new Error(`WebSocket connection failed: ${e.message}`));
        return;
      }

      // Initialize connection timeout
      const connectionTimeout = setTimeout(() => {
        if (this.isConnecting) {
          console.log(
            "WebSocket connection timeout, trying alternative ports..."
          );
          this._cleanupConnection();
          this.tryAlternativePorts(resolve, reject);
        }
      }, 5000);

      this.socket.onopen = () => {
        console.log("WebSocket connection established");
        clearTimeout(connectionTimeout);
        this.isConnected = true;
        this.isConnecting = false;
        this.connectionState = "connected";
        this.reconnectAttempts = 0;

        // Start heartbeat to keep connection alive
        this._startHeartbeat();

        // Check if we have a stored clientId to send to server
        if (this.clientId) {
          this._sendMessage({
            type: "reconnect",
            clientId: this.clientId,
          });
        }

        resolve();
      };

      this.socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          // Handle connection message to get client ID
          if (message.type === "connected") {
            this.clientId = message.clientId;
            localStorage.setItem("ws_client_id", this.clientId);
            console.log(`Received client ID: ${this.clientId}`);
          }

          // Call listeners for this message type
          if (this.listeners[message.type]) {
            this.listeners[message.type].forEach((callback) => {
              try {
                callback(message);
              } catch (e) {
                console.error("Error in WebSocket message listener:", e);
              }
            });
          }

          // Also call general message handlers
          if (this.listeners["message"]) {
            this.listeners["message"].forEach((callback) => {
              try {
                callback(message);
              } catch (e) {
                console.error(
                  "Error in general WebSocket message listener:",
                  e
                );
              }
            });
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      this.socket.onclose = (event) => {
        console.log("WebSocket connection closed", event.code, event.reason);
        clearTimeout(connectionTimeout);
        this._cleanupConnection();

        // Don't count server-initiated close for certain conditions as failure
        const isNormalClosure = event.code === 1000;
        const isServerShutdown = event.code === 1001 || event.code === 1012;

        if (
          !isNormalClosure &&
          !isServerShutdown &&
          this.connectionState !== "manually-closed"
        ) {
          this.handleReconnect();
        }

        this.connectionState = "disconnected";
      };

      this.socket.onerror = (error) => {
        console.warn("WebSocket error - connection may fail:", error);
        // Don't reject here, let the close event or timeout handle it
      };
    });
  }

  _cleanupConnection() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
  }

  _getStoredPort() {
    return parseInt(localStorage.getItem("ws_port")) || null;
  }

  _storePort(port) {
    localStorage.setItem("ws_port", port.toString());
  }

  _startHeartbeat() {
    // Clear any existing heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Send ping every 25 seconds to keep connection alive
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected && this.socket.readyState === WebSocket.OPEN) {
        try {
          this._sendMessage({ type: "ping", timestamp: Date.now() });
        } catch (e) {
          console.error("Error sending heartbeat:", e);
        }
      }
    }, 25000);
  }

  _sendMessage(data) {
    try {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify(data));
        return true;
      }
      return false;
    } catch (e) {
      console.error("Error sending WebSocket message:", e);
      return false;
    }
  }

  // Try connecting to alternative ports
  tryAlternativePorts(resolve, reject) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.hostname;

    // Try ports 5001-5005
    let portIndex = 0;
    const ports = [5001, 5002, 5003, 5004, 5005, 5000]; // Try 5000 last

    const tryNextPort = () => {
      if (portIndex >= ports.length) {
        this.isConnecting = false;
        this.connectionState = "failed";
        reject(new Error("Could not connect to WebSocket on any port"));
        return;
      }

      const port = ports[portIndex++];
      const wsUrl = `${protocol}//${host}:${port}/ws`; // Note the /ws path!

      console.log(`Trying WebSocket connection on port ${port}...`);

      try {
        if (this.socket) {
          try {
            this.socket.close();
          } catch (e) {
            // Ignore close errors
          }
        }

        this.socket = new WebSocket(wsUrl);
      } catch (e) {
        console.error(`Error creating WebSocket on port ${port}:`, e);
        setTimeout(tryNextPort, 100);
        return;
      }

      const portTimeout = setTimeout(() => {
        console.log(`Connection to port ${port} timed out`);
        try {
          if (this.socket) {
            this.socket.close();
          }
        } catch (e) {
          // Ignore close errors
        }
        this.socket = null;
        tryNextPort();
      }, 3000);

      this.socket.onopen = () => {
        console.log(`WebSocket connection established on port ${port}`);
        clearTimeout(portTimeout);
        this.isConnected = true;
        this.isConnecting = false;
        this.connectionState = "connected";
        this.reconnectAttempts = 0;

        // Store the working port
        this._storePort(port);

        // Start heartbeat
        this._startHeartbeat();

        resolve();
      };

      this.socket.onclose = () => {
        clearTimeout(portTimeout);
        this.socket = null;
        tryNextPort();
      };

      this.socket.onerror = () => {
        // Let the timeout or close handler deal with errors
      };

      // Set up the same message handler
      this.socket.onmessage = this.socket?.onmessage;
    };

    tryNextPort();
  }

  handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(
        `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
      );

      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = setTimeout(() => {
        this.connect().catch((err) => {
          console.error("Reconnect failed:", err);
        });
      }, 2000 * this.reconnectAttempts); // Exponential backoff
    } else {
      console.log(
        "Max reconnection attempts reached. Please refresh the page."
      );
      // Notify listeners about connection failure
      if (this.listeners["connection_failed"]) {
        this.listeners["connection_failed"].forEach((callback) =>
          callback({
            type: "connection_failed",
            attempts: this.reconnectAttempts,
          })
        );
      }
    }
  }

  disconnect() {
    this.connectionState = "manually-closed";

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.socket) {
      if (
        this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING
      ) {
        this.socket.close();
      }
      this.socket = null;
    }

    this.isConnected = false;
    this.isConnecting = false;
    console.log("WebSocket connection manually closed");
  }

  addEventListener(type, callback) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(callback);
  }

  removeEventListener(type, callback) {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter(
        (cb) => cb !== callback
      );
    }
  }

  getClientId() {
    return this.clientId;
  }

  isReady() {
    return this.isConnected && this.socket?.readyState === WebSocket.OPEN;
  }

  getConnectionStatus() {
    return {
      state: this.connectionState,
      clientId: this.clientId,
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}

// Create singleton instance
const wsService = new WebSocketService();

export default wsService;
