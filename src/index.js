import { CosmWasmClient, SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import BigNumber from 'bignumber.js';

// Configure BigNumber
BigNumber.config({
  DECIMAL_PLACES: 18,
  ROUNDING_MODE: BigNumber.ROUND_DOWN,
  EXPONENTIAL_AT: 1e+9
});

// Constants
const PERSISTENCE_CHAIN_ID = 'core-1';
const RPC_ENDPOINT = 'https://rpc.core.persistence.one';
const REST_ENDPOINT = 'https://rest.core.persistence.one';

// Sample CW20 tokens on Persistence - actual tokens we'll query
const CW20_TOKENS = [
  { 
    address: 'persistence1euqmngymytlt8j707spv9hn6ajzy92ndfjk47pnlu9uzmfuyplhs47y4e7', 
    name: 'ATOM-XPRT LP',
    symbol: 'ATOM-XPRT LP' 
  },
  {
    address: 'persistence1l26l2qrvvf0mc4mrt3gpzunql6t2cp8jx52x0c4hu6hrlccw6l5sc2plfh',
    name: 'PSTAKE-XPRT LP',
    symbol: 'ATOM-XPRT LP'
  }
];

// State
let userAddress = null;
let tokenBalances = [];
let keplrClient = null;
let cosmWasmClient = null;
let signingClient = null;

// Helper function to create CosmWasm client
async function createCosmWasmClient() {
  try {
    return await CosmWasmClient.connect(RPC_ENDPOINT);
  } catch (error) {
    console.error('Failed to create CosmWasm client:', error);
    throw error;
  }
}

// Query CW20 token balance
async function queryCW20Balance(tokenAddress, walletAddress) {
  try {
    const query = {
      balance: {
        address: walletAddress
      }
    };
    const result = await cosmWasmClient.queryContractSmart(tokenAddress, query);
    return result.balance;
  } catch (error) {
    console.error(`Failed to query balance for token ${tokenAddress}:`, error);
    return '0';
  }
}

// Query CW20 token info
async function queryCW20TokenInfo(tokenAddress) {
  try {
    const query = {
      token_info: {}
    };
    return await cosmWasmClient.queryContractSmart(tokenAddress, query);
  } catch (error) {
    console.error(`Failed to query token info for ${tokenAddress}:`, error);
    return null;
  }
}

// Initialize CosmJS client
async function initializeCosmosClient(offlineSigner) {
  try {
    cosmWasmClient = await createCosmWasmClient();
    signingClient = await SigningCosmWasmClient.connectWithSigner(
      RPC_ENDPOINT,
      offlineSigner
    );
    keplrClient = {
      offlineSigner,
      address: userAddress,
      cosmWasmClient,
      signingClient
    };
  } catch (error) {
    showError(`Failed to initialize CosmJS client: ${error.message}`);
  }
}

// Load CW20 token balances
async function loadTokenBalances() {
  try {
    if (!cosmWasmClient || !userAddress) {
      throw new Error('Client or wallet not initialized');
    }

    // Clear existing rows and show loading state
    const tokensTableBody = document.getElementById('tokens-tbody');
    tokensTableBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; padding: 20px;">
          <div class="balance-loader">
            <div class="balance-spinner"></div>
            <p>Fetching token balances...</p>
          </div>
        </td>
      </tr>
    `;
    
    // Add loader styles if not already added
    if (!document.getElementById('balance-loader-styles')) {
      const style = document.createElement('style');
      style.id = 'balance-loader-styles';
      style.textContent = `
        .balance-loader {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }
        .balance-spinner {
          width: 30px;
          height: 30px;
          border: 3px solid #f3f3f3;
          border-top: 3px solid #5f259f;
          border-radius: 50%;
          animation: balance-spin 1s linear infinite;
        }
        @keyframes balance-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    showLoading(true);

    // Fetch balances for each token
    const balancePromises = CW20_TOKENS.map(async (token) => {
      const balance = await queryCW20Balance(token.address, userAddress);
      const tokenInfo = await queryCW20TokenInfo(token.address);
      
      return {
        ...token,
        balance: balance,
        decimals: tokenInfo?.decimals || 6
      };
    });

    tokenBalances = await Promise.all(balancePromises);
    renderTokenBalances();
    showLoading(false);
  } catch (error) {
    const tokensTableBody = document.getElementById('tokens-tbody');
    tokensTableBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; padding: 20px; color: #c62828;">
          Failed to load token balances: ${error.message}
        </td>
      </tr>
    `;
    showError(`Failed to load token balances: ${error.message}`);
    showLoading(false);
  }
}

// Render token balances to the table
function renderTokenBalances() {
  const tokensTableBody = document.getElementById('tokens-tbody');
  
  // Clear the table body first to remove the loader
  tokensTableBody.innerHTML = '';
  
  tokenBalances.forEach(token => {
    // Keep the original balance string to preserve precision
    const rawBalance = token.balance;
    console.log('Raw balance from chain:', rawBalance);
    
    // Calculate formatted balance preserving all decimal places
    const formattedBalance = new BigNumber(rawBalance)
      .dividedBy(new BigNumber(10).pow(token.decimals))
      .toString(10); // Base 10, full precision
    console.log('Formatted balance:', formattedBalance);
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="checkbox-cell">
        <input type="checkbox" data-token-address="${token.address}" class="token-checkbox">
      </td>
      <td>${token.symbol} (${token.name})</td>
      <td>${formattedBalance}</td>
      <td>
        <div class="amount-input-container">
          <input type="text" 
                 inputmode="decimal"
                 pattern="[0-9]*[.]?[0-9]*"
                 min="0" 
                 max="${formattedBalance}" 
                 value="0" 
                 class="transfer-amount" 
                 data-token-address="${token.address}"
                 style="width: 120px; margin-right: 8px;">
          <button class="amount-btn half-btn" 
                  data-token-address="${token.address}" 
                  data-amount="${new BigNumber(formattedBalance).dividedBy(2).toString(10)}">
            Half
          </button>
          <button class="amount-btn max-btn" 
                  data-token-address="${token.address}" 
                  data-amount="${formattedBalance}">
            Max
          </button>
        </div>
      </td>
    `;
    tokensTableBody.appendChild(row);
  });

  // Add styles for the new elements
  const style = document.createElement('style');
  style.textContent = `
    .amount-input-container {
      display: flex;
      align-items: center;
    }
    .transfer-amount {
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 5px;
      font-size: 14px;
    }
    .transfer-amount::-webkit-inner-spin-button,
    .transfer-amount::-webkit-outer-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .amount-btn {
      padding: 6px 12px;
      margin: 0 4px;
      background-color: #5f259f;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    .amount-btn:hover {
      background-color: #4a1d7a;
    }
  `;
  document.head.appendChild(style);

  // Add event listeners
  document.querySelectorAll('.token-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      updateTransferButton();
      // Log state for debugging
      console.log('Checkbox changed, new state:', {
        checked: checkbox.checked,
        tokenAddress: checkbox.getAttribute('data-token-address'),
        amount: document.querySelector(`.transfer-amount[data-token-address="${checkbox.getAttribute('data-token-address')}"]`).value
      });
    });
  });

  document.querySelectorAll('.transfer-amount').forEach(input => {
    input.addEventListener('input', handleAmountInput);
    
    // Prevent non-numeric input
    input.addEventListener('keypress', (event) => {
      if (!/[\d.]/.test(event.key) || 
          (event.key === '.' && input.value.includes('.'))) {
        event.preventDefault();
      }
    });
    
    // Handle paste events
    input.addEventListener('paste', (event) => {
      const pastedText = (event.clipboardData || window.clipboardData).getData('text');
      if (!/^\d*\.?\d*$/.test(pastedText)) {
        event.preventDefault();
      }
    });
  });

  // Add event listeners for Half and Max buttons
  document.querySelectorAll('.amount-btn').forEach(button => {
    button.addEventListener('click', (event) => {
      const tokenAddress = button.getAttribute('data-token-address');
      const amount = button.getAttribute('data-amount');
      const input = document.querySelector(`.transfer-amount[data-token-address="${tokenAddress}"]`);
      input.value = amount;
      console.log('Button clicked, setting amount:', amount);
      updateTransferButton();
    });
  });
}

