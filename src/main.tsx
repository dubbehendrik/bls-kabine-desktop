import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './apps/bls-bahnplanung/App';
import logo from './assets/HSE-Logo.jpg';
import './styles/global.css';
import './styles/desktop.css';

function Header() {
  const bridge = window.blsDesktop;
  const [version, setVersion] = useState('');
  const [checking, setChecking] = useState(false);
  useEffect(() => { bridge?.version().then(setVersion).catch(() => setVersion('')); }, [bridge]);
  const check = async () => {
    if (!bridge) return;
    setChecking(true);
    try { await bridge.checkForUpdates(); } finally { setChecking(false); }
  };
  return <header className="site-header desktop-header">
    <span className="desktop-title">BLS-Kabine Lehrtool</span>
    {version && <span className="desktop-version">Version {version}</span>}
    {bridge && <button type="button" onClick={check} disabled={checking}>{checking ? 'Suche läuft …' : 'Nach Updates suchen'}</button>}
    <img src={logo} alt="Hochschule Esslingen"/>
  </header>;
}

createRoot(document.getElementById('root')!).render(<>
  <Header/>
  <main><App/></main>
</>);
