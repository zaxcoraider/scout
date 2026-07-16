import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The heuristic + verdict tests are pure (no network). These placeholders only exist to
    // satisfy boot-time env validation, which the real server rightly refuses to start without.
    env: {
      SCOUT_RPC_196: 'https://rpc.invalid/196',
      SCOUT_RPC_1: 'https://rpc.invalid/1',
      SCOUT_PAYTO_ADDRESS: '0x0000000000000000000000000000000000000000',
      SCOUT_PRICE_USDT: '0.01',
    },
  },
});
