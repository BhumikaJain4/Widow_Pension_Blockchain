import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { toast } from 'react-toastify';
import axios from 'axios';
import { useWeb3 } from '../context/Web3Context';
import Icon from '../components/Icon';

const API = 'http://localhost:5000';
const STEPS = ['Identity Verification', 'Document Upload', 'Review & Submit', 'Confirmation'];

export default function ApplyPage() {
  const { account, contracts, isConnected, connect } = useWeb3();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [aadhaarNum, setAadhaarNum] = useState('');
  const [otpSent, setOtpSent]       = useState(false);
  const [otp, setOtp]               = useState('');
  const [kycData, setKycData]       = useState(null);
  const [aadhaarHash, setAadhaarHash] = useState('');
  const [demoOtp, setDemoOtp]       = useState('');
  const [uploads, setUploads]       = useState({});
  const [uploading, setUploading]   = useState({});
  const [schemes, setSchemes]       = useState([]);
  const [schemeId, setSchemeId]     = useState('1');
  const [loading, setLoading]       = useState(false);
  const [txHash, setTxHash]         = useState('');
  const [appId, setAppId]           = useState('');

  useEffect(() => {
    if (!contracts) return;
    contracts.scheme.getAllSchemeIds()
      .then(ids => Promise.all(ids.map(id => contracts.scheme.getScheme(id))))
      .then(s => { const active=s.filter(x=>x.active); setSchemes(active); if(active[0]) setSchemeId(active[0].schemeId.toString()); })
      .catch((e) => {
        console.error('Failed to load schemes:', e);
        toast.error('Unable to load pension schemes. Please verify wallet network and contract deployment.');
      });
  }, [contracts]);

  const requestOtp = async () => {
    const c = aadhaarNum.replace(/\s/g,'');
    if (c.length!==12) { toast.error('Enter a valid 12-digit Aadhaar number'); return; }
    setLoading(true);
    try {
      const {data} = await axios.post(`${API}/api/aadhaar/request-otp`,{aadhaarNumber:c});
      if(data.success){setOtpSent(true);setDemoOtp(data.demoOTP||'');toast.success('OTP sent to registered mobile.');}
    } catch(e){toast.error(e.response?.data?.error||'Failed to send OTP');}
    finally{setLoading(false);}
  };

  const verifyOtp = async () => {
    const c = aadhaarNum.replace(/\s/g,'');
    setLoading(true);
    try {
      const {data} = await axios.post(`${API}/api/aadhaar/verify-otp`,{aadhaarNumber:c,otp});
      if(!data.success){toast.error('Verification failed');return;}
      const hash=data.aadhaarHash;
      if(contracts){
        const activeId=await contracts.registry.getActiveApplicationByAadhaar(hash).catch(()=>0n);
        if(Number(activeId)>0){toast.error(`This Aadhaar already has an active application (#${activeId}). You may re-apply only after it is rejected or paid.`);setLoading(false);return;}
      }
      setKycData(data.kyc);setAadhaarHash(hash);toast.success('Aadhaar verified successfully.');setStep(1);
    } catch(e){toast.error(e.response?.data?.error||'Verification failed');}
    finally{setLoading(false);}
  };

  const uploadFile = async (key,file) => {
    const fd=new FormData();fd.append('document',file);fd.append('docType',key);
    fd.append('applicantId', aadhaarHash || 'unknown');
    setUploading(u=>({...u,[key]:true}));
    try {
      const {data}=await axios.post(`${API}/api/ipfs/upload`,fd,{headers:{'Content-Type':'multipart/form-data'}});
      if(data.success){setUploads(u=>({...u,[key]:data}));toast.success(`${key.replace(/_/g,' ')} uploaded.`);}
    } catch(e){toast.error('Upload failed: '+(e.response?.data?.error||e.message));}
    finally{setUploading(u=>({...u,[key]:false}));}
  };

  const DOC_DEFS=[
    {key:'death_cert',    label:"Husband's Death Certificate",required:true},
    {key:'marriage_cert', label:'Marriage Certificate',       required:true},
    {key:'age_proof',     label:'Age / Date of Birth Proof',  required:true},
    {key:'photo',         label:'Passport Photo',             required:false},
  ];
  const reqDone=DOC_DEFS.filter(d=>d.required).every(d=>uploads[d.key]);

  const submit = async () => {
    if(!contracts){toast.error('Wallet not connected');return;}
    const main=uploads.death_cert||Object.values(uploads)[0];
    if(!main){toast.error('Please upload the death certificate first');return;}
    setLoading(true);
    try {
      toast.info('Please confirm the transaction in MetaMask.');
      // Collect all uploaded CIDs and sha256 hashes
      const allCids = DOC_DEFS
        .filter(d => uploads[d.key])
        .map(d => uploads[d.key].cid);

      const allHashes = DOC_DEFS
        .filter(d => uploads[d.key])
        .map(d => uploads[d.key].sha256Hash);

      const tx = await contracts.registry.submitApplication(
        aadhaarHash,
        allCids[0],        // primary CID (death cert)
        parseInt(schemeId)
      );
      toast.info('Waiting for blockchain confirmation…');
      const receipt=await tx.wait();
      const event=receipt.logs.map(l=>{try{return contracts.registry.interface.parseLog(l);}catch{return null;}}).find(e=>e?.name==='ApplicationSubmitted');
      const id=event?.args?.applicationId?.toString()||'?';
      setAppId(id);setTxHash(receipt.hash);setStep(3);toast.success(`Application #${id} recorded on-chain.`);
    } catch(e){toast.error(e.reason||e.message||'Transaction failed');}
    finally{setLoading(false);}
  };

  if(!isConnected) return (
    <div className="page ap-guard">
      <div className="ap-guard-card">
        <div className="ap-guard-seal">
          <Icon name="wallet" size={40} color="var(--navy)"/>
        </div>
        <h2>Wallet Connection Required</h2>
        <p>You must connect your MetaMask wallet to submit a pension application.</p>
        <button className="btn btn-primary btn-lg mt-3" onClick={connect}><Icon name="wallet" size={16}/>Connect MetaMask</button>
        <div className="ap-guard-note">Your wallet address will serve as the beneficiary address for disbursements.</div>
      </div>
    </div>
  );

  return (
    <div className="page ap-page">
      {/* Page header */}
      <div className="page-header">
        <div className="container">
          <span className="page-header-eyebrow">IGNWPS Application</span>
          <h1 className="page-header-title">Pension Application Form</h1>
          <p className="page-header-sub">All information submitted is secured by the Ethereum blockchain.</p>
        </div>
      </div>

      <div className="content-area">
        <div className="container" style={{maxWidth:720}}>
          <div className="animate-fade-up">

            {/* Step indicator */}
            <div className="ap-step-bar">
              {STEPS.map((s,i)=>(
                <div key={i} className={`ap-step ${i<step?'done':i===step?'active':''}`}>
                  <div className="ap-step-circle">
                    {i<step ? <Icon name="check" size={13} color="white"/> : <span>{i+1}</span>}
                  </div>
                  <div className="ap-step-label">{s}</div>
                  {i<STEPS.length-1 && <div className={`ap-step-line ${i<step?'done':''}`}/>}
                </div>
              ))}
            </div>

            {/* STEP 0 — Aadhaar */}
            {step===0 && (
              <div className="ap-panel animate-fade-in">
                <div className="ap-panel-header">
                  <div className="ap-panel-icon"><Icon name="id" size={22} color="white"/></div>
                  <div>
                    <div className="ap-panel-title">Step 1: Aadhaar Identity Verification</div>
                    <div className="ap-panel-sub">Your Aadhaar number is hashed using SHA-256 before any on-chain storage. The raw number is never recorded.</div>
                  </div>
                </div>
                <div className="ap-panel-body">
                  <div className="form-group">
                    <label className="form-label">Aadhaar Number <span style={{color:'var(--red)'}}>*</span></label>
                    <input className="form-input" style={{fontFamily:'JetBrains Mono,monospace',fontSize:18,letterSpacing:3}} placeholder="XXXX XXXX XXXX"
                      maxLength={14} value={aadhaarNum} disabled={otpSent}
                      onChange={e=>setAadhaarNum(e.target.value.replace(/[^0-9\s]/g,''))}/>
                    <span className="form-hint">12-digit number printed on your Aadhaar card.</span>
                  </div>
                  {!otpSent ? (
                    <button className="btn btn-primary btn-full" onClick={requestOtp} disabled={loading}>
                      {loading?<><span className="spinner"/>Sending OTP…</>:<><Icon name="bell" size={15}/>Send OTP to Registered Mobile</>}
                    </button>
                  ) : (
                    <>
                      {demoOtp && (
                        <div className="alert alert-warning">
                          <Icon name="warning" size={15}/>
                          <div><strong>Demo Mode</strong> — OTP: <strong style={{fontSize:18,letterSpacing:4,fontFamily:'monospace'}}>{demoOtp}</strong><br/>
                          <span style={{fontSize:12}}>In production, UIDAI sends this to your registered mobile number.</span></div>
                        </div>
                      )}
                      <div className="form-group">
                        <label className="form-label">One-Time Password <span style={{color:'var(--red)'}}>*</span></label>
                        <input className="form-input" style={{fontFamily:'JetBrains Mono,monospace',fontSize:22,letterSpacing:8,textAlign:'center'}}
                          placeholder="_ _ _ _ _ _" maxLength={6} value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,''))}/>
                      </div>
                      <div className="flex gap-1">
                        <button className="btn btn-primary" onClick={verifyOtp} disabled={loading||otp.length!==6}>
                          {loading?<><span className="spinner"/>Verifying…</>:<><Icon name="check" size={14}/>Verify OTP</>}
                        </button>
                        <button className="btn btn-ghost" onClick={()=>{setOtpSent(false);setOtp('');setDemoOtp('');}}>Change Number</button>
                      </div>
                    </>
                  )}
                  <div className="ap-demo-box">
                    <div className="ap-demo-label">Demo — Test Aadhaar Numbers:</div>
                    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}>
                      {['234567890123','456789012345','111111111111'].map(n=>(
                        <button key={n} className="ap-demo-chip" onClick={()=>setAadhaarNum(n)}>{n}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 1 — Documents */}
            {step===1 && kycData && (
              <div className="animate-fade-in">
                <div className="ap-kyc-row">
                  <Icon name="success" size={20} color="var(--green)"/>
                  <div>
                    <strong style={{color:'var(--green)',fontSize:14}}>{kycData.name}</strong>
                    <span style={{color:'var(--text-muted)',marginLeft:8,fontSize:13}}>{kycData.district}, {kycData.state}</span>
                    <span style={{color:'var(--text-muted)',marginLeft:8,fontSize:13}}>· {kycData.maskedAadhaar}</span>
                  </div>
                </div>
                <div className="ap-panel">
                  <div className="ap-panel-header">
                    <div className="ap-panel-icon" style={{background:'linear-gradient(135deg,var(--navy),var(--navy-mid))'}}><Icon name="folder" size={22} color="white"/></div>
                    <div>
                      <div className="ap-panel-title">Step 2: Document Upload</div>
                      <div className="ap-panel-sub">Files are stored on IPFS. Only SHA-256 content hashes are recorded on-chain.</div>
                    </div>
                  </div>
                  <div className="ap-panel-body">
                    <table className="formal-table ap-doc-table">
                      <thead><tr><th>Document</th><th>Status</th><th style={{textAlign:'right'}}>Action</th></tr></thead>
                      <tbody>
                        {DOC_DEFS.map(doc=>(
                          <tr key={doc.key}>
                            <td>
                              <div style={{fontWeight:700,fontSize:14}}>{doc.label}</div>
                              {doc.required&&<span style={{fontSize:11,color:'var(--red)',fontWeight:700}}>Required</span>}
                            </td>
                            <td>
                              {uploads[doc.key]
                                ? <span className="badge badge-approved"><Icon name="check" size={10}/>Uploaded</span>
                                : <span className="badge badge-pending">Pending</span>}
                            </td>
                            <td style={{textAlign:'right'}}>
                              {uploads[doc.key] ? (
                                <span className="font-mono" style={{fontSize:11,color:'var(--text-muted)'}}>{uploads[doc.key].cid.slice(0,16)}…</span>
                              ) : uploading[doc.key] ? (
                                <span style={{fontSize:13,color:'var(--text-muted)',display:'flex',alignItems:'center',gap:5,justifyContent:'flex-end'}}>
                                  <span className="spinner spinner-dark" style={{width:13,height:13}}/>Uploading…
                                </span>
                              ) : (
                                <label className="btn btn-ghost btn-sm" style={{cursor:'pointer'}}>
                                  <Icon name="upload" size={13}/>Choose File
                                  <input type="file" accept=".jpg,.jpeg,.png,.pdf,.webp" style={{display:'none'}} onChange={e=>{if(e.target.files[0]) uploadFile(doc.key,e.target.files[0]);}}/>
                                </label>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <hr className="divider"/>
                    <div className="flex justify-between items-center">
                      <button className="btn btn-ghost" onClick={()=>setStep(0)}><Icon name="arrowL" size={14}/>Previous</button>
                      <button className="btn btn-navy" onClick={()=>setStep(2)} disabled={!reqDone}>
                        Continue to Review<Icon name="arrowR" size={14}/>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2 — Review */}
            {step===2 && (
              <div className="ap-panel animate-fade-in">
                <div className="ap-panel-header">
                  <div className="ap-panel-icon" style={{background:'linear-gradient(135deg,var(--gold),#9A6A00)'}}><Icon name="doc" size={22} color="white"/></div>
                  <div>
                    <div className="ap-panel-title">Step 3: Review & Submit</div>
                    <div className="ap-panel-sub">Verify all details before creating a permanent blockchain transaction.</div>
                  </div>
                </div>
                <div className="ap-panel-body">
                  {/* Identity */}
                  <div className="ap-review-section">
                    <div className="ap-review-section-title"><Icon name="id" size={12}/>Identity Details</div>
                    <table className="formal-table">
                      <tbody>
                        {[['Full Name',kycData?.name],['District & State',`${kycData?.district}, ${kycData?.state}`],['Aadhaar (Masked)',kycData?.maskedAadhaar],['Wallet Address',account]].map(([l,v])=>(
                          <tr key={l}><td style={{color:'var(--text-muted)',width:'40%'}}>{l}</td><td className={l==='Wallet Address'?'font-mono':''} style={l==='Wallet Address'?{fontSize:12}:{fontWeight:600}}>{v}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Documents */}
                  <div className="ap-review-section">
                    <div className="ap-review-section-title"><Icon name="ipfs" size={12}/>Uploaded Documents</div>
                    <table className="formal-table">
                      <tbody>
                        {Object.entries(uploads).map(([k,v])=>(
                          <tr key={k}><td style={{color:'var(--text-muted)',width:'40%'}}>{k.replace(/_/g,' ')}</td><td className="font-mono" style={{fontSize:11}}>{v.cid.slice(0,28)}…</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Scheme */}
                  <div className="ap-review-section">
                    <div className="ap-review-section-title"><Icon name="scheme" size={12}/>Pension Scheme</div>
                    <select className="form-select" value={schemeId} onChange={e=>setSchemeId(e.target.value)}>
                      {schemes.map(s=>(
                        <option key={s.schemeId.toString()} value={s.schemeId.toString()}>
                          {s.name} — {parseFloat(ethers.formatEther(s.monthlyAmount)).toFixed(4)} ETH/month
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="alert alert-saffron">
                    <Icon name="info" size={15}/>
                    <span>By clicking Submit, you authorise an Ethereum transaction. This action is irreversible and will be permanently recorded on-chain.</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <button className="btn btn-ghost" onClick={()=>setStep(1)}><Icon name="arrowL" size={14}/>Previous</button>
                    <button className="btn btn-primary btn-lg" onClick={submit} disabled={loading}>
                      {loading?<><span className="spinner"/>Submitting…</>:<><Icon name="arrowR" size={16}/>Submit Application</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3 — Confirmed */}
            {step===3 && (
              <div className="ap-success animate-fade-in">
                <div className="ap-success-header">
                  <Icon name="success" size={52} color="var(--green)"/>
                  <h2 style={{color:'#fff',marginTop:14}}>Application Submitted</h2>
                  <p style={{color:'rgba(255,255,255,.7)',marginTop:6}}>Your application has been permanently recorded on the Ethereum blockchain.</p>
                </div>
                <div className="ap-success-body">
                  <table className="formal-table">
                    <tbody>
                      <tr><td style={{color:'var(--text-muted)',width:'40%'}}>Application ID</td><td><strong>#{appId}</strong></td></tr>
                      <tr><td style={{color:'var(--text-muted)'}}>Transaction Hash</td><td className="font-mono" style={{fontSize:11}}>{txHash.slice(0,32)}…</td></tr>
                      <tr><td style={{color:'var(--text-muted)'}}>Status</td><td><span className="badge badge-submitted">Submitted — Awaiting Review</span></td></tr>
                      <tr><td style={{color:'var(--text-muted)'}}>Next Step</td><td style={{color:'var(--text-muted)'}}>Registered validators will review your application</td></tr>
                    </tbody>
                  </table>
                  <div className="flex gap-2 mt-3" style={{justifyContent:'center'}}>
                    <button className="btn btn-navy" onClick={()=>navigate(`/status?id=${appId}`)}>
                      <Icon name="search" size={15}/>Track Application Status
                    </button>
                    <button className="btn btn-ghost" onClick={()=>{setStep(0);setKycData(null);setUploads({});setAadhaarNum('');setOtp('');setOtpSent(false);}}>
                      Submit Another Application
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .ap-page .page-header { background:linear-gradient(135deg,var(--navy-deep),var(--navy-mid)); }
        .ap-guard { display:flex; align-items:center; justify-content:center; min-height:100vh; background:var(--bg); }
        .ap-guard-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--r-xl); padding:52px 44px; text-align:center; max-width:460px; box-shadow:var(--shadow-md); }
        .ap-guard-seal { width:80px; height:80px; background:var(--bg-panel); border:1px solid var(--border); border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 20px; }
        .ap-guard-card h2 { font-size:22px; margin-bottom:10px; }
        .ap-guard-card p  { color:var(--text-muted); font-size:14px; line-height:1.6; }
        .ap-guard-note { margin-top:20px; font-size:12px; color:var(--text-muted); font-style:italic; }
        /* Step bar */
        .ap-step-bar { display:flex; align-items:flex-start; margin-bottom:32px; }
        .ap-step { display:flex; flex-direction:column; align-items:center; flex:1; position:relative; }
        .ap-step-circle { width:36px; height:36px; border-radius:50%; border:2px solid var(--border); background:var(--surface); display:flex; align-items:center; justify-content:center; font-weight:800; font-size:13px; color:var(--text-muted); position:relative; z-index:1; transition:var(--transition); }
        .ap-step.done   .ap-step-circle { background:var(--green); border-color:var(--green); color:#fff; }
        .ap-step.active .ap-step-circle { background:var(--navy); border-color:var(--navy); color:#fff; box-shadow:0 0 0 4px rgba(27,42,74,.14); }
        .ap-step-label { font-size:11px; font-weight:700; color:var(--text-muted); margin-top:6px; text-align:center; }
        .ap-step.active .ap-step-label { color:var(--navy); font-weight:800; }
        .ap-step.done   .ap-step-label { color:var(--green); }
        .ap-step-line { position:absolute; top:17px; left:50%; width:100%; height:2px; background:var(--border); z-index:0; }
        .ap-step-line.done { background:var(--green); }
        /* Panel */
        .ap-panel { background:var(--surface); border:1px solid var(--border); border-radius:var(--r-lg); overflow:hidden; margin-bottom:20px; box-shadow:var(--shadow-sm); }
        .ap-panel-header { display:flex; align-items:center; gap:14px; padding:18px 24px; background:linear-gradient(135deg,var(--saffron),#CC5500); }
        .ap-panel-icon { width:44px; height:44px; border-radius:var(--r-sm); background:rgba(255,255,255,.2); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .ap-panel-title { font-size:15px; font-weight:800; color:#fff; margin-bottom:2px; }
        .ap-panel-sub   { font-size:12px; color:rgba(255,255,255,.75); line-height:1.4; }
        .ap-panel-body  { padding:24px; }
        /* KYC row */
        .ap-kyc-row { display:flex; align-items:center; gap:10px; background:var(--green-lt); border:1px solid #9EDAB8; border-radius:var(--r); padding:13px 16px; margin-bottom:16px; }
        /* Doc table */
        .ap-doc-table td { vertical-align:middle; }
        /* Demo */
        .ap-demo-box { background:var(--gold-lt); border:1px solid #E8CC88; border-radius:var(--r); padding:14px 16px; margin-top:20px; }
        .ap-demo-label { font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.8px; color:var(--gold); }
        .ap-demo-chip { padding:6px 12px; background:var(--surface); border:1px solid #E8CC88; border-radius:var(--r-sm); font-size:13px; font-family:'JetBrains Mono',monospace; cursor:pointer; color:var(--gold); font-weight:600; transition:var(--transition); }
        .ap-demo-chip:hover { background:var(--navy); color:#fff; border-color:var(--navy); }
        /* Review */
        .ap-review-section { background:var(--bg-panel); border:1px solid var(--border); border-radius:var(--r); padding:16px; margin-bottom:12px; }
        .ap-review-section-title { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted); margin-bottom:12px; display:flex; align-items:center; gap:5px; }
        /* Success */
        .ap-success { background:var(--surface); border:1px solid var(--border); border-radius:var(--r-lg); overflow:hidden; box-shadow:var(--shadow-md); }
        .ap-success-header { background:linear-gradient(135deg,var(--green),#144F2C); padding:40px; text-align:center; }
        .ap-success-body   { padding:28px; }
      `}</style>
    </div>
  );
}
