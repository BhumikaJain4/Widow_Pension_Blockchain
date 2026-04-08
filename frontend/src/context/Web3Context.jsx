import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import {
  PENSION_REGISTRY_ABI, ROLE_ACCESS_ABI,
  SCHEME_CONFIG_ABI, FUND_MANAGER_ABI, AUDIT_LOG_ABI
} from '../config/contracts';

let deployment = null;
try { deployment = require('../config/deployment.json'); } catch {}

const Web3Context = createContext(null);

export function Web3Provider({ children }) {
  const [account,    setAccount]    = useState(null);
  const [provider,   setProvider]   = useState(null);
  const [signer,     setSigner]     = useState(null);
  const [contracts,  setContracts]  = useState(null);
  // roles now includes isTreasury
  const [roles, setRoles] = useState({ isAdmin: false, isValidator: false, isTreasury: false });
  const [chainId,    setChainId]    = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error,      setError]      = useState(null);
  const [deployed]                  = useState(!!deployment);

  const _initContracts = useCallback(async (s, addrs, userAddr) => {
    try {
      const registry   = new ethers.Contract(addrs.PensionRegistry, PENSION_REGISTRY_ABI, s);
      const roleAccess = new ethers.Contract(addrs.RoleAccess,      ROLE_ACCESS_ABI,      s);
      const scheme     = new ethers.Contract(addrs.SchemeConfig,    SCHEME_CONFIG_ABI,    s);
      const fund       = new ethers.Contract(addrs.FundManager,     FUND_MANAGER_ABI,     s);
      const audit      = new ethers.Contract(addrs.AuditLog,        AUDIT_LOG_ABI,        s);
      setContracts({ registry, roleAccess, scheme, fund, audit });

      const [ADMIN_ROLE, VALIDATOR_ROLE, TREASURY_ROLE] = await Promise.all([
        roleAccess.DEFAULT_ADMIN_ROLE(),
        roleAccess.VALIDATOR_ROLE(),
        roleAccess.TREASURY_ROLE(),
      ]);
      const [isAdmin, isValidator, isTreasury] = await Promise.all([
        roleAccess.hasRole(ADMIN_ROLE,     userAddr),
        roleAccess.hasRole(VALIDATOR_ROLE, userAddr),
        roleAccess.hasRole(TREASURY_ROLE,  userAddr),
      ]);
      setRoles({ isAdmin, isValidator, isTreasury });
    } catch (err) {
      console.error('Contract init error:', err);
      setError('Failed to connect to contracts: ' + err.message);
    }
  }, []);

  const connect = useCallback(async () => {
    setError(null); setConnecting(true);
    try {
      if (!window.ethereum) throw new Error('MetaMask not found. Please install MetaMask.');
      const web3Provider = new ethers.BrowserProvider(window.ethereum);
      const accounts     = await web3Provider.send('eth_requestAccounts', []);
      if (!accounts.length) throw new Error('No accounts returned.');
      const web3Signer = await web3Provider.getSigner();
      const network    = await web3Provider.getNetwork();
      setProvider(web3Provider); setSigner(web3Signer);
      setAccount(accounts[0]); setChainId(Number(network.chainId));
      if (deployment) await _initContracts(web3Signer, deployment.contracts, accounts[0]);
    } catch (err) { setError(err.message); }
    finally { setConnecting(false); }
  }, [_initContracts]);

  const disconnect = useCallback(() => {
    setAccount(null); setProvider(null); setSigner(null);
    setContracts(null); setRoles({ isAdmin: false, isValidator: false, isTreasury: false });
    setChainId(null);
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;
    const onAccounts = (accs) => {
      if (!accs.length) { disconnect(); return; }
      setAccount(accs[0]);
      if (deployment && signer) _initContracts(signer, deployment.contracts, accs[0]);
    };
    const onChain = () => window.location.reload();
    window.ethereum.on('accountsChanged', onAccounts);
    window.ethereum.on('chainChanged', onChain);
    return () => {
      window.ethereum.removeListener('accountsChanged', onAccounts);
      window.ethereum.removeListener('chainChanged', onChain);
    };
  }, [disconnect, signer, _initContracts]);

  useEffect(() => {
    const auto = async () => {
      if (!window.ethereum) return;
      try {
        const accs = await window.ethereum.request({ method: 'eth_accounts' });
        if (accs.length > 0) connect();
      } catch {}
    };
    auto();
  }, [connect]);

  const shortAddr = (addr) => addr ? `${addr.slice(0,6)}…${addr.slice(-4)}` : '';

  return (
    <Web3Context.Provider value={{
      account, provider, signer, contracts, roles, chainId,
      connecting, error, deployed, deployment,
      connect, disconnect,
      isConnected: !!account, shortAddr,
    }}>
      {children}
    </Web3Context.Provider>
  );
}

export const useWeb3 = () => {
  const ctx = useContext(Web3Context);
  if (!ctx) throw new Error('useWeb3 must be used within Web3Provider');
  return ctx;
};
