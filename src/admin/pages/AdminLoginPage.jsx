import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Loader2,
  Mail,
  ShieldCheck,
  X,
} from 'lucide-react'
import {
  getAdminConfiguration,
  getAdminSession,
  getGoogleAuthRedirectUrl,
  requestForgotPasswordOtp,
  resendForgotPasswordOtp,
  resetAdminPassword,
  signInAdmin,
  verifyForgotPasswordOtp,
} from '../services/adminApi.js'
import './AdminLogin.css'

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const from = location.state?.from?.pathname || '/admin/dashboard'

  // Flow mode: 'login' | 'forgot-email' | 'verify-otp' | 'reset-password'
  const [mode, setMode] = useState('login')

  // Configuration
  const [config, setConfig] = useState(null)
  const [isConfigLoading, setIsConfigLoading] = useState(true)

  // Login Form State
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)

  // Forgot Password / OTP State
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', ''])
  const [otpExpirySeconds, setOtpExpirySeconds] = useState(300) // 5 minutes
  const [resendCooldown, setResendCooldown] = useState(0) // 60s cooldown
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)

  // Status & Feedback
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(() => {
    const googleError = searchParams.get('google_error')
    if (googleError === 'cancelled') {
      return 'Google sign-in was cancelled. You can try again whenever you’re ready.'
    }
    if (googleError === 'failed') {
      return 'Google sign-in could not be completed. Please try again.'
    }
    return ''
  })
  const [success, setSuccess] = useState('')

  // Google Setup Modal State
  const [showGoogleModal, setShowGoogleModal] = useState(false)

  const otpInputsRef = useRef([])

  // Check if already authenticated on mount
  useEffect(() => {
    let mounted = true
    async function checkAuth() {
      try {
        const conf = await getAdminConfiguration()
        if (mounted) {
          setConfig(conf)
          if (!conf.configured || !conf.databaseConnected) {
            setError(conf.message || 'Admin authentication is not fully configured.')
          }
        }

        if (conf.configured) {
          try {
            const session = await getAdminSession()
            if (session && mounted) {
              navigate(from, { replace: true })
            }
          } catch {
            // Not signed in; stay on login page
          }
        }
      } catch (err) {
        if (mounted) setError(err.message || 'Unable to connect to admin auth service.')
      } finally {
        if (mounted) setIsConfigLoading(false)
      }
    }
    checkAuth()
    return () => {
      mounted = false
    }
  }, [navigate, from])

  // OTP 5-minute countdown timer
  useEffect(() => {
    if (mode !== 'verify-otp') return undefined
    const interval = setInterval(() => {
      setOtpExpirySeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [mode])

  // Resend OTP cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return undefined
    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [resendCooldown])

  // Handle Standard Email & Password Submit
  async function handleLoginSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      await signInAdmin({
        email: email.trim(),
        password,
        rememberMe,
      })
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message || 'Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  // Handle Google Button Click
  function handleGoogleLoginClick() {
    setError('')
    if (config?.googleEnabled) {
      window.location.assign(getGoogleAuthRedirectUrl())
    } else {
      setShowGoogleModal(true)
    }
  }

  // Handle Step 1 of Forgot Password: Request OTP
  async function handleForgotEmailSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const result = await requestForgotPasswordOtp(email.trim())
      setSuccess(result.message || 'Verification code sent to your email.')
      setOtpDigits(['', '', '', '', '', ''])
      setOtpExpirySeconds(300)
      setResendCooldown(60)
      setMode('verify-otp')
    } catch (err) {
      setError(err.message || 'Failed to dispatch verification code.')
    } finally {
      setLoading(false)
    }
  }

  // Handle OTP Digit Input Navigation
  function handleOtpDigitChange(index, value) {
    const char = value.slice(-1)
    if (char && !/^\d$/.test(char)) return

    const newDigits = [...otpDigits]
    newDigits[index] = char
    setOtpDigits(newDigits)

    // Auto advance focus
    if (char && index < 5) {
      otpInputsRef.current[index + 1]?.focus()
    }
  }

  function handleOtpKeyDown(index, e) {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputsRef.current[index - 1]?.focus()
    }
  }

  function handleOtpPaste(e) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').trim()
    if (/^\d{6}$/.test(pasted)) {
      const digits = pasted.split('')
      setOtpDigits(digits)
      otpInputsRef.current[5]?.focus()
    }
  }

  // Handle Step 2: Verify OTP
  async function handleVerifyOtpSubmit(e) {
    e.preventDefault()
    const fullOtp = otpDigits.join('')
    if (fullOtp.length !== 6) {
      setError('Please enter the complete 6-digit verification code.')
      return
    }

    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const result = await verifyForgotPasswordOtp({
        email: email.trim(),
        otp: fullOtp,
      })
      setResetToken(result.resetToken)
      setSuccess(result.message || 'Code verified successfully.')
      setMode('reset-password')
    } catch (err) {
      setError(err.message || 'Invalid or expired verification code.')
    } finally {
      setLoading(false)
    }
  }

  // Handle Resend OTP
  async function handleResendOtp() {
    if (resendCooldown > 0) return
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const result = await resendForgotPasswordOtp(email.trim())
      setSuccess(result.message || 'A fresh verification code has been dispatched.')
      setResendCooldown(60)
      setOtpExpirySeconds(300)
      setOtpDigits(['', '', '', '', '', ''])
      otpInputsRef.current[0]?.focus()
    } catch (err) {
      setError(err.message || 'Could not resend verification code.')
    } finally {
      setLoading(false)
    }
  }

  // Handle Step 3: Set New Password
  async function handleResetPasswordSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }

    if (newPassword.length < 12) {
      setError('Password must contain at least 12 characters.')
      return
    }

    setLoading(true)
    try {
      const result = await resetAdminPassword({
        email: email.trim(),
        resetToken,
        newPassword,
        confirmPassword,
      })
      setSuccess(result.message || 'Password successfully updated.')
      setPassword('')
      setTimeout(() => {
        setMode('login')
        setSuccess('Password updated. Please sign in with your new credentials.')
      }, 1500)
    } catch (err) {
      setError(err.message || 'Failed to update password.')
    } finally {
      setLoading(false)
    }
  }

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
  }

  return (
    <div className="admin-auth-page">
      {/* Background Ambience */}
      <div className="admin-auth-page__ambient" aria-hidden="true">
        <div className="admin-auth-page__glow-orb admin-auth-page__glow-orb--1" />
        <div className="admin-auth-page__glow-orb admin-auth-page__glow-orb--2" />
        <div className="admin-auth-page__glow-orb admin-auth-page__glow-orb--3" />
      </div>

      <div className="admin-auth-card">
        {/* Header Branding */}
        <header className="admin-auth-header">
          <Link to="/" className="admin-auth-logo-link" title="Return to Vibe Together Home">
            <img
              src="/assets/folder/favicon.png"
              alt="Vibe Together"
              className="admin-auth-logo"
            />
            <div className="admin-auth-badge">
              <span className="admin-auth-badge__dot" />
              <span>Admin Workspace</span>
            </div>
          </Link>

          {mode === 'login' && (
            <>
              <h1 className="admin-auth-title">Welcome Back</h1>
              <p className="admin-auth-subtitle">
                Sign in with your verified administrator credentials
              </p>
            </>
          )}

          {mode === 'forgot-email' && (
            <>
              <h1 className="admin-auth-title">Reset Password</h1>
              <p className="admin-auth-subtitle">
                Enter your admin email to receive a secure 6-digit OTP
              </p>
            </>
          )}

          {mode === 'verify-otp' && (
            <>
              <h1 className="admin-auth-title">Verify Code</h1>
              <p className="admin-auth-subtitle">
                Enter the 6-digit verification code sent to <strong>{email}</strong>
              </p>
            </>
          )}

          {mode === 'reset-password' && (
            <>
              <h1 className="admin-auth-title">Create Password</h1>
              <p className="admin-auth-subtitle">
                Choose a strong new password (minimum 12 characters)
              </p>
            </>
          )}
        </header>

        {/* Global Feedback Notices */}
        {error && (
          <div className="admin-auth-alert admin-auth-alert--error" role="alert">
            <AlertCircle size={18} className="admin-auth-alert-icon" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="admin-auth-alert admin-auth-alert--success" role="status">
            <CheckCircle2 size={18} className="admin-auth-alert-icon" />
            <span>{success}</span>
          </div>
        )}

        {/* =========================================================================
            STATE 1: LOGIN FORM
            ========================================================================= */}
        {mode === 'login' && (
          <form className="admin-auth-form" onSubmit={handleLoginSubmit}>
            <div className="admin-auth-field">
              <label className="admin-auth-label" htmlFor="admin-email">
                Admin Email Address
              </label>
              <div className="admin-auth-input-wrapper">
                <Mail size={18} className="admin-auth-input-icon" />
                <input
                  id="admin-email"
                  type="email"
                  className="admin-auth-input"
                  placeholder="admin@vibetogether.com"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="admin-auth-field">
              <label className="admin-auth-label" htmlFor="admin-password">
                Password
              </label>
              <div className="admin-auth-input-wrapper">
                <Lock size={18} className="admin-auth-input-icon" />
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  className="admin-auth-input"
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="button"
                  className="admin-auth-toggle-pass"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <div className="admin-auth-meta">
              <label className="admin-auth-remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={loading}
                />
                <span>Remember me for 30 days</span>
              </label>

              <button
                type="button"
                className="admin-auth-link"
                onClick={() => {
                  setError('')
                  setSuccess('')
                  setMode('forgot-email')
                }}
              >
                Forgot Password?
              </button>
            </div>

            <button
              type="submit"
              className="admin-auth-submit-btn"
              disabled={loading || isConfigLoading}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="admin-auth-spinner" />
                  <span>Verifying Credentials…</span>
                </>
              ) : (
                <>
                  <span>Sign In to Dashboard</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>

            <div className="admin-auth-divider">or continue with</div>

            {/* Google OAuth Login Button */}
            <button
              type="button"
              className="admin-auth-google-btn"
              onClick={handleGoogleLoginClick}
              disabled={loading}
            >
              <svg className="admin-auth-google-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>
          </form>
        )}

        {/* =========================================================================
            STATE 2: FORGOT PASSWORD - ENTER EMAIL
            ========================================================================= */}
        {mode === 'forgot-email' && (
          <form className="admin-auth-form" onSubmit={handleForgotEmailSubmit}>
            <div className="admin-auth-field">
              <label className="admin-auth-label" htmlFor="forgot-email">
                Registered Admin Email
              </label>
              <div className="admin-auth-input-wrapper">
                <Mail size={18} className="admin-auth-input-icon" />
                <input
                  id="forgot-email"
                  type="email"
                  className="admin-auth-input"
                  placeholder="admin@vibetogether.com"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <button type="submit" className="admin-auth-submit-btn" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={18} className="admin-auth-spinner" />
                  <span>Dispatching Code…</span>
                </>
              ) : (
                <>
                  <span>Send 6-Digit OTP</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>

            <button
              type="button"
              className="admin-auth-secondary-btn"
              onClick={() => {
                setError('')
                setSuccess('')
                setMode('login')
              }}
              disabled={loading}
            >
              <ArrowLeft size={16} />
              <span>Back to Sign In</span>
            </button>
          </form>
        )}

        {/* =========================================================================
            STATE 3: VERIFY OTP
            ========================================================================= */}
        {mode === 'verify-otp' && (
          <form className="admin-auth-form" onSubmit={handleVerifyOtpSubmit}>
            <div className="admin-auth-field">
              <label className="admin-auth-label">Enter 6-Digit Verification Code</label>
              <div className="admin-auth-otp-grid" onPaste={handleOtpPaste}>
                {otpDigits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => (otpInputsRef.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    className="admin-auth-otp-cell"
                    value={digit}
                    onChange={(e) => handleOtpDigitChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    disabled={loading}
                    autoFocus={index === 0}
                  />
                ))}
              </div>

              <div className="admin-auth-otp-timer">
                <span>Code expires in:</span>
                <span className="admin-auth-otp-countdown">{formatTimer(otpExpirySeconds)}</span>
              </div>
            </div>

            <button
              type="submit"
              className="admin-auth-submit-btn"
              disabled={loading || otpDigits.join('').length !== 6 || otpExpirySeconds === 0}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="admin-auth-spinner" />
                  <span>Verifying Code…</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={18} />
                  <span>Verify OTP</span>
                </>
              )}
            </button>

            <div className="admin-auth-meta">
              <button
                type="button"
                className="admin-auth-link"
                onClick={handleResendOtp}
                disabled={loading || resendCooldown > 0}
              >
                {resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : 'Resend OTP Code'}
              </button>

              <button
                type="button"
                className="admin-auth-link"
                onClick={() => {
                  setError('')
                  setSuccess('')
                  setMode('forgot-email')
                }}
              >
                Change Email
              </button>
            </div>
          </form>
        )}

        {/* =========================================================================
            STATE 4: CREATE NEW PASSWORD
            ========================================================================= */}
        {mode === 'reset-password' && (
          <form className="admin-auth-form" onSubmit={handleResetPasswordSubmit}>
            <div className="admin-auth-field">
              <label className="admin-auth-label" htmlFor="new-password">
                New Password (minimum 12 characters)
              </label>
              <div className="admin-auth-input-wrapper">
                <KeyRound size={18} className="admin-auth-input-icon" />
                <input
                  id="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  className="admin-auth-input"
                  placeholder="New strong password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="button"
                  className="admin-auth-toggle-pass"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showNewPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <div className="admin-auth-field">
              <label className="admin-auth-label" htmlFor="confirm-password">
                Confirm New Password
              </label>
              <div className="admin-auth-input-wrapper">
                <Lock size={18} className="admin-auth-input-icon" />
                <input
                  id="confirm-password"
                  type={showNewPassword ? 'text' : 'password'}
                  className="admin-auth-input"
                  placeholder="Repeat new password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <button type="submit" className="admin-auth-submit-btn" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={18} className="admin-auth-spinner" />
                  <span>Updating Password…</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={18} />
                  <span>Set New Password</span>
                </>
              )}
            </button>
          </form>
        )}

        <div style={{ textAlign: 'center' }}>
          <Link to="/" className="admin-auth-return">
            &larr; Return to Vibe Together Public Site
          </Link>
        </div>
      </div>

      {/* =========================================================================
          GOOGLE OAUTH SETUP GUIDE MODAL (Requirement 11)
          ========================================================================= */}
      {showGoogleModal && (
        <div
          className="admin-auth-modal-backdrop"
          onClick={() => setShowGoogleModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="admin-auth-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ color: '#00f2fe' }}>&#9881;</span>
                <h3>Google Cloud OAuth Setup</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGoogleModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#a89cb9',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '0.9rem', color: '#e5cbff', margin: '0.5rem 0 1rem' }}>
              Google OAuth credentials are not yet configured in your backend <code>.env</code> file.
              Follow these steps to configure your credentials:
            </p>

            <ol>
              <li>Open the <strong style={{ color: '#fff' }}>Google Cloud Console</strong> (<a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" style={{ color: '#00f2fe' }}>console.cloud.google.com</a>).</li>
              <li>Create or select your project.</li>
              <li>Navigate to <strong style={{ color: '#fff' }}>APIs & Services &rarr; OAuth consent screen</strong> and configure it.</li>
              <li>Go to <strong style={{ color: '#fff' }}>Credentials &rarr; Create Credentials &rarr; OAuth client ID</strong>.</li>
              <li>Select <strong style={{ color: '#fff' }}>Web application</strong>.</li>
              <li>For the server-side redirect flow, the required setting is the redirect URI below. If you also enable a browser-based Google flow, add <code>{window.location.origin}</code> as an Authorized JavaScript origin.</li>
              <li>Add this exact Authorized Redirect URI: <code>{config?.googleCallbackUrl || 'http://localhost:4000/api/admin/auth/google/callback'}</code>.</li>
              <li>Copy your <strong style={{ color: '#fff' }}>Client ID</strong> and <strong style={{ color: '#fff' }}>Client Secret</strong>.</li>
              <li>Add them to <code>backend/.env</code>:
                <pre style={{ background: '#0a0514', padding: '0.75rem', borderRadius: '8px', fontSize: '0.8rem', marginTop: '0.5rem', color: '#a82bff' }}>
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:4000/api/admin/auth/google/callback
                </pre>
              </li>
              {config?.googleMissingConfiguration?.length > 0 && (
                <li>
                  Missing or invalid settings: <code>{config.googleMissingConfiguration.join(', ')}</code>.
                </li>
              )}
              <li>Restart the backend server.</li>
            </ol>

            <button
              type="button"
              className="admin-auth-submit-btn"
              style={{ marginTop: '1.25rem' }}
              onClick={() => setShowGoogleModal(false)}
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
