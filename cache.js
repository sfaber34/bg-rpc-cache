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
  try {
    const chainId = await fallbackClient.getChainId();
    cacheMap.set('eth_chainId', chainId);
    console.log("Successfully set chain ID:", chainId);
  } catch (error) {
    console.error("Error setting chain ID:", error.message);
  }
}

async function updateCache() {
  try {
    const blockNumber = await fallbackClient.getBlockNumber();
    const currentCachedBlock = cacheMap.get('eth_blockNumber') || 0;
    
    if (blockNumber > currentCachedBlock) {
      cacheMap.set('eth_blockNumber', blockNumber);
      
      try {
        const block = await fallbackClient.getBlock({ blockNumber });
        // Convert block object to be JSON-serializable
        const serializableBlock = JSON.parse(JSON.stringify(block, (_, value) =>
          typeof value === 'bigint' ? value.toString() : value
        ));
        cacheMap.set('eth_getBlockByNumber', serializableBlock);
        console.log("Updated cache. Block Number:", blockNumber);
      } catch (blockError) {
        console.error("Error fetching block details:", blockError.message);
        // Still keep the block number even if block details fail
        console.log("Cached block number but failed to get block details");
      }
    }
  } catch (error) {
    console.error("Error updating cache:", error.message);
  }
}

setChainId();
setInterval(updateCache, checkInterval);
