# Summary

This code snippet intends to run on the Midnight ZKPaas TEE environment set by BCW under the GCP cloud service.
It should work to fullfill the augmented functionality of `Sponsored Wallet`, where it receives a zk-proof and submits it to the chain internally.

It should be able to do the following 4 things:

  - Expose a REST endpoint to be consumed internally that accepts a Zk-proof (with wallet signed identify) from the proof-server.
  - Accepts a zk-proof submission with a wallet pre-attached for identity of the transaction.
  - Connects to an internal wallet with DUST attached (topped up by Midnight).
  - Submits the proof to the chain and returns the result after checking through an internal RPC service.

  More technical documentation can be found here:
  - https://docs.google.com/document/d/1GdF06y1IPp6fQjMH6v8Flou1SXBxY9hsHi1amYxGEQ0/edit?tab=t.0
  - (Request for access if needed to daniel@bcw.group / alena@bcw.group / mithil@bcw.group)

## Sponsor Wallet Pattern - Technical Implementation

The sponsor wallet pattern allows a funded wallet to pay transaction fees on behalf of another wallet (prover) that owns the contract state. This enables users without funds to interact with smart contracts.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MIDNIGHT PROVIDER                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   coinPublicKey  ───────────►  PROVER WALLET (overrideKeys)             │
│   encryptionPublicKey  ─────►  (owns contract state per-user)           │
│                                                                         │
│   balanceTx()  ─────────────►  SPONSOR WALLET (pays fees)               │
│       └─► proveTransaction()►  PROVER WALLET (signs proof)              │
│   submitTx()   ─────────────►  SPONSOR WALLET (submits to chain)        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Smart Contract Design

The counter contract uses a per-user counter map keyed by `ZswapCoinPublicKey`:

```compact
export ledger counters: Map<ZswapCoinPublicKey, Counter>;

export circuit increment(): [] {
  const caller = ownPublicKey();
  if (!counters.member(caller)) {
    counters.insertDefault(caller);
  }
  counters.lookup(caller).increment(1);
}
```

Each user has their own isolated counter, identified by their coin public key.

### Core Functions

| Function | Purpose |
|----------|---------|
| `buildWalletAndWaitForFunds()` | Builds sponsor wallet, waits for sync and funds |
| `buildProverWalletFromSeed()` | Builds prover wallet from seed (no funds required) |
| `setExternalProverWallet()` | Sets prover wallet and overrides keys for signing |
| `createWalletAndMidnightProvider()` | Provider with dynamic key override support |
| `getCounterLedgerState()` | Query counter for specific public key |
| `displayCounterValue()` | Display counter for any wallet address |

### How It Works

1. **Sponsor Wallet**: Primary wallet with funds - handles `balanceTx()` and `submitTx()`
2. **Prover Wallet**: Built from seed when needed - provides keys and signs proofs
3. **Key Override**: `setExternalProverWallet()` overrides `coinPublicKey` and `encryptionPublicKey`
4. **Proving**: `balanceTx()` uses `externalProverWallet ?? wallet` for `proveTransaction()`

### Key Implementation Details

```typescript
// Global state for sponsor pattern
let externalProverWallet: (Wallet & Resource) | null = null;
let overrideKeys: { coinPublicKey?: CoinPublicKey; encryptionPublicKey?: EncPublicKey } = {};

// Provider uses getters that check override keys
export const createWalletAndMidnightProvider = async (wallet: Wallet) => {
  const state = await Rx.firstValueFrom(wallet.state());
  const baseCoinPublicKey = state.coinPublicKey;
  const baseEncryptionPublicKey = state.encryptionPublicKey;
  
  return {
    get coinPublicKey() {
      return overrideKeys.coinPublicKey ?? baseCoinPublicKey;
    },
    get encryptionPublicKey() {
      return overrideKeys.encryptionPublicKey ?? baseEncryptionPublicKey;
    },
    balanceTx(tx, newCoins) {
      return wallet.balanceTransaction(...)
        .then((tx) => {
          const prover = externalProverWallet ?? wallet;
          return prover.proveTransaction(tx);  // Prover signs
        })
        .then(...);
    },
    submitTx(tx) {
      return wallet.submitTransaction(tx);  // Sponsor submits
    },
  };
};

// Set external prover and override keys
export const setExternalProverWallet = async (wallet) => {
  externalProverWallet = wallet;
  if (wallet === null) {
    overrideKeys = {};
    return;
  }
  const state = await Rx.firstValueFrom(wallet.state());
  overrideKeys = {
    coinPublicKey: state.coinPublicKey,
    encryptionPublicKey: state.encryptionPublicKey,
  };
};
```

