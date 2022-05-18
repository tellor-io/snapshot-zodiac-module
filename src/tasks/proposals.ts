import "hardhat-deploy";
import "@nomiclabs/hardhat-ethers";
import { Contract } from "ethers";
import { task, types } from "hardhat/config";
import { readFileSync } from "fs";
import dotenv from "dotenv";

dotenv.config()

interface Proposal {
    id: string,
    txs: ModuleTransaction[]
}

interface ExtendedProposal extends Proposal {
    txsHashes: string[]
}

interface ModuleTransaction {
    to: string,
    value: string,
    data: string,
    operation: number,
    nonce: number
}

const getProposalDetails = async (module: Contract, path: string): Promise<ExtendedProposal> => {
    const proposal: Proposal = JSON.parse(readFileSync(path, "utf-8"))
    const txsHashes = await Promise.all(proposal.txs.map(async (tx, index) => {
        return await module.getTransactionHash(tx.to, tx.value, tx.data, tx.operation, index)
    }));
    return {
        ...proposal,
        txsHashes
    }
}

task("addProposal", "Adds a proposal")
        .addParam("module", "Address of the module", undefined, types.string)
        .setAction(async (taskArgs, hardhatRuntime) => {
            const ethers = hardhatRuntime.ethers;
            const Module = await ethers.getContractFactory("TellorModule");
            const module = await Module.attach(taskArgs.module);

            const id = 1;
            const tx = {
              to: process.env.ADDRESS,
              value: 1 * 10 ** 18, //1 eth
              data:"0x",
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
            const tx1 = await module.addProposal(id, [txHash]);
            console.log("Transaction:", tx1.hash);
        });

task("showProposal", "Shows proposal details")
        .addParam("module", "Address of the module", undefined, types.string)
        .addParam("proposalFile", "File with proposal information json", undefined, types.inputFile)
        .setAction(async (taskArgs, hardhatRuntime) => {
            const ethers = hardhatRuntime.ethers;
            const Module = await ethers.getContractFactory("TellorModule");
            const module = await Module.attach(taskArgs.module);

            const proposal = await getProposalDetails(module, taskArgs.proposalFile);

            const txHashesImages = ethers.utils.solidityPack(["bytes32[]"], [proposal.txsHashes])
            const txHashesHash = ethers.utils.keccak256(txHashesImages)

            console.log("### Proposal ####");
            console.log("ID:", proposal.id);
            console.log("Transactions hashes hash:", txHashesHash);
            console.log("Transactions hashes:", proposal.txsHashes);
            console.log("Transactions:", proposal.txs);
        });

task("executeProposal", "Executes a proposal")
        .addParam("module", "Address of the module", undefined, types.string)
        .setAction(async (taskArgs, hardhatRuntime) => {
            const ethers = hardhatRuntime.ethers;
            const Module = await ethers.getContractFactory("TellorModule");
            const module = await Module.attach(taskArgs.module);

            const id = 1;
            const tx = {
              to: process.env.ADDRESS,
              value: 1 * 10 ** 18, //1 eth
              data:"0x",
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
            const tx1 = await module.executeProposalWithIndex(
                        id, [txHash], tx.to, tx.value, tx.data,tx.operation,0
                    );
                console.log("Transaction:", tx1.hash);
        });

export { };