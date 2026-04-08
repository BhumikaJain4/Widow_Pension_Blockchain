import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import { useWeb3 } from '../context/Web3Context';
import { APP_STATE } from '../config/contracts';
import Icon from '../components/Icon';
import { requestNotificationPermission, startNotificationService, stopNotificationService, notificationsEnabled, notificationsSupported, sendTestNotification } from '../services/notificationService';

const IPFS_GATEWAYS = ['http://localhost:8080/ipfs/', 'https://ipfs.io/ipfs/', 'https://cloudflare-ipfs.com/ipfs/'];

function IPFSDocViewer({ cid }) {
  const [gw, setGw]       = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [isPdf, setIsPdf]   = useState(false);
  const url = IPFS_GATEWAYS[gw] + cid;
  const tryNext = () => { if (gw < IPFS_GATEWAYS.length-1) { setGw(g=>g+1); setLoaded(false); } else setIsPdf(true); };
  return (
    <div className="vd-ipfs">
      <div className="vd-ipfs-bar">
        <Icon name="ipfs" size={13} color="var(--saffron)"/>
        <span className="font-mono" style={{fontSize:11,color:'var(--text-muted)'}}>{cid?.slice(0,30)}…</span>
        <div style={{marginLeft:'auto',display:'flex',gap:5}}>
          {IPFS_GATEWAYS.map((_,i)=><button key={i} className={`vd-gw ${gw===i?'vd-gw-on':''}`} onClick={()=>{setGw(i);setLoaded(false);setIsPdf(false);}}>GW{i+1}</button>)}
          <a href={url} target="_blank" rel="noreferrer" className="vd-gw"><Icon name="external" size={11}/>Open</a>
        </div>
      </div>
      {!loaded && !isPdf && <div className="vd-ipfs-load"><span className="spinner spinner-dark" style={{width:20,height:20}}/><span>Loading document from IPFS…</span></div>}
      {isPdf ? (
        <div className="vd-ipfs-pdf"><Icon name="doc" size={32} color="var(--text-muted)"/><p>PDF or non-image document.</p><a href={url} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm"><Icon name="external" size={13}/>Open in Browser</a></div>
      ) : (
        <img src={url} alt="IPFS document" className="vd-ipfs-img" style={{display:loaded?'block':'none'}} onLoad={()=>setLoaded(true)} onError={tryNext}/>
      )}
    </div>
  );
}