### CLI Usage Flow

```bash
cd counter-cli && npm run build && npm run testnet-remote
```

**Interactive Flow:**

1. **Build Sponsor Wallet**: Choose option 1/2/3 to create wallet with funds
2. **Deploy or Join Contract**: Deploy new or join existing contract
3. **Increment with Prover**:
   - Enter private seed to sign with external wallet (prover)
   - Or leave empty to use sponsor wallet
4. **Display Counter**:
   - Enter wallet address (`mn_shield-*`, `shield-cpk`, hex) to query
   - Or press enter to query your own counter

```
You can do one of the following:
  1. Increment
  2. Display current counter value
  3. Exit
Which would you like to do? 1
Enter private seed to sign increment (leave empty to use current wallet): <prover_seed>

Which would you like to do? 2
Enter wallet public address (mn_shield-*, shield-cpk, hex) or press enter to use your own: <address>
```
```


## Project Structure

```
example-counter/
├── contract/               # Smart contract in Compact language
│   ├── src/counter.compact # The actual smart contract
│   └── src/test/           # Contract unit tests
└── counter-cli/            # Command-line interface
    └── src/                # CLI implementation
```

## Prerequisites

### 1. Node.js Version Check

You need NodeJS version 22.15 or greater:

```bash
node --version
```

Expected output: `v22.15.0` or higher.

If you get a lower version: [Install Node.js 22+](https://nodejs.org/).

### 2. Docker Installation

The [proof server](https://docs.midnight.network/develop/tutorial/using/proof-server) runs in Docker, so you need Docker Desktop:

```bash
docker --version
```

Expected output: `Docker version X.X.X`.

If Docker is not found: [Install Docker Desktop](https://docs.docker.com/desktop/). Make sure Docker Desktop is running (not just installed).

## Setup Instructions

### Install the Compact Compiler

The Compact compiler converts smart contracts written in the Compact language into executable circuits for zero-knowledge proof generation.

#### Download and install compact compiler

```bash
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
```

#### Add to your PATH (choose based on your shell)

```bash
source $HOME/.local/bin/env                    # bash/zsh/sh
source $HOME/.local/bin/env.fish              # fish
```

#### Update to the version required by this project (optional)

```
compact update 0.25.0
```

#### Verify installation

```bash
compact compile --version
```

Expected output: `0.25.0`.

> If command not found: Restart your terminal and try the `source` command again.

### Install Project Dependencies

```bash
npm install
```

### Compile the Smart Contract

The Compact compiler generates TypeScript bindings and zero-knowledge circuits from the smart contract source code. Navigate to contract directory and compile the smart contract:

```bash
cd contract && npm run compact
```

Expected output:

```
Compiling 1 circuits:
  circuit "increment" (k=10, rows=29)