// Handle amount input changes
function handleAmountInput(event) {
  const input = event.target;
  let value = input.value.trim();
  
  // Remove any non-numeric characters except decimal point
  value = value.replace(/[^\d.]/g, '');
  
  // Ensure only one decimal point
  const parts = value.split('.');
  if (parts.length > 2) {
    value = parts[0] + '.' + parts.slice(1).join('');
  }
  
  // Convert to BigNumber for comparison
  const numValue = value === '' ? new BigNumber(0) : new BigNumber(value);
  const max = new BigNumber(input.getAttribute('max'));
  
  // Validate the value
  if (numValue.isGreaterThan(max)) {
    value = max.toString(10);
  }
  
  // Update the input value
  input.value = value;
  updateTransferButton();
}

// Update transfer button state
function updateTransferButton() {
  const transferButton = document.getElementById('transfer-button');
  const anyChecked = Array.from(document.querySelectorAll('.token-checkbox'))
    .some(checkbox => checkbox.checked);
  
  const anyAmountGreaterThanZero = Array.from(document.querySelectorAll('.token-checkbox'))
    .some(checkbox => {
      if (checkbox.checked) {
        const tokenAddress = checkbox.getAttribute('data-token-address');
        const amountInput = document.querySelector(`.transfer-amount[data-token-address="${tokenAddress}"]`);
        const amount = amountInput.value;
        return !isNaN(amount) && new BigNumber(amount).isGreaterThan(0);
      }
      return false;
    });
  
  const recipientValid = document.getElementById('recipient-address').value.trim().startsWith('persistence1') &&
                        document.getElementById('recipient-address').value.trim().length >= 39;

  const shouldEnable = anyChecked && anyAmountGreaterThanZero && recipientValid;
  console.log('Transfer button state:', {
    anyChecked,
    anyAmountGreaterThanZero,
    recipientValid,
    shouldEnable
  });
  
  transferButton.disabled = !shouldEnable;
}

