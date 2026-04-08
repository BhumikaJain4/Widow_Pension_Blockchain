// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ============================================================
//  CONTRACT 3: AuditLog.sol
//  Deploy THIRD. Constructor arg: RoleAccess address.
//  APPEND-ONLY — no update or delete.
//  Project: Blockchain-Based Widow Pension Administration
//  Group:   IBC07 | CSE 542 | Prof. Sanjay Chaudhary
// ============================================================

import "./RoleAccess.sol";

contract AuditLog {

    RoleAccess public roleAccess;

    modifier onlyLogger() {
        require(
            roleAccess.hasRole(roleAccess.LOGGER_ROLE(), msg.sender),
            "AuditLog: caller lacks LOGGER_ROLE"
        );
        _;
    }

    enum ActionType {
        SUBMITTED,
        REVIEW_STARTED,
        APPROVED,
        REJECTED,
        PAYMENT_SENT,
        DISPUTE_RAISED,
        DISPUTE_RESOLVED
    }

    struct AuditEntry {
        uint256    applicationId;
        address    actor;
        ActionType action;
        string     details;
        uint256    timestamp;
        uint256    blockNumber;
    }

    mapping(uint256 => AuditEntry[]) private auditTrails;
    AuditEntry[] private globalLog;

    event AuditEventLogged(
        uint256 indexed applicationId,
        address indexed actor,
        ActionType      action,
        string          details,
        uint256         timestamp,
        uint256         blockNumber
    );

    constructor(address roleAccessAddr) {
        require(roleAccessAddr != address(0), "AuditLog: invalid RoleAccess");
        roleAccess = RoleAccess(roleAccessAddr);
    }

    function logEvent(
        uint256 applicationId, address actor,
        ActionType action, string calldata details
    ) external onlyLogger {
        if (action == ActionType.REJECTED) {
            require(bytes(details).length > 0, "AuditLog: rejection reason required");
        }
        AuditEntry memory entry = AuditEntry(applicationId, actor, action, details, block.timestamp, block.number);
        auditTrails[applicationId].push(entry);
        globalLog.push(entry);
        emit AuditEventLogged(applicationId, actor, action, details, block.timestamp, block.number);
    }

    function getAuditTrail(uint256 applicationId) external view returns (AuditEntry[] memory) {
        return auditTrails[applicationId];
    }

    function getEntry(uint256 applicationId, uint256 index) external view returns (AuditEntry memory) {
        require(index < auditTrails[applicationId].length, "AuditLog: out of bounds");
        return auditTrails[applicationId][index];
    }

    function getEntryCount(uint256 applicationId) external view returns (uint256) {
        return auditTrails[applicationId].length;
    }

    function globalLogCount() external view returns (uint256) { return globalLog.length; }

    function getGlobalLog(uint256 from, uint256 count) external view returns (AuditEntry[] memory result) {
        require(from < globalLog.length, "AuditLog: from out of bounds");
        uint256 end = from + count;
        if (end > globalLog.length) end = globalLog.length;
        result = new AuditEntry[](end - from);
        for (uint256 i = from; i < end; i++) result[i - from] = globalLog[i];
    }

    function verifyEntry(
        uint256 applicationId, uint256 index,
        address expectedActor, ActionType expectedAction
    ) external view returns (bool) {
        if (index >= auditTrails[applicationId].length) return false;
        AuditEntry memory e = auditTrails[applicationId][index];
        return (e.actor == expectedActor && e.action == expectedAction);
    }
}
