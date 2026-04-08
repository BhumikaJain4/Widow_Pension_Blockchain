// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ============================================================
//  CONTRACT 5: FundManager.sol
//  Deploy FIFTH. Constructor args: RoleAccess, SchemeConfig.
//  Project: Blockchain-Based Widow Pension Administration
//  Group:   IBC07 | CSE 542 | Prof. Sanjay Chaudhary
// ============================================================

import "./RoleAccess.sol";
import "./SchemeConfig.sol";

contract FundManager {

    RoleAccess   public roleAccess;
    SchemeConfig public schemeConfig;

    bool public paused = false;

    mapping(uint256 => uint256) public schemeBalances;
    mapping(uint256 => uint256) public paymentRecord;
    mapping(uint256 => bool)    public isPaid;

    modifier onlyAdmin() {
        require(roleAccess.hasRole(roleAccess.DEFAULT_ADMIN_ROLE(), msg.sender), "FundManager: not admin");
        _;
    }
    modifier onlyTreasury() {
        require(roleAccess.hasRole(roleAccess.TREASURY_ROLE(), msg.sender), "FundManager: not treasury");
        _;
    }
    modifier onlyRegistry() {
        require(roleAccess.hasRole(roleAccess.REGISTRY_ROLE(), msg.sender), "FundManager: not registry");
        _;
    }
    modifier notPaused() {
        require(!paused, "FundManager: paused");
        _;
    }

    event FundsDeposited(uint256 indexed schemeId, address indexed by, uint256 amount, uint256 timestamp);
    event PaymentReleased(uint256 indexed applicationId, uint256 indexed schemeId, address indexed beneficiary, uint256 amount, uint256 timestamp);
    event ContractPaused(address by, uint256 timestamp);
    event ContractUnpaused(address by, uint256 timestamp);

    constructor(address roleAccessAddr, address schemeConfigAddr) {
        require(roleAccessAddr   != address(0), "FundManager: invalid RoleAccess");
        require(schemeConfigAddr != address(0), "FundManager: invalid SchemeConfig");
        roleAccess   = RoleAccess(roleAccessAddr);
        schemeConfig = SchemeConfig(schemeConfigAddr);
    }

    function depositFunds(uint256 schemeId) external payable onlyTreasury notPaused {
        require(msg.value > 0, "FundManager: deposit = 0");
        require(schemeConfig.isSchemeActive(schemeId), "FundManager: scheme inactive");
        schemeBalances[schemeId] += msg.value;
        emit FundsDeposited(schemeId, msg.sender, msg.value, block.timestamp);
    }

    function disbursePayment(
        uint256 applicationId, uint256 schemeId, address payable beneficiary
    ) external onlyRegistry notPaused {
        require(!isPaid[applicationId],                "FundManager: already paid");
        require(beneficiary != address(0),             "FundManager: zero beneficiary");
        require(schemeConfig.isSchemeActive(schemeId), "FundManager: scheme inactive");

        uint256 amount = schemeConfig.getMonthlyAmount(schemeId);
        require(amount > 0,                            "FundManager: scheme amount = 0");
        require(schemeBalances[schemeId] >= amount,    "FundManager: insufficient balance");

        isPaid[applicationId]        = true;
        paymentRecord[applicationId] = amount;
        schemeBalances[schemeId]    -= amount;

        (bool ok, ) = beneficiary.call{value: amount}("");
        require(ok, "FundManager: transfer failed");

        emit PaymentReleased(applicationId, schemeId, beneficiary, amount, block.timestamp);
    }

    function pause()   external onlyAdmin { require(!paused, "already paused"); paused = true;  emit ContractPaused(msg.sender, block.timestamp); }
    function unpause() external onlyAdmin { require(paused,  "not paused");     paused = false; emit ContractUnpaused(msg.sender, block.timestamp); }

    function getSchemeBalance(uint256 schemeId) external view returns (uint256) { return schemeBalances[schemeId]; }
    function totalFundsHeld() external view returns (uint256) { return address(this).balance; }
    function checkPaymentStatus(uint256 applicationId) external view returns (bool paid, uint256 amount) {
        paid   = isPaid[applicationId];
        amount = paymentRecord[applicationId];
    }

    receive() external payable { schemeBalances[1] += msg.value; }
}
