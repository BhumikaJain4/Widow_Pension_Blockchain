import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { toast } from 'react-toastify';
import { useWeb3 } from '../context/Web3Context';
import Icon from '../components/Icon';

export default function AdminPanel() {
  const { contracts, account, roles, isConnected, connect } = useWeb3();

  // Treasury sees only 'funds' tab; Admin sees all
  const canAccessAdmin = roles.isAdmin || roles.isTreasury;
  const defaultTab = roles.isAdmin ? 'overview' : 'funds';
  const [tab, setTab] = useState(defaultTab);

  const [stats, setStats]     = useState({});
  const [schemes, setSchemes] = useState([]);
  const [balances, setBalances] = useState({});
  const [deadlockedApps, setDeadlockedApps] = useState([]);
  const [loading, setLoading] = useState(false);

  const [targetAddr, setTargetAddr]   = useState('');
  const [selectedRole, setSelectedRole] = useState('ALL');
  const [checkAddr, setCheckAddr]     = useState('');
  const [checkResult, setCheckResult] = useState(null);

  const [depositAmt, setDepositAmt]     = useState('');
  const [depositScheme, setDepositScheme] = useState('1');

  const [newScheme, setNewScheme]   = useState({name:'',amount:'',minAge:'18',maxAge:'120',maxDays:'30'});
  const [editScheme, setEditScheme] = useState(null);

  const [deadlockTimeout, setDeadlockTimeout] = useState('7');
  const [validatorCount,  setValidatorCount]  = useState('');

  const ROLES=[
    {value:'ALL',          label:'All Operational Roles',desc:'REVIEWER + APPROVER + AUDITOR + LOGGER + REGISTRY + VALIDATOR'},
    {value:'VALIDATOR_ROLE',label:'Validator',           desc:'Can cast votes on applications'},
    {value:'REVIEWER_ROLE', label:'Reviewer',            desc:'Can open voting on SUBMITTED applications'},
    {value:'APPROVER_ROLE', label:'Approver',            desc:'Legacy approver role'},
    {value:'AUDITOR_ROLE',  label:'Auditor',             desc:'Can inspect and audit records'},
    {value:'LOGGER_ROLE',   label:'Logger',              desc:'Can write to the AuditLog contract'},
    {value:'REGISTRY_ROLE', label:'Registry',            desc:'Can call FundManager disbursement'},
    {value:'TREASURY_ROLE', label:'Treasury',            desc:'Can deposit funds to pension schemes'},
  ];

  const loadStats = useCallback(async()=>{
    if(!contracts) return;
    try {
      const [total,pending,validators,threshold,balance,ids,dlTimeout]=await Promise.all([
        contracts.registry.totalApplications(),
        contracts.registry.pendingCount(),
        contracts.registry.totalValidators(),
        contracts.registry.consensusThreshold(),
        contracts.fund.totalFundsHeld(),
        contracts.scheme.getAllSchemeIds(),
        contracts.registry.deadlockTimeoutDays().catch(()=>7n),
      ]);
      setStats({total,pending,validators,threshold,balance});
      setDeadlockTimeout(dlTimeout.toString());
      const loaded=await Promise.all(ids.map(id=>contracts.scheme.getScheme(id)));
      setSchemes(loaded);
      const bals={};
      for(const s of loaded) bals[s.schemeId.toString()]=await contracts.fund.getSchemeBalance(s.schemeId);
      setBalances(bals);
      contracts.registry.getDeadlockedApps().then(dl=>setDeadlockedApps(dl.map(d=>d.toString()))).catch(()=>{});
    } catch(e){
      console.error(e);
      toast.error('Unable to load admin stats. Please verify wallet network and contract deployment.');
    }
  },[contracts]);

  useEffect(()=>{loadStats();},[loadStats]);

  // ── Role management ───────────────────────────────────────
  const grantRole=async()=>{
    if(!ethers.isAddress(targetAddr)){toast.error('Invalid wallet address');return;}
    setLoading(true);
    try {
      const tx=selectedRole==='ALL'
        ? await contracts.roleAccess.grantAllRoles(targetAddr)
        : await contracts.roleAccess.grantRole(await contracts.roleAccess[selectedRole](),targetAddr);
      await tx.wait();
      toast.success(`${selectedRole==='ALL'?'All operational roles':ROLES.find(r=>r.value===selectedRole)?.label} granted.`);
      setTargetAddr('');
    } catch(e){toast.error(e.reason||e.message);}
    finally{setLoading(false);}
  };

  const revokeRole=async()=>{
    if(!ethers.isAddress(targetAddr)){toast.error('Invalid wallet address');return;}
    setLoading(true);
    try {
      const tx=selectedRole==='ALL'
        ? await contracts.roleAccess.revokeAllRoles(targetAddr)
        : await contracts.roleAccess.revokeRole(await contracts.roleAccess[selectedRole](),targetAddr);
      await tx.wait();
      toast.success(`${selectedRole==='ALL'?'All roles':ROLES.find(r=>r.value===selectedRole)?.label} revoked.`);
    } catch(e){toast.error(e.reason||e.message);}
    finally{setLoading(false);}
  };

  const checkRoles=async()=>{
    if(!ethers.isAddress(checkAddr)){toast.error('Invalid address');return;}
    try {
      const checks=await Promise.all(ROLES.filter(r=>r.value!=='ALL').map(async r=>{
        const rb=await contracts.roleAccess[r.value]();
        return{label:r.label,has:await contracts.roleAccess.hasRole(rb,checkAddr)};
      }));
      setCheckResult({address:checkAddr,roles:checks});
    } catch(e){toast.error(e.message);}
  };

  // ── Funds ─────────────────────────────────────────────────
  const depositFunds=async()=>{
    if(!depositAmt||parseFloat(depositAmt)<=0){toast.error('Enter a valid amount');return;}
    setLoading(true);
    try {
      const tx=await contracts.fund.depositFunds(parseInt(depositScheme),{value:ethers.parseEther(depositAmt)});
      await tx.wait();
      toast.success(`Deposited ${depositAmt} ETH to Scheme #${depositScheme}`);
      setDepositAmt('');loadStats();
    } catch(e){toast.error(e.reason||e.message);}
    finally{setLoading(false);}
  };

  // ── Schemes ───────────────────────────────────────────────
  const addScheme=async()=>{
    if(!newScheme.name||!newScheme.amount){toast.error('Name and amount required');return;}
    if(parseInt(newScheme.minAge)<18){toast.error('Minimum eligible age must be 18 or above');return;}
    setLoading(true);
    try {
      await (await contracts.scheme.addScheme(newScheme.name,ethers.parseEther(newScheme.amount),parseInt(newScheme.minAge),parseInt(newScheme.maxAge),parseInt(newScheme.maxDays))).wait();
      toast.success('Scheme added successfully.');
      setNewScheme({name:'',amount:'',minAge:'18',maxAge:'120',maxDays:'30'});loadStats();
    } catch(e){toast.error(e.reason||e.message);}
    finally{setLoading(false);}
  };

  const saveEdit=async()=>{
    if(!editScheme) return;
    if(parseInt(editScheme.minAge)<18){toast.error('Minimum eligible age must be 18 or above');return;}
    setLoading(true);
    try {
      await (await contracts.scheme.updateScheme(parseInt(editScheme.id),editScheme.name,ethers.parseEther(editScheme.amount),parseInt(editScheme.minAge),parseInt(editScheme.maxAge),parseInt(editScheme.maxDays))).wait();
      toast.success('Scheme updated successfully.');
      setEditScheme(null);loadStats();
    } catch(e){toast.error(e.reason||e.message);}
    finally{setLoading(false);}
  };

  const toggleScheme=async(id,active)=>{
    setLoading(true);
    try{await (await contracts.scheme.toggleScheme(parseInt(id))).wait();toast.success(`Scheme ${active?'deactivated':'activated'}.`);loadStats();}
    catch(e){toast.error(e.reason||e.message);}
    finally{setLoading(false);}
  };

  const startEdit=s=>setEditScheme({id:s.schemeId.toString(),name:s.name,amount:parseFloat(ethers.formatEther(s.monthlyAmount)).toFixed(4),minAge:s.minAgeLimit.toString(),maxAge:s.maxAgeLimit.toString(),maxDays:s.maxProcessingDays.toString()});

  // ── Validator / Deadlock ──────────────────────────────────
  const updateValidatorCount=async()=>{const n=parseInt(validatorCount);if(!n||n<1){toast.error('Enter valid count >= 1');return;}setLoading(true);try{await (await contracts.registry.setTotalValidators(n)).wait();toast.success(`Validator count set to ${n}. New threshold: ${Math.ceil(n*.7)}`);loadStats();}catch(e){toast.error(e.reason||e.message);}finally{setLoading(false);}};
  const saveDeadlockTimeout=async()=>{const d=parseInt(deadlockTimeout);if(!d||d<1){toast.error('Minimum 1 day');return;}setLoading(true);try{await (await contracts.registry.setDeadlockTimeout(d)).wait();toast.success(`Deadlock timeout set to ${d} days.`);loadStats();}catch(e){toast.error(e.reason||e.message);}finally{setLoading(false);}};
  const resolveDeadlock=async(id)=>{setLoading(true);try{await (await contracts.registry.resolveDeadlock(parseInt(id))).wait();toast.success(`Application #${id} re-queued.`);loadStats();}catch(e){toast.error(e.reason||e.message);}finally{setLoading(false);}};

  // ── Guards ────────────────────────────────────────────────
  if(!isConnected) return (
    <div className="page adm-guard">
      <div className="adm-guard-card">
        <Icon name="lock" size={48} color="var(--navy)"/>
        <h2>Portal Admin — Authentication Required</h2>
        <p>Connect your wallet to access the administration panel.</p>
        <button className="btn btn-primary btn-lg mt-3" onClick={connect}><Icon name="wallet" size={16}/>Connect Wallet</button>
      </div>
    </div>
  );
  if(!canAccessAdmin) return (
    <div className="page adm-guard">
      <div className="adm-guard-card">
        <Icon name="error" size={48} color="var(--red)"/>
        <h2>Access Restricted</h2>
        <p>This page is accessible to <strong>Admin</strong> and <strong>Treasury</strong> wallets only.</p>
        <p style={{marginTop:8,fontSize:13,color:'var(--text-muted)'}}>Your wallet: <code>{account?.slice(0,14)}…</code></p>
      </div>
    </div>
  );

  // Only admin sees all tabs; treasury only sees funds
  const ALL_TABS=[
    {id:'overview',label:'Overview',        icon:'chart',    adminOnly:true},
    {id:'roles',   label:'Role Management', icon:'key',      adminOnly:true},
    {id:'funds',   label:'Fund Management', icon:'funds',    adminOnly:false},
    {id:'schemes', label:'Scheme Config',   icon:'scheme',   adminOnly:true},
    {id:'deadlock',label:'Deadlocks',       icon:'deadlock', adminOnly:true},
  ];
  const TABS=ALL_TABS.filter(t=>!t.adminOnly||roles.isAdmin);

  return (
    <div className="page adm-page">
      <div className="page-header">
        <div className="container">
          <span className="page-header-eyebrow">Portal Administration</span>
          <h1 className="page-header-title">Admin & Treasury Panel</h1>
          <p className="page-header-sub">
            {roles.isAdmin ? 'Full administrative access — roles, funds, schemes and system configuration.'
              : 'Treasury access — deposit funds to active pension schemes.'}
          </p>
          {roles.isTreasury && !roles.isAdmin && (
            <div style={{marginTop:12,display:'inline-flex',alignItems:'center',gap:8,background:'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.2)',borderRadius:8,padding:'6px 14px',fontSize:13,color:'rgba(255,255,255,.8)'}}>
              <Icon name="funds" size={14} color="rgba(255,255,255,.7)"/>
              You are connected as <strong style={{color:'#fff'}}>Treasury</strong>. You can deposit funds to pension schemes.
            </div>
          )}
        </div>
      </div>

      <div className="content-area">
        <div className="container" style={{maxWidth:960}}>
          <div className="animate-fade-up">

            {/* Tab bar */}
            <div className="adm-tabs mb-3">
              {TABS.map(t=>(
                <button key={t.id}
                  className={`adm-tab ${tab===t.id?'adm-tab-on':''} ${t.id==='deadlock'&&deadlockedApps.length>0?'adm-tab-alert':''}`}
                  onClick={()=>setTab(t.id)}>
                  <Icon name={t.icon} size={14}/>{t.label}
                  {t.id==='deadlock'&&deadlockedApps.length>0&&<span className="adm-tab-badge">{deadlockedApps.length}</span>}
                </button>
              ))}
            </div>

            {/* ── OVERVIEW ── */}
            {tab==='overview' && (
              <div className="stagger">
                <div className="grid-4 mb-3">
                  {[
                    {label:'Total Applications', value:stats.total?.toString()||'—',     icon:'doc',   color:'var(--saffron)'},
                    {label:'Pending',            value:stats.pending?.toString()||'—',   icon:'clock', color:'var(--navy-light)'},
                    {label:'Validators',         value:stats.validators?.toString()||'—', icon:'users', color:'var(--green)'},
                    {label:'Threshold',          value:stats.threshold?.toString()||'—',  icon:'vote',  color:'#5C2D8A'},
                  ].map(s=>(
                    <div key={s.label} className="adm-stat">
                      <div className="adm-stat-icon" style={{background:`${s.color}18`,border:`1px solid ${s.color}28`}}>
                        <Icon name={s.icon} size={20} color={s.color}/>
                      </div>
                      <div className="adm-stat-val" style={{color:s.color}}>{s.value}</div>
                      <div className="adm-stat-lbl">{s.label}</div>
                    </div>
                  ))}
                </div>
                <div className="card">
                  <div className="card-inner">
                    <div className="adm-hd"><Icon name="funds" size={16}/>Total Funds Held</div>
                    <div className="adm-big-val" style={{color:'var(--green)'}}>{stats.balance?parseFloat(ethers.formatEther(stats.balance)).toFixed(4):'—'} ETH</div>
                    <hr className="divider"/>
                    <div className="adm-hd"><Icon name="users" size={16}/>Update Total Validator Count</div>
                    <p className="text-muted text-sm mb-2">Call this every time a validator is added or removed. The 70% threshold is automatically recalculated.<br/>Examples: 3 validators → threshold 3 · 5 validators → threshold 4 · 7 → 5 · 10 → 7</p>
                    <div className="flex gap-1">
                      <input className="form-input" type="number" min="1" placeholder="Total validators…" value={validatorCount} onChange={e=>setValidatorCount(e.target.value)} style={{flex:1,maxWidth:240}}/>
                      <button className="btn btn-navy" onClick={updateValidatorCount} disabled={loading}>{loading?<><span className="spinner"/>…</>:<>Update Count<Icon name="arrowR" size={13}/></>}</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── ROLES ── */}
            {tab==='roles' && (
              <div className="stagger">
                <div className="card mb-3">
                  <div className="card-inner">
                    <div className="adm-hd"><Icon name="key" size={16}/>Grant or Revoke Role</div>
                    <p className="text-muted text-sm mb-3">Select the specific role you wish to grant or revoke, then enter the wallet address.</p>
                    <div className="adm-role-grid">
                      {ROLES.map(r=>(
                        <button key={r.value} className={`adm-role-btn ${selectedRole===r.value?'adm-role-btn-on':''}`} onClick={()=>setSelectedRole(r.value)}>
                          <span className="adm-role-name">{r.label}</span>
                          <span className="adm-role-desc">{r.desc}</span>
                        </button>
                      ))}
                    </div>
                    <div className="form-group mt-2">
                      <label className="form-label">Wallet Address</label>
                      <input className="form-input font-mono" style={{fontSize:14}} placeholder="0x…" value={targetAddr} onChange={e=>setTargetAddr(e.target.value)}/>
                    </div>
                    <div className="flex gap-1">
                      <button className="btn btn-green" onClick={grantRole} disabled={loading||!targetAddr}>{loading?<><span className="spinner"/>…</>:<><Icon name="check" size={14}/>Grant</>}</button>
                      <button className="btn btn-danger" onClick={revokeRole} disabled={loading||!targetAddr}>{loading?<><span className="spinner"/>…</>:<><Icon name="x" size={14}/>Revoke</>}</button>
                    </div>
                  </div>
                </div>
                <div className="card">
                  <div className="card-inner">
                    <div className="adm-hd"><Icon name="search" size={16}/>Inspect Wallet Roles</div>
                    <div className="flex gap-1 mb-2">
                      <input className="form-input font-mono" style={{fontSize:14,flex:1}} placeholder="0x…" value={checkAddr} onChange={e=>setCheckAddr(e.target.value)}/>
                      <button className="btn btn-ghost" onClick={checkRoles}><Icon name="search" size={14}/>Inspect</button>
                    </div>
                    {checkResult&&(
                      <div className="adm-check-result">
                        <div className="font-mono text-sm mb-2" style={{color:'var(--text-muted)',wordBreak:'break-all'}}>{checkResult.address}</div>
                        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                          {checkResult.roles.map(r=>(
                            <span key={r.label} className={`badge ${r.has?'badge-approved':'badge-pending'}`}>
                              <Icon name={r.has?'check':'minus'} size={10}/>{r.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── FUNDS ── */}
            {tab==='funds' && (
              <div className="stagger">
                <div className="alert alert-warning">
                  <Icon name="warning" size={15}/>
                  <div>Only the <strong>Treasury wallet</strong> can deposit funds. Ensure you are connected with the treasury account in MetaMask before depositing.</div>
                </div>
                <div className="card mb-3">
                  <div className="card-inner">
                    <div className="adm-hd"><Icon name="funds" size={16}/>Deposit Funds to Pension Scheme</div>
                    <div className="grid-2 mb-3">
                      <div className="form-group">
                        <label className="form-label">Select Scheme</label>
                        <select className="form-select" value={depositScheme} onChange={e=>setDepositScheme(e.target.value)}>
                          {schemes.filter(s=>s.active).map(s=>(
                            <option key={s.schemeId.toString()} value={s.schemeId.toString()}>
                              Scheme #{s.schemeId.toString()} — {s.name.slice(0,40)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Amount (ETH)</label>
                        <input className="form-input" type="number" step="0.001" min="0" placeholder="0.000" value={depositAmt} onChange={e=>setDepositAmt(e.target.value)}/>
                      </div>
                    </div>
                    <button className="btn btn-primary" onClick={depositFunds} disabled={loading}>
                      {loading?<><span className="spinner"/>Depositing…</>:<><Icon name="payment" size={15}/>Deposit Funds</>}
                    </button>
                  </div>
                </div>
                <div className="card">
                  <div className="card-inner">
                    <div className="adm-hd"><Icon name="chart" size={16}/>Scheme Fund Balances</div>
                    <table className="formal-table">
                      <thead><tr><th>Scheme</th><th>Name</th><th style={{textAlign:'right'}}>Balance (ETH)</th></tr></thead>
                      <tbody>
                        {schemes.map(s=>(
                          <tr key={s.schemeId.toString()}>
                            <td style={{fontWeight:800}}>#{s.schemeId.toString()}</td>
                            <td style={{color:'var(--text-muted)'}}>{s.name.slice(0,48)}</td>
                            <td style={{textAlign:'right',fontWeight:800,color:'var(--green)'}}>
                              {balances[s.schemeId.toString()]?parseFloat(ethers.formatEther(balances[s.schemeId.toString()])).toFixed(4):'—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── SCHEMES ── */}
            {tab==='schemes' && (
              <div className="stagger">
                <div className="card mb-3">
                  <div className="card-inner">
                    <div className="adm-hd"><Icon name="scheme" size={16}/>Add New Pension Scheme</div>
                    <div className="form-group">
                      <label className="form-label">Scheme Name <span style={{color:'var(--red)'}}>*</span></label>
                      <input className="form-input" placeholder="e.g. State Widow Pension Scheme" value={newScheme.name} onChange={e=>setNewScheme(s=>({...s,name:e.target.value}))}/>
                    </div>
                    <div className="grid-2">
                      <div className="form-group"><label className="form-label">Monthly Amount (ETH) *</label><input className="form-input" type="number" step="0.001" placeholder="0.001" value={newScheme.amount} onChange={e=>setNewScheme(s=>({...s,amount:e.target.value}))}/></div>
                      <div className="form-group"><label className="form-label">SLA — Max Processing Days *</label><input className="form-input" type="number" min="1" placeholder="30" value={newScheme.maxDays} onChange={e=>setNewScheme(s=>({...s,maxDays:e.target.value}))}/></div>
                      <div className="form-group"><label className="form-label">Minimum Eligible Age (18+) *</label><input className="form-input" type="number" min="18" placeholder="18" value={newScheme.minAge} onChange={e=>setNewScheme(s=>({...s,minAge:e.target.value}))}/><span className="form-hint">Must be 18 or above as per IGNWPS guidelines.</span></div>
                      <div className="form-group"><label className="form-label">Maximum Age</label><input className="form-input" type="number" min="18" placeholder="120" value={newScheme.maxAge} onChange={e=>setNewScheme(s=>({...s,maxAge:e.target.value}))}/></div>
                    </div>
                    <button className="btn btn-primary" onClick={addScheme} disabled={loading}>{loading?<><span className="spinner"/>Adding…</>:<><Icon name="check" size={14}/>Add Scheme</>}</button>
                  </div>
                </div>
                {editScheme&&(
                  <div className="card mb-3" style={{border:'2px solid var(--saffron)'}}>
                    <div className="card-inner">
                      <div className="adm-hd" style={{color:'var(--saffron)'}}><Icon name="settings" size={16}/>Editing Scheme #{editScheme.id}</div>
                      <div className="form-group"><label className="form-label">Scheme Name</label><input className="form-input" value={editScheme.name} onChange={e=>setEditScheme(s=>({...s,name:e.target.value}))}/></div>
                      <div className="grid-2">
                        <div className="form-group"><label className="form-label">Monthly Amount (ETH)</label><input className="form-input" type="number" step="0.001" value={editScheme.amount} onChange={e=>setEditScheme(s=>({...s,amount:e.target.value}))}/></div>
                        <div className="form-group"><label className="form-label">SLA Days</label><input className="form-input" type="number" min="1" value={editScheme.maxDays} onChange={e=>setEditScheme(s=>({...s,maxDays:e.target.value}))}/></div>
                        <div className="form-group"><label className="form-label">Min Age (18+)</label><input className="form-input" type="number" min="18" value={editScheme.minAge} onChange={e=>setEditScheme(s=>({...s,minAge:e.target.value}))}/></div>
                        <div className="form-group"><label className="form-label">Max Age</label><input className="form-input" type="number" min="18" value={editScheme.maxAge} onChange={e=>setEditScheme(s=>({...s,maxAge:e.target.value}))}/></div>
                      </div>
                      <div className="flex gap-1">
                        <button className="btn btn-primary" onClick={saveEdit} disabled={loading}>{loading?<><span className="spinner"/>…</>:<><Icon name="check" size={14}/>Save Changes</>}</button>
                        <button className="btn btn-ghost" onClick={()=>setEditScheme(null)}>Cancel</button>
                      </div>
                    </div>
                  </div>
                )}
                <div className="card">
                  <div className="card-inner">
                    <div className="adm-hd"><Icon name="doc" size={16}/>All Pension Schemes</div>
                    <table className="formal-table">
                      <thead><tr><th>ID</th><th>Name</th><th>Amount/mo</th><th>Age</th><th>SLA</th><th>Status</th><th>Actions</th></tr></thead>
                      <tbody>{schemes.map(s=>(
                        <tr key={s.schemeId.toString()}>
                          <td style={{fontWeight:800}}>#{s.schemeId.toString()}</td>
                          <td style={{fontWeight:600}}>{s.name.slice(0,38)}</td>
                          <td style={{color:'var(--green)',fontWeight:700}}>{parseFloat(ethers.formatEther(s.monthlyAmount)).toFixed(4)}</td>
                          <td>{s.minAgeLimit.toString()}+</td>
                          <td>{s.maxProcessingDays.toString()}d</td>
                          <td><span className={`badge ${s.active?'badge-approved':'badge-rejected'}`}>{s.active?'Active':'Inactive'}</span></td>
                          <td>
                            <div style={{display:'flex',gap:5}}>
                              <button className="btn btn-ghost btn-xs" onClick={()=>startEdit(s)}><Icon name="settings" size={12}/>Edit</button>
                              <button className={`btn btn-xs ${s.active?'btn-danger':'btn-green'}`} onClick={()=>toggleScheme(s.schemeId.toString(),s.active)} disabled={loading}>
                                {s.active?<><Icon name="x" size={11}/>Deactivate</>:<><Icon name="check" size={11}/>Activate</>}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── DEADLOCK ── */}
            {tab==='deadlock' && (
              <div className="stagger">
                <div className="card mb-3">
                  <div className="card-inner">
                    <div className="adm-hd"><Icon name="clock" size={16}/>Deadlock Timeout Configuration</div>
                    <p className="text-muted text-sm mb-2">Applications stuck in VOTING beyond <strong>SLA + timeout</strong> days may be force-resolved. The application re-enters the queue with votes reset to zero.</p>
                    <div className="flex gap-1 items-center">
                      <input className="form-input" type="number" min="1" value={deadlockTimeout} onChange={e=>setDeadlockTimeout(e.target.value)} style={{flex:1,maxWidth:200}}/>
                      <span className="text-muted text-sm" style={{flexShrink:0}}>days beyond SLA</span>
                      <button className="btn btn-navy" onClick={saveDeadlockTimeout} disabled={loading}>{loading?<><span className="spinner"/>…</>:'Save Setting'}</button>
                    </div>
                  </div>
                </div>
                <div className="card">
                  <div className="card-inner">
                    <div className="adm-hd"><Icon name="deadlock" size={16} color="var(--red)"/>Deadlocked Applications{deadlockedApps.length>0&&<span className="badge badge-rejected" style={{marginLeft:8}}>{deadlockedApps.length}</span>}</div>
                    {deadlockedApps.length===0
                      ? <div style={{textAlign:'center',padding:'32px',color:'var(--text-muted)'}}><Icon name="check" size={32} color="var(--green)"/><p style={{marginTop:8}}>No deadlocked applications — system is healthy.</p></div>
                      : <table className="formal-table">
                          <thead><tr><th>Application</th><th>Issue</th><th style={{textAlign:'right'}}>Action</th></tr></thead>
                          <tbody>{deadlockedApps.map(id=>(
                            <tr key={id}>
                              <td style={{fontWeight:800}}>#{id}</td>
                              <td style={{color:'var(--text-muted)',fontSize:13}}>Stuck in VOTING — consensus is no longer reachable</td>
                              <td style={{textAlign:'right'}}><button className="btn btn-danger btn-sm" onClick={()=>resolveDeadlock(id)} disabled={loading}>{loading?<><span className="spinner"/>…</>:<><Icon name="refresh" size={12}/>Resolve</>}</button></td>
                            </tr>
                          ))}</tbody>
                        </table>
                    }
                    <div className="alert alert-saffron mt-2"><Icon name="info" size={14}/>Resolving a deadlock re-queues the application at the back of the FCFS queue with all votes reset. All validators must vote again from scratch.</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .adm-page .page-header{background:linear-gradient(135deg,var(--navy-deep),var(--navy-mid));}
        .adm-guard{display:flex;align-items:center;justify-content:center;min-height:100vh;background:var(--bg);}
        .adm-guard-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-xl);padding:52px 44px;text-align:center;max-width:480px;box-shadow:var(--shadow-md);display:flex;flex-direction:column;align-items:center;gap:14px;}
        .adm-guard-card h2{font-size:22px;color:var(--navy-deep);}
        .adm-guard-card p{color:var(--text-muted);font-size:14px;line-height:1.6;}
        .adm-guard-card code{background:var(--bg-panel);padding:2px 6px;border-radius:4px;font-size:12px;}
        .adm-tabs{display:flex;gap:3px;background:var(--bg-panel);border:1px solid var(--border);border-radius:var(--r-lg);padding:4px;width:fit-content;flex-wrap:wrap;}
        .adm-tab{display:flex;align-items:center;gap:6px;padding:8px 16px;border-radius:calc(var(--r-lg) - 4px);border:none;background:none;font-weight:700;font-size:13px;cursor:pointer;color:var(--text-muted);transition:var(--transition);position:relative;}
        .adm-tab:hover{background:var(--surface);color:var(--text-mid);}
        .adm-tab-on{background:var(--surface)!important;color:var(--navy-deep)!important;box-shadow:var(--shadow-xs);}
        .adm-tab-alert{color:var(--red)!important;}
        .adm-tab-badge{background:var(--red);color:#fff;border-radius:99px;font-size:9px;font-weight:900;padding:1px 5px;margin-left:2px;}
        .adm-hd{font-size:14px;font-weight:800;color:var(--navy-deep);margin-bottom:12px;display:flex;align-items:center;gap:7px;}
        .adm-stat{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:20px;box-shadow:var(--shadow-xs);display:flex;flex-direction:column;gap:6px;}
        .adm-stat-icon{width:44px;height:44px;border-radius:var(--r-sm);display:flex;align-items:center;justify-content:center;}
        .adm-stat-val{font-size:26px;font-weight:900;line-height:1;}
        .adm-stat-lbl{font-size:12px;color:var(--text-muted);font-weight:600;}
        .adm-big-val{font-size:38px;font-weight:900;line-height:1;margin-bottom:4px;}
        .adm-role-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;}
        .adm-role-btn{padding:10px 14px;border:1.5px solid var(--border);border-radius:var(--r);background:var(--surface-warm);cursor:pointer;text-align:left;transition:var(--transition);display:flex;flex-direction:column;gap:2px;}
        .adm-role-btn:hover{border-color:var(--navy);background:var(--bg-panel);}
        .adm-role-btn-on{border-color:var(--navy)!important;background:#EEF2FF!important;box-shadow:0 0 0 2px rgba(27,42,74,.12);}
        .adm-role-name{font-weight:800;font-size:13px;color:var(--navy-deep);}
        .adm-role-desc{font-size:11px;color:var(--text-muted);}
        .adm-check-result{background:var(--bg-panel);border:1px solid var(--border);border-radius:var(--r);padding:14px;}
        @media(max-width:600px){.adm-role-grid{grid-template-columns:1fr;}}
      `}</style>
    </div>
  );
}
