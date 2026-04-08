// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ============================================================
//  CONTRACT 6: PensionRegistry.sol  — FINAL VERSION
//  Deploy LAST. Constructor args: all 5 contract addresses.
//  Project: Blockchain-Based Widow Pension Administration
//  Group:   IBC07 | CSE 542 | Prof. Sanjay Chaudhary
//
//  FEATURES:
//  [FCFS]  First-Come-First-Served queue. Applications are
//          stored in submission order. Validators must process
//          the oldest SUBMITTED application first — the contract
//          enforces this: beginReview() only accepts the next
//          application in line (queue front).
//
//  [70%]   Consensus threshold is auto-calculated as 70% of
//          registered validators (ceiling). Admin sets
//          totalValidators with setTotalValidators(n) whenever
//          a validator is added or removed.
//          Formula: threshold = ceil(totalValidators * 70 / 100)
//          Examples: 3 validators → 3 votes needed
//                    5 validators → 4 votes needed
//                   10 validators → 7 votes needed
//
//  [QUEUE] getValidatorQueue() — validators call this to see
//          all pending applications in FCFS order with their
//          position, state, days elapsed, and SLA status.
//
//  [U1]    processingDays stored on final decision.
//  [U3]    ValidatorPriorityAlert event on every state change.
// ============================================================

import "./RoleAccess.sol";
import "./AuditLog.sol";
import "./FundManager.sol";
import "./SchemeConfig.sol";
import "./IPFSVerifier.sol";

