import "hardhat-deploy";
import "@nomiclabs/hardhat-ethers";
import { task, types } from "hardhat/config";
import { deployAndSetUpModule } from "@gnosis.pm/zodiac";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Address } from "hardhat-deploy/types";

interface TellorTaskArgs {
  avatar: string;
  target: string;
  oracle: Address;
  cooldown: string;
  expiration: string;
  proxied: boolean;
}

const deployTellorModule = async (
  taskArgs: TellorTaskArgs,
  hardhatRuntime: HardhatRuntimeEnvironment
) => {
  const [caller] = await hardhatRuntime.ethers.getSigners();
  console.log("Using the account:", caller.address);

  // if (taskArgs.proxied) {
  //   const chainId = await hardhatRuntime.getChainId();
  //   const module = "tellor";
  //   const { transaction } = deployAndSetUpModule(
  //     module,
  //     {
  //       types: ["address", "address", "address", "uint32", "uint32"],
  //       values: [
  //         taskArgs.avatar,
  //         taskArgs.target,
  //         taskArgs.oracle,
  //         taskArgs.cooldown,
  //         taskArgs.expiration,
  //       ],
  //     },
  //     hardhatRuntime.ethers.provider,
  //     Number(chainId),
  //     Date.now().toString()
  //   );
  //   const deploymentTransaction = await caller.sendTransaction(transaction);
  //   const receipt = await deploymentTransaction.wait();
  //   console.log("Module deployed to:", receipt.logs[1].address);
  //   return;
  // }

  const ModuleName = "TellorModule";
  const Module = await hardhatRuntime.ethers.getContractFactory(ModuleName);
  // get address nonce
  const nonce = await hardhatRuntime.ethers.provider.getTransactionCount(
    caller.address
  );
  const overrides = {
    nonce: nonce,
  };
  const module = await Module.deploy(
    taskArgs.avatar,
    taskArgs.target,
    taskArgs.oracle,
    taskArgs.cooldown,
    taskArgs.expiration,
    overrides
  );
  await module.deployed();
  console.log("Module deployed to:", module.address);

  // Wait for few confirmed transactions.
  // Otherwise the etherscan api doesn't find the deployed contract.
  console.log("waiting for tx confirmation...");
  await module.deployTransaction.wait(10);

  console.log("submitting contract for verification...");

  await hardhatRuntime.run("verify", {
    address: module.address,
    constructorArgsParams: [
      taskArgs.avatar,
      taskArgs.target,
      taskArgs.oracle,
      `${taskArgs.cooldown}`,
      `${taskArgs.expiration}`,
    ],
  });
  console.log("SnapshotVoting contract verified");
};

task("setup", "Provides the clearing price to an auction")
  .addParam(
    "avatar",
    "Address of the avatar (e.g. Safe)",
    undefined,
    types.string
  )
  .addParam("target", "Address of the target", undefined, types.string)
  .addParam("oracle", "Address of the oracle", undefined, types.string)
  .addParam(
    "cooldown",
    "Cooldown in seconds that should be required after a oracle provided answer",
    24 * 3600,
    types.int,
    true
  )
  .addParam(
    "expiration",
    "Time duration in seconds for which a positive answer is valid. After this time the answer is expired",
    7 * 24 * 3600,
    types.int,
    true
  )
  .addParam(
    "proxied",
    "Deploys module through proxy factory",
    false,
    types.boolean,
    true
  )
  .setAction(deployTellorModule);

task("verifyEtherscan", "Verifies the contract on etherscan")
  .addParam("module", "Address of the module", undefined, types.string)
  .addParam(
    "avatar",
    "Address of the avatar (e.g. Safe)",
    undefined,
    types.string
  )
  .addParam("target", "Address of the target", undefined, types.string)
  .addParam("oracle", "Address of the oracle", undefined, types.string)
  .addParam(
    "cooldown",
    "Cooldown in seconds that should be required after a oracle provided answer",
    24 * 3600,
    types.int,
    true
  )
  .addParam(
    "expiration",
    "Time duration in seconds for which a positive answer is valid. After this time the answer is expired",
    7 * 24 * 3600,
    types.int,
    true
  )
  .setAction(
    async (taskArgs: TellorTaskArgs & { module: string }, hardhatRuntime) => {
      await hardhatRuntime.run("verify", {
        address: taskArgs.module,
        constructorArgsParams: [
          taskArgs.avatar,
          taskArgs.target,
          taskArgs.oracle,
          `${taskArgs.cooldown}`,
          `${taskArgs.expiration}`,
        ],
      });
    }
  );

export {};
