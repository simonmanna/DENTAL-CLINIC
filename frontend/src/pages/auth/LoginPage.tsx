// src/pages/auth/LoginPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const { login, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Invalid credentials. Please try again.');
    }
  };

  const inputStyle = (field: string): React.CSSProperties => ({
    width: '100%',
    padding: '13px 16px',
    border: `1.5px solid ${focusedField === field ? '#1976d2' : '#dde8f2'}`,
    borderRadius: '10px',
    fontSize: '15px',
    color: '#0d2d4a',
    background: focusedField === field ? '#ffffff' : '#f7fafd',
    outline: 'none',
    transition: 'all 0.2s ease',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    boxShadow: focusedField === field ? '0 0 0 4px rgba(25,118,210,0.10)' : 'none',
  });

  return (
    <div style={styles.root}>
      {/* ── Rich SVG background: teeth + smiling faces + sparkles ── */}
      <svg
        style={styles.bgSvg}
        viewBox="0 0 1440 900"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <radialGradient id="bgGrad" cx="40%" cy="35%" r="80%">
            <stop offset="0%" stopColor="#ddf0fb" />
            <stop offset="50%" stopColor="#b8dff5" />
            <stop offset="100%" stopColor="#8ec5e6" />
          </radialGradient>
          <radialGradient id="glow1" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#b3d9f5" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="glow2" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#c5e8f7" stopOpacity="0" />
          </radialGradient>

          {/* Reusable tooth */}
          <symbol id="T" viewBox="0 0 60 80">
            <path d="M30 3C17 3 6 12 6 23c0 9 3 16 7 23 4 8 5 18 7 27 1 4 4 6 7 4 2-2 2-8 3-8s1 6 3 8c3 2 6 0 7-4 2-9 3-19 7-27 4-7 7-14 7-23C54 12 43 3 30 3z"
              fill="white" fillOpacity="0.55"/>
            <path d="M22 14c-2 2-4 6-4 10" stroke="rgba(160,210,240,0.7)" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
          </symbol>

          {/* Smiley face bubble */}
          <symbol id="F" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="46" fill="white" fillOpacity="0.28" stroke="white" strokeOpacity="0.5" strokeWidth="1.5"/>
            <circle cx="36" cy="40" r="5" fill="rgba(15,90,170,0.45)"/>
            <circle cx="64" cy="40" r="5" fill="rgba(15,90,170,0.45)"/>
            <path d="M30 60Q50 80 70 60" stroke="rgba(15,90,170,0.5)" strokeWidth="4.5" strokeLinecap="round" fill="none"/>
            <rect x="35" y="61" width="9" height="8" rx="1" fill="white" fillOpacity="0.75"/>
            <rect x="45" y="61" width="9" height="8" rx="1" fill="white" fillOpacity="0.75"/>
            <rect x="55" y="61" width="9" height="8" rx="1" fill="white" fillOpacity="0.75"/>
            <line x1="44" y1="61" x2="44" y2="69" stroke="rgba(190,225,248,0.6)" strokeWidth="0.7"/>
            <line x1="54" y1="61" x2="54" y2="69" stroke="rgba(190,225,248,0.6)" strokeWidth="0.7"/>
          </symbol>

          {/* Sparkle star */}
          <symbol id="S" viewBox="0 0 24 24">
            <path d="M12 2l1.8 7.2L22 8l-6.5 5 2.5 7.5L12 16.5 6 20.5l2.5-7.5L2 8l8.2 1.2z"
              fill="white" fillOpacity="0.55"/>
          </symbol>

          {/* Smile arc only */}
          <symbol id="A" viewBox="0 0 80 40">
            <path d="M8 8Q40 38 72 8" stroke="white" strokeOpacity="0.45" strokeWidth="5" strokeLinecap="round" fill="none"/>
          </symbol>
        </defs>

        <rect width="1440" height="900" fill="url(#bgGrad)"/>

        {/* Soft ambient glows */}
        <ellipse cx="300" cy="200" rx="420" ry="280" fill="url(#glow1)"/>
        <ellipse cx="1200" cy="700" rx="380" ry="260" fill="url(#glow2)"/>

        {/* Wave bands at bottom */}
        <path d="M0 680Q360 620 720 665Q1080 710 1440 650L1440 900L0 900Z" fill="rgba(255,255,255,0.16)"/>
        <path d="M0 730Q400 685 800 718Q1100 745 1440 700L1440 900L0 900Z" fill="rgba(255,255,255,0.1)"/>

        {/* ── Large teeth – corners ── */}
        <use href="#T" x="30"   y="60"  width="88"  height="117" opacity="0.38" transform="rotate(-20 74 118)"/>
        <use href="#T" x="1310" y="50"  width="80"  height="107" opacity="0.32" transform="rotate(16 1350 104)"/>
        <use href="#T" x="100"  y="540" width="70"  height="93"  opacity="0.28" transform="rotate(9 135 587)"/>
        <use href="#T" x="1340" y="490" width="72"  height="96"  opacity="0.28" transform="rotate(-11 1376 538)"/>
        <use href="#T" x="590"  y="10"  width="52"  height="69"  opacity="0.22" transform="rotate(5 616 45)"/>
        <use href="#T" x="840"  y="810" width="60"  height="80"  opacity="0.22" transform="rotate(-7 870 850)"/>
        <use href="#T" x="210"  y="760" width="48"  height="64"  opacity="0.2"  transform="rotate(13 234 792)"/>
        <use href="#T" x="1170" y="740" width="52"  height="69"  opacity="0.22" transform="rotate(-5 1196 774)"/>

        {/* ── Smiley face bubbles ── */}
        <use href="#F" x="20"   y="310" width="130" height="130" opacity="0.75"/>
        <use href="#F" x="1290" y="270" width="110" height="110" opacity="0.68"/>
        <use href="#F" x="70"   y="690" width="90"  height="90"  opacity="0.55"/>
        <use href="#F" x="1350" y="660" width="82"  height="82"  opacity="0.52"/>
        <use href="#F" x="490"  y="790" width="72"  height="72"  opacity="0.42"/>
        <use href="#F" x="950"  y="820" width="68"  height="68"  opacity="0.4"/>
        <use href="#F" x="680"  y="40"  width="60"  height="60"  opacity="0.35"/>
        <use href="#F" x="1080" y="560" width="75"  height="75"  opacity="0.38"/>
        <use href="#F" x="250"  y="420" width="65"  height="65"  opacity="0.38"/>

        {/* ── Smile arcs ── */}
        <use href="#A" x="290"  y="130" width="100" height="50" opacity="0.5"/>
        <use href="#A" x="1030" y="160" width="90"  height="45" opacity="0.45"/>
        <use href="#A" x="170"  y="460" width="80"  height="40" opacity="0.38"/>
        <use href="#A" x="1250" y="410" width="85"  height="43" opacity="0.38"/>
        <use href="#A" x="710"  y="830" width="95"  height="48" opacity="0.32"/>
        <use href="#A" x="500"  y="640" width="70"  height="35" opacity="0.3"/>

        {/* ── Sparkles ── */}
        <use href="#S" x="255"  y="205" width="28" height="28" opacity="0.58"/>
        <use href="#S" x="1145" y="105" width="22" height="22" opacity="0.52"/>
        <use href="#S" x="405"  y="708" width="20" height="20" opacity="0.42"/>
        <use href="#S" x="1065" y="655" width="24" height="24" opacity="0.48"/>
        <use href="#S" x="725"  y="65"  width="18" height="18" opacity="0.42"/>
        <use href="#S" x="158"  y="608" width="16" height="16" opacity="0.38"/>
        <use href="#S" x="1310" y="565" width="18" height="18" opacity="0.38"/>
        <use href="#S" x="830"  y="490" width="20" height="20" opacity="0.35"/>
        <use href="#S" x="455"  y="290" width="16" height="16" opacity="0.35"/>

        {/* Dotted ring accents */}
        <circle cx="195"  cy="195" r="78"  fill="none" stroke="rgba(255,255,255,0.42)" strokeWidth="1.5" strokeDasharray="6 8"/>
        <circle cx="1245" cy="695" r="62"  fill="none" stroke="rgba(255,255,255,0.38)" strokeWidth="1.5" strokeDasharray="5 7"/>
        <circle cx="1105" cy="175" r="48"  fill="none" stroke="rgba(255,255,255,0.32)" strokeWidth="1"   strokeDasharray="4 6"/>
        <circle cx="560"  cy="480" r="38"  fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1"   strokeDasharray="4 6"/>

        {/* Soft floating bubbles */}
        <circle cx="480"  cy="118" r="22" fill="rgba(255,255,255,0.22)"/>
        <circle cx="975"  cy="88"  r="16" fill="rgba(255,255,255,0.2)"/>
        <circle cx="1390" cy="355" r="30" fill="rgba(255,255,255,0.15)"/>
        <circle cx="58"   cy="478" r="24" fill="rgba(255,255,255,0.18)"/>
        <circle cx="355"  cy="825" r="18" fill="rgba(255,255,255,0.2)"/>
        <circle cx="1105" cy="825" r="20" fill="rgba(255,255,255,0.18)"/>
        <circle cx="740"  cy="680" r="14" fill="rgba(255,255,255,0.2)"/>

        {/* Plus cross accents */}
        <g opacity="0.45">
          <line x1="632" y1="742" x2="632" y2="762" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
          <line x1="622" y1="752" x2="642" y2="752" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
        </g>
        <g opacity="0.38">
          <line x1="832" y1="102" x2="832" y2="120" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          <line x1="823" y1="111" x2="841" y2="111" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        </g>
        <g opacity="0.38">
          <line x1="352" y1="352" x2="352" y2="370" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          <line x1="343" y1="361" x2="361" y2="361" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        </g>
        <g opacity="0.32">
          <line x1="1200" y1="450" x2="1200" y2="466" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          <line x1="1192" y1="458" x2="1208" y2="458" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        </g>
      </svg>

      {/* ── Login card ── */}
      <div style={styles.card}>

        {/* Logo */}
        <div style={styles.logoRow}>
          <div style={styles.logoIcon}>
            <svg width="21" height="21" viewBox="0 0 60 80" fill="none">
              <path
                d="M30 3C17 3 6 12 6 23c0 9 3 16 7 23 4 8 5 18 7 27 1 4 4 6 7 4 2-2 2-8 3-8s1 6 3 8c3 2 6 0 7-4 2-9 3-19 7-27 4-7 7-14 7-23C54 12 43 3 30 3z"
                fill="white"
              />
            </svg>
          </div>
          <div>
            <div style={styles.logoTitle}>FSHIKTA</div>
            <div style={styles.logoTagline}>DENTAL MANAGEMENT SYSTEM</div>
          </div>
        </div>

        <div style={styles.rule} />

        <h2 style={styles.heading}>Welcome back</h2>
        <p style={styles.subheading}>Sign in to continue to your clinic dashboard</p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

          {/* Email */}
          <div>
            <label style={styles.label}>Username / Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@clinic.com"
              required
              style={inputStyle('email')}
              onFocus={() => setFocusedField('email')}
              onBlur={() => setFocusedField(null)}
            />
          </div>

          {/* Password */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '7px' }}>
              <label style={{ ...styles.label, marginBottom: 0 }}>Password</label>
              <a href="#" style={styles.forgotLink}>Forgot password?</a>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{ ...inputStyle('password'), paddingRight: '46px' }}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
              />
              <button
                type="button"
                onClick={() => setShowPass(s => !s)}
                style={styles.eyeBtn}
              >
                {showPass
                  ? <EyeOff size={17} color="#7a9ab8" />
                  : <Eye size={17} color="#7a9ab8" />}
              </button>
            </div>
          </div>

          {/* Remember me */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              id="remember"
              style={{ width: '16px', height: '16px', accentColor: '#1976d2', cursor: 'pointer' }}
            />
            <label
              htmlFor="remember"
              style={{ fontSize: '13.5px', color: '#6a8ba6', cursor: 'pointer', userSelect: 'none' as const }}
            >
              Keep me signed in
            </label>
          </div>

          {/* Error */}
          {error && (
            <div style={styles.errorBox}>
              <span style={{
                width: '7px', height: '7px', borderRadius: '50%',
                background: '#e53935', flexShrink: 0, marginTop: '3px', display: 'block',
              }} />
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            style={{ ...styles.submitBtn, opacity: isLoading ? 0.72 : 1 }}
          >
            {isLoading
              ? <><Loader2 size={17} style={{ animation: 'spin 1s linear infinite', marginRight: '8px' }} />Signing in…</>
              : 'Log In'}
          </button>
        </form>

        {/* Card footer */}
        {/* <div style={styles.cardFooter}>
          <span style={styles.footerDot}>■</span>
          <span style={styles.footerText}>HenrySchein</span>
          <span style={styles.footerBold}>ONE</span>
          <span style={styles.footerSep}>·</span>
          <span style={styles.footerContact}>support@smilecare.com</span>
        </div> */}
      </div>

      {/* Bottom tagline */}
      <p style={styles.tagline}>Trusted by dental practices</p>
      {/* <p style={styles.tagline}>HIPAA compliant · Trusted by 200+ dental practices</p> */}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes riseIn {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
    position: 'relative',
    overflow: 'hidden',
    padding: '24px 16px',
  },

  bgSvg: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },

  card: {
    position: 'relative',
    zIndex: 10,
    width: '100%',
    maxWidth: '490px',
    background: 'rgba(255,255,255,0.96)',
    borderRadius: '22px',
    boxShadow: '0 24px 80px rgba(8,55,110,0.18), 0 4px 24px rgba(8,55,110,0.10)',
    padding: '42px 48px 36px',
    backdropFilter: 'blur(14px)',
    animation: 'riseIn 0.55s cubic-bezier(0.22,1,0.36,1) both',
  },

  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '13px',
    marginBottom: '24px',
    paddingLeft: '8px'
  },

  logoIcon: {
    width: '46px',
    height: '46px',
    borderRadius: '13px',
    background: 'linear-gradient(135deg, #1352a0 0%, #0288d1 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 5px 16px rgba(2,136,209,0.38)',
    flexShrink: 0,
  },

  logoTitle: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: '40px',
    fontWeight: 700,
    color: '#0a2540',
    letterSpacing: '0.3px',
    lineHeight: 1.1,
    textAlign:'center',
  },

  logoTagline: {
    fontSize: '9px',
    fontWeight: 600,
    letterSpacing: '0.14em',
    color: '#7aabbf',
    textTransform: 'uppercase' as const,
    marginTop: '2px',
  },

  rule: {
    height: '1px',
    background: 'linear-gradient(90deg, transparent, #cde7f5 30%, #cde7f5 70%, transparent)',
    marginBottom: '26px',
  },

  heading: {
    fontFamily: "'Fraunces', Georgia, serif",
    fontSize: '28px',
    fontWeight: 600,
    color: '#0a2540',
    letterSpacing: '-0.4px',
    lineHeight: 1.15,
    marginBottom: '6px',
  },

  subheading: {
    fontSize: '13.5px',
    color: '#7a9ab8',
    marginBottom: '28px',
    fontWeight: 400,
    lineHeight: 1.5,
  },

  label: {
    display: 'block',
    fontSize: '11.5px',
    fontWeight: 700,
    color: '#3a6080',
    letterSpacing: '0.06em',
    marginBottom: '7px',
    textTransform: 'uppercase' as const,
  },

  forgotLink: {
    fontSize: '12.5px',
    color: '#1976d2',
    textDecoration: 'none',
    fontWeight: 500,
  },

  eyeBtn: {
    position: 'absolute' as const,
    right: '13px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    lineHeight: 1,
  },

  errorBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '11px 14px',
    background: '#fff3f3',
    border: '1px solid #fbbdbd',
    borderRadius: '10px',
    fontSize: '13px',
    color: '#c0392b',
    fontWeight: 400,
    lineHeight: 1.5,
  },

  submitBtn: {
    width: '100%',
    padding: '14px',
    background: 'linear-gradient(135deg, #1352a0 0%, #1976d2 60%, #039be5 100%)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '11px',
    fontSize: '15.5px',
    fontWeight: 700,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    letterSpacing: '0.04em',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
    boxShadow: '0 6px 22px rgba(19,82,160,0.32)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    marginTop: '26px',
    paddingTop: '18px',
    borderTop: '1px solid #e4eef7',
  },

  footerDot: {
    color: '#c0392b',
    fontSize: '10px',
  },

  footerText: {
    fontSize: '11.5px',
    fontWeight: 600,
    color: '#3a5a7a',
    letterSpacing: '0.02em',
  },

  footerBold: {
    fontSize: '13.5px',
    fontWeight: 800,
    color: '#3a5a7a',
    letterSpacing: '-0.5px',
  },

  footerSep: {
    color: '#b0c8dc',
    margin: '0 4px',
    fontSize: '12px',
  },

  footerContact: {
    fontSize: '11.5px',
    color: '#1976d2',
    fontWeight: 500,
    cursor: 'pointer',
  },

  tagline: {
    position: 'relative' as const,
    zIndex: 10,
    marginTop: '18px',
    fontSize: '11px',
    color: 'rgba(12,50,90,0.42)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    fontWeight: 500,
  },
};