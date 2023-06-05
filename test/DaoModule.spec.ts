import { expect } from "chai";
import hre, { deployments, ethers, waffle } from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { buildMockInitializerParams } from "./utils";
import { _TypedDataEncoder } from "@ethersproject/hash";
import { keccak256 } from "ethers/lib/utils";
const h = require("usingtellor/test/helpers/helpers.js");

const abiCoder = new ethers.utils.AbiCoder();

const {
  abi,
  bytecode,
} = require("usingtellor/artifacts/contracts/TellorPlayground.sol/TellorPlayground.json");

const EIP712_TYPES = {
  Transaction: [
    {
      name: "to",
      type: "address",
    },
    {
      name: "value",
      type: "uint256",
    },
    {
      name: "data",
      type: "bytes",
    },
    {
      name: "operation",
      type: "uint8",
    },
    {
      name: "nonce",
      type: "uint256",
    },
  ],
};

const INVALIDATED_STATE =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const ZERO_STATE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const OWNER_ADDRESS = "0x0000000000000000000000000000000000000001";

describe("TellorModuleERC20", async () => {
  const baseSetup = deployments.createFixture(async () => {
    await deployments.fixture();
    const Avatar = await hre.ethers.getContractFactory("TestAvatar");
    const avatar = await Avatar.deploy();
    const Mock = await hre.ethers.getContractFactory("MockContract");
    const mock = await Mock.deploy();

    const Oracle = await ethers.getContractFactory(abi, bytecode);
    const oracle = await Oracle.deploy();
    await oracle.deployed();

    return { Avatar, avatar, module, mock, oracle };
  });

  const setupTestWithTestAvatar = deployments.createFixture(async () => {
    const base = await baseSetup();
    const Module = await hre.ethers.getContractFactory("TellorModule");
    const module = await Module.deploy(
      OWNER_ADDRESS,
      base.avatar.address,
      base.avatar.address,
      base.oracle.address,
      23,
      0
    );
    return { ...base, Module, module };
  });

  const setupTestWithTestAvatarExpire90 = deployments.createFixture(
    async () => {
      const base = await baseSetup();
      const Module = await hre.ethers.getContractFactory("TellorModule");
      const module = await Module.deploy(
        OWNER_ADDRESS,
        base.avatar.address,
        base.avatar.address,
        base.oracle.address,
        23,
        90
      );
      return { ...base, Module, module };
    }
  );

  const setupTestWithMockAvatar = deployments.createFixture(async () => {
    const base = await baseSetup();
    const Module = await hre.ethers.getContractFactory("TellorModule");
    const module = await Module.deploy(
      OWNER_ADDRESS,
      base.mock.address,
      base.mock.address,
      base.oracle.address,
      23,
      0
    );
    return { ...base, Module, module };
  });
  const [user1] = waffle.provider.getWallets();

  const getQueryDataArgs = (proposalId: string, txHashes: string[], module: string) => {
    const encodedTxHashes = abiCoder.encode(["bytes32[]"], [txHashes]);
    const superHash = keccak256(encodedTxHashes);
    const encoded = abiCoder.encode(
      ["string", "bytes32", "address"],
      [proposalId, superHash, module]
    )
    return encoded;
  }

  describe("setUp", async () => {
    it("throws if is already initialized", async () => {
      const { mock } = await baseSetup();
      const Module = await hre.ethers.getContractFactory("TellorModule");
      const module = await Module.deploy(
        OWNER_ADDRESS,
        user1.address,
        user1.address,
        user1.address,
        23,
        0
      );
      await expect(
        module.setUp(buildMockInitializerParams(mock))
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("throws if avatar is zero address", async () => {
      const Module = await hre.ethers.getContractFactory("TellorModule");
      await expect(
        Module.deploy(OWNER_ADDRESS, ZERO_ADDRESS, user1.address, user1.address, 23, 0)
      ).to.be.revertedWith("Avatar can not be zero address");
    });

    it("throws if avatar is zero address", async () => {
      const Module = await hre.ethers.getContractFactory("TellorModule");
      await expect(
        Module.deploy(OWNER_ADDRESS, user1.address, ZERO_ADDRESS, user1.address, 23, 0)
      ).to.be.revertedWith("Target can not be zero address");
    });

    it("throws if not enough time between cooldown and expiration", async () => {
      const Module = await hre.ethers.getContractFactory("TellorModule");
      await expect(
        Module.deploy(OWNER_ADDRESS, user1.address, user1.address, user1.address, 0, 59)
      ).to.be.revertedWith(
        "There need to be at least 60s between end of cooldown and expiration"
      );
    });

    it("result expiration can be 0", async () => {
      const Module = await hre.ethers.getContractFactory("TellorModule");
      await Module.deploy(OWNER_ADDRESS, user1.address, user1.address, user1.address, 10, 0);
    });

    it("should emit event because of successful set up", async () => {
      const Module = await hre.ethers.getContractFactory("TellorModule");
      const module = await Module.deploy(
        OWNER_ADDRESS,
        user1.address,
        user1.address,
        user1.address,
        10,
        0
      );
      await module.deployed();
      await expect(module.deployTransaction)
        .to.emit(module, "TellorModuleSetup")
        .withArgs(user1.address, user1.address, user1.address);
    });
  });

  describe("markProposalWithExpiredResultAsInvalid", async () => {
    it("throws if result cannot expire", async () => {
      const { module } = await setupTestWithTestAvatar();

      const id = "some_random_id";
      const txHash = ethers.utils.solidityKeccak256(
        ["string"],
        ["some_tx_data"]
      );
      const proposal = await module.buildProposal(id, [txHash]);
      const proposalHash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(proposal)
      );

      await expect(
        module.markProposalWithExpiredResultAsInvalid(proposalHash)
      ).to.be.revertedWith("Results are valid forever");
    });

    it("throws if proposal is unknown", async () => {
      const { module, avatar } = await setupTestWithTestAvatarExpire90();

      const id = "some_random_id";
      const txHash = ethers.utils.solidityKeccak256(
        ["string"],
        ["some_tx_data"]
      );
      const proposal = await module.buildProposal(id, [txHash]);
      const proposalHash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(proposal)
      );

      await expect(
        module.markProposalWithExpiredResultAsInvalid(proposalHash)
      ).to.be.revertedWith("No query id set for provided proposal");
    });

    it("throws if result was not accepted", async () => {
      const { mock, module, avatar, oracle } =
        await setupTestWithTestAvatarExpire90();

      const id = "some_random_id";
      const tx = {
        to: user1.address,
        value: 0,
        data: "0xbaddad",
        operation: 0,
        nonce: 0,
      };
      const txHash = await module.getTransactionHash(
        tx.to,
        tx.value,
        tx.data,
        tx.operation,
        tx.nonce
      );
      const proposal = await module.buildProposal(id, [txHash]);
      const queryId = await module.getQueryId(id, [txHash]);

      const proposalHash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(proposal)
      );

      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        queryId
      );
      await mock.givenMethodReturnUint(
        module.interface.getSighash("getDataBefore"),
        INVALIDATED_STATE
      );
      await module.addProposal(id, [txHash]);

      // submit to the oracle first
      const queryDataArgs = getQueryDataArgs(id, [txHash], module.address);
      const queryData = abiCoder.encode(
        ["string", "bytes"],
        ["Snapshot", queryDataArgs]
      );

      await oracle.submitValue(
        queryId,
        abiCoder.encode(["bool"], [false]),
        0,
        queryData
      );

      await expect(
        module.markProposalWithExpiredResultAsInvalid(proposalHash)
      ).to.be.revertedWith("Transaction was not approved");
    });

    it("throws if result is not expired", async () => {
      const { mock, module, avatar, oracle } =
        await setupTestWithTestAvatarExpire90();

      const id = "some_random_id";
      const tx = {
        to: user1.address,
        value: 0,
        data: "0xbaddad",
        operation: 0,
        nonce: 0,
      };
      const txHash = await module.getTransactionHash(
        tx.to,
        tx.value,
        tx.data,
        tx.operation,
        tx.nonce
      );
      const proposal = await module.buildProposal(id, [txHash]);
      const queryId = await module.getQueryId(id, [txHash]);

      const proposalHash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(proposal)
      );

      const block = await ethers.provider.getBlock("latest");
      await mock.givenMethodReturnUint(
        oracle.interface.getSighash("getTimestampbyQueryIdandIndex"),
        block.timestamp
      );
      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        queryId
      );

      await mock.givenMethodReturnBool(
        module.interface.getSighash("getDataBefore"),
        true
      );
      await module.addProposal(id, [txHash]);

      //submit to the oracle first
      const queryDataArgs = getQueryDataArgs(id, [txHash], module.address);
      const queryData = abiCoder.encode(
        ["string", "bytes"],
        ["Snapshot", queryDataArgs]
      );

      await oracle.submitValue(
        queryId,
        abiCoder.encode(["bool"], [true]),
        0,
        queryData
      );

      await expect(
        module.markProposalWithExpiredResultAsInvalid(proposalHash)
      ).to.be.revertedWith("Result has not expired yet");
    });

    it("can mark proposal with expired accepted result as invalid", async () => {
      const { mock, module, avatar, oracle } =
        await setupTestWithTestAvatarExpire90();

      const id = "some_random_id";
      const tx = {
        to: user1.address,
        value: 0,
        data: "0xbaddad",
        operation: 0,
        nonce: 0,
      };
      const txHash = await module.getTransactionHash(
        tx.to,
        tx.value,
        tx.data,
        tx.operation,
        tx.nonce
      );
      const proposal = await module.buildProposal(id, [txHash]);
      const queryId = await module.getQueryId(id, [txHash]);

      const proposalHash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(proposal)
      );

      const block = await ethers.provider.getBlock("latest");
      await mock.givenMethodReturnUint(
        oracle.interface.getSighash("getTimestampbyQueryIdandIndex"),
        block.timestamp
      );
      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        queryId
      );
      await mock.givenMethodReturnBool(
        module.interface.getSighash("getDataBefore"),
        true
      );

      //submit to the oracle first
      const queryDataArgs = getQueryDataArgs(id, [txHash], module.address);
      const queryData = abiCoder.encode(
        ["string", "bytes"],
        ["Snapshot", queryDataArgs]
      );

      await oracle.submitValue(
        queryId,
        abiCoder.encode(["bool"], [true]),
        0,
        queryData
      );

      await module.addProposal(id, [txHash]);

      await h.advanceTime(91);

      await module.markProposalWithExpiredResultAsInvalid(proposalHash);
      expect(await module.queryIds(proposalHash)).to.be.deep.equals(
        INVALIDATED_STATE
      );
    });
  });

  describe("getTransactionHash", async () => {
    it("correctly generates hash for tx without data", async () => {
      const { module } = await setupTestWithTestAvatar();
      const chainId = await module.getChainId();
      const domain = {
        chainId: chainId,
        verifyingContract: module.address,
      };
      const tx = {
        to: user1.address,
        value: 0,
        data: "0x",
        operation: 0,
        nonce: 0,
      };
      expect(
        await module.getTransactionHash(
          tx.to,
          tx.value,
          tx.data,
          tx.operation,
          tx.nonce
        )
      ).to.be.equals(_TypedDataEncoder.hash(domain, EIP712_TYPES, tx));
    });

    it("correctly generates hash for complex tx", async () => {
      const { module } = await setupTestWithTestAvatar();
      const chainId = await module.getChainId();
      const domain = {
        chainId: chainId,
        verifyingContract: module.address,
      };
      const tx = {
        to: user1.address,
        value: 23,
        data: "0xbaddad",
        operation: 1,
        nonce: 13,
      };
      expect(
        await module.getTransactionHash(
          tx.to,
          tx.value,
          tx.data,
          tx.operation,
          tx.nonce
        )
      ).to.be.equals(_TypedDataEncoder.hash(domain, EIP712_TYPES, tx));
    });
  });

  describe("buildProposal", async () => {
    it("concatenates id and hashed hashes as ascii strings", async () => {
      const { module } = await setupTestWithTestAvatar();
      const id = "some_random_id";
      const tx1Hash = ethers.utils.solidityKeccak256(
        ["string"],
        ["some_tx_data"]
      );
      const tx2Hash = ethers.utils.solidityKeccak256(
        ["string"],
        ["some_other_tx_data"]
      );
      const hashesHash = ethers.utils
        .solidityKeccak256(["bytes32[]"], [[tx1Hash, tx2Hash]])
        .slice(2);
      expect(await module.buildProposal(id, [tx1Hash, tx2Hash])).to.be.equals(
        `${id}␟${hashesHash}`
      );
    });
  });

  describe("addProposal", async () => {
    it("throws if proposal was already submitted", async () => {
      const { module, mock, oracle, avatar } = await setupTestWithTestAvatar();
      const id = "some_random_id";
      const txHash = ethers.utils.solidityKeccak256(
        ["string"],
        ["some_tx_data"]
      );

      const queryId = await module.getQueryId(id, [txHash]);

      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        queryId
      );

      await module.addProposal(id, [txHash]);

      await expect(module.addProposal(id, [txHash])).to.be.revertedWith(
        "Proposal has already been submitted"
      );
    });

    it("throws if proposal was already submitted when proposal params were different", async () => {
      const { module, mock, oracle, avatar } = await setupTestWithTestAvatar();
      const id = "some_random_id";
      const txHash = ethers.utils.solidityKeccak256(
        ["string"],
        ["some_tx_data"]
      );

      const queryId = await module.getQueryId(id, [txHash]);

      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        queryId
      );

      await module.addProposal(id, [txHash]);

      await expect(module.addProposal(id, [txHash])).to.be.revertedWith(
        "Proposal has already been submitted"
      );
    });

    it("calls askQuestionWithMinBondERC20 with correct data", async () => {
      const { module, mock, oracle, avatar } = await setupTestWithTestAvatar();
      const id = "some_random_id";
      const txHash = ethers.utils.solidityKeccak256(
        ["string"],
        ["some_tx_data"]
      );

      const proposal = await module.buildProposal(id, [txHash]);
      const queryId = await module.getQueryId(id, [txHash]);

      const proposalHash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(proposal)
      );
      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        queryId
      );

      //submit to the oracle first
      const queryDataArgs = getQueryDataArgs(id, [txHash], module.address);
      const queryData = abiCoder.encode(
        ["string", "bytes"],
        ["Snapshot", queryDataArgs]
      );

      await oracle.submitValue(
        queryId,
        abiCoder.encode(["bool"], [true]),
        0,
        queryData
      );

      await expect(module.addProposal(id, [txHash]))
        .to.emit(module, "ProposalAdded")
        .withArgs(queryId, id);

      expect(await module.queryIds(proposalHash)).to.be.deep.equals(queryId);
    });
  });

  it("calls askQuestionWithMinBondERC20 with correct data when minimum bond is set", async () => {
    const { module, mock, oracle, avatar } = await setupTestWithTestAvatar();
    const id = "some_random_id";
    const txHash = ethers.utils.solidityKeccak256(["string"], ["some_tx_data"]);

    const proposal = await module.buildProposal(id, [txHash]);
    const queryId = await module.getQueryId(id, [txHash]);
    const proposalHash = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(proposal)
    );
    await mock.givenMethodReturnUint(
      module.interface.getSighash("getQueryId"),
      queryId
    );

    await expect(module.addProposal(id, [txHash]))
      .to.emit(module, "ProposalAdded")
      .withArgs(queryId, id);

    expect(await module.queryIds(proposalHash)).to.be.deep.equals(queryId);
  });

  describe("addProposalWithNonce", async () => {
    it("throws if previous nonce was not invalid", async () => {
      const { module, mock, oracle } = await setupTestWithTestAvatar();
      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        42
      );
      const id = "some_random_id";
      const txHash = ethers.utils.solidityKeccak256(
        ["string"],
        ["some_tx_data"]
      );
      const previousQueryId = await module.getQueryId(id, [txHash]);
      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        previousQueryId
      );
      await module.addProposal(id, [txHash]);
    });

    it("calls askQuestionWithMinBondERC20 with correct data", async () => {
      const { module, mock, oracle, avatar } = await setupTestWithTestAvatar();
      const id = "some_random_id";
      const txHash = ethers.utils.solidityKeccak256(
        ["string"],
        ["some_tx_data"]
      );

      const proposal = await module.buildProposal(id, [txHash]);
      const queryId = await module.getQueryId(id, [txHash]);
      const proposalHash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(proposal)
      );
      const previousQueryId = await module.getQueryId(id, [txHash]);
      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        previousQueryId
      );

      //submit to the oracle first
      const queryDataArgs = getQueryDataArgs(id, [txHash], module.address);
      const queryData = abiCoder.encode(
        ["string", "bytes"],
        ["Snapshot", queryDataArgs]
      );

      await oracle.submitValue(
        queryId,
        abiCoder.encode(["bool"], [true]),
        0,
        queryData
      );

      await module.addProposal(id, [txHash]);

      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        queryId
      );

      expect(await module.queryIds(proposalHash)).to.be.deep.equals(queryId);
    });

    it("can invalidate after proposal param change", async () => {
      const { module, mock, oracle, avatar } = await setupTestWithTestAvatar();
      const id = "some_random_id";
      const txHash = ethers.utils.solidityKeccak256(
        ["string"],
        ["some_tx_data"]
      );

      const proposal = await module.buildProposal(id, [txHash]);
      const proposalHash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(proposal)
      );
      const previousQueryId = await module.getQueryId(id, [txHash]);
      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        previousQueryId
      );

      await module.addProposal(id, [txHash]);

      const queryId = await module.getQueryId(id, [txHash]);
      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        queryId
      );

      const block = await ethers.provider.getBlock("latest");

      await mock.givenCalldataReturnUint(
        module.interface.encodeFunctionData("getDataBefore", [
          previousQueryId,
          block.timestamp,
        ]),
        INVALIDATED_STATE
      );

      expect(await module.queryIds(proposalHash)).to.be.deep.equals(queryId);
    });

    it("can invalidate multiple times", async () => {
      const { module, mock, oracle } = await setupTestWithTestAvatar();
      const id = "some_random_id";
      const txHash = ethers.utils.solidityKeccak256(
        ["string"],
        ["some_tx_data"]
      );

      const proposal = await module.buildProposal(id, [txHash]);
      const queryId = await module.getQueryId(id, [txHash]);
      const proposalHash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(proposal)
      );
      const previousQueryId = await module.getQueryId(id, [txHash]);
      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        previousQueryId
      );
      await module.addProposal(id, [txHash]);

      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        queryId
      );

      const block = await ethers.provider.getBlock("latest");

      await mock.givenCalldataReturnUint(
        module.interface.encodeFunctionData("getDataBefore", [
          previousQueryId,
          block.timestamp,
        ]),
        INVALIDATED_STATE
      );

      // Nonce doesn't need to increase 1 by 1
      const finalQueryId = await module.getQueryId(id, [txHash]);
      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        finalQueryId
      );
      await mock.givenCalldataReturnUint(
        module.interface.encodeFunctionData("getDataBefore", [
          queryId,
          block.timestamp,
        ]),
        INVALIDATED_STATE
      );
    });

    it("does not create proposal if previous nonce was internally invalidated", async () => {
      const { module, mock, oracle, avatar } = await setupTestWithTestAvatar();
      const id = "some_random_id";
      const txHash = ethers.utils.solidityKeccak256(
        ["string"],
        ["some_tx_data"]
      );

      const proposal = await module.buildProposal(id, [txHash]);
      const proposalHash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(proposal)
      );
      const questionIdNonce0 = await module.getQueryId(id, [txHash]);
      const questionIdNonce1 = await module.getQueryId(id, [txHash]);

      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        questionIdNonce0
      );
      const proposalParameters = [id, [txHash]];
      await module.addProposal(...proposalParameters);

      await mock.givenMethodReturnUint(
        module.interface.getSighash("getDataBefore"),
        INVALIDATED_STATE
      );

      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        questionIdNonce1
      );
    });

    it("cannot ask again if follow up was not invalidated", async () => {
      const { module, mock, oracle, avatar } = await setupTestWithTestAvatar();
      const id = "some_random_id";
      const txHash = ethers.utils.solidityKeccak256(
        ["string"],
        ["some_tx_data"]
      );

      const proposal = await module.buildProposal(id, [txHash]);
      const queryId = await module.getQueryId(id, [txHash]);
      const proposalHash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(proposal)
      );
      const previousQueryId = await module.getQueryId(id, [txHash]);
      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        previousQueryId
      );
      await module.addProposal(id, [txHash]);

      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        queryId
      );

      const block = await ethers.provider.getBlock("latest");

      await mock.givenCalldataReturnUint(
        module.interface.encodeFunctionData("getDataBefore", [
          previousQueryId,
          block.timestamp,
        ]),
        INVALIDATED_STATE
      );

      await mock.givenCalldataReturnBool(
        module.interface.encodeFunctionData("getDataBefore", [
          queryId,
          block.timestamp,
        ]),
        true
      );
    });
  });

  describe("executeProposal", async () => {
    it("throws if query id was not set", async () => {
      const { module } = await setupTestWithMockAvatar();

      const id = "some_random_id";
      const tx = {
        to: user1.address,
        value: 0,
        data: "0xbaddad",
        operation: 0,
        nonce: 0,
      };
      const txHash = await module.getTransactionHash(
        tx.to,
        tx.value,
        tx.data,
        tx.operation,
        tx.nonce
      );

      await expect(
        module.executeProposal(
          id,
          [txHash],
          tx.to,
          tx.value,
          tx.data,
          tx.operation
        )
      ).to.be.revertedWith("No query id set for provided proposal");
    });

    it("throws if tx data doesn't belong to proposal", async () => {
      const { mock, module, oracle } = await setupTestWithMockAvatar();

      const id = "some_random_id";
      const tx = {
        to: user1.address,
        value: 0,
        data: "0xbaddad",
        operation: 0,
        nonce: 1,
      };
      const txHash = await module.getTransactionHash(
        tx.to,
        tx.value,
        tx.data,
        tx.operation,
        tx.nonce
      );
      const queryId = await module.getQueryId(id, [txHash]);

      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        queryId
      );
      await module.addProposal(id, [txHash]);

      await expect(
        module.executeProposal(
          id,
          [txHash],
          tx.to,
          tx.value,
          tx.data,
          tx.operation
        )
      ).to.be.revertedWith("Unexpected transaction hash");
    });

    it("throws if tx data doesn't belong to queryId", async () => {
      const { mock, module, oracle } = await setupTestWithMockAvatar();

      const id = "some_random_id";
      const tx = {
        to: user1.address,
        value: 0,
        data: "0xbaddad",
        operation: 0,
        nonce: 0,
      };
      const txHash = await module.getTransactionHash(
        tx.to,
        tx.value,
        tx.data,
        tx.operation,
        tx.nonce
      );
      const queryId = await module.getQueryId(id, [txHash]);

      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        queryId
      );
      await module.addProposal(id, []);

      await mock.givenMethodReturnBool(
        module.interface.getSighash("getDataBefore"),
        true
      );

      await expect(
        module.executeProposal(
          id,
          [txHash],
          tx.to,
          tx.value,
          tx.data,
          tx.operation
        )
      ).to.be.revertedWith("No query id set for provided proposal");
    });

    it("throws if tx was not approved", async () => {
      const { mock, module, oracle } = await setupTestWithMockAvatar();

      const id = "some_random_id";
      const tx = {
        to: user1.address,
        value: 0,
        data: "0xbaddad",
        operation: 0,
        nonce: 0,
      };
      const txHash = await module.getTransactionHash(
        tx.to,
        tx.value,
        tx.data,
        tx.operation,
        tx.nonce
      );
      const queryId = await module.getQueryId(id, [txHash]);

      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        queryId
      );

      //submit to the oracle first
      const queryDataArgs = getQueryDataArgs(id, [txHash], module.address);
      const queryData = abiCoder.encode(
        ["string", "bytes"],
        ["Snapshot", queryDataArgs]
      );

      await oracle.submitValue(
        queryId,
        abiCoder.encode(["bool"], [false]),
        0,
        queryData
      );

      await h.advanceTime(23);

      await module.addProposal(id, [txHash]);

      await mock.givenMethodReturnBool(
        module.interface.getSighash("getDataBefore"),
        false
      );

      await expect(
        module.executeProposal(
          id,
          [txHash],
          tx.to,
          tx.value,
          tx.data,
          tx.operation
        )
      ).to.be.revertedWith("Transaction was not approved");
    });

    it("triggers module transaction when bond is high enough", async () => {
      const { avatar, mock, module, oracle } = await setupTestWithTestAvatar();

      const id = "some_random_id";
      const tx = {
        to: user1.address,
        value: 0,
        data: "0xbaddad",
        operation: 0,
        nonce: 0,
      };
      const txHash = await module.getTransactionHash(
        tx.to,
        tx.value,
        tx.data,
        tx.operation,
        tx.nonce
      );
      const proposal = await module.buildProposal(id, [txHash]);
      const queryId = await module.getQueryId(id, [txHash]);

      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        queryId
      );
      await module.addProposal(id, [txHash]);

      await avatar.setModule(module.address);

      const block = await ethers.provider.getBlock("latest");
      await mock.reset();

      await mock.givenMethodReturnBool(
        module.interface.getSighash("getDataBefore"),
        true
      );
      await mock.givenMethodReturnUint(
        oracle.interface.getSighash("getTimestampbyQueryIdandIndex"),
        block.timestamp
      );

      //submit to the oracle first
      const queryDataArgs = getQueryDataArgs(id, [txHash], module.address);
      const queryData = abiCoder.encode(
        ["string", "bytes"],
        ["Snapshot", queryDataArgs]
      );

      await oracle.submitValue(
        queryId,
        abiCoder.encode(["bool"], [true]),
        0,
        queryData
      );

      await h.advanceTime(23);

      await module.executeProposal(
        id,
        [txHash],
        tx.to,
        tx.value,
        tx.data,
        tx.operation
      );

      expect(
        await module.executedProposalTransactions(
          ethers.utils.solidityKeccak256(["string"], [proposal]),
          txHash
        )
      ).to.be.equals(true);
    });

    it("throws if oracle submission disputed", async () => {
      const { avatar, mock, module, oracle } = await setupTestWithTestAvatar();

      const id = "some_random_id";
      const tx = {
        to: user1.address,
        value: 0,
        data: "0xbaddad",
        operation: 0,
        nonce: 0,
      };
      const txHash = await module.getTransactionHash(
        tx.to,
        tx.value,
        tx.data,
        tx.operation,
        tx.nonce
      );
      const proposal = await module.buildProposal(id, [txHash]);
      const queryId = await module.getQueryId(id, [txHash]);

      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        queryId
      );
      await module.addProposal(id, [txHash]);

      await avatar.setModule(module.address);

      const block = await ethers.provider.getBlock("latest");
      await mock.reset();

      await mock.givenMethodReturnBool(
        module.interface.getSighash("getDataBefore"),
        true
      );
      await mock.givenMethodReturnUint(
        oracle.interface.getSighash("getTimestampbyQueryIdandIndex"),
        block.timestamp
      );

      //submit to the oracle first
      const queryDataArgs = getQueryDataArgs(id, [txHash], module.address);
      const queryData = abiCoder.encode(
        ["string", "bytes"],
        ["Snapshot", queryDataArgs]
      );

      await oracle.submitValue(
        queryId,
        abiCoder.encode(["bool"], [true]),
        0,
        queryData
      );

      const blocky = await h.getBlock()
      await oracle.beginDispute(queryId, blocky.timestamp)

      await h.advanceTime(23);

      await expect(
        module.executeProposal(
          id,
          [txHash],
          tx.to,
          tx.value,
          tx.data,
          tx.operation
        )
      ).to.be.revertedWith("Data not retrieved");

      expect(
        await module.executedProposalTransactions(
          ethers.utils.solidityKeccak256(["string"], [proposal]),
          txHash
        )
      ).to.be.equals(false);
    });

    it("reads nondisputed oracle submission", async () => {
      const { avatar, mock, module, oracle } = await setupTestWithTestAvatar();

      const id = "some_random_id";
      const tx = {
        to: user1.address,
        value: 0,
        data: "0xbaddad",
        operation: 0,
        nonce: 0,
      };
      const txHash = await module.getTransactionHash(
        tx.to,
        tx.value,
        tx.data,
        tx.operation,
        tx.nonce
      );
      const proposal = await module.buildProposal(id, [txHash]);
      const queryId = await module.getQueryId(id, [txHash]);

      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        queryId
      );
      await module.addProposal(id, [txHash]);

      await avatar.setModule(module.address);

      const block = await ethers.provider.getBlock("latest");
      await mock.reset();

      await mock.givenMethodReturnBool(
        module.interface.getSighash("getDataBefore"),
        true
      );
      await mock.givenMethodReturnUint(
        oracle.interface.getSighash("getTimestampbyQueryIdandIndex"),
        block.timestamp
      );

      //submit to the oracle first
      const queryDataArgs = getQueryDataArgs(id, [txHash], module.address);
      const queryData = abiCoder.encode(
        ["string", "bytes"],
        ["Snapshot", queryDataArgs]
      );

      await oracle.submitValue(
        queryId,
        abiCoder.encode(["bool"], [true]),
        0,
        queryData
      );

      await oracle.submitValue(
        queryId,
        abiCoder.encode(["bool"], [false]),
        0,
        queryData
      );

      const blocky2 = await h.getBlock()

      await oracle.beginDispute(queryId, blocky2.timestamp)

      await h.advanceTime(23);

      await module.executeProposal(
        id,
        [txHash],
        tx.to,
        tx.value,
        tx.data,
        tx.operation
      );

      expect(
        await module.executedProposalTransactions(
          ethers.utils.solidityKeccak256(["string"], [proposal]),
          txHash
        )
      ).to.be.equals(true);
    });
      
    it("throws if cooldown was not over", async () => {
      const { mock, module, oracle } = await setupTestWithMockAvatar();

      const id = "some_random_id";
      const tx = {
        to: user1.address,
        value: 0,
        data: "0xbaddad",
        operation: 0,
        nonce: 0,
      };
      const txHash = await module.getTransactionHash(
        tx.to,
        tx.value,
        tx.data,
        tx.operation,
        tx.nonce
      );
      const queryId = await module.getQueryId(id, [txHash]);

      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        queryId
      );

      //submit to the oracle first
      const queryDataArgs = getQueryDataArgs(id, [txHash], module.address);
      const queryData = abiCoder.encode(
        ["string", "bytes"],
        ["Snapshot", queryDataArgs]
      );

      await oracle.submitValue(
        queryId,
        abiCoder.encode(["bool"], [true]),
        0,
        queryData
      );

      await module.addProposal(id, [txHash]);

      const block = await ethers.provider.getBlock("latest");
      await mock.givenMethodReturnBool(
        module.interface.getSighash("getDataBefore"),
        true
      );
      await mock.givenMethodReturnUint(
        oracle.interface.getSighash("getTimestampbyQueryIdandIndex"),
        block.timestamp
      );

      await expect(
        module.executeProposal(
          id,
          [txHash],
          tx.to,
          tx.value,
          tx.data,
          tx.operation
        )
      ).to.be.revertedWith("Wait for additional cooldown");
    });

    it("throws if result expired", async () => {
      const { mock, module, oracle, avatar } =
        await setupTestWithTestAvatarExpire90();

      await user1.sendTransaction({ to: avatar.address, value: 100 });
      await avatar.setModule(module.address);

      const id = "some_random_id";
      const tx = {
        to: mock.address,
        value: 42,
        data: "0x",
        operation: 0,
        nonce: 0,
      };
      const txHash = await module.getTransactionHash(
        tx.to,
        tx.value,
        tx.data,
        tx.operation,
        tx.nonce
      );
      const queryId = await module.getQueryId(id, [txHash]);

      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        queryId
      );

      const queryDataArgs = getQueryDataArgs(id, [txHash], module.address);
      const queryData = abiCoder.encode(
        ["string", "bytes"],
        ["Snapshot", queryDataArgs]
      );

      await oracle.submitValue(
        queryId,
        abiCoder.encode(["bool"], [true]),
        0,
        queryData
      );

      await module.addProposal(id, [txHash]);
      const block = await ethers.provider.getBlock("latest");
      await mock.givenMethodReturnBool(
        module.interface.getSighash("getDataBefore"),
        true
      );
      await mock.givenMethodReturnUint(
        oracle.interface.getSighash("getTimestampbyQueryIdandIndex"),
        block.timestamp
      );
      await mock.givenMethodReturnBool(
        avatar.interface.getSighash("execTransactionFromModule"),
        true
      );
      await h.advanceTime(91);

      await expect(
        module.executeProposal(
          id,
          [txHash],
          tx.to,
          tx.value,
          tx.data,
          tx.operation
        )
      ).to.be.revertedWith("Result has expired");
    });

    it("throws if tx was already executed for that proposal", async () => {
      const { mock, module, oracle, avatar } = await setupTestWithMockAvatar();

      const id = "some_random_id";
      const tx = {
        to: user1.address,
        value: 0,
        data: "0xbaddad",
        operation: 0,
        nonce: 0,
      };
      const txHash = await module.getTransactionHash(
        tx.to,
        tx.value,
        tx.data,
        tx.operation,
        tx.nonce
      );
      const queryId = await module.getQueryId(id, [txHash]);

      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        queryId
      );

      //submit to the oracle first
      const queryDataArgs = getQueryDataArgs(id, [txHash], module.address);
      const queryData = abiCoder.encode(
        ["string", "bytes"],
        ["Snapshot", queryDataArgs]
      );

      await oracle.submitValue(
        queryId,
        abiCoder.encode(["bool"], [true]),
        0,
        queryData
      );

      await module.addProposal(id, [txHash]);
      const block = await ethers.provider.getBlock("latest");
      await mock.givenMethodReturnBool(
        module.interface.getSighash("getDataBefore"),
        true
      );
      await mock.givenMethodReturnUint(
        oracle.interface.getSighash("getTimestampbyQueryIdandIndex"),
        block.timestamp
      );
      await mock.givenMethodReturnBool(
        avatar.interface.getSighash("execTransactionFromModule"),
        true
      );
      await h.advanceTime(24);

      await module.executeProposal(
        id,
        [txHash],
        tx.to,
        tx.value,
        tx.data,
        tx.operation
      );
      await expect(
        module.executeProposal(
          id,
          [txHash],
          tx.to,
          tx.value,
          tx.data,
          tx.operation
        )
      ).to.be.revertedWith("Cannot execute transaction again");
    });

    it("throws if module transaction failed", async () => {
      const { avatar, mock, module, oracle } = await setupTestWithMockAvatar();

      const id = "some_random_id";
      const tx = {
        to: mock.address,
        value: 0,
        data: "0xbaddad",
        operation: 0,
        nonce: 0,
      };
      const txHash = await module.getTransactionHash(
        tx.to,
        tx.value,
        tx.data,
        tx.operation,
        tx.nonce
      );
      const proposal = await module.buildProposal(id, [txHash]);
      const queryId = await module.getQueryId(id, [txHash]);

      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        queryId
      );

      //submit to the oracle first
      const queryDataArgs = getQueryDataArgs(id, [txHash], module.address);
      const queryData = abiCoder.encode(
        ["string", "bytes"],
        ["Snapshot", queryDataArgs]
      );

      await oracle.submitValue(
        queryId,
        abiCoder.encode(["bool"], [true]),
        0,
        queryData
      );

      await module.addProposal(id, [txHash]);
      const block = await ethers.provider.getBlock("latest");
      await mock.givenMethodReturnBool(
        module.interface.getSighash("getDataBefore"),
        true
      );
      await mock.givenMethodReturnUint(
        oracle.interface.getSighash("getTimestampbyQueryIdandIndex"),
        block.timestamp
      );
      await mock.givenMethodReturnBool(
        avatar.interface.getSighash("execTransactionFromModule"),
        false
      );
      await h.advanceTime(24);

      await expect(
        module.executeProposalWithIndex(
          id,
          [txHash],
          tx.to,
          tx.value,
          tx.data,
          tx.operation,
          tx.nonce
        )
      ).to.be.revertedWith("Module transaction failed");
      expect(
        await module.executedProposalTransactions(
          ethers.utils.solidityKeccak256(["string"], [proposal]),
          txHash
        )
      ).to.be.equals(false);

      // Return success and check that it can be executed
      await mock.givenMethodReturnBool(
        avatar.interface.getSighash("execTransactionFromModule"),
        true
      );
      await module.executeProposalWithIndex(
        id,
        [txHash],
        tx.to,
        tx.value,
        tx.data,
        tx.operation,
        tx.nonce
      );
      expect(
        await module.executedProposalTransactions(
          ethers.utils.solidityKeccak256(["string"], [proposal]),
          txHash
        )
      ).to.be.equals(true);
    });

    it("triggers module transaction", async () => {
      const { avatar, mock, module, oracle } = await setupTestWithMockAvatar();

      const id = "some_random_id";
      const tx = {
        to: user1.address,
        value: 0,
        data: "0xbaddad",
        operation: 0,
        nonce: 0,
      };
      const txHash = await module.getTransactionHash(
        tx.to,
        tx.value,
        tx.data,
        tx.operation,
        tx.nonce
      );
      const proposal = await module.buildProposal(id, [txHash]);
      const queryId = await module.getQueryId(id, [txHash]);

      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        queryId
      );

      //submit to the oracle first
      const queryDataArgs = getQueryDataArgs(id, [txHash], module.address);
      const queryData = abiCoder.encode(
        ["string", "bytes"],
        ["Snapshot", queryDataArgs]
      );

      await oracle.submitValue(
        queryId,
        abiCoder.encode(["bool"], [true]),
        0,
        queryData
      );

      await module.addProposal(id, [txHash]);

      const block = await ethers.provider.getBlock("latest");
      await mock.reset();
      await mock.givenMethodReturnBool(
        module.interface.getSighash("getDataBefore"),
        true
      );
      await mock.givenMethodReturnUint(
        oracle.interface.getSighash("getTimestampbyQueryIdandIndex"),
        block.timestamp
      );
      await mock.givenMethodReturnBool(
        avatar.interface.getSighash("execTransactionFromModule"),
        true
      );

      await expect(
        module.executeProposal(
          id,
          [txHash],
          tx.to,
          tx.value,
          tx.data,
          tx.operation
        )
      ).to.be.revertedWith("Wait for additional cooldown");

      await h.advanceTime(24);

      await module.executeProposal(
        id,
        [txHash],
        tx.to,
        tx.value,
        tx.data,
        tx.operation
      );

      const proposalHash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(proposal)
      );
      expect(await module.queryIds(proposalHash)).to.be.deep.equals(queryId);
      expect(
        await module.executedProposalTransactions(
          ethers.utils.solidityKeccak256(["string"], [proposal]),
          txHash
        )
      ).to.be.equals(true);

      expect((await mock.callStatic.invocationCount()).toNumber()).to.be.equals(
        1
      );
      const execTransactionFromModuleCalldata =
        avatar.interface.encodeFunctionData("execTransactionFromModule", [
          tx.to,
          tx.value,
          tx.data,
          tx.operation,
        ]);
      expect(
        (
          await mock.callStatic.invocationCountForCalldata(
            execTransactionFromModuleCalldata
          )
        ).toNumber()
      ).to.be.equals(1);
    });

    it("throws if previous tx in tx array was not executed yet", async () => {
      const { mock, module, oracle } = await setupTestWithMockAvatar();

      const id = "some_random_id";
      const tx1 = {
        to: user1.address,
        value: 0,
        data: "0xbaddad",
        operation: 0,
        nonce: 0,
      };
      const tx1Hash = await module.getTransactionHash(
        tx1.to,
        tx1.value,
        tx1.data,
        tx1.operation,
        tx1.nonce
      );
      const tx2 = {
        to: user1.address,
        value: 23,
        data: "0xdeaddeed",
        operation: 0,
        nonce: 1,
      };
      const tx2Hash = await module.getTransactionHash(
        tx2.to,
        tx2.value,
        tx2.data,
        tx2.operation,
        tx2.nonce
      );
      const queryId = await module.getQueryId(id, [tx1Hash, tx2Hash]);

      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        queryId
      );

      //submit to the oracle first
      const queryDataArgs = getQueryDataArgs(id, [tx1Hash, tx2Hash], module.address);
      const queryData = abiCoder.encode(
        ["string", "bytes"],
        ["Snapshot", queryDataArgs]
      );

      await oracle.submitValue(
        queryId,
        abiCoder.encode(["bool"], [true]),
        0,
        queryData
      );

      await module.addProposal(id, [tx1Hash, tx2Hash]);
      const block = await ethers.provider.getBlock("latest");
      await mock.givenMethodReturnBool(
        module.interface.getSighash("getDataBefore"),
        true
      );
      await mock.givenMethodReturnUint(
        oracle.interface.getSighash("getTimestampbyQueryIdandIndex"),
        block.timestamp
      );
      await h.advanceTime(24);
      await expect(
        module.executeProposalWithIndex(
          id,
          [tx1Hash, tx2Hash],
          tx2.to,
          tx2.value,
          tx2.data,
          tx2.operation,
          tx2.nonce
        )
      ).to.be.revertedWith("Previous transaction not executed yet");
    });

    it("allows to execute the transactions in different blocks", async () => {
      const { avatar, mock, module, oracle } = await setupTestWithMockAvatar();

      const id = "some_random_id";
      const tx1 = {
        to: user1.address,
        value: 0,
        data: "0xbaddad",
        operation: 0,
        nonce: 0,
      };
      const tx1Hash = await module.getTransactionHash(
        tx1.to,
        tx1.value,
        tx1.data,
        tx1.operation,
        tx1.nonce
      );
      const tx2 = {
        to: user1.address,
        value: 23,
        data: "0xdeaddeed",
        operation: 0,
        nonce: 1,
      };
      const tx2Hash = await module.getTransactionHash(
        tx2.to,
        tx2.value,
        tx2.data,
        tx2.operation,
        tx2.nonce
      );
      const proposal = await module.buildProposal(id, [tx1Hash, tx2Hash]);
      const queryId = await module.getQueryId(id, [tx1Hash, tx2Hash]);

      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        queryId
      );

      //submit to the oracle first
      const queryDataArgs = getQueryDataArgs(id, [tx1Hash, tx2Hash], module.address);
      const queryData = abiCoder.encode(
        ["string", "bytes"],
        ["Snapshot", queryDataArgs]
      );

      await oracle.submitValue(
        queryId,
        abiCoder.encode(["bool"], [true]),
        0,
        queryData
      );

      await module.addProposal(id, [tx1Hash, tx2Hash]);
      const block = await ethers.provider.getBlock("latest");
      await mock.reset();
      await mock.givenMethodReturnBool(
        module.interface.getSighash("getDataBefore"),
        true
      );
      await mock.givenMethodReturnUint(
        oracle.interface.getSighash("getTimestampbyQueryIdandIndex"),
        block.timestamp
      );
      await mock.givenMethodReturnBool(
        avatar.interface.getSighash("execTransactionFromModule"),
        true
      );
      await h.advanceTime(24);

      await module.executeProposal(
        id,
        [tx1Hash, tx2Hash],
        tx1.to,
        tx1.value,
        tx1.data,
        tx1.operation
      );

      expect(
        await module.executedProposalTransactions(
          ethers.utils.solidityKeccak256(["string"], [proposal]),
          tx1Hash
        )
      ).to.be.equals(true);

      const execTransaction1FromModuleCalldata =
        avatar.interface.encodeFunctionData("execTransactionFromModule", [
          tx1.to,
          tx1.value,
          tx1.data,
          tx1.operation,
        ]);
      expect(
        (
          await mock.callStatic.invocationCountForCalldata(
            execTransaction1FromModuleCalldata
          )
        ).toNumber()
      ).to.be.equals(1);

      await module.executeProposalWithIndex(
        id,
        [tx1Hash, tx2Hash],
        tx2.to,
        tx2.value,
        tx2.data,
        tx2.operation,
        tx2.nonce
      );

      expect(
        await module.executedProposalTransactions(
          ethers.utils.solidityKeccak256(["string"], [proposal]),
          tx2Hash
        )
      ).to.be.equals(true);
      const execTransaction2FromModuleCalldata =
        avatar.interface.encodeFunctionData("execTransactionFromModule", [
          tx2.to,
          tx2.value,
          tx2.data,
          tx2.operation,
        ]);
      expect(
        (
          await mock.callStatic.invocationCountForCalldata(
            execTransaction2FromModuleCalldata
          )
        ).toNumber()
      ).to.be.equals(1);

      expect((await mock.callStatic.invocationCount()).toNumber()).to.be.equals(
        2
      );
    });

    it("allows to send same tx (with different nonce) multiple times in proposal", async () => {
      const { avatar, mock, module, oracle } = await setupTestWithMockAvatar();

      const id = "some_random_id";
      const tx1 = {
        to: user1.address,
        value: 0,
        data: "0xbaddad",
        operation: 0,
        nonce: 0,
      };
      const tx1Hash = await module.getTransactionHash(
        tx1.to,
        tx1.value,
        tx1.data,
        tx1.operation,
        tx1.nonce
      );
      const tx2 = { ...tx1, nonce: 1 };
      const tx2Hash = await module.getTransactionHash(
        tx2.to,
        tx2.value,
        tx2.data,
        tx2.operation,
        tx2.nonce
      );

      expect(tx1Hash).to.be.not.equals(tx2Hash);

      const proposal = await module.buildProposal(id, [tx1Hash, tx2Hash]);
      const queryId = await module.getQueryId(id, [tx1Hash, tx2Hash]);

      await mock.givenMethodReturnUint(
        module.interface.getSighash("getQueryId"),
        queryId
      );

      // submit to the oracle first
      const queryDataArgs = getQueryDataArgs(id, [tx1Hash, tx2Hash], module.address);
      const queryData = abiCoder.encode(
        ["string", "bytes"],
        ["Snapshot", queryDataArgs]
      );

      await oracle.submitValue(
        queryId,
        abiCoder.encode(["bool"], [true]),
        0,
        queryData
      );

      await module.addProposal(id, [tx1Hash, tx2Hash]);
      const block = await ethers.provider.getBlock("latest");
      await mock.reset();
      await mock.givenMethodReturnBool(
        module.interface.getSighash("getDataBefore"),
        true
      );
      await mock.givenMethodReturnUint(
        oracle.interface.getSighash("getTimestampbyQueryIdandIndex"),
        block.timestamp
      );
      await mock.givenMethodReturnBool(
        avatar.interface.getSighash("execTransactionFromModule"),
        true
      );
      await h.advanceTime(24);

      await module.executeProposal(
        id,
        [tx1Hash, tx2Hash],
        tx1.to,
        tx1.value,
        tx1.data,
        tx1.operation
      );

      expect(
        await module.executedProposalTransactions(
          ethers.utils.solidityKeccak256(["string"], [proposal]),
          tx1Hash
        )
      ).to.be.equals(true);

      const execTransactionFromModuleCalldata =
        avatar.interface.encodeFunctionData("execTransactionFromModule", [
          tx1.to,
          tx1.value,
          tx1.data,
          tx1.operation,
        ]);
      expect(
        (
          await mock.callStatic.invocationCountForCalldata(
            execTransactionFromModuleCalldata
          )
        ).toNumber()
      ).to.be.equals(1);

      await module.executeProposalWithIndex(
        id,
        [tx1Hash, tx2Hash],
        tx2.to,
        tx2.value,
        tx2.data,
        tx2.operation,
        tx2.nonce
      );

      expect(
        await module.executedProposalTransactions(
          ethers.utils.solidityKeccak256(["string"], [proposal]),
          tx2Hash
        )
      ).to.be.equals(true);
      expect(
        (
          await mock.callStatic.invocationCountForCalldata(
            execTransactionFromModuleCalldata
          )
        ).toNumber()
      ).to.be.equals(2);

      expect((await mock.callStatic.invocationCount()).toNumber()).to.be.equals(
        2
      );
    });
    
  });

});
