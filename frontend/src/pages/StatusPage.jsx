import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWeb3 } from '../context/Web3Context';
import { APP_STATE, AUDIT_ACTION } from '../config/contracts';
import Icon from '../components/Icon';

export default function StatusPage() {
  const { contracts, account, isConnected, connect } = useWeb3();
  const [searchParams] = useSearchParams();
  const [appId, setAppId]   = useState(searchParams.get('id')||'');
  const [app, setApp]       = useState(null);
  const [votes, setVotes]   = useState(null);
  const [audit, setAudit]   = useState([]);
  const [rejReasons, setRejReasons] = useState([]);
  const [myApps, setMyApps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  useEffect(()=>{
    if(!contracts||!account) return;
    contracts.registry.getApplicationsByWallet(account).then(ids=>setMyApps(ids.map(id=>id.toString()))).catch(()=>{});
  },[contracts,account]);

  const fetchApp = useCallback(async (id)=>{
    if(!id||!contracts) return;
    setLoading(true);setError('');setApp(null);setVotes(null);setAudit([]);setRejReasons([]);
    try {
      const n=parseInt(id);
      const [appData,voteData]=await Promise.all([contracts.registry.getApplication(n),contracts.registry.getVoteStatus(n)]);
      setApp(appData);setVotes(voteData);
      contracts.audit.getAuditTrail(n).then(t=>setAudit(t)).catch(()=>{});
      contracts.registry.getAllRejectionReasons(n).then(r=>setRejReasons(r.map(x=>({validator:x.validator,reason:x.reason})))).catch(()=>{});
    } catch { setError('Application not found. Please verify the Application ID and try again.'); }
    finally { setLoading(false); }
  },[contracts]);

  useEffect(()=>{if(searchParams.get('id')&&contracts) fetchApp(searchParams.get('id'));},[contracts,searchParams,fetchApp]);

  const raiseDispute = async ()=>{
    if(!contracts) return;
    try{const tx=await contracts.registry.raiseDispute(parseInt(appId));await tx.wait();fetchApp(appId);}catch(e){console.error(e);}
  };

  const fmtDate=ts=>{
    if(!ts||ts.toString()==='0') return '—';
    return new Date(Number(ts)*1000).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  };

  const stateInfo=app?APP_STATE[Number(app.state)]:null;
  const curState=app?Number(app.state):-1;
  const PROG_STEPS=[
    {label:'Submitted',  icon:'inbox'},
    {label:'Under Review',icon:'vote'},
    {label:'Decision',   icon:'scale'},
    {label:'Paid',       icon:'payment'},
  ];
  const pStep=n=>{if(n===1)return 0;if(n===2)return 1;if(n===3||n===4||n===6)return 2;if(n===5)return 3;return -1;};
  const progressStep=pStep(curState);

  return (
    <div className="page st-page">
      <div className="page-header">
        <div className="container">
          <span className="page-header-eyebrow">Application Tracking</span>
          <h1 className="page-header-title">Track Application Status</h1>
          <p className="page-header-sub">Real-time on-chain status — every update is permanently recorded.</p>
        </div>
      </div>

      <div className="content-area">
        <div className="container" style={{maxWidth:860}}>
          <div className="animate-fade-up">

            {/* Search */}
            <div className="st-search">
              <div className="st-search-inner">
                <div className="st-search-label">Application Reference Number</div>
                <div className="flex gap-1 items-center">
                  <input className="form-input" style={{fontFamily:'JetBrains Mono,monospace',fontSize:17,letterSpacing:1,flex:1}}
                    placeholder="Enter Application ID (e.g. 1, 2, 3…)"
                    value={appId} onChange={e=>setAppId(e.target.value.replace(/\D/g,''))}
                    onKeyDown={e=>e.key==='Enter'&&fetchApp(appId)}/>
                  {isConnected
                    ? <button className="btn btn-navy" onClick={()=>fetchApp(appId)} disabled={loading||!appId}>
                        {loading?<><span className="spinner"/>Loading…</>:<><Icon name="search" size={15}/>Search</>}
                      </button>
                    : <button className="btn btn-primary" onClick={connect}><Icon name="wallet" size={15}/>Connect Wallet</button>
                  }
                </div>
                {myApps.length>0 && (
                  <div className="st-myapps">
                    <span className="st-myapps-label">Your applications:</span>
                    {myApps.map(id=>(
                      <button key={id} className="st-chip" onClick={()=>{setAppId(id);fetchApp(id);}}>#{id}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {error && <div className="alert alert-error"><Icon name="error" size={15}/>{error}</div>}

            {app && stateInfo && (
              <div className="stagger">

                {/* Status card */}
                <div className="st-status-card">
                  <div className="st-status-left">
                    <div className={`st-status-icon st-icon-${stateInfo.label.toLowerCase()}`}>
                      <Icon name={stateInfo.icon} size={28} color="white"/>
                    </div>
                    <div>
                      <div className="st-status-title">Application Reference: #{app.applicationId?.toString()}</div>
                      <div className="st-status-sub">Queue Position #{app.queuePosition?.toString()} · Scheme #{app.schemeId?.toString()}</div>
                    </div>
                  </div>
                  <span className={`badge ${stateInfo.badge}`} style={{fontSize:13,padding:'6px 16px',display:'flex',alignItems:'center',gap:5}}>
                    <Icon name={stateInfo.icon} size={12}/>{stateInfo.label}
                  </span>
                </div>

                {/* Progress */}
                {curState>0 && (
                  <div className="card" style={{padding:'24px 28px',marginBottom:20}}>
                    <div className="st-progress">
                      {PROG_STEPS.map((s,i)=>{
                        const done=progressStep>i,active=progressStep===i,rej=active&&(curState===4||curState===6);
                        return (
                          <div key={i} className={`st-pstep ${done?'done':active?'active':''}`}>
                            <div className={`st-pcircle ${rej?'rej':''}`}>
                              {done?<Icon name="check" size={13} color="white"/>
                                :rej?<Icon name="x" size={13} color="white"/>
                                :<Icon name={s.icon} size={13} color={active?'white':'var(--text-muted)'}/>}
                            </div>
                            <div className="st-plabel">{s.label}</div>
                            {i<PROG_STEPS.length-1 && <div className={`st-pline ${done?'done':''}`}/>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* All Rejection Reasons */}
                {curState===4 && (
                  <div className="st-rej-panel">
                    <div className="st-rej-head">
                      <Icon name="x" size={16} color="var(--red)"/>Application Rejected — Validator Reasons
                    </div>
                    <table className="formal-table" style={{marginBottom:0}}>
                      <thead><tr><th>Validator</th><th>Reason Provided</th></tr></thead>
                      <tbody>
                        {(rejReasons.length>0?rejReasons:[{validator:app.finalDecisionBy||'',reason:app.rejectionReason||'No reason recorded'}]).map((r,i)=>(
                          <tr key={i}>
                            <td className="font-mono" style={{fontSize:11,width:'36%',color:'var(--text-muted)'}}>{r.validator?`${r.validator.slice(0,10)}…${r.validator.slice(-6)}`:'System'}</td>
                            <td style={{fontStyle:'italic',color:'var(--text-mid)'}}>{r.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {account?.toLowerCase()===app.applicant?.toLowerCase() && (
                      <div style={{marginTop:14,paddingTop:14,borderTop:'1px solid var(--border)'}}>
                        <button className="btn btn-danger btn-sm" onClick={raiseDispute}>
                          <Icon name="scale" size={13}/>Raise Formal Dispute
                        </button>
                        <span className="text-xs text-muted" style={{marginLeft:10}}>Dispute window: 30 days from decision date.</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid-2">
                  {/* Application details */}
                  <div className="card" style={{padding:'20px 24px'}}>
                    <div className="st-card-title"><Icon name="doc" size={13}/>Application Details</div>
                    <table className="formal-table">
                      <tbody>
                        {[
                          {l:'Applicant Address',v:`${app.applicant?.slice(0,10)}…${app.applicant?.slice(-6)}`,mono:true},
                          {l:'Submission Date',  v:fmtDate(app.submittedAt)},
                          {l:'Pension Scheme',   v:`Scheme #${app.schemeId?.toString()}`},
                          {l:'IPFS Document',    v:<a href={`https://ipfs.io/ipfs/${app.ipfsCID}`} target="_blank" rel="noreferrer" style={{color:'var(--saffron)',display:'flex',alignItems:'center',gap:4,fontFamily:'monospace',fontSize:11}}>{app.ipfsCID?.slice(0,18)}…<Icon name="external" size={10}/></a>},
                          ...(app.decidedAt?.toString()!=='0'?[{l:'Decision Date',v:fmtDate(app.decidedAt)}]:[]),
                          ...(app.paidAt?.toString()!=='0'?[{l:'Payment Date',v:fmtDate(app.paidAt)}]:[]),
                          ...(app.processingDays?.toString()!=='0'?[{l:'Processing Time',v:app.processingDays?.toString()+' days'}]:[]),
                        ].map((r,i)=>(
                          <tr key={i}><td className={r.mono?'font-mono':''}>{r.l}</td><td className={r.mono?'font-mono':''} style={r.mono?{fontSize:12,fontWeight:600}:{fontWeight:600}}>{r.v}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Vote status */}
                  {votes && (
                    <div className="card" style={{padding:'20px 24px'}}>
                      <div className="st-card-title"><Icon name="vote" size={13}/>Voting Status</div>
                      {[
                        {label:'Approve Votes',count:Number(votes.approveCount),color:'var(--green)',icon:'check'},
                        {label:'Reject Votes', count:Number(votes.rejectCount), color:'var(--red)',  icon:'x'},
                      ].map(m=>(
                        <div key={m.label} style={{marginBottom:14}}>
                          <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                            <span style={{fontWeight:700,color:m.color,fontSize:13,display:'flex',alignItems:'center',gap:4}}>
                              <Icon name={m.icon} size={12} color={m.color}/>{m.label}
                            </span>
                            <strong style={{fontSize:13}}>{m.count} / {votes.threshold?.toString()}</strong>
                          </div>
                          <div style={{height:9,background:'var(--bg-panel)',borderRadius:99,overflow:'hidden',border:'1px solid var(--border)'}}>
                            <div style={{height:'100%',width:`${Math.min(100,m.count/Number(votes.threshold)*100)}%`,background:m.color,borderRadius:99,transition:'width .5s ease'}}/>
                          </div>
                        </div>
                      ))}
                      <table className="formal-table" style={{marginTop:8}}>
                        <tbody>
                          <tr><td style={{color:'var(--text-muted)'}}>Required for Decision</td><td style={{fontWeight:700}}>{votes.threshold?.toString()} votes (70%)</td></tr>
                          <tr><td style={{color:'var(--text-muted)'}}>Votes Still Needed</td><td style={{fontWeight:700}}>{votes.votesStillNeeded?.toString()}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Audit trail */}
                {audit.length>0 && (
                  <div className="card" style={{padding:'20px 24px'}}>
                    <div className="st-card-title"><Icon name="audit" size={13}/>Immutable Audit Trail</div>
                    <table className="formal-table">
                      <thead><tr><th>Action</th><th>Details</th><th>Block</th><th>Timestamp</th></tr></thead>
                      <tbody>
                        {[...audit].reverse().map((e,i)=>(
                          <tr key={i}>
                            <td><span className="badge badge-navy" style={{fontSize:11}}>{AUDIT_ACTION[Number(e.action)]}</span></td>
                            <td style={{fontSize:12,color:'var(--text-muted)',maxWidth:300}}>{e.details}</td>
                            <td className="font-mono" style={{fontSize:11,color:'var(--text-muted)'}}>#{e.blockNumber?.toString()}</td>
                            <td style={{fontSize:12,whiteSpace:'nowrap',color:'var(--text-muted)'}}>{fmtDate(e.timestamp)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .st-search { background:var(--surface); border:1px solid var(--border); border-radius:var(--r-lg); padding:22px 26px; margin-bottom:24px; box-shadow:var(--shadow-sm); }
        .st-search-inner {}
        .st-search-label { font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.8px; color:var(--text-muted); margin-bottom:10px; }
        .st-myapps { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:12px; padding-top:12px; border-top:1px solid var(--border); }
        .st-myapps-label { font-size:10px; font-weight:800; letter-spacing:1.2px; text-transform:uppercase; color:var(--text-muted); }
        .st-chip { background:var(--saffron-lt); color:var(--saffron); border:1px solid #F0B888; border-radius:var(--r-sm); padding:4px 12px; font-size:12px; font-weight:800; cursor:pointer; transition:var(--transition); }
        .st-chip:hover { background:var(--saffron); color:#fff; border-color:var(--saffron); }
        .st-status-card { display:flex; align-items:center; justify-content:space-between; padding:20px 24px; border-radius:var(--r-lg); margin-bottom:16px; background:var(--surface); border:1px solid var(--border); box-shadow:var(--shadow-sm); }
        .st-status-left { display:flex; align-items:center; gap:16px; }
        .st-status-icon { width:52px; height:52px; border-radius:var(--r); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .st-icon-submitted{background:var(--saffron);} .st-icon-voting{background:var(--purple);} .st-icon-approved{background:var(--green);} .st-icon-rejected{background:var(--red);} .st-icon-paid{background:var(--green);} .st-icon-disputed{background:var(--purple);}
        .st-status-title { font-size:17px; font-weight:800; color:var(--navy-deep); margin-bottom:2px; }
        .st-status-sub   { font-size:13px; color:var(--text-muted); }
        .st-progress { display:flex; align-items:flex-start; }
        .st-pstep { display:flex; flex-direction:column; align-items:center; flex:1; position:relative; }
        .st-pstep:not(:last-child) .st-pline { position:absolute; top:17px; left:50%; width:100%; height:2px; background:var(--border); z-index:0; border-radius:99px; }
        .st-pstep:not(:last-child) .st-pline.done { background:var(--green); }
        .st-pcircle { width:34px; height:34px; border-radius:50%; border:2px solid var(--border); background:var(--surface); display:flex; align-items:center; justify-content:center; position:relative; z-index:1; transition:var(--transition); }
        .st-pstep.done   .st-pcircle { background:var(--green); border-color:var(--green); }
        .st-pstep.active .st-pcircle { background:var(--navy); border-color:var(--navy); box-shadow:0 0 0 4px rgba(27,42,74,.12); }
        .st-pcircle.rej { background:var(--red); border-color:var(--red); }
        .st-plabel { font-size:11px; font-weight:700; color:var(--text-muted); margin-top:6px; text-align:center; }
        .st-pstep.active .st-plabel { color:var(--navy); font-weight:800; }
        .st-pstep.done   .st-plabel { color:var(--green); }
        .st-rej-panel { background:var(--red-lt); border:1.5px solid #F0A8A8; border-radius:var(--r-lg); padding:20px 24px; margin-bottom:16px; }
        .st-rej-head { font-size:13px; font-weight:800; color:var(--red); margin-bottom:14px; display:flex; align-items:center; gap:8px; }
        .st-card-title { font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted); margin-bottom:14px; display:flex; align-items:center; gap:5px; }
      `}</style>
    </div>
  );
}
