// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.8.0;

import "@gnosis.pm/zodiac/contracts/core/Module.sol";
import "usingtellor/contracts/UsingTellor.sol";
import "hardhat/console.sol";

contract TellorModule is Module, UsingTellor {
    // Events
    event ProposalQuestionCreated(
        bytes32 indexed questionId,
        string indexed proposalId
    );

    event TellorModuleSetup(
        address indexed initiator,
        address indexed owner,
        address indexed avatar,
        address target
    );

    // Storage
    uint32 public answerExpiration;
    bytes32 public constant DOMAIN_SEPARATOR_TYPEHASH =
        0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218;
    // keccak256(
    //     "EIP712Domain(uint256 chainId,address verifyingContract)"
    // );

    // Mapping of questionHash to transactionHash to execution state
    mapping(bytes32 => mapping(bytes32 => bool))
        public executedProposalTransactions;

    bytes32 public constant INVALIDATED =
        0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

    uint32 public questionCooldown;

    // Mapping of question hash to question id. Special case: INVALIDATED for question hashes that have been invalidated
    mapping(bytes32 => bytes32) public questionIds;

    bytes32 public constant TRANSACTION_TYPEHASH =
        0x72e9670a7ee00f5fbf1049b8c38e3f22fab7e9b85029e85cf9412f17fdd5c2ad;

    // keccak256(
    //     "Transaction(address to,uint256 value,bytes data,uint8 operation,uint256 nonce)"
    // );

    /*Functions*/
    /**
     * @param _owner Address of the owner
     * @param _avatar Address of the avatar (e.g. a Safe)
     * @param _target Address of the contract that will call exec function
     * @param _tellorAddress Address of the Tellor oracle contract
     * @param _cooldown Cooldown in seconds that should be required after a oracle provided answer
     * @param _expiration Duration that a positive answer of the oracle is valid in seconds (or 0 if valid forever)
     * @notice There need to be at least 60 seconds between end of cooldown and expiration
     */
    constructor(
        address _owner,
        address _avatar,
        address _target,
        address payable _tellorAddress,
        uint32 _cooldown,
        uint32 _expiration
    ) UsingTellor(_tellorAddress) {
        bytes memory initParams = abi.encode(
            _owner,
            _avatar,
            _target,
            _cooldown,
            _expiration
        );
        setUp(initParams);
    }

    function addProposal(string memory _proposalId, bytes32[] memory _txHashes)
        public
    {
        _addProposalWithNonce(_proposalId, _txHashes, 0);
    }

    /**
     * @dev Build the question by combining the proposalId and the hex string of the hash of the txHashes
     * @param _proposalId Id of the proposal that proposes to execute the transactions represented by the txHashes
     * @param _txHashes EIP-712 Hashes of the transactions that should be executed
     */
    function buildQuestion(
        string memory _proposalId,
        bytes32[] memory _txHashes
    ) public pure returns (string memory) {
        string memory _txsHash = _bytes32ToAsciiString(
            keccak256(abi.encodePacked(_txHashes))
        );
        return
            string(abi.encodePacked(_proposalId, bytes3(0xe2909f), _txsHash));
    }

    /**
     * @dev Executes the transactions of a proposal via the target if accepted
     * @param _proposalId Id that should identify the proposal uniquely
     * @param _txHashes EIP-712 hashes of the transactions that should be executed
     * @param _to Target of the transaction that should be executed
     * @param _value Wei value of the transaction that should be executed
     * @param _data Data of the transaction that should be executed
     * @param _operation Operation (Call or Delegatecall) of the transaction that should be executed
     * @notice The txIndex used by this function is always 0
     */
    function executeProposal(
        string memory _proposalId,
        bytes32[] memory _txHashes,
        address _to,
        uint256 _value,
        bytes memory _data,
        Enum.Operation _operation
    ) public {
        executeProposalWithIndex(
            _proposalId,
            _txHashes,
            _to,
            _value,
            _data,
            _operation,
            0
        );
    }

    /**
     * @dev Executes the transactions of a proposal via the target if accepted
     * @param _proposalId Id that should identify the proposal uniquely
     * @param _txHashes EIP-712 hashes of the transactions that should be executed
     * @param _to Target of the transaction that should be executed
     * @param _value Wei value of the transaction that should be executed
     * @param _data Data of the transaction that should be executed
     * @param _operation Operation (Call or Delegatecall) of the transaction that should be executed
     * @param _txIndex Index of the transaction hash in txHashes. This is used as the nonce for the transaction, to make the tx hash unique
     */
    function executeProposalWithIndex(
        string memory _proposalId,
        bytes32[] memory _txHashes,
        address _to,
        uint256 _value,
        bytes memory _data,
        Enum.Operation _operation,
        uint256 _txIndex
    ) public {
        // We use the hash of the question to check the execution state, as the other parameters might change, but the question not
        bytes32 _questionHash = keccak256(
            bytes(buildQuestion(_proposalId, _txHashes))
        );
        // Lookup question id for this proposal
        bytes32 _questionId = questionIds[_questionHash];

        // Question hash needs to set to be eligible for execution
        require(
            _questionId != bytes32(0),
            "No question id set for provided proposal"
        );
        require(_questionId != INVALIDATED, "Proposal has been invalidated");

        bytes32 _txHash = getTransactionHash(
            _to,
            _value,
            _data,
            _operation,
            _txIndex
        );

        require(_txHashes[_txIndex] == _txHash, "Unexpected transaction hash");

        (
            bool _ifRetrieve,
            bytes memory _valueRetrieved,
            uint256 _timestampReceived
        ) = getDataBefore(_questionId, block.timestamp);

        require(_ifRetrieve, "Data not retrieved");

        // The answer is valid in the time after the cooldown and before the expiration time (if set).
        require(
            _timestampReceived + uint256(questionCooldown) < block.timestamp,
            "Wait for additional cooldown"
        );

        bool _didPass = abi.decode(_valueRetrieved, (bool));

        require(_didPass, "Transaction was not approved");

        uint32 _expiration = answerExpiration;
        require(
            _expiration == 0 ||
                _timestampReceived + uint256(_expiration) >= block.timestamp,
            "Answer has expired"
        );

        // Check this is either the first transaction in the list or that the previous question was already approved
        require(
            _txIndex == 0 ||
                executedProposalTransactions[_questionHash][
                    _txHashes[_txIndex - 1]
                ],
            "Previous transaction not executed yet"
        );
        // Check that this question was not executed yet
        require(
            !executedProposalTransactions[_questionHash][_txHash],
            "Cannot execute transaction again"
        );
        // Mark transaction as executed
        executedProposalTransactions[_questionHash][_txHash] = true;
        // Execute the transaction via the target.

        require(
            exec(_to, _value, _data, _operation),
            "Module transaction failed"
        );
    }

    /**
     * @dev Generate the question id.
     * @notice It is required that this is the same as for the oracle implementation used.
     */
    function getQuestionId(string memory _proposalId)
        public
        pure
        returns (bytes32)
    {
        bytes32 _questionId = keccak256(
            abi.encode("Snapshot", abi.encode(_proposalId))
        );
        return _questionId;
    }

    /// @dev Returns the chain id used by this contract.
    function getChainId() public view returns (uint256) {
        uint256 _id;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            _id := chainid()
        }
        return _id;
    }

    /// @dev Generates the data for the module transaction hash (required for signing)
    function generateTransactionHashData(
        address _to,
        uint256 _value,
        bytes memory _data,
        Enum.Operation _operation,
        uint256 _nonce
    ) public view returns (bytes memory) {
        uint256 _chainId = getChainId();
        bytes32 _domainSeparator = keccak256(
            abi.encode(DOMAIN_SEPARATOR_TYPEHASH, _chainId, this)
        );
        bytes32 _transactionHash = keccak256(
            abi.encode(
                TRANSACTION_TYPEHASH,
                _to,
                _value,
                keccak256(_data),
                _operation,
                _nonce
            )
        );
        return
            abi.encodePacked(
                bytes1(0x19),
                bytes1(0x01),
                _domainSeparator,
                _transactionHash
            );
    }

    function getTransactionHash(
        address _to,
        uint256 _value,
        bytes memory _data,
        Enum.Operation _operation,
        uint256 _nonce
    ) public view returns (bytes32) {
        return
            keccak256(
                generateTransactionHashData(
                    _to,
                    _value,
                    _data,
                    _operation,
                    _nonce
                )
            );
    }

    /**
     * @dev Marks a proposal as invalid, preventing execution of the connected transactions
     * @param _proposalId Id that should identify the proposal uniquely
     * @param _txHashes EIP-712 hashes of the transactions that should be executed
     * @notice This can only be called by the owner
     */
    function markProposalAsInvalid(
        string memory _proposalId,
        bytes32[] memory _txHashes // owner only is checked in markProposalAsInvalidByHash(bytes32)
    ) public {
        string memory _question = buildQuestion(_proposalId, _txHashes);
        bytes32 _questionHash = keccak256(bytes(_question));
        markProposalAsInvalidByHash(_questionHash);
    }

    /**
     * @dev @dev Marks a question hash as invalid, preventing execution of the connected transactions
     * @param _questionHash Question hash calculated based on the proposal id and txHashes
     * @notice This can only be called by the owner
     */
    function markProposalAsInvalidByHash(bytes32 _questionHash)
        public
        onlyOwner
    {
        questionIds[_questionHash] = INVALIDATED;
    }

    /**
     * @dev Marks a proposal with an expired answer as invalid, preventing execution of the connected transactions
     * @param _questionHash Question hash calculated based on the proposal id and txHashes
     */
    function markProposalWithExpiredAnswerAsInvalid(bytes32 _questionHash)
        public
    {
        uint32 _expirationDuration = answerExpiration;
        require(_expirationDuration > 0, "Answers are valid forever");
        bytes32 _questionId = questionIds[_questionHash];
        require(_questionId != INVALIDATED, "Proposal is already invalidated");
        require(
            _questionId != bytes32(0),
            "No question id set for provided proposal"
        );
        (
            bool _ifRetrieve,
            bytes memory _valueRetrieved,
            uint256 _timestampRetrieved
        ) = getDataBefore(_questionId, block.timestamp);

        require(_ifRetrieve, "Data not retrieved");

        bool _didPass = abi.decode(_valueRetrieved, (bool));

        require(_didPass, "Transaction was not approved");

        require(
            _timestampRetrieved + uint256(_expirationDuration) <
                block.timestamp,
            "Answer has not expired yet"
        );

        questionIds[_questionHash] = INVALIDATED;
    }

    /**
     * @dev Sets the duration for which a positive answer is valid.
     * @param _expiration Duration that a positive answer of the oracle is valid in seconds (or 0 if valid forever)
     * @notice A proposal with an expired answer is the same as a proposal that has been marked invalid
     * @notice There need to be at least 60 seconds between end of cooldown and expiration
     * @notice This can only be called by the owner
     */
    function setAnswerExpiration(uint32 _expiration) public onlyOwner {
        require(
            _expiration == 0 || _expiration - questionCooldown >= 60,
            "There need to be at least 60s between end of cooldown and expiration"
        );
        answerExpiration = _expiration;
    }

    /**
     * @dev Sets the cooldown before an answer is usable.
     * @param _cooldown Cooldown in seconds that should be required after a oracle provided answer
     * @notice This can only be called by the owner
     * @notice There need to be at least 60 seconds between end of cooldown and expiration
     */
    function setQuestionCooldown(uint32 _cooldown) public onlyOwner {
        uint32 _expiration = answerExpiration;
        require(
            _expiration == 0 || _expiration - _cooldown >= 60,
            "There need to be at least 60s between end of cooldown and expiration"
        );
        questionCooldown = _cooldown;
    }

    function setUp(bytes memory initParams) public override {
        (
            address _owner,
            address _avatar,
            address _target,
            uint32 _cooldown,
            uint32 _expiration
        ) = abi.decode(initParams, (address, address, address, uint32, uint32));
        __Ownable_init();
        require(_avatar != address(0), "Avatar can not be zero address");
        require(_target != address(0), "Target can not be zero address");
        require(
            _expiration == 0 || _expiration - _cooldown >= 60,
            "There need to be at least 60s between end of cooldown and expiration"
        );
        avatar = _avatar;
        target = _target;
        answerExpiration = _expiration;
        questionCooldown = _cooldown;

        transferOwnership(_owner);

        emit TellorModuleSetup(msg.sender, _owner, _avatar, _target);
    }

    /**
     * @dev Function to add a proposal that should be considered for execution
     * @param _proposalId Id that should identify the proposal uniquely
     * @param _txHashes EIP-712 hashes of the transactions that should be executed
     * @param _nonce Nonce that should be used when asking the question on the oracle
     */
    function _addProposalWithNonce(
        string memory _proposalId,
        bytes32[] memory _txHashes,
        uint256 _nonce
    ) internal {
        // We generate the question string used for the oracle
        string memory _question = buildQuestion(_proposalId, _txHashes);
        bytes32 _questionHash = keccak256(bytes(_question));
        if (_nonce > 0) {
            // Previous nonce must have been invalidated by the oracle.
            // However, if the proposal was internally invalidated, it should not be possible to ask it again.
            bytes32 _currentQuestionId = questionIds[_questionHash];
            (bool _ifRetrieve, , ) = getDataBefore(
                _currentQuestionId,
                block.timestamp - questionCooldown
            );
            require(
                _currentQuestionId != INVALIDATED,
                "This proposal has been marked as invalid"
            );
            require(_ifRetrieve, "Data not retrieved");
        } else {
            require(
                questionIds[_questionHash] == bytes32(0),
                "Proposal has already been submitted"
            );
        }
        bytes32 _questionId = getQuestionId(_proposalId);
        // Set the question hash for this question id
        questionIds[_questionHash] = _questionId;
        emit ProposalQuestionCreated(_questionId, _proposalId);
    }

    function _bytes32ToAsciiString(bytes32 _bytes)
        internal
        pure
        returns (string memory)
    {
        bytes memory s = new bytes(64);
        for (uint256 i = 0; i < 32; i++) {
            uint8 b = uint8(bytes1(_bytes << (i * 8)));
            uint8 hi = uint8(b) / 16;
            uint8 lo = uint8(b) % 16;
            s[2 * i] = _char(hi);
            s[2 * i + 1] = _char(lo);
        }
        return string(s);
    }

    function _char(uint8 _b) internal pure returns (bytes1 c) {
        if (_b < 10) return bytes1(_b + 0x30);
        else return bytes1(_b + 0x57);
    }
}
