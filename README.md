# Tellor Reality Module
[![Build Status](https://github.com/gnosis/dao-module/workflows/dao-module/badge.svg?branch=main)](https://github.com/gnosis/dao-module/actions)
[![Coverage Status](https://coveralls.io/repos/github/gnosis/dao-module/badge.svg?branch=main)](https://coveralls.io/github/gnosis/dao-module)

The Tellor Module belongs to the [Zodiac](https://github.com/gnosis/zodiac) collection of tools, which can be accessed through the Zodiac App available on [Gnosis Safe](https://gnosis-safe.io/), as well as in this repository. 

If you have any questions about the Tellor Module the [Tellor Discord](https://discord.gg/tellor).
For more information about the Zodiac collection of tools, join the [Gnosis Discord](https://discord.gg/wwmBWTgyEq).

### About the Tellor Module

This module allows on-chain execution based on the outcome of [Snapshot](https://snapshot.org/) proposals reported by the [Tellor](https://tellor.io/) oracle. This module is a Tellor implementation of the [Reality Module](https://github.com/gnosis/zodiac-module-reality).

The `Snapshot` query consists of a proposal ID (an IPFS hash), which can be used to provide more information for the transaction to be executed. 
An array of EIP-712-based transaction hashes represent the transactions that should be executed. It is only possible to execute transactions related to a specific `proposalId` once.

When the query response has resolved to `true`, meaning that the transactions should be executed, they are submitted to the immutable executor defined in the module. Transactions that resolve to `false` cannot be executed by the module.

This module is intended to be used with [Gnosis Safe](https://github.com/gnosis/safe-contracts), but it is ultimately framework agnostic.
For more information about the Snapshot query type, visit the [Snapshot dataspecs](https://github.com/tellor-io/dataSpecs/blob/main/types/Snapshot.md).

### Setup Guides

This module can be setup either using the Zodiac App's UI or by using command line tools; both methods allow for connecting to Snapshot.

[View docs for using the command line](./docs/setup_guide.md)

### Features
- Submit proposals uniquely identified by a `proposalId` and an array of `txHashes`, to create a Tellor query that validates the execution of the connected transactions.
- Proposals can be marked invalid by the `executor` using `markProposalInvalid`, thereby preventing the execution of the transactions related to that proposal.
- A `cooldown` can be specified representing the minimum amount of time required to pass after the query has been answered before the transactions can be executed.

### Flow
- Add the proposal to the Tellor Module via the `addProposal` method.
- The [Snapshot](https://snapshot.org/) proposal needs to pass to approve it for execution.
- A staked [Tellor](https://tellor.io/) reporter submits the proposal result to the oracle.
- Once the result has been submitted and the `cooldown` period has passed, the transaction(s) can be executed via `executeProposal`.

### Definitions

#### Transaction nonce or index

The `nonce` of a transaction makes it possible to have two transactions with the same `to`, `value` and `data` but still generate a different transaction hash. This is important as all hashes in the `txHashes` array should be unique. To make sure that this is the case, the module will always use the `index` of the transaction hash inside the `txHashes` array as a nonce. So the first transaction to be executed has the `nonce` with the value `0`, the second with the value `1`, and so on.

Therefore we can simplify it to the following statement: The `nonce` of a Reality Module transaction is equal to the `index` of that transaction's hash in the `txHashes` array.

<!-- #### Proposal nonce
There is a chance that a question is marked invalid on the oracle (e.g. if it is asked too early). In this case it should be possible to ask the question again, and we need to be able to generate a new question ID. For this it is possible to provide the next higher `nonce` compared to the last invalidated proposal. So in case the first proposal (with the default `nonce` of `0`) was marked invalid on the oracle, a new proposal can be submitted with the `nonce` of `1`. -->

### Failed transactions

The Tellor Module requires proposal transactions are successful (e.g. transactions should not internally revert for any reason). If any of the transactions of a proposal fail, it will not be possible to continue with the execution of the following transactions. This is to prevent subsequent transactions being executed in a scenario in which earlier transactions failed due to the gas limit being too low or due to other errors.

Transactions that failed will _not_ be marked as executed, and therefore, they can be executed at any later point in time. This is a potential risk, and therefore it is recommended to either set an answer expiration time or invalidate the proposal (e.g. via another proposal).

### Answer expiration

The Tellor Module can be configured so that positive answers will expire after a certain time. This can be done by calling `setAnswerExpiration` with a duration in seconds. If the transactions related to the proposal are not executed before the answer expires, it will not be possible to execute them. This is useful in the case of transactions that revert and therefore cannot be executed in order to prevent them from being unexpectedly executed in the future. Negative answers (no or invalid) cannot expire.

Note: If the expiration time is set to `0`, answers will never expire. This also means answers that expired before will become available again. To prevent this, it is recommended to call `markProposalWithExpiredAnswerAsInvalid` immediately after any proposal expires (or on all outstanding expired answers prior to setting the expiration date to `0`). This will mark a proposal with an expired answer as invalid. This method can be called by anyone.

### EIP-712 details

[EIP-712](https://github.com/Ethereum/EIPs/blob/master/EIPS/eip-712.md) is used to generate the hashes for the transactions to be executed. The following EIP-712 domain and types are used.

#### Domain

```
{
  EIP712Domain: [
    { type: "uint256", name: "chainId" },
    { type: "address", name: "verifyingContract" }
  ]
}
```

#### TransactionType

```
{
  Transaction: [
    { type: "address", name: "to" },
    { type: "uint256", name: "value" },
    { type: "bytes", name: "data" },
    { type: "uint8", name: "operation" },
    { type: "uint256", name: "nonce" }
  ]
}
```

### Solidity Compiler

The contracts have been developed with [Solidity 0.8.0](https://github.com/ethereum/solidity/releases/tag/v0.8.0) in mind. This version of Solidity made all arithmetic checked by default, therefore eliminating the need for explicit overflow or underflow (or other arithmetic) checks.
<!-- 
### Audits

An audit has been performed by the [G0 group](https://github.com/g0-group).

No issues have been discovered. -->

<!-- The audit results are available as a pdf in [this repo](audits/ZodiacRealityModuleSep2021.pdf) or on the [g0-group repo](https://github.com/g0-group/Audits/blob/e11752abb010f74e32a6fc61142032a10deed578/ZodiacRealityModuleSep2021.pdf). -->

### Security and Liability

All contracts are WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.