// Validate recipient address
function validateRecipientAddress() {
  const recipientAddressInput = document.getElementById('recipient-address');
  const address = recipientAddressInput.value.trim();
  const isValid = address.startsWith('persistence1') && address.length >= 39 && address.length <= 65;
  
  if (address && !isValid) {
    recipientAddressInput.style.borderColor = 'red';
  } else {
    recipientAddressInput.style.borderColor = '';
  }
  
  updateTransferButton(); // Add this to ensure button state updates when address changes
  return isValid && address;
}

// Connect Keplr wallet
async function connectKeplr() {
  console.log('Connecting to Keplr');
  try {
    if (!window.keplr) {
      throw new Error('Keplr wallet extension is not installed');
    }

    const connectWalletBtn = document.getElementById('connect-wallet');
    connectWalletBtn.disabled = true;
    showLoading(true);
    
    // Add Persistence chain if not already added
    await suggestChain();
    
    // Enable the chain
    await window.keplr.enable(PERSISTENCE_CHAIN_ID);
    
    // Get the offlineSigner
    const offlineSigner = window.keplr.getOfflineSigner(PERSISTENCE_CHAIN_ID);
    
    // Get user's address
    const accounts = await offlineSigner.getAccounts();
    userAddress = accounts[0].address;
    
    // Update UI
    document.getElementById('user-address').textContent = userAddress;
    document.getElementById('wallet-info').style.display = 'block';
    document.getElementById('token-list').style.display = 'block';
    document.getElementById('recipient-section').style.display = 'block';
    
    // Initialize client and load balances
    await initializeCosmosClient(offlineSigner);
    await loadTokenBalances();
    
    connectWalletBtn.textContent = 'Wallet Connected';
    showLoading(false);
    
    showSuccess('Wallet connected successfully!');
  } catch (error) {
    showError(`Failed to connect wallet: ${error.message}`);
    document.getElementById('connect-wallet').disabled = false;
    showLoading(false);
  }
}

// Suggest Persistence chain to Keplr
async function suggestChain() {
  if (!window.keplr) return;
  
  await window.keplr.experimentalSuggestChain({
    chainId: PERSISTENCE_CHAIN_ID,
    chainName: 'Persistence',
    rpc: RPC_ENDPOINT,
    rest: REST_ENDPOINT,
    bip44: {
      coinType: 750,
    },
    bech32Config: {
      bech32PrefixAccAddr: 'persistence',
      bech32PrefixAccPub: 'persistencepub',
      bech32PrefixValAddr: 'persistencevaloper',
      bech32PrefixValPub: 'persistencevaloperpub',
      bech32PrefixConsAddr: 'persistencevalcons',
      bech32PrefixConsPub: 'persistencevalconspub',
    },
    currencies: [
      {
        coinDenom: 'XPRT',
        coinMinimalDenom: 'uxprt',
        coinDecimals: 6,
      },
    ],
    feeCurrencies: [
      {
        coinDenom: 'XPRT',
        coinMinimalDenom: 'uxprt',
        coinDecimals: 6,
      },
    ],
    stakeCurrency: {
      coinDenom: 'XPRT',
      coinMinimalDenom: 'uxprt',
      coinDecimals: 6,
    },
    gasPriceStep: {
      low: 0.01,
      average: 0.025,
      high: 0.04,
    },
    features: ['ibc-transfer'],
  });
}

