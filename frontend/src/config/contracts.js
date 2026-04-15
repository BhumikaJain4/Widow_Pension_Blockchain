// ============================================================
//  Contract ABIs — extracted from compiled artifacts
//  Run: cd contracts && npm install && npx hardhat compile
//  Then update addresses in deployment.json after deploy
// ============================================================



export const PENSION_REGISTRY_ABI = [
  "function submitApplication(bytes32 aadhaarHash, string calldata ipfsCID, uint256 schemeId) external returns (uint256 applicationId)",
  "function beginReview(uint256 appId) external",
  "function castVote(uint256 appId, bool approve, string calldata reason) external",
  "function raiseDispute(uint256 appId) external",
  "function resolveDispute(uint256 appId, bool reopen) external",
  "function setTotalValidators(uint256 n) external",
  "function resolveDeadlock(uint256 appId) external",
  "function setDeadlockTimeout(uint256 days_) external",
  "function getDeadlockedApps() external view returns (uint256[])",
  "function deadlockTimeoutDays() external view returns (uint256)",
  "function getApplication(uint256 appId) external view returns (tuple(uint256 applicationId, address applicant, bytes32 aadhaarHash, string ipfsCID, uint256 schemeId, uint8 state, string rejectionReason, address reviewer, address finalDecisionBy, uint256 submittedAt, uint256 decidedAt, uint256 processingSeconds, uint256 processingDays, uint256 paidAt, uint256 queuePosition))",
  "function getApplicationStatus(uint256 appId) external view returns (uint8 state, string rejectionReason, address decidedBy, uint256 decidedAt)",
  "function getApplicationsByWallet(address wallet) external view returns (uint256[])",
  "function getVoteStatus(uint256 appId) external view returns (uint8 appState, uint256 approveCount, uint256 rejectCount, uint256 threshold, uint256 votesStillNeeded, bool callerHasVoted)",
  "function getValidatorQueue() external view returns (tuple(uint256 appId, uint256 queuePosition, uint8 state, uint256 submittedAt, uint256 daysElapsed, uint256 slaDays, bool slaBreach, uint256 approveVotes, uint256 rejectVotes, uint256 votesNeeded)[])",
  "function getNextInQueue() external view returns (uint256 appId, uint256 position)",
  "function pendingCount() external view returns (uint256)",
  "function checkSLABreach(uint256 appId) external view returns (bool breached, uint256 daysElapsed)",
  "function isAadhaarRegistered(bytes32 aadhaarHash) external view returns (bool)",
  "function getActiveApplicationByAadhaar(bytes32 aadhaarHash) external view returns (uint256 activeAppId)",
  "function getAllRejectionReasons(uint256 appId) external view returns (tuple(address validator, string reason)[])",
  "function rejectVoters(uint256, uint256) external view returns (address)",
  "function totalApplications() external view returns (uint256)",
  "function totalValidators() external view returns (uint256)",
  "function consensusThreshold() external view returns (uint256)",
  "function hasVoted(uint256, address) external view returns (bool)",
  "function approveVotes(uint256) external view returns (uint256)",
  "function rejectVotes(uint256) external view returns (uint256)",
  "event ApplicationSubmitted(uint256 indexed applicationId, address indexed applicant, uint256 indexed schemeId, uint256 queuePosition, uint256 timestamp)",
  "event VotingStarted(uint256 indexed applicationId, address indexed reviewer, uint256 threshold, uint256 timestamp)",
  "event VoteCast(uint256 indexed applicationId, address indexed validator, bool approve, uint256 approveCount, uint256 rejectCount, uint256 threshold, uint256 timestamp)",
  "event ApplicationApproved(uint256 indexed applicationId, address indexed decidingValidator, uint256 timestamp, uint256 processingDays)",
  "event ApplicationRejected(uint256 indexed applicationId, address indexed decidingValidator, string reason, uint256 timestamp, uint256 processingDays)",
  "event PaymentTriggered(uint256 indexed applicationId, address indexed beneficiary, uint256 amount, uint256 timestamp)",
  "event DisputeRaised(uint256 indexed applicationId, address indexed applicant, uint256 timestamp)",
  "event DeadlockResolved(uint256 indexed applicationId, address indexed admin, string reason, uint256 timestamp)"
];

