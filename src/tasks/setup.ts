import "hardhat-deploy";
import "@nomiclabs/hardhat-ethers";
import { task, types } from "hardhat/config";
import { deployAndSetUpModule } from "@gnosis.pm/zodiac";
import defaultTemplate from "./defaultTemplate.json";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Contract } from "ethers";

const {
  abi,
  bytecode,
} = require("usingtellor/artifacts/contracts/TellorPlayground.sol/TellorPlayground.json");

interface TellorTaskArgs {
  owner: string;
  avatar: string;
  target: string;
  timeout: string;
  cooldown: string;
  expiration: string;
  proxied: boolean;
}

let tellorOracle: Contract;

const deployTellorModule = async (
  taskArgs: TellorTaskArgs,
  hardhatRuntime: HardhatRuntimeEnvironment
) => {
  const [caller] = await hardhatRuntime.ethers.getSigners();
  console.log("Using the account:", caller.address);

  let TellorOracle = await hardhatRuntime.ethers.getContractFactory(
    abi,
    bytecode
  );
  tellorOracle = await TellorOracle.deploy();
  await tellorOracle.deployed();

  if (taskArgs.proxied) {
    const chainId = await hardhatRuntime.getChainId();
    const module = "tellor";
    const { transaction } = deployAndSetUpModule(
      module,
      {
        types: [
          "address",
          "address",
          "address",
          "address",
          "uint32",
          "uint32",
          "uint32",
        ],
        values: [
          taskArgs.owner,
          taskArgs.avatar,
          taskArgs.target,
          tellorOracle.address,
          taskArgs.timeout,
          taskArgs.cooldown,
          taskArgs.expiration,
        ],
      },
      hardhatRuntime.ethers.provider,
      Number(chainId),
      Date.now().toString()
    );
    const deploymentTransaction = await caller.sendTransaction(transaction);
    const receipt = await deploymentTransaction.wait();
    console.log("Module deployed to:", receipt.logs[1].address);
    return;
  }

  const ModuleName = "TellorModule";
  const Module = await hardhatRuntime.ethers.getContractFactory(ModuleName);
  const module = await Module.deploy(
    taskArgs.owner,
    taskArgs.avatar,
    taskArgs.target,
    tellorOracle.address,
    taskArgs.timeout,
    taskArgs.cooldown,
    taskArgs.expiration
  );
  await module.deployTransaction.wait();
  console.log("Module deployed to:", module.address);

  // Wait for few confirmed transactions.
  // Otherwise the etherscan api doesn't find the deployed contract.
  console.log("waiting for tx confirmation...");
  await module.deployTransaction.wait(5);

  console.log("submitting contract for verification...");


  await hardhatRuntime.run("verify", {
    address: module.address,
    constructorArgsParams: [
      taskArgs.owner,
      taskArgs.avatar,
      taskArgs.target,
      tellorOracle.address,
      `${taskArgs.timeout}`,
      `${taskArgs.cooldown}`,
      `${taskArgs.expiration}`,
    ],
  });
  console.log("SnapshotVoting contract verified");
};

task("setup", "Provides the clearing price to an auction")
  .addParam("owner", "Address of the owner", undefined, types.string)
  .addParam(
    "avatar",
    "Address of the avatar (e.g. Safe)",
    undefined,
    types.string
  )
  .addParam("target", "Address of the target", undefined, types.string)
  // .addParam(
  //   "oracle",
  //   "Address of the oracle (e.g. Realitio)",
  //   undefined,
  //   types.string
  // )
  .addParam(
    "timeout",
    "Timeout in seconds that should be required for the oracle",
    48 * 3600,
    types.int,
    true
  )
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
  .addParam("owner", "Address of the owner", undefined, types.string)
  .addParam(
    "avatar",
    "Address of the avatar (e.g. Safe)",
    undefined,
    types.string
  )
  .addParam("target", "Address of the target", undefined, types.string)
  // .addParam(
  //   "oracle",
  //   "Address of the oracle (e.g. Realitio)",
  //   undefined,
  //   types.string
  // )
  // .addParam(
  //   "template",
  //   "Template that should be used for proposal questions (See https://github.com/realitio/realitio-dapp#structuring-and-fetching-information)",
  //   undefined,
  //   types.string
  // )
  .addParam(
    "timeout",
    "Timeout in seconds that should be required for the oracle",
    48 * 3600,
    types.int,
    true
  )
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
          taskArgs.owner,
          taskArgs.avatar,
          taskArgs.target,
          tellorOracle.address,
          // taskArgs.oracle,
          `${taskArgs.timeout}`,
          `${taskArgs.cooldown}`,
          `${taskArgs.expiration}`,
        ],
      });
    }
  );

task("createDaoTemplate", "Creates a question template on the oracle address")
  .addParam(
    "oracle",
    "Address of the oracle (e.g. RealitioV3)",
    undefined,
    types.string
  )
  .addParam(
    "template",
    "Template string for question (should include placeholders for proposal id and txs hash)",
    JSON.stringify(defaultTemplate),
    types.string,
    true
  )
  .setAction(async (taskArgs, hardhatRuntime) => {
    const [caller] = await hardhatRuntime.ethers.getSigners();
    console.log("Using the account:", caller.address);
    const oracle = await hardhatRuntime.ethers.getContractAt(
      "RealitioV3",
      taskArgs.oracle
    );
    const receipt = await oracle
      .createTemplate(taskArgs.template)
      .then((tx: any) => tx.wait());
    const id = receipt.logs[0].topics[1];
    console.log("Template id:", id);
  });

export {};
