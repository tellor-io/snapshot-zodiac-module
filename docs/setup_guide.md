# Tellor Module Setup Guide

This guide shows how to setup the Tellor module with a Gnosis Safe on the Rinkeby test network. It will use the [Tellor](https://tellor.io/) oracle to retrieve [Snapshot](https://snapshot.org/) voting results.

The Tellor Module belongs to the [Zodiac](https://github.com/gnosis/zodiac) collection of tools. If you have any questions about the Tellor Module join the [Tellor Discord](https://discord.gg/tellor).
For more information about the Zodiac collection of tools, join the [Gnosis Discord](https://discord.gg/wwmBWTgyEq). Follow [@WeAreTellor](https://twitter.com/wearetellor) and [@GnosisGuild](https://twitter.com/gnosisguild) on Twitter for updates. 

## Prerequisites

To start the process, you need to create a Gnosis Safe on the Rinkeby test network, for example on [https://rinkeby.gnosis-safe.io](https://rinkeby.gnosis-safe.io)). This Safe will represent the DAO and hold its assets, such as tokens and collectibles. A Safe transaction is required to set up the Tellor Module.

For the hardhat tasks to work, the environment needs to be properly configured. See the [sample env file](../.env.sample) for more information.

## Setup

The module has six attributes:

- `Owner`: Address that can call setter functions
- `Avatar`: Address of the DAO (e.g a Gnosis Safe)
- `Target`: Address on which the module will call `execModuleTransaction()`
- `Oracle`: Address of the oracle (Tellor contract address)
- `Cooldown`: Duration (in seconds) required before the transaction can be executed (after the timeout has expired)
- `Expiration`: Duration that a transaction is valid in seconds (or 0 if valid forever) after the cooldown

Hardhat tasks can be used to deploy the Tellor Module instance. There are two different ways to deploy the module, the first one is through a normal deployment, passing arguments to the constructor (without the `proxied` flag), or to deploy the module through a [Minimal Proxy Factory](https://eips.ethereum.org/EIPS/eip-1167) (with the `proxied` flag) to save on gas costs.

This task requires the following parameters:

- `Owner`: Address that can call setter functions
- `Avatar`: Address of the DAO (e.g a Gnosis Safe)
- `Target`: Address on which the module will call `execModuleTransaction()`
- `Oracle`: Address of the oracle (Tellor contract address)
- `proxied` (Optional): Deploys the module through a proxy factory

There are more optional parameters, for more information run `yarn hardhat setup --help`.

An example for this on Rinkeby would be:

`yarn hardhat --network rinkeby setup --owner <owner_address> --avatar <avatar_address> --target <target_address>`

Once the module has been deployed, you should verify the source code. (Note: It is likely that Etherscan will verify it automatically, but just in case, you should verify it yourself.) If you use a network that is Etherscan compatible, and you configure the `ETHERSCAN_API_KEY` in your environment, you can use the provided hardhat task to do this.

An example of this on Rinkeby would be:
`yarn hardhat --network rinkeby verifyEtherscan --module 0x4242424242424242424242424242424242424242 --owner <owner_address> --avatar <avatar_address> --target <target_address>`

### Enabling the module

To allow the Tellor Module to actually execute transactions, you must enable it on the Gnosis Safe to which it is connected. For this, it is possible to use the Zodiac app (enabling a custom module with the address of your newly deployed module above) or the Transaction Builder on https://rinkeby.gnosis-safe.io. For this you can follow the tutorial on [adding a module with the transaction builder](https://help.gnosis-safe.io/en/articles/4934427-add-a-module).

<!-- ## Snapshot integration

To setup the newly deployed module on snapshot view the [Snapshot integration guide here.](https://gnosis.github.io/zodiac/docs/tutorial-module-reality/integrate-snapshot).  -->

## Monitoring your module

Because anyone can submit proposals to your module, it is strongly recommended to put in place monitoring practices. The Tellor Module relies on the Tellor oracle to provide the correct answer, so that no malicious transactions are executed. In the worst case, the avatar (e.g. the connected Gnosis Safe) can invalidate a submitted proposal. See the [README](../README.md) for more information on this. 

To make sure that all of the involved stakeholders can react in a timely manner, the events emitted by the module contract should be monitored. Each time a new proposal is submitted, the contract will emit a `ProposalQuestionCreated` event with the following parameters:
```
event ProposalQuestionCreated(
    bytes32 indexed questionId, // Tellor query id
    string indexed proposalId // Snapshot proposal id
);
```

There are different services available for monitoring such as the [OpenZepplin Defender Sentinel](https://docs.openzeppelin.com/defender/sentinel).

## Support

If you have any questions about the Tellor Module join our [Tellor Discord](https://discord.gg/tellor).
For more information about the Zodiac collection of tools, join the [Gnosis Discord](https://discord.gg/wwmBWTgyEq).
