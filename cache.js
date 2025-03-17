import http from "https";
import { WebSocket, WebSocketServer } from 'ws';
import { createPublicClient, http as httpTransport } from "viem";
import { mainnet } from "viem/chains";
import fs from "fs";

import { fallbackUrl, cachePort, checkInterval } from "./config.js";

const server = http.createServer({
  key: fs.readFileSync('/home/ubuntu/shared/server.key'),
  cert: fs.readFileSync('/home/ubuntu/shared/server.cert'),
  requestCert: true,
  rejectUnauthorized: true
});

server.listen(cachePort, '127.0.0.1', () => {
  console.log(`Cache server listening on port ${cachePort}`);
});

const wss = new WebSocketServer({ 
  server,
  path: '/ws'
});

// Track last known block number to avoid duplicate updates
let lastKnownBlockNumber = null;

// Track connected clients
const clients = new Set();

wss.on('connection', (ws, req) => {
  console.log(`New WebSocket connection from ${req.socket.remoteAddress}`);
  clients.add(ws);

  // Send current values to new client
  sendCurrentValues(ws);

  ws.on('close', () => {
    console.log(`WebSocket client ${req.socket.remoteAddress} disconnected`);
    clients.delete(ws);
  });
});

// Convert BigInt to string if needed
function serializeValue(value) {
  return typeof value === 'bigint' ? value.toString() : value;
}

// Broadcast cache updates to all connected clients
function broadcastUpdate(method, value, timestamp = Date.now()) {
  const message = JSON.stringify({ 
    method, 
    value: serializeValue(value), 
    timestamp 
  });

  // Log the update
  console.log(`Updated local cache for ${method}: ${serializeValue(value)}`);

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// Send current values when a new client connects
async function sendCurrentValues(ws) {
  try {
    // Send chainId (permanent cache)
    const chainId = await fallbackClient.getChainId();
    ws.send(JSON.stringify({ 
      method: 'eth_chainId', 
      value: serializeValue(chainId), 
      timestamp: null  // null indicates permanent cache
    }));

    // Send current block number and gas price
    const [blockNumber, gasPrice] = await Promise.all([
      fallbackClient.getBlockNumber(),
      fallbackClient.getGasPrice()
    ]);
    
    lastKnownBlockNumber = blockNumber;
    
    ws.send(JSON.stringify({ 
      method: 'eth_blockNumber', 
      value: serializeValue(blockNumber), 
      timestamp: Date.now() 
    }));

    ws.send(JSON.stringify({
      method: 'eth_gasPrice',
      value: serializeValue(gasPrice),
      timestamp: Date.now()
    }));
  } catch (error) {
    console.error('Error sending current values:', error);
  }
}

export const fallbackClient = createPublicClient({
  name: "RPC",
  chain: mainnet,
  transport: httpTransport(fallbackUrl),
});

async function setChainId() {
  try {
    const chainId = await fallbackClient.getChainId();
    broadcastUpdate('eth_chainId', chainId, null);
    console.log("Successfully set chain ID:", chainId);
  } catch (error) {
    process.stderr.write(`[ERROR] setChainId(): ${error.message}\n`);
  }
}

async function updateCache() {
  try {
    const [blockNumber, gasPrice] = await Promise.all([
      fallbackClient.getBlockNumber(),
      fallbackClient.getGasPrice()
    ]);
    
    if (lastKnownBlockNumber === null || blockNumber > lastKnownBlockNumber) {
      lastKnownBlockNumber = blockNumber;
      broadcastUpdate('eth_blockNumber', blockNumber);
      broadcastUpdate('eth_gasPrice', gasPrice);
    }
  } catch (error) {
    process.stderr.write(`[ERROR] updateCache(): ${error.message}\n`);
  }
}

// Add global error handlers
process.on('uncaughtException', (error) => {
  process.stderr.write(`[ERROR] Uncaught Exception: ${error.stack}\n`);
});

process.on('unhandledRejection', (reason, promise) => {
  process.stderr.write(`[ERROR] Unhandled Rejection at: ${promise}\n[ERROR] Reason: ${reason}\n`);
});

setChainId();
setInterval(updateCache, checkInterval);
