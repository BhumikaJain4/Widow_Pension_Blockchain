const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer, validator1, validator2, validator3, treasury, applicant] = await hre.ethers.getSigners();

  console.log("=".repeat(60));
  console.log("  Widow Pension DApp — Contract Deployment");
  console.log("=".repeat(60));
  console.log(`\nDeployer:   ${deployer.address}`);
  console.log(`Validator1: ${validator1.address}`);
  console.log(`Validator2: ${validator2.address}`);
  console.log(`Validator3: ${validator3.address}`);
  console.log(`Treasury:   ${treasury.address}`);
  console.log(`Applicant:  ${applicant.address}\n`);

  // ── 1. RoleAccess ─────────────────────────────────────────
  console.log("1. Deploying RoleAccess...");
  const RoleAccess = await hre.ethers.getContractFactory("RoleAccess");
  const roleAccess = await RoleAccess.deploy();
  await roleAccess.waitForDeployment();
  console.log(`   ✓ RoleAccess: ${await roleAccess.getAddress()}`);

  // ── 2. SchemeConfig ───────────────────────────────────────
  console.log("2. Deploying SchemeConfig...");
  const SchemeConfig = await hre.ethers.getContractFactory("SchemeConfig");
  const schemeConfig = await SchemeConfig.deploy(await roleAccess.getAddress());
  await schemeConfig.waitForDeployment();
  console.log(`   ✓ SchemeConfig: ${await schemeConfig.getAddress()}`);

  // ── 3. AuditLog ───────────────────────────────────────────
  console.log("3. Deploying AuditLog...");
  const AuditLog = await hre.ethers.getContractFactory("AuditLog");
  const auditLog = await AuditLog.deploy(await roleAccess.getAddress());
  await auditLog.waitForDeployment();
  console.log(`   ✓ AuditLog: ${await auditLog.getAddress()}`);

  // ── 4. IPFSVerifier ───────────────────────────────────────
  console.log("4. Deploying IPFSVerifier...");
  const IPFSVerifier = await hre.ethers.getContractFactory("IPFSVerifier");
  const ipfsVerifier = await IPFSVerifier.deploy(await roleAccess.getAddress());
  await ipfsVerifier.waitForDeployment();
  console.log(`   ✓ IPFSVerifier: ${await ipfsVerifier.getAddress()}`);

  // ── 5. FundManager ────────────────────────────────────────
  console.log("5. Deploying FundManager...");
  const FundManager = await hre.ethers.getContractFactory("FundManager");
  const fundManager = await FundManager.deploy(
    await roleAccess.getAddress(),
    await schemeConfig.getAddress()
  );
  await fundManager.waitForDeployment();
  console.log(`   ✓ FundManager: ${await fundManager.getAddress()}`);

  // ── 6. PensionRegistry ────────────────────────────────────
  console.log("6. Deploying PensionRegistry...");
  const PensionRegistry = await hre.ethers.getContractFactory("PensionRegistry");
  const pensionRegistry = await PensionRegistry.deploy(
    await roleAccess.getAddress(),
    await auditLog.getAddress(),
    await fundManager.getAddress(),
    await schemeConfig.getAddress(),
    await ipfsVerifier.getAddress()
  );
  await pensionRegistry.waitForDeployment();
  console.log(`   ✓ PensionRegistry: ${await pensionRegistry.getAddress()}`);

  // ── Role Setup ────────────────────────────────────────────
  console.log("\nSetting up roles...");
  const LOGGER_ROLE   = await roleAccess.LOGGER_ROLE();
  const REGISTRY_ROLE = await roleAccess.REGISTRY_ROLE();
  const TREASURY_ROLE = await roleAccess.TREASURY_ROLE();

  await roleAccess.grantRole(LOGGER_ROLE,   await pensionRegistry.getAddress());
  await roleAccess.grantRole(REGISTRY_ROLE, await pensionRegistry.getAddress());
  await roleAccess.grantRole(TREASURY_ROLE, treasury.address);
  await roleAccess.grantAllRoles(validator1.address);
  await roleAccess.grantAllRoles(validator2.address);
  await roleAccess.grantAllRoles(validator3.address);
  console.log("   ✓ Roles granted to registry, treasury, and 3 validators");

  // Fund the contract via treasury
  const fundAmount = hre.ethers.parseEther("10");
  await fundManager.connect(treasury).depositFunds(1, { value: fundAmount });
  console.log(`   ✓ Scheme 1 funded with 10 ETH`);

  // ── Write deployment config ───────────────────────────────
  const deploymentData = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployedAt: new Date().toISOString(),
    contracts: {
      RoleAccess:      await roleAccess.getAddress(),
      SchemeConfig:    await schemeConfig.getAddress(),
      AuditLog:        await auditLog.getAddress(),
      IPFSVerifier:    await ipfsVerifier.getAddress(),
      FundManager:     await fundManager.getAddress(),
      PensionRegistry: await pensionRegistry.getAddress()
    },
    accounts: {
      deployer:   deployer.address,
      validator1: validator1.address,
      validator2: validator2.address,
      validator3: validator3.address,
      treasury:   treasury.address,
      applicant:  applicant.address
    }
  };

  // Write to contracts folder
  fs.writeFileSync(
    path.join(__dirname, "../deployment.json"),
    JSON.stringify(deploymentData, null, 2)
  );

  // Write to backend
  const backendConfigDir = path.join(__dirname, "../../backend/src/config");
  if (fs.existsSync(backendConfigDir)) {
    fs.writeFileSync(
      path.join(backendConfigDir, "deployment.json"),
      JSON.stringify(deploymentData, null, 2)
    );
    console.log("   ✓ Backend deployment.json updated");
  }

  // Write to frontend
  const frontendConfigDir = path.join(__dirname, "../../frontend/src/config");
  if (fs.existsSync(frontendConfigDir)) {
    fs.writeFileSync(
      path.join(frontendConfigDir, "deployment.json"),
      JSON.stringify(deploymentData, null, 2)
    );
    console.log("   ✓ Frontend deployment.json updated");
  }

  console.log("\n" + "=".repeat(60));
  console.log("  Deployment Complete!");
  console.log("=".repeat(60));
  console.log(JSON.stringify(deploymentData.contracts, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
