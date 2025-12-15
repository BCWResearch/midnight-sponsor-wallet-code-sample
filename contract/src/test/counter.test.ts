// This file is part of midnightntwrk/example-counter.
// Copyright (C) 2025 Midnight Foundation
// SPDX-License-Identifier: Apache-2.0
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { CounterSimulator } from "./counter-simulator.js";
import {
  NetworkId,
  setNetworkId
} from "@midnight-ntwrk/midnight-js-network-id";
import { describe, it, expect } from "vitest";
import { encodeCoinPublicKey } from "@midnight-ntwrk/onchain-runtime";

setNetworkId(NetworkId.Undeployed);

describe("Counter smart contract", () => {
  const keyA = "1".repeat(64);
  const keyB = "2".repeat(64);

  const asKey = (hex: string) => ({ bytes: encodeCoinPublicKey(hex) });

  it("generates initial ledger state deterministically", () => {
    const simulator0 = new CounterSimulator();
    const simulator1 = new CounterSimulator();
    const ledger0 = simulator0.getLedger();
    const ledger1 = simulator1.getLedger();
    expect(ledger0.counters.isEmpty()).toBe(true);
    expect(ledger1.counters.isEmpty()).toBe(true);
    expect(ledger0.counters.size()).toEqual(ledger1.counters.size());
  });

  it("properly initializes ledger state and private state", () => {
    const simulator = new CounterSimulator();
    const initialLedgerState = simulator.getLedger();
    expect(initialLedgerState.counters.isEmpty()).toBe(true);
    const initialPrivateState = simulator.getPrivateState();
    expect(initialPrivateState).toEqual({ privateCounter: 0 });
  });

  it("increments the counter correctly", () => {
    const simulator = new CounterSimulator(keyA);
    const nextLedgerState = simulator.increment();
    expect(nextLedgerState.counters.member(asKey(keyA))).toBe(true);
    expect(nextLedgerState.counters.lookup(asKey(keyA)).read()).toEqual(1n);
    const nextPrivateState = simulator.getPrivateState();
    expect(nextPrivateState).toEqual({ privateCounter: 0 });
  });

  it("keeps counters isolated per signer", () => {
    const simulator = new CounterSimulator(keyA);
    simulator.increment();
    simulator.increment(keyA);
    const afterB = simulator.increment(keyB);
    expect(afterB.counters.lookup(asKey(keyA)).read()).toEqual(2n);
    expect(afterB.counters.lookup(asKey(keyB)).read()).toEqual(1n);
  });
});
