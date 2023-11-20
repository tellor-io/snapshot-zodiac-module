# Zodiac Tellor Module
[![Build Status](https://github.com/gnosis/dao-module/workflows/dao-module/badge.svg?branch=main)](https://github.com/gnosis/dao-module/actions)
[![Coverage Status](https://coveralls.io/repos/github/gnosis/dao-module/badge.svg?branch=main)](https://coveralls.io/github/gnosis/dao-module)

The Tellor Module belongs to the [Zodiac](https://github.com/gnosis/zodiac) collection of tools, which can be accessed through the Zodiac App available on [Gnosis Safe](https://gnosis-safe.io/), as well as in this repository. 

If you have any questions about the Tellor Module, join the [Tellor Discord](https://discord.gg/tellor).
For more information about the Zodiac collection of tools, join the [Gnosis Discord](https://discord.gg/wwmBWTgyEq).

## About the Tellor Module

This module allows on-chain execution based on the outcome of [Snapshot](https://snapshot.org/) proposals reported by the [Tellor](https://tellor.io/) oracle. This module is a Tellor implementation of the [Reality Module](https://github.com/gnosis/zodiac-module-reality).

The `Snapshot` query consists of a proposal ID (an IPFS hash), which can be used to provide more information for the transaction to be executed. 
An array of EIP-712-based transaction hashes represent the transactions that should be executed. It is only possible to execute transactions related to a specific `proposalId` and `txHashes` once.

When the query response has resolved to `true`, meaning that the transactions should be executed, they are submitted to the immutable executor defined in the module. Transactions that resolve to `false` cannot be executed by the module.

This module is intended to be used with [Gnosis Safe](https://github.com/gnosis/safe-contracts), but it is ultimately framework agnostic.
For more information about the Snapshot query type, visit the [Snapshot dataspecs](https://github.com/tellor-io/dataSpecs/blob/main/types/Snapshot.md).

## Setup Guides

This module can be setup either using the Zodiac App's UI or by using command line tools; both methods allow for connecting to Snapshot.

[View docs for using the command line](./docs/setup_guide.md)

## Features
- Submit proposals uniquely identified by a `proposalId` and an array of `txHashes`, to create a Tellor query that validates the execution of the connected transactions.
- Proposals can be marked invalid by the `executor` using `markProposalInvalid`, thereby preventing the execution of the transactions related to that proposal.
- A `cooldown` can be specified representing the minimum amount of time required to pass after the query has been answered before the transactions can be executed.

## Flow
- Add the proposal to the Tellor Module via the `addProposal` method.
- The [Snapshot](https://snapshot.org/) proposal needs to pass to approve it for execution.
- A staked [Tellor](https://tellor.io/) reporter submits the proposal result to the oracle.
- Once the result has been submitted and the `cooldown` period has passed, the transaction(s) can be executed via `executeProposal`.

## Definitions

### Transaction nonce or index

The `nonce` of a transaction makes it possible to have two transactions with the same `to`, `value` and `data` but still generate a different transaction hash. This is important as all hashes in the `txHashes` array should be unique. To make sure that this is the case, the module will always use the `index` of the transaction hash inside the `txHashes` array as a nonce. So the first transaction to be executed has the `nonce` with the value `0`, the second with the value `1`, and so on.

Therefore we can simplify it to the following statement: The `nonce` of a Tellor Module transaction is equal to the `index` of that transaction's hash in the `txHashes` array.

### Failed transactions

The Tellor Module requires proposal transactions are successful (e.g. transactions should not internally revert for any reason). If any of the transactions of a proposal fail, it will not be possible to continue with the execution of the following transactions. This is to prevent subsequent transactions being executed in a scenario in which earlier transactions failed due to the gas limit being too low or due to other errors.

Transactions that failed will _not_ be marked as executed, and therefore, they can be executed at any later point in time. This is a potential risk, and therefore it is recommended to either set a result expiration time or invalidate the proposal (e.g. via another proposal).

### Result expiration

The Tellor Module can be configured so that positive results will expire after a certain time. This can be done by calling `setResultExpiration` with a duration in seconds. If the transactions related to the proposal are not executed before the result expires, it will not be possible to execute them. This is useful in the case of transactions that revert and therefore cannot be executed in order to prevent them from being unexpectedly executed in the future. Negative results (no or invalid) cannot expire.

Note: If the expiration time is set to `0`, results will never expire. This also means results that expired before will become available again. To prevent this, it is recommended to call `markProposalWithExpiredResultAsInvalid` immediately after any proposal expires (or on all outstanding expired results prior to setting the expiration date to `0`). This will mark a proposal with an expired result as invalid. This method can be called by anyone.

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

## Executing a Proposal

If you've deployed a Tellor Module through the Zodiac frontend, you may be wondering how to connect it to Snapshot and execute a proposal. The steps for achieving this are as follows.

### Configuring Gnosis SafeSnap on Snapshot

1. Ensure you have access to a Snapshot space.
2. Visit [snapshot.org](https://snapshot.org/) and navigate to your Snapshot space.
3. Click on "Settings."
4. Navigate to the "Advanced" tab.
5. In the "Plugins" section, select "Add plugin."
6. Search for and select "Gnosis SafeSnap."
7. You'll encounter several plugin inputs:

```json
{
  "safes": [
    {
      "network": "",
      "umaAddress": "",
      "tellorAddress": "",
      "realityAddress": ""
    }
  ]
}
```

8. Fill in the `network` field with the network ID where your Tellor module contract is deployed. For `tellorAddress`, input the address of your Tellor module contract, typically deployed via the Gnosis Safe frontend.
9. Click "Add Plugin."

### Adding a Proposal to Snapshot

1. In your Snapshot space, select "New Proposal."
2. Enter your proposal's name and description, then click "Continue."
3. Under "Type," choose "Basic Voting" and then select "Continue."
4. Add the transactions you wish to execute from your Gnosis safe.
5. Click "Publish."
6. Once published, your proposal page will display an "Information" panel. Click the "IPFS" link (e.g., "https://snapshot.mypinata.cloud/ipfs/bafkreia5v5qgwurmky4vy5orpxniptlswefipla6rmbjw4jjzoqtgbkdfi". Copy and save the entire hash at the end of this URL. This is your `proposalId`.

Your community is now ready to participate in the Snapshot vote. Meanwhile, add your proposal to the Tellor module through the Gnosis Safe/Zodiac frontend.

### Adding Proposal to Zodiac Module

1. In the Zodiac frontend, select your TellorModule.
2. For each transaction in your proposal, you'll need its transaction hash.
3. Under "Read Contract," locate `getTransactionHash`. For each transaction, input the relevant details. Use `_operation` `0` for a simple `call`, or `1` for a delegate call (most normal operations use just a `call`). Start with `nonce` `0`, increasing by `1` for each subsequent transaction within a proposal. Reset to `0` for each unique proposals. Click "Run Query" to obtain your transaction hash.
4. With all transaction hashes ready, click "Write Contract."
5. Find `addProposal`, input your `proposalId` and an array of your transaction hashes in the correct order.
6. Click "+ Add this transaction," then "Bundle Transactions." Your transaction is now assembled. Click "Submit Transaction" and "Execute" to submit it on-chain.

### Executing the Proposal

1. After your Snapshot proposal voting ends, you can either [tip Telliot data reporters](https://docs.tellor.io/tellor/getting-data/funding-a-feed) or [submit the data yourself](https://docs.tellor.io/tellor/reporting-data/introduction) to get your vote results on-chain.
2. Use the [QueryId Station tool](https://tellor.io/queryidstation/) to generate `queryId` and `queryData`. Select "Custom," input "Snapshot" as the `type`, and add your Snapshot `proposalId`.
3. If submitting results yourself, note that the submission is an ABI-encoded boolean. Submit `0x0000000000000000000000000000000000000000000000000000000000000001` for a passed proposal, or `0x0000000000000000000000000000000000000000000000000000000000000000` otherwise.
4. Once data is submitted on-chain and the Tellor Zodiac module's `cooldown` period has passed, you can execute your proposal.
5. In the Zodiac frontend, go to "Write Contract" and choose "executeProposalWithIndex."
6. Submit each transaction in the correct order, incrementing `_txIndex` by `1` for each transaction, starting from `0`.
7. After inputting all transactions, proceed to "bundle transactions," "Submit Transactions," and finally "Execute" to execute your transactions on-chain.

Your proposed transactions should now be successfully executed.


## Solidity Compiler

The contracts have been developed with [Solidity 0.8.0](https://github.com/ethereum/solidity/releases/tag/v0.8.0) in mind. This version of Solidity made all arithmetic checked by default, therefore eliminating the need for explicit overflow or underflow (or other arithmetic) checks.
<!-- 
### Audits

An audit has been performed by the [G0 group](https://github.com/g0-group).

No issues have been discovered. -->

<!-- The audit results are available as a pdf in [this repo](audits/ZodiacRealityModuleSep2021.pdf) or on the [g0-group repo](https://github.com/g0-group/Audits/blob/e11752abb010f74e32a6fc61142032a10deed578/ZodiacRealityModuleSep2021.pdf). -->

## Security and Liability

All contracts are WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
