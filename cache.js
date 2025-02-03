import http from "http";
import { createPublicClient, http as httpTransport } from "viem";
import { mainnet } from "viem/chains";

import { fallbackUrl, cachePort, checkInterval } from "./config.js";

const cacheMap = new Map();

function getMapContents() {
  const result = {};
  for (const [key, value] of cacheMap.entries()) {
    result[key] = typeof value === 'bigint' ? value.toString() : value;
  }
  return result;
}

// Create HTTP server to serve map contents
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(getMapContents(), null, 2));
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
  const chainId = await fallbackClient.getChainId();
  cacheMap.set('chainId', chainId);
}

async function updateCache() {
  const blockNumber = await fallbackClient.getBlockNumber();
  const currentCachedBlock = cacheMap.get('blockNumber') || 0;
  
  if (blockNumber > currentCachedBlock) {
    cacheMap.set('blockNumber', blockNumber);
    
    const block = await fallbackClient.getBlock({ blockNumber });
    // Convert block object to be JSON-serializable
    const serializableBlock = JSON.parse(JSON.stringify(block, (_, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));
    cacheMap.set('block', serializableBlock);

    console.log("Updated cache. Block Number: " + blockNumber);
  }
}

setChainId();
setInterval(updateCache, checkInterval);
