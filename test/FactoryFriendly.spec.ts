import { expect } from "chai";
import hre, { deployments, ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { AbiCoder } from "ethers/lib/utils";
import { BigNumber } from "ethers";

const FIRST_ADDRESS = "0x0000000000000000000000000000000000000001";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
let tellorOracleAddress: string;

const saltNonce = "0xfa";

const {
  abi,
  bytecode,
} = require("usingtellor/artifacts/contracts/TellorPlayground.sol/TellorPlayground.json");

describe("Module works with factory", () => {
  const timeout = 60;
  const cooldown = 60;
  const expiration = 120;
  const templateId = BigNumber.from(1);

  const paramsTypes = [
    "address",
    "address",
    "address",
    "address",
    "uint32",
    "uint32",
    "uint32",
    "uint256",
    "address",
  ];

  const baseSetup = deployments.createFixture(async () => {
    await deployments.fixture();

    const TellorOracle = await ethers.getContractFactory(abi, bytecode);
    const tellorOracle = await TellorOracle.deploy();
    await tellorOracle.deployed();

    tellorOracleAddress = tellorOracle.address;

    const Factory = await hre.ethers.getContractFactory("ModuleProxyFactory");
    const TellorModule = await hre.ethers.getContractFactory("TellorModule");
    const factory = await Factory.deploy();

    const masterCopy = await TellorModule.deploy(
      FIRST_ADDRESS,
      FIRST_ADDRESS,
      FIRST_ADDRESS,
      tellorOracleAddress,
      1,
      0,
      60,
      0,
      tellorOracleAddress
    );

    return { factory, masterCopy };
  });

  it("should throw because master copy is already initialized", async () => {
    const { masterCopy } = await baseSetup();
    const [safe, oracle] = await ethers.getSigners();

    const encodedParams = new AbiCoder().encode(paramsTypes, [
      safe.address,
      safe.address,
      safe.address,
      tellorOracleAddress,
      timeout,
      cooldown,
      expiration,
      templateId,
      tellorOracleAddress,
    ]);

    await expect(masterCopy.setUp(encodedParams)).to.be.revertedWith(
      "Initializable: contract is already initialized"
    );
  });

  it("should deploy new reality module proxy", async () => {
    const { factory, masterCopy } = await baseSetup();
    const [safe, oracle] = await ethers.getSigners();
    const paramsValues = [
      safe.address,
      safe.address,
      safe.address,
      tellorOracleAddress,
      timeout,
      cooldown,
      expiration,
      templateId,
      tellorOracleAddress,
    ];
    const encodedParams = [new AbiCoder().encode(paramsTypes, paramsValues)];
    const initParams = masterCopy.interface.encodeFunctionData(
      "setUp",
      encodedParams
    );
    const receipt = await factory
      .deployModule(masterCopy.address, initParams, saltNonce)
      .then((tx: any) => tx.wait());

    // retrieve new address from event
    const {
      args: [newProxyAddress],
    } = receipt.events.find(
      ({ event }: { event: string }) => event === "ModuleProxyCreation"
    );

    const newProxy = await hre.ethers.getContractAt(
      "TellorModule",
      newProxyAddress
    );
    expect(await newProxy.questionTimeout()).to.be.eq(timeout);
    expect(await newProxy.questionCooldown()).to.be.eq(cooldown);
    expect(await newProxy.answerExpiration()).to.be.eq(expiration);
    expect(await newProxy.template()).to.be.eq(BigNumber.from(templateId));
  });
});
