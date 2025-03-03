import http from "https";
import { WebSocket, WebSocketServer } from 'ws';
import { createPublicClient, http as httpTransport } from "viem";
import { mainnet } from "viem/chains";
import fs from "fs";

import { fallbackUrl, cachePort, checkInterval } from "./config.js";

const wss = new WebSocketServer({ 
  server: http.createServer({
    key: fs.readFileSync('/home/ubuntu/shared/server.key'),
    cert: fs.readFileSync('/home/ubuntu/shared/server.cert'),
  }).listen(cachePort)
});

// Track last known block number to avoid duplicate updates
let lastKnownBlockNumber = null;

console.log("----------------------------------------------------------------------------------------------------------------");
console.log("----------------------------------------------------------------------------------------------------------------");
console.log(`Cache WebSocket server running at ws://localhost:${cachePort}`);

// Track connected clients
const clients = new Set();

wss.on('connection', (ws) => {
  console.log('handleCachedRequest.js connected');
  clients.add(ws);

  // Send current values to new client
  sendCurrentValues(ws);

  ws.on('close', () => {
    console.log('handleCachedRequest.js disconnected');
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
    
    lastKnownBlockNumber = blockNumber; // Update last known block
    
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
    // Use null timestamp for eth_chainId since it never expires
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
    
    // Only broadcast if block number has changed
    if (lastKnownBlockNumber === null || blockNumber > lastKnownBlockNumber) {
      lastKnownBlockNumber = blockNumber;
      broadcastUpdate('eth_blockNumber', blockNumber);
      broadcastUpdate('eth_gasPrice', gasPrice);
      console.log("Updated cache. Block Number:", blockNumber.toString(), "Gas Price:", gasPrice.toString());
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
