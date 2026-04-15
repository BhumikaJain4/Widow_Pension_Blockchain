// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ============================================================
//  CONTRACT 4: IPFSVerifier.sol
//  Deploy FOURTH. Constructor arg: RoleAccess address.
//  Project: Blockchain-Based Widow Pension Administration
//  Group:   IBC07 | CSE 542 | Prof. Sanjay Chaudhary
// ============================================================

import "./RoleAccess.sol";

contract IPFSVerifier {

    RoleAccess public roleAccess;

    modifier onlyRegistry() {
        require(
            roleAccess.hasRole(roleAccess.REGISTRY_ROLE(), msg.sender),
            "IPFSVerifier: caller lacks REGISTRY_ROLE"
        );
        _;
    }

    struct DocumentRecord {
        string  ipfsCID;
        bytes32 sha256Hash;
        string  docType;
        uint256 anchoredAt;
        bool    exists;
    }

    mapping(uint256 => DocumentRecord[]) private documents;
    mapping(string => uint256) private cidToAppId;

    event DocumentAnchored(
        uint256 indexed applicationId,
        string  ipfsCID,
        bytes32 sha256Hash,
        string  docType,
        uint256 timestamp
    );

    event VerificationResult(
        uint256 indexed applicationId,
        bytes32 claimedHash,
        bool    isValid,
        address verifier
    );

    constructor(address roleAccessAddr) {
        require(roleAccessAddr != address(0), "IPFSVerifier: invalid RoleAccess");
        roleAccess = RoleAccess(roleAccessAddr);
    }

    // Called by PensionRegistry when submitting an application
    function anchorDocument(
        uint256 applicationId,
        string  calldata ipfsCID,
        bytes32 sha256Hash,
        string  calldata docType
    ) external onlyRegistry {
        require(bytes(ipfsCID).length > 0,  "IPFSVerifier: empty CID");
        require(sha256Hash != bytes32(0),    "IPFSVerifier: zero hash");
        require(bytes(docType).length > 0,  "IPFSVerifier: empty docType");
        require(cidToAppId[ipfsCID] == 0,   "IPFSVerifier: CID already anchored");

        documents[applicationId].push(DocumentRecord({
            ipfsCID:    ipfsCID,
            sha256Hash: sha256Hash,
            docType:    docType,
            anchoredAt: block.timestamp,
            exists:     true
        }));

        cidToAppId[ipfsCID] = applicationId;

        emit DocumentAnchored(applicationId, ipfsCID, sha256Hash, docType, block.timestamp);
    }

    // Validator calls this to verify a document's integrity
    function verifyDocument(
        uint256 applicationId,
        uint256 docIndex,
        bytes32 claimedHash
    ) external returns (bool isValid, string memory storedCID) {
        require(docIndex < documents[applicationId].length, "IPFSVerifier: out of bounds");

        DocumentRecord memory doc = documents[applicationId][docIndex];
        isValid   = (doc.sha256Hash == claimedHash);
        storedCID = doc.ipfsCID;

        emit VerificationResult(applicationId, claimedHash, isValid, msg.sender);
    }

    // Returns all documents for an application
    function getDocumentManifest(
        uint256 applicationId
    ) external view returns (DocumentRecord[] memory) {
        return documents[applicationId];
    }

    // Returns a single document by index
    function getDocument(
        uint256 applicationId,
        uint256 docIndex
    ) external view returns (DocumentRecord memory) {
        require(docIndex < documents[applicationId].length, "IPFSVerifier: out of bounds");
        return documents[applicationId][docIndex];
    }

    // Returns total document count for an application
    function documentCount(
        uint256 applicationId
    ) external view returns (uint256) {
        return documents[applicationId].length;
    }

    // Lookup which application a CID belongs to
    function getAppIdByCID(
        string calldata cid
    ) external view returns (uint256) {
        return cidToAppId[cid];
    }
}