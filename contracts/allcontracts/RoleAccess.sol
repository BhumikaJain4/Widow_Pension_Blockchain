// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ============================================================
//  CONTRACT 1: RoleAccess.sol
//  Deploy ONCE. Pass this address to every other contract.
//  Project: Blockchain-Based Widow Pension Administration
//  Group:   IBC07 | CSE 542 | Prof. Sanjay Chaudhary
//
//  ONE deployed instance shared by all 6 contracts.
//  A single grantAllRoles() call makes a validator operational
//  across the entire system immediately.
//
//  DEPLOYMENT ORDER:
//    1. Deploy RoleAccess              → ROLE_ADDR
//    2. Deploy SchemeConfig(ROLE_ADDR)
//    3. Deploy AuditLog(ROLE_ADDR)
//    4. Deploy IPFSVerifier(ROLE_ADDR)
//    5. Deploy FundManager(ROLE_ADDR, SCHEME_ADDR)
//    6. Deploy PensionRegistry(ROLE_ADDR, AUDIT_ADDR,
//                              FUND_ADDR, SCHEME_ADDR, IPFS_ADDR)
//
//  AFTER DEPLOY — run these setup calls from Wallet 1:
//    grantRole(LOGGER_ROLE,   PensionRegistry_address)
//    grantRole(REGISTRY_ROLE, PensionRegistry_address)
//    grantRole(TREASURY_ROLE, treasury_wallet)
//    grantAllRoles(validator_wallet_1)
//    grantAllRoles(validator_wallet_2)
//    ... repeat for each validator
// ============================================================

contract RoleAccess {

    // ── Role Identifiers ──────────────────────────────────────
    bytes32 public constant DEFAULT_ADMIN_ROLE = keccak256("DEFAULT_ADMIN_ROLE");
    bytes32 public constant REVIEWER_ROLE      = keccak256("REVIEWER_ROLE");
    bytes32 public constant APPROVER_ROLE      = keccak256("APPROVER_ROLE");
    bytes32 public constant TREASURY_ROLE      = keccak256("TREASURY_ROLE");
    bytes32 public constant AUDITOR_ROLE       = keccak256("AUDITOR_ROLE");
    bytes32 public constant LOGGER_ROLE        = keccak256("LOGGER_ROLE");
    bytes32 public constant REGISTRY_ROLE      = keccak256("REGISTRY_ROLE");
    bytes32 public constant VALIDATOR_ROLE     = keccak256("VALIDATOR_ROLE");

    // ── Single Source of Truth for All Roles ──────────────────
    mapping(bytes32 => mapping(address => bool)) private _roles;

    // ── Events ────────────────────────────────────────────────
    event RoleGranted(bytes32 indexed role, address indexed account, address indexed by);
    event RoleRevoked(bytes32 indexed role, address indexed account, address indexed by);
    event AllRolesGranted(address indexed account, address indexed by, uint256 timestamp);
    event AllRolesRevoked(address indexed account, address indexed by, uint256 timestamp);

    // ── Constructor ───────────────────────────────────────────
    constructor() {
        _roles[DEFAULT_ADMIN_ROLE][msg.sender] = true;
        emit RoleGranted(DEFAULT_ADMIN_ROLE, msg.sender, msg.sender);
    }

    modifier onlyAdmin() {
        require(_roles[DEFAULT_ADMIN_ROLE][msg.sender], "RoleAccess: not admin");
        _;
    }

    // ── Core Read ─────────────────────────────────────────────
    function hasRole(bytes32 role, address account) public view returns (bool) {
        return _roles[role][account];
    }

    // ── Single Role ───────────────────────────────────────────
    function grantRole(bytes32 role, address account) external onlyAdmin {
        require(account != address(0), "RoleAccess: zero address");
        require(!_roles[role][account], "RoleAccess: already has role");
        _roles[role][account] = true;
        emit RoleGranted(role, account, msg.sender);
    }

    function revokeRole(bytes32 role, address account) external onlyAdmin {
        require(_roles[role][account], "RoleAccess: does not have role");
        _roles[role][account] = false;
        emit RoleRevoked(role, account, msg.sender);
    }

    function renounceRole(bytes32 role) external {
        require(_roles[role][msg.sender], "RoleAccess: caller lacks role");
        _roles[role][msg.sender] = false;
        emit RoleRevoked(role, msg.sender, msg.sender);
    }

    function grantMultipleRoles(bytes32[] calldata roles, address account) external onlyAdmin {
        require(account != address(0), "RoleAccess: zero address");
        for (uint256 i = 0; i < roles.length; i++) {
            if (!_roles[roles[i]][account]) {
                _roles[roles[i]][account] = true;
                emit RoleGranted(roles[i], account, msg.sender);
            }
        }
    }

    // ── All Operational Roles in One Call ─────────────────────
    /// @notice On-board a new validator with all operational roles.
    ///         Grants: REVIEWER, APPROVER, AUDITOR, LOGGER, REGISTRY, VALIDATOR
    ///         Does NOT grant: DEFAULT_ADMIN, TREASURY (high-privilege, manual only)
    function grantAllRoles(address account) external onlyAdmin {
        require(account != address(0), "RoleAccess: zero address");
        bytes32[6] memory ops = [
            REVIEWER_ROLE, APPROVER_ROLE, AUDITOR_ROLE,
            LOGGER_ROLE, REGISTRY_ROLE, VALIDATOR_ROLE
        ];
        for (uint256 i = 0; i < ops.length; i++) {
            if (!_roles[ops[i]][account]) {
                _roles[ops[i]][account] = true;
                emit RoleGranted(ops[i], account, msg.sender);
            }
        }
        emit AllRolesGranted(account, msg.sender, block.timestamp);
    }

    /// @notice Off-board a validator — revokes all operational roles instantly.
    function revokeAllRoles(address account) external onlyAdmin {
        require(account != address(0), "RoleAccess: zero address");
        bytes32[6] memory ops = [
            REVIEWER_ROLE, APPROVER_ROLE, AUDITOR_ROLE,
            LOGGER_ROLE, REGISTRY_ROLE, VALIDATOR_ROLE
        ];
        for (uint256 i = 0; i < ops.length; i++) {
            if (_roles[ops[i]][account]) {
                _roles[ops[i]][account] = false;
                emit RoleRevoked(ops[i], account, msg.sender);
            }
        }
        emit AllRolesRevoked(account, msg.sender, block.timestamp);
    }
}
