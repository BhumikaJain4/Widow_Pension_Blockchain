import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useWeb3 } from '../context/Web3Context';
import Icon from './Icon';

// Ashoka Chakra — 24 spokes, exact proportions
function Chakra({ size = 34 }) {
  const R = size / 2;
  const spokes = Array.from({ length: 24 }, (_, i) => {
    const a = (i * 15 * Math.PI) / 180;
    const inner = R * 0.32, outer = R * 0.82;
    return (
      <line key={i}
        x1={R + inner * Math.cos(a)} y1={R + inner * Math.sin(a)}
        x2={R + outer * Math.cos(a)} y2={R + outer * Math.sin(a)}
        stroke="#000080" strokeWidth={size > 30 ? 1.2 : 0.8}/>
    );
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" className="chakra-spin">
      <circle cx={R} cy={R} r={R * 0.88} fill="none" stroke="#000080" strokeWidth={size > 30 ? 1.6 : 1}/>
      <circle cx={R} cy={R} r={R * 0.62} fill="none" stroke="#000080" strokeWidth={size > 30 ? 0.8 : 0.6}/>
      <circle cx={R} cy={R} r={R * 0.14} fill="#000080"/>
      {spokes}
    </svg>
  );
}

export default function Navbar() {
  const { account, connect, disconnect, connecting, isConnected, shortAddr, roles } = useWeb3();
  const loc = useLocation();
  const [open, setOpen] = useState(false);

  // Treasury AND admin can access admin panel (funds tab)
  const canAccessAdmin = roles.isAdmin || roles.isTreasury;

  const links = [
    { to:'/',         label:'Home' },
    { to:'/apply',    label:'Apply' },
    { to:'/status',   label:'Track Status' },
    ...(roles.isValidator || roles.isAdmin ? [{ to:'/validator', label:'Validator' }] : []),
    ...(canAccessAdmin ? [{ to:'/admin', label:'Portal Admin' }] : []),
  ];

  const roleLabel = roles.isAdmin ? 'Admin'
    : roles.isTreasury && roles.isValidator ? 'Treasury · Validator'
    : roles.isTreasury ? 'Treasury'
    : roles.isValidator ? 'Validator'
    : null;

  return (
    <>
      {/* GOI tricolor bar */}
      <div className="goi-bar"/>

      {/* Top strip — formal GOI style */}
      <div className="nb-top-strip">
        <div className="container nb-top-inner">
          <div className="nb-top-left">
            <Chakra size={42}/>
            <div className="nb-identity">
              <div className="nb-ministry">Ministry of Rural Development · Government of India</div>
              <div className="nb-scheme-name">Indira Gandhi National Widow Pension Scheme</div>
              <div className="nb-scheme-sub">IGNWPS — Blockchain Administration Portal</div>
            </div>
          </div>
          <div className="nb-top-right">
           
            {isConnected ? (
              <div className="nb-wallet-info">
                <span className="nb-wallet-dot"/>
                <span className="nb-wallet-addr">{shortAddr(account)}</span>
                {roleLabel && <span className="badge badge-gold" style={{fontSize:10}}>{roleLabel}</span>}
                <button className="nb-disconnect" onClick={disconnect}>Sign Out</button>
              </div>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={connect} disabled={connecting}>
                <Icon name="wallet" size={13}/>{connecting ? 'Connecting…' : 'Connect Wallet'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Navigation bar */}
      <nav className="nb-nav">
        <div className="container nb-nav-inner">
          <div className="nb-links">
            {links.map(l => (
              <Link key={l.to} to={l.to}
                className={`nb-link ${loc.pathname === l.to ? 'nb-link--active' : ''}`}
                onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
          </div>
          <button className="nb-hamburger" onClick={() => setOpen(o => !o)}>
            <span/><span/><span/>
          </button>
        </div>
        {open && (
          <div className="nb-mobile">
            {links.map(l => (
              <Link key={l.to} to={l.to} className="nb-mobile-link" onClick={() => setOpen(false)}>{l.label}</Link>
            ))}
          </div>
        )}
      </nav>

      <style>{`
        /* Top identity strip */
        .nb-top-strip {
          position:fixed; top:5px; left:0; right:0; z-index:1001;
          background:var(--surface);
          border-bottom:1px solid var(--border);
          box-shadow:0 1px 8px rgba(27,42,74,.08);
        }
        .nb-top-inner {
          display:flex; align-items:center; justify-content:space-between;
          padding-top:10px; padding-bottom:10px; gap:20px;
        }
        .nb-top-left { display:flex; align-items:center; gap:16px; }
        .nb-identity { display:flex; flex-direction:column; gap:1px; }
        .nb-ministry    { font-size:10px; font-weight:700; color:var(--text-muted); letter-spacing:.8px; text-transform:uppercase; }
        .nb-scheme-name { font-size:15px; font-weight:800; color:var(--navy-deep); font-family:'Literata',Georgia,serif; line-height:1.2; }
        .nb-scheme-sub  { font-size:10.5px; color:var(--text-muted); letter-spacing:.3px; }
        .nb-top-right { display:flex; align-items:center; gap:14px; flex-shrink:0; }
        .nb-lang { font-size:11px; font-weight:600; color:var(--text-muted); border-right:1px solid var(--border); padding-right:14px; cursor:pointer; white-space:nowrap; }
        .nb-wallet-info { display:flex; align-items:center; gap:8px; }
        .nb-wallet-dot  { width:7px; height:7px; border-radius:50%; background:var(--green); animation:pulseDot 2.5s infinite; flex-shrink:0; }
        .nb-wallet-addr { font-size:12px; font-weight:700; color:var(--text); font-family:'JetBrains Mono',monospace; }
        .nb-disconnect  { font-size:12px; font-weight:700; color:var(--red); background:none; border:none; cursor:pointer; padding:4px 10px; border-radius:var(--r-sm); transition:var(--transition); }
        .nb-disconnect:hover { background:var(--red-lt); }

        /* Nav bar */
        .nb-nav {
          position:fixed; top:calc(20px + 62px); left:0; right:0; z-index:1000;
          background:var(--navy);
          border-bottom:3px solid var(--saffron);
          box-shadow:0 4px 16px rgba(27,42,74,.24);
        }
        .nb-nav-inner { display:flex; align-items:center; height:50px; justify-content:space-between; }
        .nb-links { display:flex; height:100%; }
        .nb-link {
          display:flex; align-items:center; padding:0 20px;
          font-size:13.5px; font-weight:700; color:rgba(255,255,255,.75);
          text-decoration:none; border-bottom:3px solid transparent;
          transition:var(--transition); margin-bottom:-3px; letter-spacing:.2px;
          white-space:nowrap;
        }
        .nb-link:hover { color:#fff; background:rgba(255,255,255,.08); text-decoration:none; }
        .nb-link--active { color:#fff; border-bottom-color:var(--saffron); background:rgba(255,255,255,.06); }
        .nb-hamburger { display:none; flex-direction:column; gap:5px; background:none; border:none; cursor:pointer; padding:8px; margin-left:auto; }
        .nb-hamburger span { display:block; width:22px; height:2px; background:rgba(255,255,255,.8); border-radius:2px; }
        .nb-mobile { background:var(--navy-deep); border-top:1px solid rgba(255,255,255,.08); display:flex; flex-direction:column; }
        .nb-mobile-link { padding:13px 24px; font-size:14px; font-weight:700; color:rgba(255,255,255,.8); text-decoration:none; border-bottom:1px solid rgba(255,255,255,.06); transition:var(--transition); }
        .nb-mobile-link:hover { background:rgba(255,255,255,.06); color:#fff; text-decoration:none; }

        /* Adjust page top padding to account for double header */
        .page { padding-top: calc(5px + 62px + 44px + 1px) !important; }

        @media(max-width:900px) {
          .nb-links { display:none; }
          .nb-hamburger { display:flex; }
          .nb-lang,.nb-wallet-addr,.nb-wallet-info .badge { display:none; }
          .nb-scheme-sub { display:none; }
        }
        @media(max-width:600px) {
          .nb-ministry { display:none; }
          .nb-scheme-name { font-size:13px; }
        }
      `}</style>
    </>
  );
}
