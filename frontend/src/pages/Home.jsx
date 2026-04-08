import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWeb3 } from '../context/Web3Context';
import { ethers } from 'ethers';
import Icon from '../components/Icon';

function GoiEmblem() {
  const spokes = Array.from({length:24},(_,i)=>{
    const a=(i*15*Math.PI)/180;
    return <line key={i} x1={60+40*Math.cos(a)} y1={60+40*Math.sin(a)} x2={60+52*Math.cos(a)} y2={60+52*Math.sin(a)} stroke="rgba(0,0,128,.14)" strokeWidth="1.5"/>;
  });
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" className="chakra-spin" style={{opacity:.6}}>
      <circle cx="60" cy="60" r="56" fill="none" stroke="rgba(0,0,128,.1)" strokeWidth="2"/>
      <circle cx="60" cy="60" r="40" fill="none" stroke="rgba(0,0,128,.12)" strokeWidth="1.5"/>
      <circle cx="60" cy="60" r="10" fill="none" stroke="rgba(0,0,128,.18)" strokeWidth="2"/>
      <circle cx="60" cy="60" r="3.5" fill="rgba(0,0,128,.2)"/>
      {spokes}
    </svg>
  );
}

export default function Home() {
  const { contracts, isConnected, connect, connecting } = useWeb3();
  const [stats, setStats]   = useState({ total:'—', pending:'—', validators:'—', balance:'—' });
  const [schemes, setSchemes] = useState([]);

  useEffect(() => {
    if (!contracts) return;
    (async () => {
      try {
        const [total,pending,validators,balance,ids] = await Promise.all([
          contracts.registry.totalApplications(),
          contracts.registry.pendingCount(),
          contracts.registry.totalValidators(),
          contracts.fund.totalFundsHeld(),
          contracts.scheme.getAllSchemeIds(),
        ]);
        setStats({
          total:total.toString(), pending:pending.toString(),
          validators:validators.toString(),
          balance:parseFloat(ethers.formatEther(balance)).toFixed(3)+' ETH',
        });
        const s = await Promise.all(ids.map(id=>contracts.scheme.getScheme(id)));
        setSchemes(s.filter(x=>x.active));
      } catch {}
    })();
  }, [contracts]);

  return (
    <div className="page" style={{background:'var(--bg)'}}>

      {/* ── HERO ── */}
      <div className="h-hero">
        <div className="h-hero-pattern"/>
        <div className="h-hero-emblem"><GoiEmblem/></div>
        <div className="container h-hero-inner">
          <div className="h-hero-content animate-fade-up">
            <div className="h-hero-tag">
              <span className="h-dot h-dot-saffron"/>
              <span className="h-dot h-dot-white"/>
              <span className="h-dot h-dot-green"/>
              <span>Government of India · Ministry of Rural Development</span>
            </div>
            <h1 className="h-hero-title">
              Widow Pension<br/>
              <span className="h-hero-title-accent">Administration Portal</span>
            </h1>
            <div className="h-hero-rule"><div className="h-rule-line"/><div className="h-rule-diamond"/><div className="h-rule-line"/></div>
            <p className="h-hero-desc">
              The <em>Indira Gandhi National Widow Pension Scheme</em> administration system,
              secured by the Ethereum blockchain. Every application, vote, and disbursement
              is permanently recorded — transparent, tamper-proof, and corruption-free.
            </p>
            <div className="h-hero-actions animate-fade-up" style={{animationDelay:'.1s'}}>
              {isConnected
                ? <Link to="/apply" className="btn btn-primary btn-lg"><Icon name="apply" size={17}/>Apply for Pension</Link>
                : <button className="btn btn-primary btn-lg" onClick={connect} disabled={connecting}>
                    <Icon name="wallet" size={17}/>{connecting?'Connecting…':'Connect Wallet to Apply'}
                  </button>
              }
              <Link to="/status" className="btn btn-outline btn-lg" style={{borderColor:'rgba(255,255,255,.5)',color:'#fff'}}>
                <Icon name="search" size={17}/>Track Application
              </Link>
            </div>
          </div>

          {/* Stats panel */}
          <div className="h-stats-panel animate-fade-up" style={{animationDelay:'.15s'}}>
            <div className="h-stats-title">
              <Icon name="block" size={14} color="var(--saffron)"/>Live Blockchain Data
            </div>
            {[
              {label:'Total Applications', value:stats.total,      icon:'doc',   color:'var(--saffron)'},
              {label:'Pending Review',     value:stats.pending,    icon:'clock', color:'#6366F1'},
              {label:'Active Validators',  value:stats.validators, icon:'users', color:'var(--green)'},
              {label:'Treasury Balance',   value:stats.balance,    icon:'funds', color:'var(--gold)'},
            ].map(s=>(
              <div key={s.label} className="h-stat">
                <div className="h-stat-icon" style={{background:`${s.color}18`,border:`1px solid ${s.color}30`}}>
                  <Icon name={s.icon} size={18} color={s.color}/>
                </div>
                <div>
                  <div className="h-stat-val" style={{color:s.color}}>{s.value}</div>
                  <div className="h-stat-lbl">{s.label}</div>
                </div>
              </div>
            ))}
            <div className="h-stats-footer">
              <div style={{height:3,background:'linear-gradient(90deg,var(--saffron),var(--gold),var(--green))',borderRadius:99}}/>
            </div>
          </div>
        </div>
      </div>

      {/* ── APPLICATION PROCESS ── */}
      <div className="h-process-section">
        <div className="container">
          <div className="h-section-head stagger">
            <div className="h-section-eyebrow">Application Process</div>
            <h2 className="h-section-title">Four Steps to Pension Disbursement</h2>
            <p className="h-section-desc">Every step is logged immutably on the Ethereum blockchain, ensuring full transparency and accountability.</p>
          </div>
          <div className="h-steps stagger">
            {[
              {n:'01', icon:'id',      color:'var(--saffron)', title:'Aadhaar eKYC Verification',
                desc:'Identity verified via UIDAI OTP. A SHA-256 cryptographic hash is stored on-chain. Your raw Aadhaar number is never recorded.'},
              {n:'02', icon:'ipfs',    color:'#6366F1', title:'Document Submission',
                desc:'Required documents uploaded to IPFS decentralised storage. Content hashes anchored on-chain — making document tampering mathematically impossible.'},
              {n:'03', icon:'vote',    color:'#2A8050', title:'Validator Consensus',
                desc:'Registered validators review and vote. A 70% supermajority is required. Majority wins as soon as the outcome is mathematically certain.'},
              {n:'04', icon:'payment', color:'var(--gold)', title:'Automatic Disbursement',
                desc:'Upon approval, the smart contract immediately transfers the pension amount to the applicant\'s wallet. No human intervention required.'},
            ].map(s=>(
              <div key={s.n} className="h-step-card">
                <div className="h-step-number" style={{color:s.color}}>{s.n}</div>
                <div className="h-step-icon-wrap" style={{background:`${s.color}15`,border:`1px solid ${s.color}25`}}>
                  <Icon name={s.icon} size={26} color={s.color}/>
                </div>
                <h4 className="h-step-title">{s.title}</h4>
                <p className="h-step-desc">{s.desc}</p>
                <div className="h-step-line" style={{background:s.color}}/>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── ACTIVE SCHEMES ── */}
      {schemes.length > 0 && (
        <div className="h-schemes-section">
          <div className="container">
            <div className="h-section-head stagger">
              <div className="h-section-eyebrow">Pension Schemes</div>
              <h2 className="h-section-title">Currently Active Schemes</h2>
            </div>
            <div className="grid-2 stagger">
              {schemes.map(s=>(
                <div key={s.schemeId.toString()} className="h-scheme-card">
                  <div className="h-scheme-header">
                    <div>
                      <span className="badge badge-approved" style={{marginBottom:8,display:'inline-flex'}}>Active</span>
                      <h3 className="h-scheme-title">{s.name}</h3>
                    </div>
                    <div className="h-scheme-amount">
                      <div className="h-scheme-val">{parseFloat(ethers.formatEther(s.monthlyAmount)).toFixed(4)}</div>
                      <div className="h-scheme-unit">ETH / month</div>
                    </div>
                  </div>
                  <div className="h-scheme-meta">
                    <span><Icon name="users" size={13} color="var(--text-muted)"/>Age {s.minAgeLimit.toString()} and above</span>
                    <span><Icon name="clock" size={13} color="var(--text-muted)"/>SLA: {s.maxProcessingDays.toString()} days</span>
                    <span><Icon name="block" size={13} color="var(--text-muted)"/>Scheme #{s.schemeId.toString()}</span>
                  </div>
                  <Link to="/apply" className="btn btn-primary btn-sm" style={{marginTop:16}}>
                    Apply Under This Scheme<Icon name="arrowR" size={13}/>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── WHY BLOCKCHAIN ── */}
      <div className="h-why-section">
        <div className="container">
          <div className="h-section-head stagger" style={{textAlign:'center'}}>
            <div className="h-section-eyebrow" style={{color:'rgba(255,255,255,.5)'}}>Technology</div>
            <h2 className="h-section-title" style={{color:'#fff'}}>Why Blockchain-Based Administration?</h2>
            <p className="h-section-desc" style={{color:'rgba(255,255,255,.6)',margin:'0 auto'}}>Traditional pension administration is opaque and vulnerable to fraud. Blockchain eliminates these problems permanently.</p>
          </div>
          <div className="grid-3 stagger">
            {[
              {icon:'lock',   color:'var(--saffron)', title:'Tamper-proof Records',   desc:'Every action is permanently written to the Ethereum blockchain. No administrator can alter past decisions.'},
              {icon:'search', color:'#818CF8',        title:'Complete Transparency',   desc:'Any citizen can audit every transaction and decision. The ledger is open and verifiable by anyone.'},
              {icon:'chain',  color:'var(--gold)',    title:'Instant Disbursement',    desc:'Smart contracts automatically release pension funds upon approval. No delays, no manual transfers.'},
              {icon:'shield', color:'var(--green)',   title:'Privacy Preserving',      desc:'Only cryptographic hashes of Aadhaar numbers are stored. Raw identity data never reaches the blockchain.'},
              {icon:'scale',  color:'#F472B6',        title:'Dispute Mechanism',        desc:'Rejected applicants may raise a formal dispute within 30 days for fresh review by the validator panel.'},
              {icon:'block',  color:'#60A5FA',        title:'Decentralised Control',    desc:'No single authority controls outcomes. A 70% validator consensus ensures no one can manipulate decisions.'},
            ].map(f=>(
              <div key={f.title} className="h-why-card">
                <div className="h-why-icon" style={{background:`${f.color}18`,border:`1px solid ${f.color}28`}}>
                  <Icon name={f.icon} size={22} color={f.color}/>
                </div>
                <h4 className="h-why-title">{f.title}</h4>
                <p className="h-why-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── CTA ── */}
      <div className="h-cta-section">
        <div className="container h-cta-inner">
          <div>
            <h2 className="h-cta-title">Ready to Apply?</h2>
            <p className="h-cta-desc">Connect your MetaMask wallet to begin the application process.</p>
          </div>
          <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
            {isConnected
              ? <Link to="/apply" className="btn btn-primary btn-lg"><Icon name="apply" size={17}/>Apply Now</Link>
              : <button className="btn btn-primary btn-lg" onClick={connect} disabled={connecting}>
                  <Icon name="wallet" size={17}/>{connecting?'Connecting…':'Connect & Apply'}
                </button>
            }
            <Link to="/status" className="btn btn-ghost btn-lg"><Icon name="search" size={17}/>Track Status</Link>
          </div>
        </div>
      </div>

      <style>{`
        /* HERO */
        .h-hero { position:relative; overflow:hidden; padding:52px 0 56px; background:linear-gradient(160deg, var(--navy-deep) 0%, var(--navy) 60%, var(--navy-mid) 100%); }
        .h-hero-pattern { position:absolute; inset:0; background-image:radial-gradient(rgba(255,255,255,.04) 1px,transparent 1px); background-size:28px 28px; }
        .h-hero-emblem { position:absolute; right:-20px; top:50%; transform:translateY(-50%); pointer-events:none; }
        .h-hero-inner { position:relative; z-index:1; display:grid; grid-template-columns:1fr 320px; gap:48px; align-items:center; }
        .h-hero-tag { display:flex; align-items:center; gap:7px; font-size:11px; font-weight:700; color:rgba(255,255,255,.55); letter-spacing:.8px; text-transform:uppercase; margin-bottom:18px; }
        .h-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
        .h-dot-saffron{background:var(--saffron);} .h-dot-white{background:#fff;} .h-dot-green{background:#138808;}
        .h-hero-title { font-size:clamp(32px,4.5vw,52px); color:#fff; margin-bottom:16px; line-height:1.1; }
        .h-hero-title-accent { color:var(--saffron-mid); font-style:italic; }
        .h-hero-rule { display:flex; align-items:center; gap:10px; margin:18px 0; }
        .h-rule-line { flex:1; height:1px; background:linear-gradient(90deg,rgba(255,255,255,.15),rgba(255,255,255,.35)); max-width:80px; }
        .h-rule-diamond { width:8px; height:8px; background:var(--saffron); transform:rotate(45deg); flex-shrink:0; }
        .h-hero-desc { font-size:15.5px; color:rgba(255,255,255,.7); max-width:520px; margin-bottom:32px; line-height:1.8; }
        .h-hero-desc em { color:rgba(255,255,255,.9); font-style:normal; font-weight:600; }
        .h-hero-actions { display:flex; gap:12px; flex-wrap:wrap; }
        .h-hero-actions .btn-outline { border-color:rgba(255,255,255,.4); color:#fff; }
        .h-hero-actions .btn-outline:hover { background:rgba(255,255,255,.12); border-color:rgba(255,255,255,.7); }

        /* Stats panel */
        .h-stats-panel { background:var(--surface); border:1px solid var(--border); border-radius:var(--r-xl); padding:24px; box-shadow:var(--shadow-lg); position:relative; overflow:hidden; }
        .h-stats-panel::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; background:linear-gradient(90deg,var(--saffron),var(--gold),var(--green)); }
        .h-stats-title { font-size:10.5px; font-weight:800; letter-spacing:1.5px; text-transform:uppercase; color:var(--text-muted); margin-bottom:18px; display:flex; align-items:center; gap:6px; }
        .h-stat { display:flex; align-items:center; gap:12px; padding:12px 0; border-bottom:1px solid var(--border); }
        .h-stat:last-of-type { border-bottom:none; }
        .h-stat-icon { width:40px; height:40px; border-radius:var(--r-sm); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .h-stat-val { font-size:20px; font-weight:900; line-height:1; margin-bottom:2px; }
        .h-stat-lbl { font-size:11.5px; color:var(--text-muted); font-weight:600; }
        .h-stats-footer { margin-top:16px; }

        /* Process section */
        .h-process-section { background:var(--bg-panel); border-top:1px solid var(--border); border-bottom:1px solid var(--border); padding:64px 0; }
        .h-section-head { margin-bottom:44px; }
        .h-section-eyebrow { font-size:11px; font-weight:800; letter-spacing:3px; text-transform:uppercase; color:var(--saffron); margin-bottom:8px; display:block; }
        .h-section-title { font-size:clamp(22px,3vw,34px); margin-bottom:12px; }
        .h-section-desc { font-size:15px; color:var(--text-muted); max-width:560px; line-height:1.75; }
        .h-steps { display:grid; grid-template-columns:repeat(4,1fr); gap:18px; }
        .h-step-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--r-lg); padding:28px 22px; position:relative; overflow:hidden; transition:var(--transition); }
        .h-step-card:hover { box-shadow:var(--shadow-md); transform:translateY(-3px); }
        .h-step-number { font-family:'Literata',serif; font-size:54px; opacity:.07; position:absolute; top:-4px; right:8px; color:var(--navy); line-height:1; font-weight:700; }
        .h-step-icon-wrap { width:56px; height:56px; border-radius:var(--r); display:flex; align-items:center; justify-content:center; margin-bottom:16px; }
        .h-step-title { font-size:14px; font-weight:800; color:var(--navy-deep); margin-bottom:10px; line-height:1.3; }
        .h-step-desc  { font-size:13px; color:var(--text-muted); line-height:1.65; }
        .h-step-line  { height:3px; border-radius:99px; margin-top:18px; opacity:.7; }

        /* Schemes */
        .h-schemes-section { padding:64px 0; background:var(--bg); }
        .h-scheme-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--r-lg); padding:28px; transition:var(--transition); border-top:3px solid var(--saffron); }
        .h-scheme-card:hover { box-shadow:var(--shadow-md); transform:translateY(-2px); }
        .h-scheme-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; gap:16px; }
        .h-scheme-title { font-size:17px; color:var(--navy-deep); margin-top:4px; line-height:1.3; font-family:'Literata',serif; }
        .h-scheme-amount { text-align:right; flex-shrink:0; padding:12px 16px; background:var(--green-lt); border-radius:var(--r); border:1px solid #9EDAB8; }
        .h-scheme-val  { font-size:22px; font-weight:900; color:var(--green); line-height:1; }
        .h-scheme-unit { font-size:10.5px; color:var(--green-mid); font-weight:700; text-transform:uppercase; letter-spacing:.5px; }
        .h-scheme-meta { display:flex; gap:16px; flex-wrap:wrap; }
        .h-scheme-meta span { display:flex; align-items:center; gap:5px; font-size:13px; color:var(--text-muted); font-weight:600; }

        /* Why section */
        .h-why-section { padding:64px 0; background:var(--navy-deep); }
        .h-why-card { background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.1); border-radius:var(--r-lg); padding:28px 24px; transition:var(--transition); }
        .h-why-card:hover { background:rgba(255,255,255,.09); transform:translateY(-3px); }
        .h-why-icon  { width:52px; height:52px; border-radius:var(--r); display:flex; align-items:center; justify-content:center; margin-bottom:14px; }
        .h-why-title { font-size:14px; font-weight:800; margin-bottom:8px; color:#fff; }
        .h-why-desc  { font-size:13px; color:rgba(255,255,255,.55); line-height:1.7; }

        /* CTA */
        .h-cta-section { background:var(--bg-panel); border-top:1px solid var(--border); padding:48px 0; }
        .h-cta-inner { display:flex; align-items:center; justify-content:space-between; gap:32px; flex-wrap:wrap; }
        .h-cta-title { font-size:26px; color:var(--navy-deep); margin-bottom:6px; }
        .h-cta-desc  { font-size:15px; color:var(--text-muted); }

        @media(max-width:1024px){ .h-hero-inner{grid-template-columns:1fr;} .h-hero-emblem{display:none;} }
        @media(max-width:900px) { .h-steps{grid-template-columns:1fr 1fr;} }
        @media(max-width:600px) { .h-steps{grid-template-columns:1fr;} .h-cta-inner{flex-direction:column;} }
      `}</style>
    </div>
  );
}
