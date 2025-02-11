import http from "http";
import { createPublicClient, http as httpTransport } from "viem";
import { mainnet } from "viem/chains";

import { fallbackUrl, cachePort, checkInterval } from "./config.js";

const cacheMap = new Map();

function getMapValue(key) {
  const value = cacheMap.get(key);
  return typeof value === 'bigint' ? value.toString() : value;
}

// Create HTTP server to serve map contents
const server = http.createServer((req, res) => {
  // Add CORS headers to allow connections
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Add error handling for the response
  res.on('error', (err) => {
    process.stderr.write(`[ERROR] Error sending response: ${err}\n`);
  });

  try {
    res.setHeader('Content-Type', 'application/json');
    
    // Parse the URL to get the key parameter
    const url = new URL(req.url, `http://${req.headers.host}`);
    const key = url.searchParams.get('key');

    if (key) {
      const value = getMapValue(key);
      if (value !== undefined) {
        res.end(JSON.stringify({ [key]: value }));
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Key not found' }));
      }
    }
  } catch (error) {
    process.stderr.write(`[ERROR] Error serving cache contents: ${error}\n`);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

// Add error handling for the server
server.on('error', (error) => {
  process.stderr.write(`[ERROR] Cache server error: ${error}\n`);
  if (error.code === 'EADDRINUSE') {
    process.stderr.write(`[ERROR] Port ${cachePort} is already in use\n`);
    process.exit(1);
  }
});

server.listen(cachePort, () => {
  console.log("----------------------------------------------------------------------------------------------------------------");
  console.log("----------------------------------------------------------------------------------------------------------------");
  console.log(`Cache server running at http://localhost:${cachePort}`);
});

export const fallbackClient = createPublicClient({
  name: "RPC",
  chain: mainnet,
  transport: httpTransport(fallbackUrl),
});

async function setChainId() {
  try {
    const chainId = await fallbackClient.getChainId();
    cacheMap.set('eth_chainId', chainId);
    console.log("Successfully set chain ID:", chainId);
  } catch (error) {
    process.stderr.write(`[ERROR] setChainId(): ${error.message}\n`);
  }
}

async function updateCache() {
  try {
    const blockNumber = await fallbackClient.getBlockNumber();
    const currentCachedBlock = cacheMap.get('eth_blockNumber') || 0;
    
    if (blockNumber > currentCachedBlock) {
      cacheMap.set('eth_blockNumber', blockNumber);
      console.log("Updated cache. Block Number:", blockNumber);
    }
  } catch (error) {
    process.stderr.write(`[ERROR] updateCache(): ${error.message}\n`);
  }
}

// Add global error handlers
process.on('uncaughtException', (error) => {
  process.stderr.write(`[ERROR] Uncaught Exception: ${error.stack}\n`);
  // Optionally, you might want to keep the process running instead of exiting
  // process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  process.stderr.write(`[ERROR] Unhandled Rejection at: ${promise}\n[ERROR] Reason: ${reason}\n`);
});

setChainId();
setInterval(updateCache, checkInterval);
