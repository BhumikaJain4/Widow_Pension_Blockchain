require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true }
  },
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    hardhat: {
      chainId: 31337,
      accounts: {
        count: 10,
        accountsBalance: "100000000000000000000" // 100 ETH each
      }
    }
  },
  paths: {
    sources: "./allcontracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};