```

Note: First time may download zero-knowledge parameters (~500MB). This is normal and happens once.

### Build and Test

Build TypeScript files and run tests:

```bash
npm run build && npm run test
```

### Build the CLI Interface

Navigate to CLI directory and build the project:

```bash
cd ../counter-cli && npm run build
```

### Start the Proof Server

The proof server generates zero-knowledge proofs for transactions locally to protect private data. It must be running before you can deploy or interact with contracts.

#### Option A: Manual Proof Server (Recommended)

Pull the Docker image:

```bash
docker pull midnightnetwork/proof-server:latest
```

Then start the proof server (keep this terminal open):

```bash
docker run -p 6300:6300 midnightnetwork/proof-server -- 'midnight-proof-server --network testnet'
```

Expected output:

```
INFO midnight_proof_server: This proof server processes transactions for TestNet.
INFO actix_server::server: starting service: "actix-web-service-0.0.0.0:6300"
```

**Keep this terminal running!** The proof server must stay active while using the DApp.

#### Option B: Automatic Proof Server

This should start proof server automatically, but may fail if Docker isn't properly configured:

```bash
npm run testnet-remote-ps
```

If this fails with "Could not find a working container runtime strategy", use Option A instead.

## Run the Counter DApp

Open a new terminal (keep proof server running in the first one).

```bash
cd counter-cli && npm run build && npm run testnet-remote
```

## Using the Counter DApp

### Step 1: Create Sponsor Wallet

The CLI uses a headless wallet (separate from browser wallets like Lace) that can be called through library functions.

1. Choose option `1` to build a fresh wallet (sponsor wallet with funds)
2. The system will generate a wallet address and seed
3. **Save both the address and seed** - the sponsor wallet needs funds

Expected output:

```
Your wallet seed is: [64-character hex string]
Your wallet address is: mn_shield-addr_test1...
Your wallet balance is: 0
```

### Step 2: Fund Sponsor Wallet

Before deploying contracts, the sponsor wallet needs testnet tokens.

1. Copy your wallet address from the output above
2. Visit the [testnet faucet](https://midnight.network/test-faucet)
3. Paste your address and request funds
4. Wait for the CLI to detect the funds (takes 2-3 minutes)

Expected output:

```
Your wallet balance is: 1000000000
```

### Step 3: Deploy Contract

1. Choose option `1` to deploy a new counter contract
2. Wait for deployment (takes ~30 seconds)
3. **Save the contract address** for future use

Expected output:

```
Deployed contract at address: [contract address]
```

### Step 4: Use Sponsor Pattern

Once the contract is deployed, you can use the sponsor wallet pattern:

**Increment with External Prover:**
```
Which would you like to do? 1
Enter private seed to sign increment (leave empty to use current wallet): <prover_64_char_hex_seed>
```
- The prover seed signs the transaction (owns the counter)
- The sponsor wallet pays the fees
- The counter is incremented for the prover's public key

**Query Any User's Counter:**
```
Which would you like to do? 2
Enter wallet public address (mn_shield-*, shield-cpk, hex) or press enter to use your own: <address>
Current counter value: 5
```

### Per-User Counter Isolation

Each user's counter is isolated by their `coinPublicKey`. When a prover signs an increment:
- Their public key is used to identify their counter in the map
- Only their counter is incremented
- Other users' counters remain unchanged

### Reusing Wallets

Next time you run the DApp:

1. Choose option `2` to build wallet from seed (sponsor)
2. Enter your saved sponsor seed
3. Choose option `2` to join existing contract
4. Enter your saved contract address
5. Use prover seeds to increment counters for different users

## Useful Links

- [Testnet Faucet](https://midnight.network/test-faucet) - Get testnet funds
- [Midnight Documentation](https://docs.midnight.network/) - Complete developer guide
- [Compact Language Guide](https://docs.midnight.network/compact) - Smart contract language reference

## Troubleshooting

| Issue                                               | Solution                                                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `compact: command not found`                        | Run `source $HOME/.local/bin/env` then `compact compile --version`                                                      |
| `connect ECONNREFUSED 127.0.0.1:6300`               | Start proof server: `docker run -p 6300:6300 midnightnetwork/proof-server -- 'midnight-proof-server --network testnet'` |
| Could not find a working container runtime strategy | Docker isn't running properly. Restart Docker Desktop and try again                                                     |
| Tests fail with "Cannot find module"                | Compile contract first: `cd contract && npm run compact && npm run build && npm run test`                               |
| Wallet seed validation errors                       | Enter complete 64-character hex string without extra spaces                                                             |
| Node.js warnings about experimental features        | Normal warnings - don't affect functionality                                                                            |
| Counter shows 0 for address                         | That address hasn't incremented yet - each user has their own counter                                                   |
| Prover wallet sync issues                           | Prover wallet needs to sync but doesn't need funds - just wait for sync to complete                                     |