contract PensionRegistry {

    // ── Shared Role Authority ─────────────────────────────────
    RoleAccess internal roleAccess;

    modifier onlyAdmin() {
        require(roleAccess.hasRole(roleAccess.DEFAULT_ADMIN_ROLE(), msg.sender), "Registry: not admin");
        _;
    }
    modifier onlyReviewer() {
        require(roleAccess.hasRole(roleAccess.REVIEWER_ROLE(), msg.sender), "Registry: not reviewer");
        _;
    }
    modifier onlyReviewerOrValidator() {
        require(
            roleAccess.hasRole(roleAccess.REVIEWER_ROLE(), msg.sender) ||
            roleAccess.hasRole(roleAccess.VALIDATOR_ROLE(), msg.sender),
            "Registry: not reviewer/validator"
        );
        _;
    }
    modifier onlyValidator() {
        require(roleAccess.hasRole(roleAccess.VALIDATOR_ROLE(), msg.sender), "Registry: not validator");
        _;
    }
    modifier applicationExists(uint256 appId) {
        require(applications[appId].state != ApplicationState.NONE, "Registry: app not found");
        _;
    }

    // ── State Machine ─────────────────────────────────────────
    enum ApplicationState {
        NONE,       // 0 — does not exist
        SUBMITTED,  // 1 — waiting in FCFS queue
        VOTING,     // 2 — validators casting votes
        APPROVED,   // 3 — consensus reached: approved
        REJECTED,   // 4 — consensus reached: rejected
        PAID,       // 5 — payment disbursed (terminal)
        DISPUTED    // 6 — applicant raised dispute
    }

    // ── Structs ───────────────────────────────────────────────
    struct Application {
        uint256          applicationId;
        address          applicant;
        bytes32          aadhaarHash;
        string           ipfsCID;
        uint256          schemeId;
        ApplicationState state;
        string           rejectionReason;
        address          reviewer;
        address          finalDecisionBy;
        uint256          submittedAt;
        uint256          decidedAt;
        uint256          processingSeconds;
        uint256          processingDays;
        uint256          paidAt;
        uint256          queuePosition;   // [FCFS] position in submission order (1-based)
    }

    // Result struct for getValidatorQueue() — avoids stack-too-deep
    struct QueueEntry {
        uint256          appId;
        uint256          queuePosition;
        ApplicationState state;
        uint256          submittedAt;
        uint256          daysElapsed;
        uint256          slaDays;
        bool             slaBreach;
        uint256          approveVotes;
        uint256          rejectVotes;
        uint256          votesNeeded;
    }

    struct ProcessingTimeResult {
        uint256 submittedAt;
        uint256 decidedAt;
        uint256 processingSeconds;
        uint256 processingDays;
        uint256 currentElapsedDays;
        bool    isDecided;
    }

    // ── [70%] Consensus Config ────────────────────────────────
    // totalValidators is set by admin whenever a validator is added/removed.
    // consensusThreshold is auto-computed as ceil(totalValidators * 70 / 100).
    uint256 public totalValidators    = 3;  // default for demo
    uint256 public consensusThreshold = 3;  // auto-updated by setTotalValidators()

    // ── Voting Storage ────────────────────────────────────────
    mapping(uint256 => mapping(address => bool))   public hasVoted;
    mapping(uint256 => mapping(address => string)) public validatorRejectionReason;
    mapping(uint256 => uint256) public approveVotes;
    mapping(uint256 => uint256) public rejectVotes;
    mapping(uint256 => string)  public proposedRejectionReason;
    mapping(uint256 => address[]) public rejectVoters;

    // ── Application Storage ───────────────────────────────────
    mapping(uint256 => Application) public applications;
    mapping(bytes32 => bool)        public aadhaarRegistered;
    mapping(address => uint256[])   public walletApplications;

    // [FCFS] Ordered queue of all application IDs in submission order.
    // New submissions are pushed to the end.
    // fcfsQueue[0] is always the oldest unprocessed application.
    // queueFront tracks the index of the next application to be reviewed.
    uint256[] public fcfsQueue;
    uint256   public queueFront = 0; // index into fcfsQueue of next app to review

    uint256 private nextApplicationId = 1;
    uint256 public  totalApplications = 0;

    // External contracts
    AuditLog     internal auditLog;
    FundManager  internal fundManager;
    SchemeConfig internal schemeConfig;
    IPFSVerifier internal ipfsVerifier;

    // ── Deadlock timeout (admin-configurable) ─────────────────
    uint256 public deadlockTimeoutDays = 7;

    // ── Events ────────────────────────────────────────────────
    event ApplicationSubmitted(uint256 indexed applicationId, address indexed applicant, uint256 indexed schemeId, uint256 queuePosition, uint256 timestamp);
    event VotingStarted(uint256 indexed applicationId, address indexed reviewer, uint256 threshold, uint256 timestamp);
    event VoteCast(uint256 indexed applicationId, address indexed validator, bool approve, uint256 approveCount, uint256 rejectCount, uint256 threshold, uint256 timestamp);
    event ApplicationApproved(uint256 indexed applicationId, address indexed decidingValidator, uint256 timestamp, uint256 processingDays);
    event ApplicationRejected(uint256 indexed applicationId, address indexed decidingValidator, string reason, uint256 timestamp, uint256 processingDays);
    event PaymentTriggered(uint256 indexed applicationId, address indexed beneficiary, uint256 amount, uint256 timestamp);
    event DisputeRaised(uint256 indexed applicationId, address indexed applicant, uint256 timestamp);
    event ValidatorCountUpdated(uint256 oldCount, uint256 newCount, uint256 newThreshold, address by);
    event ValidatorPriorityAlert(uint256 indexed applicationId, uint256 slaDays, uint256 daysElapsed, int256 daysRemaining, bool slaBreach, ApplicationState state, uint256 timestamp);
    event DeadlockResolved(uint256 indexed applicationId, address indexed admin, string reason, uint256 timestamp);

    // ── Constructor ───────────────────────────────────────────
    constructor(
        address roleAccessAddr,
        address auditLogAddr,
        address fundManagerAddr,
        address schemeConfigAddr,
        address ipfsVerifierAddr
    ) {
        require(roleAccessAddr   != address(0), "Registry: invalid RoleAccess");
        require(auditLogAddr     != address(0), "Registry: invalid AuditLog");
        require(fundManagerAddr  != address(0), "Registry: invalid FundManager");
        require(schemeConfigAddr != address(0), "Registry: invalid SchemeConfig");
        require(ipfsVerifierAddr != address(0), "Registry: invalid IPFSVerifier");

        roleAccess   = RoleAccess(roleAccessAddr);
        auditLog     = AuditLog(auditLogAddr);
        fundManager  = FundManager(payable(fundManagerAddr));
        schemeConfig = SchemeConfig(schemeConfigAddr);
        ipfsVerifier = IPFSVerifier(ipfsVerifierAddr);
    }

    // ── Internal helpers ──────────────────────────────────────
    function _emitPriorityAlert(uint256 appId) internal {
        Application storage app = applications[appId];
        uint256 sla         = schemeConfig.getScheme(app.schemeId).maxProcessingDays;
        uint256 daysElapsed = (block.timestamp - app.submittedAt) / 1 days;
        int256  daysLeft    = int256(sla) - int256(daysElapsed);
        emit ValidatorPriorityAlert(appId, sla, daysElapsed, daysLeft, daysElapsed > sla, app.state, block.timestamp);
    }

    // Ceiling division: ceil(a * b / c)
    function _ceilDiv(uint256 a, uint256 b, uint256 c) internal pure returns (uint256) {
        return (a * b + c - 1) / c;
    }

    // ─────────────────────────────────────────────────────────
    //  STEP 1 — BENEFICIARY SUBMITS (joins FCFS queue)
    // ─────────────────────────────────────────────────────────

    /// @notice Submit a pension application.
    ///         The application joins the FCFS queue at the back.
    ///         Validators must process applications from the front.
    function submitApplication(
        bytes32 aadhaarHash, string calldata ipfsCID, uint256 schemeId
    ) external returns (uint256 applicationId) {
        require(aadhaarHash != bytes32(0),             "Registry: invalid aadhaar hash");
        require(bytes(ipfsCID).length > 0,             "Registry: empty IPFS CID");
        require(schemeConfig.isSchemeActive(schemeId), "Registry: scheme not active");
        require(!aadhaarRegistered[aadhaarHash],        "Registry: duplicate aadhaar");

        applicationId = nextApplicationId++;
        totalApplications++;

        // Queue position is 1-based (first app = position 1)
        uint256 pos = fcfsQueue.length + 1;

        Application storage a = applications[applicationId];
        a.applicationId = applicationId;
        a.applicant     = msg.sender;
        a.aadhaarHash   = aadhaarHash;
        a.ipfsCID       = ipfsCID;
        a.schemeId      = schemeId;
        a.state         = ApplicationState.SUBMITTED;
        a.submittedAt   = block.timestamp;
        a.queuePosition = pos;

        aadhaarRegistered[aadhaarHash] = true;
        walletApplications[msg.sender].push(applicationId);

        // Push to back of FCFS queue
        fcfsQueue.push(applicationId);

        _emitPriorityAlert(applicationId);

        auditLog.logEvent(applicationId, msg.sender, AuditLog.ActionType.SUBMITTED,
            string(abi.encodePacked(
                "Submitted. Queue position: ", _uint2str(pos),
                " Scheme: ", _uint2str(schemeId),
                " CID: ", ipfsCID
            ))
        );

        emit ApplicationSubmitted(applicationId, msg.sender, schemeId, pos, block.timestamp);
    }

    // ─────────────────────────────────────────────────────────
    //  STEP 2 — REVIEWER/VALIDATOR OPENS VOTING (FCFS enforced)
    // ─────────────────────────────────────────────────────────

    /// @notice Pick up the next application in FCFS order and open voting.
    ///         Enforces first-come-first-served — you cannot skip ahead
    ///         to a newer application while an older one is still SUBMITTED.
    ///         State: SUBMITTED → VOTING
    function beginReview(uint256 appId) external onlyReviewerOrValidator applicationExists(appId) {
        Application storage app = applications[appId];
        require(app.state == ApplicationState.SUBMITTED, "Registry: not SUBMITTED");

        // [FCFS] Enforce order — scan from queueFront to find the oldest
        // SUBMITTED application. The requested appId must be that application.
        uint256 nextInLine = _getNextSubmitted();
        require(nextInLine != 0,       "Registry: no applications in queue");
        require(appId == nextInLine,   "Registry: must process oldest application first (FCFS)");

        app.state    = ApplicationState.VOTING;
        app.reviewer = msg.sender;

        // Advance queue front past all non-SUBMITTED apps
        _advanceQueueFront();

        _emitPriorityAlert(appId);

        auditLog.logEvent(appId, msg.sender, AuditLog.ActionType.REVIEW_STARTED,
            string(abi.encodePacked(
                "Voting opened (FCFS queue position: ", _uint2str(app.queuePosition),
                "). Threshold: ", _uint2str(consensusThreshold), " votes needed"
            ))
        );

        emit VotingStarted(appId, msg.sender, consensusThreshold, block.timestamp);
    }

    /// @notice Returns the appId of the next SUBMITTED application in FCFS order.
    ///         Returns 0 if no SUBMITTED applications exist.
    ///         Validators call this to know which application to beginReview on.
    function getNextInQueue() external view returns (uint256 appId, uint256 position) {
        appId    = _getNextSubmitted();
        position = appId == 0 ? 0 : applications[appId].queuePosition;
    }

    function _getNextSubmitted() internal view returns (uint256) {
        for (uint256 i = queueFront; i < fcfsQueue.length; i++) {
            uint256 id = fcfsQueue[i];
            if (applications[id].state == ApplicationState.SUBMITTED) {
                return id;
            }
        }
        return 0; // none found
    }

    function _advanceQueueFront() internal {
        while (
            queueFront < fcfsQueue.length &&
            applications[fcfsQueue[queueFront]].state != ApplicationState.SUBMITTED
        ) {
            queueFront++;
        }
    }

    // ─────────────────────────────────────────────────────────
    //  STEP 3 — VALIDATORS CAST VOTES
    // ─────────────────────────────────────────────────────────

    /// @notice Cast a vote on an application in VOTING state.
    ///         Once approve OR reject votes reach consensusThreshold,
    ///         the application is automatically finalized.
    ///
    /// @param appId    Application to vote on
    /// @param approve  true = approve | false = reject
    /// @param reason   Required only when approve = false
    function castVote(
        uint256 appId,
        bool    approve,
        string  calldata reason
    ) external onlyValidator applicationExists(appId) {
        require(applications[appId].state == ApplicationState.VOTING, "Registry: not in VOTING state");
        require(!hasVoted[appId][msg.sender],                          "Registry: already voted");
        if (!approve) {
            require(bytes(reason).length > 0, "Registry: rejection reason required");
        }

        hasVoted[appId][msg.sender] = true;

        if (approve) {
            approveVotes[appId]++;
        } else {
            rejectVotes[appId]++;
            validatorRejectionReason[appId][msg.sender] = reason;
            rejectVoters[appId].push(msg.sender);
            // Keep the first rejection reason on-chain for backward compat
            if (bytes(proposedRejectionReason[appId]).length == 0) {
                proposedRejectionReason[appId] = reason;
            }
        }

        emit VoteCast(appId, msg.sender, approve,
            approveVotes[appId], rejectVotes[appId], consensusThreshold, block.timestamp);

        auditLog.logEvent(appId, msg.sender, AuditLog.ActionType.REVIEW_STARTED,
            string(abi.encodePacked(
                approve ? "VOTE: Approve" : "VOTE: Reject",
                " | For: ",     _uint2str(approveVotes[appId]),
                " | Against: ", _uint2str(rejectVotes[appId]),
                " | Need: ",    _uint2str(consensusThreshold)
            ))
        );

        // ── MAJORITY WINS LOGIC ───────────────────────────────────
        // Finalize as soon as the outcome is mathematically certain:
        // i.e. the losing side can no longer catch up even if ALL
        // remaining validators vote for it.
        //
        // votescast = approve + reject
        // remaining = totalValidators - votescast
        // Approve wins if: rejectVotes + remaining < approveVotes
        //   (reject can never reach approve even with all remaining)
        // Reject  wins if: approveVotes + remaining < rejectVotes
        //
        // Example — 3 validators, threshold=2:
        //   2 approve, 0 reject → remaining=1 → reject can get max 1 < 2 → APPROVED ✓
        //   2 reject,  0 approve→ remaining=1 → approve can get max 1 < 2 → REJECTED ✓
        //   1 approve, 1 reject → remaining=1 → both can still reach 2  → wait

        uint256 votesCast  = approveVotes[appId] + rejectVotes[appId];
        uint256 remaining  = totalValidators > votesCast ? totalValidators - votesCast : 0;

        bool approveWins = approveVotes[appId] >= consensusThreshold ||
                           (rejectVotes[appId] + remaining < approveVotes[appId]);
        bool rejectWins  = rejectVotes[appId]  >= consensusThreshold ||
                           (approveVotes[appId] + remaining < rejectVotes[appId]);

        if (approveWins) {
            _finalizeApproval(appId);
        } else if (rejectWins) {
            _finalizeRejection(appId);
        }
    }

    function _finalizeApproval(uint256 appId) internal {
        Application storage app = applications[appId];
        app.state             = ApplicationState.APPROVED;
        app.finalDecisionBy   = msg.sender;
        app.decidedAt         = block.timestamp;
        app.processingSeconds = block.timestamp - app.submittedAt;
        app.processingDays    = app.processingSeconds / 1 days;

        auditLog.logEvent(appId, msg.sender, AuditLog.ActionType.APPROVED,
            string(abi.encodePacked(
                "APPROVED by consensus: ", _uint2str(approveVotes[appId]),
                "/", _uint2str(consensusThreshold),
                " votes. Processing: ", _uint2str(app.processingDays), " day(s)"
            ))
        );

        emit ApplicationApproved(appId, msg.sender, block.timestamp, app.processingDays);
        _triggerPayment(appId);
    }

    function _finalizeRejection(uint256 appId) internal {
        Application storage app = applications[appId];
        app.state             = ApplicationState.REJECTED;
        app.finalDecisionBy   = msg.sender;
        app.rejectionReason   = proposedRejectionReason[appId];
        app.decidedAt         = block.timestamp;
        app.processingSeconds = block.timestamp - app.submittedAt;
        app.processingDays    = app.processingSeconds / 1 days;

        auditLog.logEvent(appId, msg.sender, AuditLog.ActionType.REJECTED,
            string(abi.encodePacked(
                app.rejectionReason,
                " | REJECTED by consensus: ", _uint2str(rejectVotes[appId]),
                "/", _uint2str(consensusThreshold),
                " votes. Processing: ", _uint2str(app.processingDays), " day(s)"
            ))
        );

        emit ApplicationRejected(appId, msg.sender, app.rejectionReason, block.timestamp, app.processingDays);
    }

    // ─────────────────────────────────────────────────────────
    //  STEP 4 — PAYMENT (AUTO ON APPROVAL)
    // ─────────────────────────────────────────────────────────
    function _triggerPayment(uint256 appId) internal {
        Application storage app = applications[appId];
        app.state  = ApplicationState.PAID;
        app.paidAt = block.timestamp;
        uint256 amount = schemeConfig.getMonthlyAmount(app.schemeId);
        fundManager.disbursePayment(appId, app.schemeId, payable(app.applicant));
        auditLog.logEvent(appId, address(this), AuditLog.ActionType.PAYMENT_SENT,
            string(abi.encodePacked("Payment of ", _uint2str(amount), " Wei disbursed")));
        emit PaymentTriggered(appId, app.applicant, amount, block.timestamp);
    }

    // ─────────────────────────────────────────────────────────
    //  DISPUTE
    // ─────────────────────────────────────────────────────────
    function raiseDispute(uint256 appId) external applicationExists(appId) {
        Application storage app = applications[appId];
        require(app.applicant == msg.sender,            "Registry: only applicant");
        require(app.state == ApplicationState.REJECTED, "Registry: only on rejected");
        require(block.timestamp <= app.decidedAt + 30 days, "Registry: dispute window closed");
        app.state = ApplicationState.DISPUTED;
        auditLog.logEvent(appId, msg.sender, AuditLog.ActionType.DISPUTE_RAISED, "Dispute raised");
        emit DisputeRaised(appId, msg.sender, block.timestamp);
    }

    function resolveDispute(uint256 appId, bool reopen) external onlyAdmin applicationExists(appId) {
        Application storage app = applications[appId];
        require(app.state == ApplicationState.DISPUTED, "Registry: not DISPUTED");
        if (reopen) {
            // Reset votes and re-enter at the BACK of the queue (fair re-submission)
            approveVotes[appId] = 0;
            rejectVotes[appId]  = 0;
            delete proposedRejectionReason[appId];
            app.state         = ApplicationState.SUBMITTED;
            app.queuePosition = fcfsQueue.length + 1;
            fcfsQueue.push(appId);
            _emitPriorityAlert(appId);
        }
        auditLog.logEvent(appId, msg.sender, AuditLog.ActionType.DISPUTE_RESOLVED,
            reopen ? "Re-opened: re-entered queue for fresh review" : "Rejection upheld by admin");
    }

    // ─────────────────────────────────────────────────────────
    //  ADMIN — SET TOTAL VALIDATORS (auto-updates 70% threshold)
    // ─────────────────────────────────────────────────────────

    /// @notice Call this every time you add or remove a validator.
    ///         Automatically recalculates the 70% consensus threshold.
    ///         Examples: n=3 → threshold=3 | n=5 → threshold=4 | n=10 → threshold=7
    function setTotalValidators(uint256 n) external onlyAdmin {
        require(n >= 1, "Registry: need at least 1 validator");
        uint256 oldCount = totalValidators;
        totalValidators    = n;
        // ceil(n * 70 / 100)
        consensusThreshold = _ceilDiv(n, 70, 100);
        // Minimum 1 vote always required
        if (consensusThreshold == 0) consensusThreshold = 1;
        emit ValidatorCountUpdated(oldCount, n, consensusThreshold, msg.sender);
    }

    // ─────────────────────────────────────────────────────────
    //  DEADLOCK RESOLUTION
    // ─────────────────────────────────────────────────────────

    /// @notice Set how many days past SLA before admin can force-resolve a deadlock.
    function setDeadlockTimeout(uint256 days_) external onlyAdmin {
        require(days_ >= 1, "Registry: minimum 1 day");
        deadlockTimeoutDays = days_;
    }

    /// @notice If a VOTING application is past (SLA + deadlockTimeoutDays) and
    ///         mathematically cannot reach consensus (e.g. validator died),
    ///         admin can re-queue it for a fresh vote with reset counts.
    function resolveDeadlock(uint256 appId) external onlyAdmin applicationExists(appId) {
        Application storage app = applications[appId];
        require(app.state == ApplicationState.VOTING, "Registry: not in VOTING");

        uint256 sla      = schemeConfig.getScheme(app.schemeId).maxProcessingDays;
        uint256 deadline = app.submittedAt + (sla + deadlockTimeoutDays) * 1 days;
        require(block.timestamp >= deadline, "Registry: timeout not reached yet");

        // Verify it is actually deadlocked: check if consensus is still reachable
        uint256 votesCast = approveVotes[appId] + rejectVotes[appId];
        uint256 remaining = totalValidators > votesCast ? totalValidators - votesCast : 0;
        bool canApprove   = approveVotes[appId] + remaining >= consensusThreshold;
        bool canReject    = rejectVotes[appId]  + remaining >= consensusThreshold;
        require(!canApprove || !canReject, "Registry: not deadlocked, consensus still reachable");

        // Reset votes and re-queue at back
        approveVotes[appId] = 0;
        rejectVotes[appId]  = 0;
        delete proposedRejectionReason[appId];
        delete rejectVoters[appId];

        app.state         = ApplicationState.SUBMITTED;
        app.reviewer      = address(0);
        app.queuePosition = fcfsQueue.length + 1;
        fcfsQueue.push(appId);

        _emitPriorityAlert(appId);

        auditLog.logEvent(
            appId, msg.sender, AuditLog.ActionType.DISPUTE_RESOLVED,
            string(abi.encodePacked(
                "DEADLOCK RESOLVED by admin: re-queued after ",
                _uint2str(deadlockTimeoutDays),
                " day timeout. All votes reset."
            ))
        );

        emit DeadlockResolved(appId, msg.sender, "Deadlock timeout: votes reset and re-queued", block.timestamp);
    }

    /// @notice Returns all application IDs currently deadlocked
    ///         (in VOTING past SLA+timeout and consensus unreachable).
    function getDeadlockedApps() external view returns (uint256[] memory deadlocked) {
        uint256 count = 0;
        for (uint256 i = 1; i < nextApplicationId; i++) {
            if (_isDeadlocked(i)) count++;
        }
        deadlocked = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 1; i < nextApplicationId; i++) {
            if (_isDeadlocked(i)) deadlocked[idx++] = i;
        }
    }

    function _isDeadlocked(uint256 appId) internal view returns (bool) {
        Application storage app = applications[appId];
        if (app.state != ApplicationState.VOTING) return false;
        uint256 sla      = schemeConfig.getScheme(app.schemeId).maxProcessingDays;
        uint256 deadline = app.submittedAt + (sla + deadlockTimeoutDays) * 1 days;
        if (block.timestamp < deadline) return false;
        uint256 votesCast = approveVotes[appId] + rejectVotes[appId];
        uint256 remaining = totalValidators > votesCast ? totalValidators - votesCast : 0;
        bool canApprove   = approveVotes[appId] + remaining >= consensusThreshold;
        bool canReject    = rejectVotes[appId]  + remaining >= consensusThreshold;
        return !canApprove || !canReject;
    }

    // ─────────────────────────────────────────────────────────
    //  [QUEUE] VALIDATOR QUEUE VIEW
    // ─────────────────────────────────────────────────────────

    /// @notice Returns ALL pending applications in FCFS order.
    ///         This is the primary function validators use to see their workload.
    ///         Index 0 = oldest application (must be processed first).
    ///         Includes both SUBMITTED (waiting) and VOTING (in progress) apps.
    ///
    /// @return queue  Array of QueueEntry structs, one per pending application
    function getValidatorQueue() external view returns (QueueEntry[] memory queue) {
        // First pass: count pending apps
        uint256 count = 0;
        for (uint256 i = queueFront; i < fcfsQueue.length; i++) {
            ApplicationState s = applications[fcfsQueue[i]].state;
            if (s == ApplicationState.SUBMITTED || s == ApplicationState.VOTING) {
                count++;
            }
        }

        queue = new QueueEntry[](count);
        uint256 idx = 0;

        // Second pass: fill entries in FCFS order
        for (uint256 i = queueFront; i < fcfsQueue.length; i++) {
            uint256 appId = fcfsQueue[i];
            Application storage app = applications[appId];
            ApplicationState s = app.state;

            if (s != ApplicationState.SUBMITTED && s != ApplicationState.VOTING) continue;

            uint256 sla         = schemeConfig.getScheme(app.schemeId).maxProcessingDays;
            uint256 daysElapsed = (block.timestamp - app.submittedAt) / 1 days;
            uint256 leading     = approveVotes[appId] > rejectVotes[appId]
                                ? approveVotes[appId] : rejectVotes[appId];
            uint256 needed      = leading >= consensusThreshold ? 0 : consensusThreshold - leading;

            queue[idx] = QueueEntry({
                appId:        appId,
                queuePosition: app.queuePosition,
                state:        s,
                submittedAt:  app.submittedAt,
                daysElapsed:  daysElapsed,
                slaDays:      sla,
                slaBreach:    daysElapsed > sla,
                approveVotes: approveVotes[appId],
                rejectVotes:  rejectVotes[appId],
                votesNeeded:  needed
            });
            idx++;
        }
    }

    /// @notice How many applications are currently pending (SUBMITTED or VOTING).
    function pendingCount() external view returns (uint256 count) {
        for (uint256 i = queueFront; i < fcfsQueue.length; i++) {
            ApplicationState s = applications[fcfsQueue[i]].state;
            if (s == ApplicationState.SUBMITTED || s == ApplicationState.VOTING) count++;
        }
    }

    // ─────────────────────────────────────────────────────────
    //  ALL REJECTION REASONS — one per rejecting validator
    // ─────────────────────────────────────────────────────────
    struct RejectionDetail {
        address validator;
        string  reason;
    }

    function getAllRejectionReasons(uint256 appId)
        external view applicationExists(appId)
        returns (RejectionDetail[] memory details)
    {
        address[] storage voters = rejectVoters[appId];
        details = new RejectionDetail[](voters.length);
        for (uint256 i = 0; i < voters.length; i++) {
            details[i] = RejectionDetail({
                validator: voters[i],
                reason:    validatorRejectionReason[appId][voters[i]]
            });
        }
    }

    // ─────────────────────────────────────────────────────────
    //  VOTE STATUS VIEW
    // ─────────────────────────────────────────────────────────
    function getVoteStatus(uint256 appId)
        external view applicationExists(appId)
        returns (
            ApplicationState appState,
            uint256 approveCount,
            uint256 rejectCount,
            uint256 threshold,
            uint256 votesStillNeeded,
            bool    callerHasVoted
        )
    {
        appState     = applications[appId].state;
        approveCount = approveVotes[appId];
        rejectCount  = rejectVotes[appId];
        threshold    = consensusThreshold;
        uint256 leading = approveCount > rejectCount ? approveCount : rejectCount;
        votesStillNeeded = leading >= threshold ? 0 : threshold - leading;
        callerHasVoted   = hasVoted[appId][msg.sender];
    }

    // ─────────────────────────────────────────────────────────
    //  PROCESSING TIME VIEW
    // ─────────────────────────────────────────────────────────
    function getProcessingTime(uint256 appId)
        external view applicationExists(appId)
        returns (ProcessingTimeResult memory result)
    {
        Application storage app = applications[appId];
        result.submittedAt        = app.submittedAt;
        result.decidedAt          = app.decidedAt;
        result.processingSeconds  = app.processingSeconds;
        result.processingDays     = app.processingDays;
        result.currentElapsedDays = (block.timestamp - app.submittedAt) / 1 days;
        result.isDecided          = app.decidedAt > 0;
    }

    // ─────────────────────────────────────────────────────────
    //  SLA CHECK
    // ─────────────────────────────────────────────────────────
    function checkSLABreach(uint256 appId)
        external view applicationExists(appId)
        returns (bool breached, uint256 daysElapsed)
    {
        Application storage app = applications[appId];
        if (app.state == ApplicationState.SUBMITTED || app.state == ApplicationState.VOTING) {
            daysElapsed = (block.timestamp - app.submittedAt) / 1 days;
            breached    = daysElapsed > schemeConfig.getScheme(app.schemeId).maxProcessingDays;
        }
    }

    // ─────────────────────────────────────────────────────────
    //  STANDARD VIEWS
    // ─────────────────────────────────────────────────────────
    function getApplication(uint256 appId) external view applicationExists(appId) returns (Application memory) {
        return applications[appId];
    }

    function getApplicationStatus(uint256 appId)
        external view applicationExists(appId)
        returns (ApplicationState state, string memory rejectionReason, address decidedBy, uint256 decidedAt)
    {
        Application storage app = applications[appId];
        return (app.state, app.rejectionReason, app.finalDecisionBy, app.decidedAt);
    }

    function getApplicationsByWallet(address wallet) external view returns (uint256[] memory) {
        return walletApplications[wallet];
    }

    function isAadhaarRegistered(bytes32 aadhaarHash) external view returns (bool) {
        return aadhaarRegistered[aadhaarHash];
    }

    /// @notice Returns the applicationId that currently has this aadhaarHash in an ACTIVE state
    ///         (SUBMITTED=1, VOTING=2, APPROVED=3, DISPUTED=6).
    ///         Returns 0 if no active application exists — meaning re-application is allowed.
    function getActiveApplicationByAadhaar(bytes32 aadhaarHash) external view returns (uint256 activeAppId) {
        for (uint256 i = 1; i < nextApplicationId; i++) {
            Application storage app = applications[i];
            if (app.aadhaarHash == aadhaarHash) {
                uint8 s = uint8(app.state);
                // Active = SUBMITTED(1), VOTING(2), APPROVED(3), DISPUTED(6)
                if (s == 1 || s == 2 || s == 3 || s == 6) {
                    return i;
                }
            }
        }
        return 0;
    }

    // Expose contract addresses for verification
    function getRoleAccess()   external view returns (address) { return address(roleAccess); }
    function getAuditLog()     external view returns (address) { return address(auditLog); }
    function getFundManager()  external view returns (address) { return address(fundManager); }
    function getSchemeConfig() external view returns (address) { return address(schemeConfig); }
    function getIPFSVerifier() external view returns (address) { return address(ipfsVerifier); }

    function _uint2str(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 t = v; uint256 d;
        while (t != 0) { d++; t /= 10; }
        bytes memory b = new bytes(d);
        while (v != 0) { d--; b[d] = bytes1(uint8(48 + (v % 10))); v /= 10; }
        return string(b);
    }
}
