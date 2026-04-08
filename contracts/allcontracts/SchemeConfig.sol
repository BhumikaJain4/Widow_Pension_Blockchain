// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ============================================================
//  CONTRACT 2: SchemeConfig.sol
//  Deploy SECOND. Constructor arg: RoleAccess address.
//  Project: Blockchain-Based Widow Pension Administration
//  Group:   IBC07 | CSE 542 | Prof. Sanjay Chaudhary
// ============================================================

import "./RoleAccess.sol";

contract SchemeConfig {

    RoleAccess public roleAccess;

    modifier onlyAdmin() {
        require(
            roleAccess.hasRole(roleAccess.DEFAULT_ADMIN_ROLE(), msg.sender),
            "SchemeConfig: not admin"
        );
        _;
    }

    struct Scheme {
        uint256 schemeId;
        string  name;
        uint256 monthlyAmount;
        uint256 minAgeLimit;
        uint256 maxAgeLimit;
        uint256 maxProcessingDays;
        bool    active;
        uint256 createdAt;
        uint256 updatedAt;
    }

    mapping(uint256 => Scheme) private schemes;
    uint256[] public schemeIds;
    uint256 private nextSchemeId = 1;

    event SchemeAdded(uint256 indexed schemeId, string name, uint256 monthlyAmount, address by);
    event SchemeUpdated(uint256 indexed schemeId, string name, address by);
    event SchemeToggled(uint256 indexed schemeId, bool active, address by);

    constructor(address roleAccessAddr) {
        require(roleAccessAddr != address(0), "SchemeConfig: invalid RoleAccess");
        roleAccess = RoleAccess(roleAccessAddr);
        // Pre-load default scheme with a small monthlyAmount suitable for testing
        _addScheme("IGNWPS - Indira Gandhi National Widow Pension Scheme", 1000000000000000000, 18, 100, 30);
    }

    function _addScheme(
        string memory name, uint256 monthlyAmount,
        uint256 minAge, uint256 maxAge, uint256 maxDays
    ) internal returns (uint256) {
        uint256 sid = nextSchemeId++;
        schemes[sid] = Scheme(sid, name, monthlyAmount, minAge, maxAge, maxDays, true, block.timestamp, block.timestamp);
        schemeIds.push(sid);
        return sid;
    }

    function addScheme(
        string calldata name, uint256 monthlyAmount,
        uint256 minAge, uint256 maxAge, uint256 maxDays
    ) external onlyAdmin returns (uint256 schemeId) {
        require(bytes(name).length > 0, "SchemeConfig: empty name");
        require(monthlyAmount > 0,      "SchemeConfig: amount = 0");
        require(minAge < maxAge,        "SchemeConfig: invalid age range");
        schemeId = _addScheme(name, monthlyAmount, minAge, maxAge, maxDays);
        emit SchemeAdded(schemeId, name, monthlyAmount, msg.sender);
    }

    function updateScheme(
        uint256 schemeId, string calldata name, uint256 monthlyAmount,
        uint256 minAge, uint256 maxAge, uint256 maxDays
    ) external onlyAdmin {
        require(schemes[schemeId].schemeId == schemeId, "SchemeConfig: not found");
        Scheme storage s = schemes[schemeId];
        s.name = name; s.monthlyAmount = monthlyAmount;
        s.minAgeLimit = minAge; s.maxAgeLimit = maxAge;
        s.maxProcessingDays = maxDays; s.updatedAt = block.timestamp;
        emit SchemeUpdated(schemeId, name, msg.sender);
    }

    function toggleScheme(uint256 schemeId) external onlyAdmin {
        require(schemes[schemeId].schemeId == schemeId, "SchemeConfig: not found");
        schemes[schemeId].active = !schemes[schemeId].active;
        schemes[schemeId].updatedAt = block.timestamp;
        emit SchemeToggled(schemeId, schemes[schemeId].active, msg.sender);
    }

    function getScheme(uint256 schemeId) external view returns (Scheme memory) {
        require(schemes[schemeId].schemeId == schemeId, "SchemeConfig: not found");
        return schemes[schemeId];
    }

    function isSchemeActive(uint256 schemeId) external view returns (bool) {
        return schemes[schemeId].active;
    }

    function getMonthlyAmount(uint256 schemeId) external view returns (uint256) {
        require(schemes[schemeId].schemeId == schemeId, "SchemeConfig: not found");
        return schemes[schemeId].monthlyAmount;
    }

    function getAllSchemeIds() external view returns (uint256[] memory) { return schemeIds; }
    function totalSchemes() external view returns (uint256) { return schemeIds.length; }
}