export const ROLE_ACCESS_ABI = [
  "function hasRole(bytes32 role, address account) public view returns (bool)",
  "function grantRole(bytes32 role, address account) external",
  "function revokeRole(bytes32 role, address account) external",
  "function grantAllRoles(address account) external",
  "function revokeAllRoles(address account) external",
  "function DEFAULT_ADMIN_ROLE() public view returns (bytes32)",
  "function VALIDATOR_ROLE() public view returns (bytes32)",
  "function REVIEWER_ROLE() public view returns (bytes32)",
  "function TREASURY_ROLE() public view returns (bytes32)",
  "function AUDITOR_ROLE() public view returns (bytes32)",
  "function LOGGER_ROLE() public view returns (bytes32)",
  "function REGISTRY_ROLE() public view returns (bytes32)",
  "function APPROVER_ROLE() public view returns (bytes32)"
];

export const SCHEME_CONFIG_ABI = [
  "function getScheme(uint256 schemeId) external view returns (tuple(uint256 schemeId, string name, uint256 monthlyAmount, uint256 minAgeLimit, uint256 maxAgeLimit, uint256 maxProcessingDays, bool active, uint256 createdAt, uint256 updatedAt))",
  "function getAllSchemeIds() external view returns (uint256[])",
  "function isSchemeActive(uint256 schemeId) external view returns (bool)",
  "function getMonthlyAmount(uint256 schemeId) external view returns (uint256)",
  "function addScheme(string calldata name, uint256 monthlyAmount, uint256 minAge, uint256 maxAge, uint256 maxDays) external returns (uint256)",
  "function updateScheme(uint256 schemeId, string calldata name, uint256 monthlyAmount, uint256 minAge, uint256 maxAge, uint256 maxDays) external",
  "function toggleScheme(uint256 schemeId) external"
];

export const FUND_MANAGER_ABI = [
  "function depositFunds(uint256 schemeId) external payable",
  "function getSchemeBalance(uint256 schemeId) external view returns (uint256)",
  "function totalFundsHeld() external view returns (uint256)",
  "function checkPaymentStatus(uint256 applicationId) external view returns (bool paid, uint256 amount)",
  "function isPaid(uint256) external view returns (bool)",
  "function paused() external view returns (bool)",
  "function pause() external",
  "function unpause() external"
];

export const AUDIT_LOG_ABI = [
  "function getAuditTrail(uint256 applicationId) external view returns (tuple(uint256 applicationId, address actor, uint8 action, string details, uint256 timestamp, uint256 blockNumber)[])",
  "function getEntryCount(uint256 applicationId) external view returns (uint256)",
  "function globalLogCount() external view returns (uint256)"
];

// State enum mapping — icon keys used by Icon component
export const APP_STATE = {
  0: { label: "None",      badge: "badge-pending",   icon: "minus"    },
  1: { label: "Submitted", badge: "badge-submitted",  icon: "inbox"    },
  2: { label: "Voting",    badge: "badge-voting",     icon: "vote"     },
  3: { label: "Approved",  badge: "badge-approved",   icon: "check"    },
  4: { label: "Rejected",  badge: "badge-rejected",   icon: "x"        },
  5: { label: "Paid",      badge: "badge-paid",       icon: "coin"     },
  6: { label: "Disputed",  badge: "badge-disputed",   icon: "scale"    },
};

export const AUDIT_ACTION = {
  0: "Submitted",
  1: "Review Started",
  2: "Approved",
  3: "Rejected",
  4: "Payment Sent",
  5: "Dispute Raised",
  6: "Dispute Resolved"
};