export default function ValidatorDashboard() {
  const { contracts, account, roles, isConnected, connect } = useWeb3();
  const [allApps, setAllApps]       = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [appDetail, setAppDetail]   = useState(null);
  const [votes, setVotes]           = useState(null);
  const [auditTrail, setAuditTrail] = useState([]);
  const [rejReasons, setRejReasons] = useState([]);
  const [rejectReason, setRejectReason] = useState('');
  const [loading, setLoading]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [threshold, setThreshold]   = useState(3);
  const [totalVals, setTotalVals]   = useState(3);
  const [notifPerms, setNotifPerms] = useState(Notification?.permission||'default');
  const [deadlocked, setDeadlocked] = useState([]);
  const [showDoc, setShowDoc]       = useState(false);
  const pollRef = useRef(null);

  const loadAllApps = useCallback(async () => {
    if (!contracts) return;
    setRefreshing(true);
    try {
      const [total,thresh,vals] = await Promise.all([contracts.registry.totalApplications(),contracts.registry.consensusThreshold(),contracts.registry.totalValidators()]);
      setThreshold(Number(thresh)); setTotalVals(Number(vals));
      const totalNum=Number(total);
      if(totalNum===0){setAllApps([]);return;}
      const appResults=await Promise.all(Array.from({length:totalNum},(_,i)=>contracts.registry.getApplication(i+1).catch(()=>null)));
      const voteResults=await Promise.all(appResults.map((a,i)=>a&&Number(a.state)===2?contracts.registry.getVoteStatus(i+1).catch(()=>null):Promise.resolve(null)));
      const pending=appResults.map((app,idx)=>{
        if(!app) return null;
        const state=Number(app.state);
        if(state!==1&&state!==2) return null;
        const v=voteResults[idx];
        const ac=v?Number(v.approveCount):0,rc=v?Number(v.rejectCount):0;
        const cast=ac+rc,rem=Number(vals)>cast?Number(vals)-cast:0;
        const de=Math.floor((Date.now()/1000-Number(app.submittedAt))/86400);
        return{app,appId:(idx+1).toString(),state,votes:v,approveVotes:ac,rejectVotes:rc,remaining:rem,daysLeft:30-de,daysElapsed:de};
      }).filter(Boolean).sort((a,b)=>Number(a.app.queuePosition)-Number(b.app.queuePosition));
      setAllApps(pending);
      contracts.registry.getDeadlockedApps().then(dl=>setDeadlocked(dl.map(d=>d.toString()))).catch(()=>{});
    } catch(e){console.error(e);}
    finally{setRefreshing(false);}
  },[contracts]);

  useEffect(()=>{loadAllApps();},[loadAllApps]);
  useEffect(()=>{pollRef.current=setInterval(loadAllApps,10000);return()=>clearInterval(pollRef.current);},[loadAllApps]);
  useEffect(()=>{
    if(contracts&&account&&(roles.isValidator||roles.isAdmin)&&notificationsEnabled()) startNotificationService(contracts,account);
    return()=>stopNotificationService();
  },[contracts,account,roles]);

  const loadAppDetail = useCallback(async (id)=>{
    if(!contracts||!id) return;
    try {
      const n=parseInt(id);
      const [app,vs]=await Promise.all([contracts.registry.getApplication(n),contracts.registry.getVoteStatus(n)]);
      setAppDetail(app);setVotes(vs);setShowDoc(false);
      contracts.audit.getAuditTrail(n).then(t=>setAuditTrail(t)).catch(()=>{});
      contracts.registry.getAllRejectionReasons(n).then(r=>setRejReasons(r.map(x=>({validator:x.validator,reason:x.reason})))).catch(()=>{});
    } catch(e){toast.error('Failed to load: '+e.message);}
  },[contracts]);

  const selectApp=(id)=>{setSelectedId(id);loadAppDetail(id);setRejectReason('');};
  useEffect(()=>{if(!selectedId)return;const t=setInterval(()=>loadAppDetail(selectedId),5000);return()=>clearInterval(t);},[selectedId,loadAppDetail]);

  const enableNotifs=async()=>{const ok=await requestNotificationPermission();setNotifPerms(Notification.permission);if(ok){sendTestNotification();startNotificationService(contracts,account);toast.success('Notifications enabled.');}else{toast.error('Permission denied.');}};

  const beginReview=async(appId)=>{setLoading(true);try{toast.info('Confirm in MetaMask…');const tx=await contracts.registry.beginReview(parseInt(appId));await tx.wait();toast.success(`Voting opened for Application #${appId}`);await loadAllApps();await loadAppDetail(appId);}catch(e){const m=e.reason||e.message||'';toast.error(m.includes('oldest')?'FCFS: You must process the oldest SUBMITTED application first.':m||'Failed');}finally{setLoading(false);}};

  const castVote=async(approve)=>{if(!approve&&!rejectReason.trim()){toast.error('A rejection reason is required.');return;}setLoading(true);try{toast.info('Confirm in MetaMask…');const tx=await contracts.registry.castVote(parseInt(selectedId),approve,approve?'':rejectReason.trim());await tx.wait();toast.success(approve?'Vote recorded: Approve':'Vote recorded: Reject');setRejectReason('');await loadAllApps();await loadAppDetail(selectedId);}catch(e){toast.error(e.reason||e.message||'Vote failed');}finally{setLoading(false);}};

  const resolveDeadlock=async(appId)=>{setLoading(true);try{const tx=await contracts.registry.resolveDeadlock(parseInt(appId));await tx.wait();toast.success(`Application #${appId} re-queued with votes reset.`);await loadAllApps();}catch(e){toast.error(e.reason||e.message);}finally{setLoading(false);}};

  const fmtDate=ts=>{if(!ts||ts.toString()==='0')return'—';return new Date(Number(ts)*1000).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});};
  const AUDIT_LABELS={0:'Submitted',1:'Review Started',2:'Approved',3:'Rejected',4:'Payment Sent',5:'Dispute Raised',6:'Dispute Resolved'};
  const getMajority=(ac,rc,rem,thr)=>{if(ac>=thr||(rc+rem<ac))return{outcome:'approved',certain:true};if(rc>=thr||(ac+rem<rc))return{outcome:'rejected',certain:true};return{outcome:'pending',certain:false};};

  if(!isConnected) return <div className="page vd-guard"><div className="vd-guard-card"><Icon name="lock" size={48} color="var(--navy)"/><h2>Validator Access Required</h2><p>Connect your MetaMask wallet with VALIDATOR_ROLE to access this dashboard.</p><button className="btn btn-primary btn-lg mt-3" onClick={connect}><Icon name="wallet" size={16}/>Connect MetaMask</button></div></div>;
  if(!roles.isValidator&&!roles.isAdmin) return <div className="page vd-guard"><div className="vd-guard-card"><Icon name="error" size={48} color="var(--red)"/><h2>Access Denied</h2><p>Wallet <code>{account?.slice(0,10)}…</code> does not have VALIDATOR_ROLE.</p></div></div>;

  const firstSubmitted=allApps.find(a=>a.state===1);

  return (
    <div className="page vd-page">
      <div className="page-header">
        <div className="container">
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}>
            <div>
              <span className="page-header-eyebrow">Validator Dashboard</span>
              <h1 className="page-header-title">Application Review Queue</h1>
              <p className="page-header-sub">FCFS enforced · Majority wins · <strong style={{color:'rgba(255,255,255,.85)'}}>Threshold: {threshold}/{totalVals} votes</strong></p>
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',paddingTop:4}}>
              {notificationsSupported()&&(notifPerms==='granted'
                ?<button className="vd-notif-btn vd-notif-on" onClick={sendTestNotification}><Icon name="bell" size={14}/>Alerts Active</button>
                :<button className="vd-notif-btn vd-notif-off" onClick={enableNotifs}><Icon name="bellOff" size={14}/>Enable Alerts</button>)}
              <button className="vd-refresh" onClick={loadAllApps} disabled={refreshing}>
                <Icon name="refresh" size={14} className={refreshing?'vd-spinning':''}/>
                {refreshing?'Refreshing…':'Refresh'}
              </button>
            </div>
          </div>
          {/* Stats strip */}
          <div className="vd-stats-strip">
            {[{label:'Pending',val:allApps.length,icon:'inbox',c:'#FFF'},{label:'Submitted',val:allApps.filter(a=>a.state===1).length,icon:'clock',c:'#FFD580'},{label:'Voting',val:allApps.filter(a=>a.state===2).length,icon:'vote',c:'#C4B5FD'},{label:'Deadlocked',val:deadlocked.length,icon:'deadlock',c:'#FCA5A5'}].map(s=>(
              <div key={s.label} className="vd-stat-pill">
                <Icon name={s.icon} size={14} color={s.c}/>
                <span style={{color:s.c,fontWeight:800}}>{s.val}</span>
                <span style={{color:'rgba(255,255,255,.55)',fontSize:12}}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="content-area" style={{padding:'28px 0 64px'}}>
        <div className="container">
          {deadlocked.length>0&&roles.isAdmin&&(
            <div className="alert alert-warning mb-3"><Icon name="warning" size={15}/>
              <div><strong>Deadlocked Applications:</strong> #{deadlocked.join(', #')} — consensus is unreachable. Select one and click Resolve Deadlock.</div>
            </div>
          )}
          <div className="vd-layout">
            {/* Queue panel */}
            <div className="vd-queue">
              <div className="vd-queue-head">
                <span><Icon name="inbox" size={13} style={{marginRight:5}}/>Application Queue</span>
                <span className="vd-q-badge">{allApps.length}</span>
              </div>
              {allApps.length===0?(
                <div className="vd-empty"><Icon name="check" size={36} color="var(--green)"/><div>No pending applications</div></div>
              ):allApps.map((item,i)=>{
                const isActive=selectedId===item.appId;
                const isNext=item.appId===firstSubmitted?.appId;
                const isUrgent=item.daysLeft<=10&&item.state===2;
                const isDL=deadlocked.includes(item.appId);
                const {outcome}=getMajority(item.approveVotes,item.rejectVotes,item.remaining,threshold);
                const pct=item.state===2?(item.approveVotes/threshold)*100:0;
                return (
                  <div key={item.appId} className={`vd-qi ${isActive?'vd-qi-sel':''} ${isUrgent?'vd-qi-urgent':''} ${isDL?'vd-qi-dl':''}`} onClick={()=>selectApp(item.appId)}>
                    <div className="vd-qi-header">
                      <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap'}}>
                        {isNext&&<span className="vd-tag-next">NEXT</span>}
                        {isUrgent&&<span className="vd-tag-urgent">URGENT</span>}
                        {isDL&&<span className="vd-tag-dl">DEADLOCK</span>}
                        <span className="vd-qi-num">App #{item.appId}</span>
                      </div>
                      <span className={`badge ${item.state===1?'badge-submitted':'badge-voting'}`} style={{fontSize:11}}>{item.state===1?'Submitted':'Voting'}</span>
                    </div>
                    <div className="vd-qi-meta">Queue #{item.app.queuePosition?.toString()} · {item.daysLeft>0?`${item.daysLeft}d remaining`:`${Math.abs(item.daysLeft)}d overdue`}</div>
                    {item.state===2&&(
                      <div style={{marginTop:7}}>
                        <div className="vd-qi-track"><div className={`vd-qi-fill ${outcome==='rejected'?'vd-qi-fill-r':''}`} style={{width:`${Math.min(100,pct)}%`}}/></div>
                        <div className="vd-qi-votes">
                          {item.approveVotes}A · {item.rejectVotes}R · {item.remaining} remaining
                          {outcome!=='pending'&&<span className={`vd-out ${outcome==='approved'?'vd-out-ok':'vd-out-no'}`}>{outcome==='approved'?'Will Approve':'Will Reject'}</span>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Detail panel */}
            <div className="vd-detail">
              {!selectedId||!appDetail?(
                <div className="vd-empty" style={{minHeight:480}}><Icon name="arrowL" size={36} color="var(--border-md)"/><div>Select an application to review</div></div>
              ):(
                <>
                  <div className="vd-d-head">
                    <div>
                      <div className="vd-d-title">Application #{selectedId}</div>
                      <div className="vd-d-sub">Queue Position #{appDetail.queuePosition?.toString()} · Scheme #{appDetail.schemeId?.toString()}</div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      {appDetail.ipfsCID&&<button className={`vd-doc-btn ${showDoc?'vd-doc-btn-on':''}`} onClick={()=>setShowDoc(s=>!s)}><Icon name="doc" size={13}/>{showDoc?'Hide Doc':'View Doc'}</button>}
                      <span className={`badge ${APP_STATE[Number(appDetail.state)]?.badge}`} style={{display:'flex',alignItems:'center',gap:4,padding:'5px 12px'}}>
                        <Icon name={APP_STATE[Number(appDetail.state)]?.icon||'minus'} size={11}/>
                        {APP_STATE[Number(appDetail.state)]?.label}
                      </span>
                    </div>
                  </div>

                  {showDoc&&appDetail.ipfsCID&&<IPFSDocViewer cid={appDetail.ipfsCID}/>}

                  {/* Info table */}
                  <div className="vd-info-block">
                    <table className="formal-table">
                      <tbody>
                        {[
                          {l:'Applicant Address',v:`${appDetail.applicant?.slice(0,12)}…${appDetail.applicant?.slice(-6)}`,mono:true},
                          {l:'Submission Date',   v:fmtDate(appDetail.submittedAt)},
                          {l:'IPFS Document',     v:appDetail.ipfsCID?.slice(0,22)+'…',mono:true,href:`https://ipfs.io/ipfs/${appDetail.ipfsCID}`},
                        ].map((c,i)=>(
                          <tr key={i}>
                            <td style={{color:'var(--text-muted)',width:'36%'}}>{c.l}</td>
                            <td className={c.mono?'font-mono':''} style={c.mono?{fontSize:12}:{}}>
                              {c.href?<a href={c.href} target="_blank" rel="noreferrer" style={{color:'var(--saffron)',display:'flex',alignItems:'center',gap:4}}>{c.v}<Icon name="external" size={10}/></a>:<strong>{c.v}</strong>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Votes */}
                  {votes&&(()=>{
                    const ac=Number(votes.approveCount),rc=Number(votes.rejectCount),rem=totalVals-(ac+rc);
                    const {outcome,certain}=getMajority(ac,rc,rem,threshold);
                    return(
                      <div className="vd-vote-block">
                        <div className="vd-vote-title"><Icon name="vote" size={13}/>Voting Progress</div>
                        {certain&&<div className={`vd-outcome ${outcome==='approved'?'vd-outcome-ok':'vd-outcome-no'}`}><Icon name={outcome==='approved'?'check':'x'} size={14}/>Outcome decided: <strong>{outcome==='approved'?'Application Approved':'Application Rejected'}</strong> — majority is mathematically certain</div>}
                        <div className="vd-vote-row">
                          <div style={{textAlign:'center',minWidth:54}}><div style={{fontSize:28,fontWeight:900,color:'var(--green)'}}>{ac}</div><div style={{fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:'.8px',color:'var(--green)',marginTop:3}}>Approve</div></div>
                          <div style={{flex:1}}>
                            <div className="vd-vote-track">
                              <div style={{height:'100%',background:'linear-gradient(90deg,var(--green),#144F2C)',borderRadius:'99px 0 0 99px',width:`${Math.min(100,ac/threshold*100)}%`,transition:'width .4s ease'}}/>
                              <div style={{height:'100%',background:'linear-gradient(90deg,#F87171,var(--red))',borderRadius:'0 99px 99px 0',marginLeft:'auto',width:`${Math.min(100,rc/threshold*100)}%`,transition:'width .4s ease'}}/>
                            </div>
                            <div style={{fontSize:12,color:'var(--text-muted)',textAlign:'center',marginTop:5}}>Threshold: <strong>{threshold}</strong> · Remaining voters: <strong>{Math.max(0,rem)}</strong></div>
                          </div>
                          <div style={{textAlign:'center',minWidth:54}}><div style={{fontSize:28,fontWeight:900,color:'var(--red)'}}>{rc}</div><div style={{fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:'.8px',color:'var(--red)',marginTop:3}}>Reject</div></div>
                        </div>
                        {votes.callerHasVoted&&<div className="vd-voted"><Icon name="check" size={13}/>You have already cast your vote on this application.</div>}
                      </div>
                    );
                  })()}

                  {/* All rejection reasons if rejected */}
                  {Number(appDetail.state)===4&&rejReasons.length>0&&(
                    <div className="vd-rej-block">
                      <div className="vd-rej-title"><Icon name="x" size={12}/>All Rejection Reasons</div>
                      <table className="formal-table" style={{marginBottom:0}}>
                        <thead><tr><th>Validator</th><th>Reason</th></tr></thead>
                        <tbody>{rejReasons.map((r,i)=>(
                          <tr key={i}><td className="font-mono" style={{fontSize:11,width:'36%'}}>{r.validator.slice(0,10)}…{r.validator.slice(-6)}</td><td style={{fontStyle:'italic'}}>{r.reason}</td></tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}

                  {/* Action: Begin Review */}
                  {Number(appDetail.state)===1&&(
                    <div className="vd-action">
                      <div className="vd-action-title"><Icon name="unlock" size={13}/>Open for Voting</div>
                      <p className="vd-action-desc">FCFS enforced — only the oldest SUBMITTED application can begin review.</p>
                      <button className="btn btn-primary" onClick={()=>beginReview(selectedId)} disabled={loading}>
                        {loading?<><span className="spinner"/>Processing…</>:<><Icon name="unlock" size={14}/>Begin Review</>}
                      </button>
                    </div>
                  )}

                  {/* Action: Vote */}
                  {Number(appDetail.state)===2&&votes&&!votes.callerHasVoted&&(
                    <div className="vd-action">
                      <div className="vd-action-title"><Icon name="vote" size={13}/>Cast Your Vote</div>
                      <div className="vd-vote-actions">
                        <button className="btn btn-green" onClick={()=>castVote(true)} disabled={loading} style={{minWidth:120,justifyContent:'center'}}>
                          {loading?<><span className="spinner"/>…</>:<><Icon name="check" size={14}/>Approve</>}
                        </button>
                        <span className="vd-or">or</span>
                        <div style={{flex:1,display:'flex',flexDirection:'column',gap:8}}>
                          <textarea className="form-textarea" rows={2} value={rejectReason} onChange={e=>setRejectReason(e.target.value)} placeholder="Rejection reason (required before rejecting)…" style={{resize:'vertical'}}/>
                          <button className="btn btn-danger" onClick={()=>castVote(false)} disabled={loading||!rejectReason.trim()} style={{justifyContent:'center'}}>
                            {loading?<><span className="spinner"/>…</>:<><Icon name="x" size={14}/>Reject</>}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Admin: Resolve Deadlock */}
                  {roles.isAdmin&&deadlocked.includes(selectedId)&&(
                    <div className="vd-action" style={{background:'var(--red-lt)',borderTop:'1px solid #F0A8A8'}}>
                      <div className="vd-action-title" style={{color:'var(--red)'}}><Icon name="deadlock" size={13}/>Deadlock Detected</div>
                      <p className="vd-action-desc">Past SLA timeout and consensus unreachable. Re-queue with votes reset.</p>
                      <button className="btn btn-danger" onClick={()=>resolveDeadlock(selectedId)} disabled={loading}>
                        {loading?<><span className="spinner"/>…</>:<><Icon name="refresh" size={13}/>Resolve Deadlock</>}
                      </button>
                    </div>
                  )}

                  {/* Audit */}
                  {auditTrail.length>0&&(
                    <div className="vd-audit">
                      <div className="vd-audit-title"><Icon name="audit" size={12}/>Audit Trail</div>
                      <table className="formal-table">
                        <thead><tr><th>Action</th><th>Details</th><th>Block</th><th>Time</th></tr></thead>
                        <tbody>{[...auditTrail].reverse().map((e,i)=>(
                          <tr key={i}>
                            <td><span className="badge badge-navy" style={{fontSize:11}}>{AUDIT_LABELS[Number(e.action)]}</span></td>
                            <td style={{fontSize:12,color:'var(--text-muted)',maxWidth:240}}>{e.details}</td>
                            <td className="font-mono" style={{fontSize:11,color:'var(--text-muted)'}}>#{e.blockNumber?.toString()}</td>
                            <td style={{fontSize:12,color:'var(--text-muted)',whiteSpace:'nowrap'}}>{fmtDate(e.timestamp)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes vdRotate{to{transform:rotate(360deg);}}
        .vd-spinning{animation:vdRotate .7s linear infinite;}
        .vd-page .page-header{background:linear-gradient(135deg,var(--navy-deep),var(--navy-mid));}
        .vd-stats-strip{display:flex;gap:20px;margin-top:20px;flex-wrap:wrap;}
        .vd-stat-pill{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:var(--r);padding:8px 14px;}
        .vd-notif-btn{display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:var(--r-sm);font-weight:700;font-size:12px;cursor:pointer;border:none;transition:var(--transition);}
        .vd-notif-on{background:var(--green-lt);color:var(--green);}
        .vd-notif-off{background:var(--saffron-lt);color:var(--saffron);}
        .vd-refresh{display:flex;align-items:center;gap:7px;padding:8px 16px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);border-radius:var(--r-sm);font-weight:700;font-size:13px;cursor:pointer;color:#fff;transition:var(--transition);}
        .vd-refresh:hover:not(:disabled){background:rgba(255,255,255,.2);}
        .vd-refresh:disabled{opacity:.5;cursor:not-allowed;}
        .vd-layout{display:grid;grid-template-columns:300px 1fr;gap:16px;align-items:start;}
        .vd-queue{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden;box-shadow:var(--shadow-sm);}
        .vd-queue-head{display:flex;justify-content:space-between;align-items:center;padding:13px 16px;background:var(--navy);color:#fff;font-weight:800;font-size:13px;}
        .vd-q-badge{background:rgba(255,255,255,.2);border-radius:99px;padding:2px 9px;font-size:12px;font-weight:900;}
        .vd-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 20px;text-align:center;color:var(--text-muted);font-size:14px;gap:12px;}
        .vd-qi{padding:13px 15px;border-bottom:1px solid var(--border);cursor:pointer;transition:var(--transition);border-left:3px solid var(--border-md);}
        .vd-qi:last-child{border-bottom:none;}
        .vd-qi:hover{background:var(--bg-panel);}
        .vd-qi-sel{background:var(--saffron-bg)!important;border-left-color:var(--saffron);}
        .vd-qi-urgent{border-left-color:var(--red);}
        .vd-qi-dl{border-left-color:#7F1D1D;background:var(--red-lt);}
        .vd-qi-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;flex-wrap:wrap;gap:4px;}
        .vd-qi-num{font-weight:800;font-size:14px;color:var(--navy-deep);}
        .vd-tag-next{background:var(--saffron);color:#fff;font-size:9px;font-weight:900;letter-spacing:1px;padding:2px 7px;border-radius:var(--r-sm);}
        .vd-tag-urgent{background:var(--red-lt);color:var(--red);border:1px solid #F0A8A8;font-size:9px;font-weight:900;padding:2px 6px;border-radius:var(--r-sm);}
        .vd-tag-dl{background:#7F1D1D;color:#fff;font-size:9px;font-weight:900;padding:2px 6px;border-radius:var(--r-sm);}
        .vd-qi-meta{font-size:11px;color:var(--text-muted);margin-bottom:5px;}
        .vd-qi-track{height:5px;background:var(--bg-panel);border:1px solid var(--border);border-radius:99px;overflow:hidden;margin-bottom:4px;}
        .vd-qi-fill{height:100%;background:linear-gradient(90deg,var(--green),#144F2C);border-radius:99px;transition:width .4s ease;}
        .vd-qi-fill-r{background:linear-gradient(90deg,#F87171,var(--red));}
        .vd-qi-votes{font-size:11px;color:var(--text-muted);font-weight:600;display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
        .vd-out{font-size:10px;font-weight:900;padding:2px 7px;border-radius:var(--r-sm);}
        .vd-out-ok{background:var(--green-lt);color:var(--green);}
        .vd-out-no{background:var(--red-lt);color:var(--red);}
        .vd-detail{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden;box-shadow:var(--shadow-sm);min-height:480px;}
        .vd-d-head{display:flex;align-items:center;justify-content:space-between;padding:18px 24px;background:linear-gradient(135deg,var(--navy-deep),var(--navy));color:#fff;}
        .vd-d-title{font-size:17px;font-weight:900;margin-bottom:2px;}
        .vd-d-sub{font-size:12px;opacity:.6;}
        .vd-doc-btn{display:flex;align-items:center;gap:5px;padding:6px 12px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);border-radius:var(--r-sm);color:#fff;font-size:12px;font-weight:700;cursor:pointer;transition:var(--transition);}
        .vd-doc-btn:hover,.vd-doc-btn-on{background:var(--saffron);border-color:var(--saffron);}
        /* IPFS viewer */
        .vd-ipfs{border-top:1px solid var(--border);}
        .vd-ipfs-bar{display:flex;align-items:center;gap:8px;padding:10px 20px;background:var(--bg-panel);border-bottom:1px solid var(--border);flex-wrap:wrap;}
        .vd-gw{padding:4px 9px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);font-size:11px;font-weight:700;cursor:pointer;transition:var(--transition);display:flex;align-items:center;gap:3px;text-decoration:none;color:var(--text);}
        .vd-gw:hover{background:var(--navy);color:#fff;border-color:var(--navy);}
        .vd-gw-on{background:var(--saffron)!important;color:#fff!important;border-color:var(--saffron)!important;}
        .vd-ipfs-load{display:flex;align-items:center;gap:10px;padding:32px;justify-content:center;color:var(--text-muted);font-size:14px;}
        .vd-ipfs-img{width:100%;max-height:380px;object-fit:contain;display:block;background:var(--bg-panel);}
        .vd-ipfs-pdf{display:flex;flex-direction:column;align-items:center;gap:12px;padding:40px;text-align:center;color:var(--text-muted);}
        /* Info block */
        .vd-info-block{padding:0 24px;border-bottom:1px solid var(--border);}
        /* Vote block */
        .vd-vote-block{padding:20px 24px;background:var(--bg-panel);border-top:1px solid var(--border);}
        .vd-vote-title{font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px;display:flex;align-items:center;gap:5px;}
        .vd-outcome{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:var(--r-sm);margin-bottom:14px;font-size:13px;font-weight:600;}
        .vd-outcome-ok{background:var(--green-lt);color:var(--green);border:1px solid #9EDAB8;}
        .vd-outcome-no{background:var(--red-lt);color:var(--red);border:1px solid #F0A8A8;}
        .vd-vote-row{display:flex;align-items:center;gap:14px;margin-bottom:10px;}
        .vd-vote-track{height:10px;background:var(--bg);border:1px solid var(--border);border-radius:99px;overflow:hidden;display:flex;margin-bottom:7px;}
        .vd-voted{background:var(--green-lt);color:var(--green);font-size:13px;font-weight:600;padding:10px 14px;border-radius:var(--r-sm);margin-top:10px;display:flex;align-items:center;gap:8px;border:1px solid #9EDAB8;}
        /* Rejection block */
        .vd-rej-block{padding:16px 24px;background:var(--red-lt);border-top:1px solid #F0A8A8;}
        .vd-rej-title{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--red);margin-bottom:10px;display:flex;align-items:center;gap:5px;}
        /* Action block */
        .vd-action{padding:18px 24px;border-top:1px solid var(--border);}
        .vd-action-title{font-size:12px;font-weight:800;color:var(--navy-deep);margin-bottom:6px;text-transform:uppercase;letter-spacing:.8px;display:flex;align-items:center;gap:6px;}
        .vd-action-desc{font-size:13px;color:var(--text-muted);margin-bottom:14px;line-height:1.5;}
        .vd-vote-actions{display:flex;gap:14px;align-items:flex-start;}
        .vd-or{font-size:12px;font-weight:700;color:var(--text-muted);padding-top:10px;flex-shrink:0;}
        .form-textarea{background:var(--surface-warm);}
        /* Audit block */
        .vd-audit{padding:18px 24px;border-top:1px solid var(--border);}
        .vd-audit-title{font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px;display:flex;align-items:center;gap:5px;}
        /* Guard */
        .vd-guard{display:flex;align-items:center;justify-content:center;min-height:100vh;background:var(--bg);}
        .vd-guard-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-xl);padding:48px 40px;text-align:center;max-width:440px;box-shadow:var(--shadow-md);display:flex;flex-direction:column;align-items:center;gap:14px;}
        .vd-guard-card h2{font-size:22px;color:var(--navy-deep);}
        .vd-guard-card p{color:var(--text-muted);font-size:14px;line-height:1.6;}
        .vd-guard-card code{background:var(--bg-panel);padding:2px 6px;border-radius:4px;font-size:12px;}
        @media(max-width:900px){.vd-layout{grid-template-columns:1fr;}.vd-vote-actions{flex-direction:column;}}
      `}</style>
    </div>
  );
}
