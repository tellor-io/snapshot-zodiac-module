import { expect } from "chai";
import hre, { deployments, ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { AbiCoder } from "ethers/lib/utils";

const FIRST_ADDRESS = "0x0000000000000000000000000000000000000001";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const saltNonce = "0xfa";

describe("Module works with factory", () => {
  const cooldown = 60;
  const expiration = 120;

  const paramsTypes = ["address", "address", "uint32", "uint32"];

  const baseSetup = deployments.createFixture(async () => {
    await deployments.fixture();
    const Factory = await hre.ethers.getContractFactory("ModuleProxyFactory");
    const TellorModule = await hre.ethers.getContractFactory("TellorModule");
    const factory = await Factory.deploy();

    const masterCopy = await TellorModule.deploy(
      FIRST_ADDRESS,
      FIRST_ADDRESS,
      ZERO_ADDRESS,
      0,
      60
    );

    return { factory, masterCopy };
  });

  it("should throw because master copy is already initialized", async () => {
    const { masterCopy } = await baseSetup();
    const [safe, oracle] = await ethers.getSigners();

    const encodedParams = new AbiCoder().encode(paramsTypes, [
      safe.address,
      safe.address,
      cooldown,
      expiration,
    ]);

    await expect(masterCopy.setUp(encodedParams)).to.be.revertedWith(
      "Initializable: contract is already initialized"
    );
  });

  it("should deploy new Tellor module proxy", async () => {
    const { factory, masterCopy } = await baseSetup();
    const [safe, oracle] = await ethers.getSigners();
    const paramsValues = [safe.address, safe.address, cooldown, expiration];
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
    expect(await newProxy.cooldown()).to.be.eq(cooldown);
    expect(await newProxy.resultExpiration()).to.be.eq(expiration);
  });
});