// Transfer selected tokens
async function transferTokens() {
  try {
    if (!keplrClient || !signingClient) {
      showError('Wallet not connected');
      return;
    }
    
    const recipientAddress = document.getElementById('recipient-address').value.trim();
    if (!validateRecipientAddress()) {
      showError('Invalid recipient address');
      return;
    }
    
    showLoading(true);
    document.getElementById('transfer-button').disabled = true;
    
    // Get selected tokens and amounts
    const transfers = [];
    document.querySelectorAll('.token-checkbox:checked').forEach(checkbox => {
      const tokenAddress = checkbox.getAttribute('data-token-address');
      const amountInput = document.querySelector(`.transfer-amount[data-token-address="${tokenAddress}"]`);
      const amount = amountInput.value; // Use the string value directly
      
      if (new BigNumber(amount).isGreaterThan(0)) {
        const token = tokenBalances.find(t => t.address === tokenAddress);
        transfers.push({
          tokenAddress,
          symbol: token.symbol,
          amount,
          decimals: token.decimals || 6
        });
      }
    });
    
    if (transfers.length === 0) {
      showError('No tokens selected for transfer');
      document.getElementById('transfer-button').disabled = false;
      showLoading(false);
      return;
    }
    
    // Execute CW20 token transfers
    for (const transfer of transfers) {
      // Calculate the raw amount preserving full precision
      const rawAmount = new BigNumber(transfer.amount)
        .multipliedBy(new BigNumber(10).pow(transfer.decimals))
        .integerValue(BigNumber.ROUND_DOWN)
        .toString(10);

      console.log('Transfer amount calculation:', {
        inputAmount: transfer.amount,
        decimals: transfer.decimals,
        rawAmount
      });
      
      const msg = {
        transfer: {
          recipient: recipientAddress,
          amount: rawAmount
        }
      };

      try {
        // Execute the actual transfer with gas configuration
        const result = await signingClient.execute(
          userAddress,
          transfer.tokenAddress,
          msg,
          {
            amount: [{
              denom: 'uxprt',
              amount: '500000'  // 0.05 XPRT for gas (increased from 0.005)
            }],
            gas: '400000'  // 400k gas units
          },
          'Transfer CW20 tokens',  // memo
          []  // funds
        );
        
        console.log(`Transfer successful for ${transfer.symbol}. TxHash: ${result.transactionHash}`);
      } catch (error) {
        console.error(`Transfer failed for ${transfer.symbol}:`, error);
        throw error;
      }
    }
    
    showSuccess(`Successfully transferred tokens to ${recipientAddress}`);
    
    // Reset form
    document.querySelectorAll('.token-checkbox').forEach(checkbox => {
      checkbox.checked = false;
    });
    
    document.querySelectorAll('.transfer-amount').forEach(input => {
      input.value = 0;
    });
    
    document.getElementById('recipient-address').value = '';
    document.getElementById('transfer-button').disabled = true;
    
    // Reload token balances
    await loadTokenBalances();
    
    showLoading(false);
  } catch (error) {
    showError(`Transfer failed: ${error.message}`);
    document.getElementById('transfer-button').disabled = false;
    showLoading(false);
  }
}

// UI Helper functions
function showLoading(isLoading) {
  document.getElementById('loading').style.display = isLoading ? 'inline-block' : 'none';
}

function showError(message) {
  const statusMessageDiv = document.getElementById('status-message');
  statusMessageDiv.textContent = message;
  statusMessageDiv.className = 'status-message error';
  statusMessageDiv.style.display = 'block';
  setTimeout(() => {
    statusMessageDiv.style.display = 'none';
  }, 5000);
}

function showSuccess(message) {
  const statusMessageDiv = document.getElementById('status-message');
  statusMessageDiv.textContent = message;
  statusMessageDiv.className = 'status-message success';
  statusMessageDiv.style.display = 'block';
  setTimeout(() => {
    statusMessageDiv.style.display = 'none';
  }, 5000);
}

// Event listeners
document.getElementById('connect-wallet').addEventListener('click', connectKeplr);
document.getElementById('transfer-button').addEventListener('click', transferTokens);
document.getElementById('recipient-address').addEventListener('input', validateRecipientAddress);

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
  // Enable the connect button immediately
  document.getElementById('connect-wallet').disabled = false;
  
  // Check for Keplr in the background
  if (!window.keplr) {
    document.getElementById('connect-wallet').textContent = 'Keplr Not Detected';
    document.getElementById('connect-wallet').disabled = true;
  }
  
  // Check for Keplr events
  window.addEventListener('keplr_keystorechange', () => {
    console.log('Keplr keystore changed');
    if (userAddress) {
      // Reconnect if the user was already connected
      connectKeplr();
    }
  });
}); 
