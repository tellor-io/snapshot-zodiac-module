import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const FIRST_ADDRESS = "0x0000000000000000000000000000000000000001";

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  const { deploy } = deployments;
  const args = [
    FIRST_ADDRESS,
    FIRST_ADDRESS,
    FIRST_ADDRESS,
    0,
    60,
  ];

  await deploy("TellorModule", {
    from: deployer,
    args,
    log: true,
    deterministicDeployment: true,
  });
};

deploy.tags = ["zodiac-module-tellor"];
export default deploy;
